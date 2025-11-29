import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneticService } from '../phonetic/phonetic.service';
import { parseFullText, parseSingleTrack, ParsedTrack } from './utils/text-parser';
import { extractRhymes, ExtractionResult } from './utils/rhyme-extractor';
import { RhymeType, Language, CreatedBy } from '@prisma/client';

export interface ImportResult {
  tracksProcessed: number;
  familiesCreated: number;
  unitsCreated: number;
  linksCreated: number;
  examplesCreated: number;
}

export interface ParseJobData {
  text: string;
  sourceTitle: string;
  language?: Language;
}

@Injectable()
export class ParserService {
  constructor(
    @InjectQueue('parser') private parserQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly phoneticService: PhoneticService,
  ) {}

  /**
   * Добавляет текст в очередь на обработку
   */
  async queueForParsing(data: ParseJobData): Promise<{ jobId: string }> {
    const job = await this.parserQueue.add('parse-text', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    
    return { jobId: job.id || 'unknown' };
  }

  /**
   * Синхронный парсинг и сохранение (для небольших текстов)
   */
  async parseAndSave(
    text: string,
    sourceTitle: string,
    language: Language = Language.RU,
  ): Promise<ImportResult> {
    const tracks = parseFullText(text);
    
    let totalFamilies = 0;
    let totalUnits = 0;
    let totalLinks = 0;
    let totalExamples = 0;

    for (const track of tracks) {
      const result = await this.processTrack(track, sourceTitle, language);
      totalFamilies += result.familiesCreated;
      totalUnits += result.unitsCreated;
      totalLinks += result.linksCreated;
      totalExamples += result.examplesCreated;
    }

    return {
      tracksProcessed: tracks.length,
      familiesCreated: totalFamilies,
      unitsCreated: totalUnits,
      linksCreated: totalLinks,
      examplesCreated: totalExamples,
    };
  }

  /**
   * Обрабатывает один трек
   */
  async processTrack(
    track: ParsedTrack,
    sourceTitle: string,
    language: Language,
  ): Promise<Omit<ImportResult, 'tracksProcessed'>> {
    // 1. Извлекаем рифмы
    const extraction = extractRhymes(track);
    
    // 2. Сохраняем примеры (строки)
    const exampleIds = await this.saveExamples(track, sourceTitle);
    
    // 3. Сохраняем семейства, юниты и связи
    let familiesCreated = 0;
    let unitsCreated = 0;
    let linksCreated = 0;

    for (const family of extraction.families) {
      const savedFamily = await this.saveFamily(family, track.title, language);
      if (savedFamily) {
        familiesCreated++;
        
        // Сохраняем юниты
        const unitIds = await this.saveUnits(
          family.units,
          savedFamily.id,
          exampleIds,
          track.title,
          sourceTitle,
        );
        unitsCreated += unitIds.length;
        
        // Сохраняем связи
        const linkCount = await this.saveLinks(family.links, unitIds);
        linksCreated += linkCount;
      }
    }

    return {
      familiesCreated,
      unitsCreated,
      linksCreated,
      examplesCreated: exampleIds.size,
    };
  }

  /**
   * Сохраняет строки трека как RhymeExamples
   */
  private async saveExamples(
    track: ParsedTrack,
    sourceTitle: string,
  ): Promise<Map<number, string>> {
    const exampleIds = new Map<number, string>();

    for (const section of track.sections) {
      for (const line of section.lines) {
        const example = await this.prisma.rhymeExample.create({
          data: {
            sourceTitle,
            track: track.title,
            section: section.name,
            lineIndex: line.globalIndex,
            text: line.cleanText,
          },
        });
        
        exampleIds.set(line.globalIndex, example.id);
      }
    }

    return exampleIds;
  }

  /**
   * Сохраняет семейство рифм
   */
  private async saveFamily(
    family: ExtractionResult['families'][0],
    trackTitle: string,
    language: Language,
  ) {
    // Генерируем уникальный slug
    const baseSlug = this.generateSlug(family.patternText);
    const slug = await this.ensureUniqueSlug(baseSlug);

    // Определяем типы рифмы
    const types: RhymeType[] = [];
    types.push(RhymeType.END); // По умолчанию концевая
    
    if (family.units.length > 2) {
      types.push(RhymeType.CHAIN);
    }
    
    // Проверяем мультисиллабичность (> 2 слогов)
    const avgPhoneticLength = family.units.reduce(
      (sum, u) => sum + u.phoneticTail.length, 0
    ) / family.units.length;
    
    if (avgPhoneticLength >= 6) {
      types.push(RhymeType.MULTISYLLABIC);
    }

    // Проверяем slant-рифмы
    if (family.links.some(l => l.matchType === 'SLANT')) {
      types.push(RhymeType.SLANT);
    }

    return this.prisma.rhymeFamily.create({
      data: {
        slug,
        language,
        patternText: family.patternText,
        phoneticKey: family.phoneticTail,
        phoneticTail: family.phoneticTail,
        types,
        complexity: family.complexity,
        topics: [trackTitle],
        createdBy: CreatedBy.IMPORT,
      },
    });
  }

  /**
   * Сохраняет юниты семейства
   */
  private async saveUnits(
    units: ExtractionResult['units'],
    familyId: string,
    exampleIds: Map<number, string>,
    trackTitle: string,
    sourceTitle: string,
  ): Promise<string[]> {
    const savedIds: string[] = [];

    for (const unit of units) {
      let exampleId = exampleIds.get(unit.globalLineIndex);
      
      // Если пример не найден — создаём
      if (!exampleId) {
        const example = await this.prisma.rhymeExample.create({
          data: {
            familyId,
            sourceTitle,
            track: trackTitle,
            section: unit.section,
            lineIndex: unit.globalLineIndex,
            text: unit.text,
          },
        });
        exampleId = example.id;
      }

      const savedUnit = await this.prisma.rhymeUnit.create({
        data: {
          familyId,
          exampleId,
          lineIndex: unit.lineIndex,
          textSpan: unit.textSpan,
          charStart: unit.charStart,
          charEnd: unit.charEnd,
          phoneticTail: unit.phoneticTail,
        },
      });

      savedIds.push(savedUnit.id);
    }

    return savedIds;
  }

  /**
   * Сохраняет связи между юнитами
   */
  private async saveLinks(
    links: ExtractionResult['links'],
    unitIds: string[],
  ): Promise<number> {
    const linksToCreate = links.map(link => ({
      unitAId: unitIds[link.unitAIndex],
      unitBId: unitIds[link.unitBIndex],
      matchType: link.matchType,
      phoneticSimilarity: link.similarity,
      distanceLines: link.distanceLines,
    }));

    // Фильтруем невалидные
    const validLinks = linksToCreate.filter(l => l.unitAId && l.unitBId);

    if (validLinks.length === 0) return 0;

    const result = await this.prisma.rhymeLink.createMany({
      data: validLinks,
      skipDuplicates: true,
    });

    return result.count;
  }

  // =====================================================
  // UTILITY
  // =====================================================

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^а-яa-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 0;
    
    while (await this.prisma.rhymeFamily.findUnique({ where: { slug } })) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
    
    return slug;
  }

  /**
   * Получить статус задачи
   */
  async getJobStatus(jobId: string) {
    const job = await this.parserQueue.getJob(jobId);
    if (!job) return null;
    
    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}
