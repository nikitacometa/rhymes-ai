import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneticService } from '../phonetic/phonetic.service';
import {
  CreateRhymeFamilyDto,
  CreateRhymeExampleDto,
  CreateRhymeUnitDto,
  CreateRhymeLinkDto,
  SearchRhymeDto,
} from './dto';
import { RhymeFamily, RhymeExample, RhymeUnit, RhymeLink, Prisma } from '@prisma/client';
import OpenAI from 'openai';

// Тип для семейства с включёнными связями
type RhymeFamilyWithRelations = RhymeFamily & {
  units?: (RhymeUnit & { example?: RhymeExample })[];
  examples?: RhymeExample[];
};

/** Результат LLM-генерации рифм */
export interface LLMRhymeSuggestion {
  rhyme: string;
  type: 'exact' | 'slant' | 'assonance' | 'pun';
  explanation?: string;
}

@Injectable()
export class RhymeService {
  private openaiApiKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneticService: PhoneticService,
    private readonly configService: ConfigService,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  // =====================================================
  // RHYME FAMILIES
  // =====================================================

  async createFamily(dto: CreateRhymeFamilyDto): Promise<RhymeFamily> {
    return this.prisma.rhymeFamily.create({
      data: dto,
    });
  }

  async findAllFamilies(limit = 100): Promise<RhymeFamilyWithRelations[]> {
    return this.prisma.rhymeFamily.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        units: true,
        examples: true,
      },
    });
  }

  async findFamilyById(id: string): Promise<RhymeFamilyWithRelations> {
    const family = await this.prisma.rhymeFamily.findUnique({
      where: { id },
      include: {
        units: true,
        examples: true,
      },
    });
    
    if (!family) {
      throw new NotFoundException(`RhymeFamily with id ${id} not found`);
    }
    
    return family;
  }

  async findFamilyBySlug(slug: string): Promise<RhymeFamilyWithRelations | null> {
    return this.prisma.rhymeFamily.findUnique({
      where: { slug },
      include: {
        units: true,
        examples: true,
      },
    });
  }

  async updateFamily(id: string, dto: Partial<CreateRhymeFamilyDto>): Promise<RhymeFamily> {
    return this.prisma.rhymeFamily.update({
      where: { id },
      data: dto,
    });
  }

  async deleteFamily(id: string): Promise<void> {
    await this.prisma.rhymeFamily.delete({
      where: { id },
    });
  }

  // =====================================================
  // RHYME EXAMPLES
  // =====================================================

  async createExample(dto: CreateRhymeExampleDto): Promise<RhymeExample> {
    return this.prisma.rhymeExample.create({
      data: dto,
    });
  }

  async createManyExamples(examples: CreateRhymeExampleDto[]): Promise<{ count: number }> {
    return this.prisma.rhymeExample.createMany({
      data: examples,
    });
  }

  async findExamplesByFamilyId(familyId: string): Promise<RhymeExample[]> {
    return this.prisma.rhymeExample.findMany({
      where: { familyId },
      orderBy: { lineIndex: 'asc' },
    });
  }

  async findExamplesByTrack(track: string): Promise<RhymeExample[]> {
    return this.prisma.rhymeExample.findMany({
      where: { track: { contains: track, mode: 'insensitive' } },
      orderBy: { lineIndex: 'asc' },
    });
  }

  // =====================================================
  // RHYME UNITS
  // =====================================================

  async createUnit(dto: CreateRhymeUnitDto): Promise<RhymeUnit> {
    return this.prisma.rhymeUnit.create({
      data: dto,
    });
  }

  async createManyUnits(units: CreateRhymeUnitDto[]): Promise<{ count: number }> {
    return this.prisma.rhymeUnit.createMany({
      data: units,
    });
  }

  async findUnitsByFamilyId(familyId: string): Promise<RhymeUnit[]> {
    return this.prisma.rhymeUnit.findMany({
      where: { familyId },
      include: {
        example: true,
      },
    });
  }

  async findUnitsByPhoneticTail(phoneticTail: string): Promise<RhymeUnit[]> {
    return this.prisma.rhymeUnit.findMany({
      where: {
        phoneticTail: { contains: phoneticTail },
      },
      include: {
        family: true,
        example: true,
      },
    });
  }

  async updateUnitFamily(unitId: string, familyId: string): Promise<RhymeUnit> {
    return this.prisma.rhymeUnit.update({
      where: { id: unitId },
      data: { familyId },
    });
  }

  // =====================================================
  // RHYME LINKS (связи между рифмующимися юнитами)
  // =====================================================

  async createLink(dto: CreateRhymeLinkDto): Promise<RhymeLink> {
    return this.prisma.rhymeLink.create({
      data: dto,
    });
  }

  async createManyLinks(links: CreateRhymeLinkDto[]): Promise<{ count: number }> {
    return this.prisma.rhymeLink.createMany({
      data: links,
      skipDuplicates: true,
    });
  }

  async findLinksByUnitId(unitId: string): Promise<RhymeLink[]> {
    return this.prisma.rhymeLink.findMany({
      where: {
        OR: [{ unitAId: unitId }, { unitBId: unitId }],
      },
      include: {
        unitA: true,
        unitB: true,
      },
    });
  }

  // =====================================================
  // SEARCH — главная функция поиска рифм
  // =====================================================

  async search(dto: SearchRhymeDto): Promise<RhymeFamilyWithRelations[]> {
    const { phrase, language, type, limit = 10 } = dto;

    // 1. Фонетизируем входную фразу
    const analysis = this.phoneticService.analyzeSync(phrase);
    const inputTail = analysis.phoneticTail;

    // 2. Строим запрос
    const where: Prisma.RhymeFamilyWhereInput = {};

    // Поиск по phoneticTail (основной метод)
    if (inputTail && inputTail.length >= 2) {
      // Ищем семейства, чей phoneticTail похож на наш
      where.OR = [
        // Точное совпадение хвоста
        { phoneticTail: inputTail },
        // Частичное совпадение (наш хвост содержится в их)
        { phoneticTail: { contains: inputTail } },
        // Их хвост содержится в нашем
        { phoneticTail: { startsWith: inputTail.slice(-3) } },
        // Fallback: поиск по тексту
        { patternText: { contains: phrase, mode: 'insensitive' } },
        { phoneticKey: { contains: inputTail } },
      ];
    } else {
      // Если хвост слишком короткий — поиск по тексту
      where.OR = [
        { patternText: { contains: phrase, mode: 'insensitive' } },
        { phoneticKey: { contains: phrase.toLowerCase() } },
      ];
    }

    // Фильтр по языку
    if (language) {
      where.language = language;
    }

    // Фильтр по типу рифмы
    if (type) {
      where.types = { has: type };
    }

    // 3. Выполняем запрос
    const families = await this.prisma.rhymeFamily.findMany({
      where,
      take: limit * 2, // Берём больше для фильтрации
      orderBy: [
        { complexity: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        units: {
          include: {
            example: true,
          },
          take: 5, // Ограничиваем юниты
        },
        examples: {
          take: 3, // Ограничиваем примеры
        },
      },
    });

    // 4. Ранжируем результаты по фонетическому сходству
    const rankedFamilies = families
      .map(family => ({
        family,
        similarity: this.phoneticService.getSimilaritySync(inputTail, family.phoneticTail),
      }))
      .filter(item => item.similarity >= 0.5) // Минимальный порог
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.family);

    return rankedFamilies;
  }

  /**
   * Поиск рифм с расширенной информацией о сходстве
   */
  async searchWithSimilarity(phrase: string, limit = 10): Promise<{
    query: {
      phrase: string;
      phoneticTail: string;
    };
    results: {
      family: RhymeFamilyWithRelations;
      similarity: number;
      isExactMatch: boolean;
    }[];
  }> {
    const analysis = this.phoneticService.analyzeSync(phrase);
    
    const families = await this.search({ phrase, limit: limit * 2 });
    
    const results = families.map(family => ({
      family,
      similarity: this.phoneticService.getSimilaritySync(
        analysis.phoneticTail,
        family.phoneticTail,
      ),
      isExactMatch: analysis.phoneticTail === family.phoneticTail,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

    return {
      query: {
        phrase,
        phoneticTail: analysis.phoneticTail,
      },
      results,
    };
  }

  // =====================================================
  // UTILITY — вспомогательные методы
  // =====================================================

  async getStats(): Promise<{
    familiesCount: number;
    examplesCount: number;
    unitsCount: number;
    linksCount: number;
  }> {
    const [familiesCount, examplesCount, unitsCount, linksCount] = await Promise.all([
      this.prisma.rhymeFamily.count(),
      this.prisma.rhymeExample.count(),
      this.prisma.rhymeUnit.count(),
      this.prisma.rhymeLink.count(),
    ]);

    return { familiesCount, examplesCount, unitsCount, linksCount };
  }

  /**
   * Найти или создать семейство по phoneticTail
   */
  async findOrCreateFamily(
    patternText: string,
    phoneticTail: string,
  ): Promise<RhymeFamily> {
    // Ищем существующее
    const existing = await this.prisma.rhymeFamily.findFirst({
      where: { phoneticTail },
    });

    if (existing) return existing;

    // Создаём новое
    const slug = patternText
      .toLowerCase()
      .replace(/[^а-яa-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);

    return this.prisma.rhymeFamily.create({
      data: {
        slug: `${slug}-${Date.now()}`,
        patternText,
        phoneticKey: phoneticTail,
        phoneticTail,
        createdBy: 'USER',
      },
    });
  }

  // =====================================================
  // LLM RHYME GENERATION
  // =====================================================

  /**
   * Генерирует рифмы с помощью LLM
   */
  async suggestRhymesWithLLM(word: string): Promise<LLMRhymeSuggestion[]> {
    if (!this.openaiApiKey) {
      return [];
    }

    const openai = new OpenAI({ apiKey: this.openaiApiKey });

    const prompt = `Ты — эксперт по русским рифмам в рэпе и поэзии.

Придумай 5-7 интересных рифм к слову/фразе: "${word}"

Требования:
- Рифмы должны быть разнообразными (точные, неточные, ассонансы, каламбуры)
- Предпочтение нестандартным, креативным рифмам
- Можно использовать фразы из нескольких слов
- Рифмы на русском языке

Верни JSON массив (без markdown):
[
  {"rhyme": "рифма", "type": "exact|slant|assonance|pun", "explanation": "пояснение если нужно"}
]

Типы:
- exact: точная рифма (кошка/ложка)
- slant: неточная рифма (любовь/морковь)  
- assonance: созвучие гласных
- pun: каламбур/игра слов`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      return JSON.parse(jsonMatch[0]) as LLMRhymeSuggestion[];
    } catch (error) {
      console.error('LLM rhyme suggestion failed:', error);
      return [];
    }
  }

  /**
   * Проверяет, доступен ли LLM
   */
  hasLLM(): boolean {
    return !!this.openaiApiKey;
  }
}
