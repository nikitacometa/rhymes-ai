import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { transliterate, getPhoneticTail, simplifiedTransliterate } from './utils/transliterate';
import { calculatePhoneticSimilarity, classifyRhymeMatch, areRhyming } from './utils/similarity';
import { countSyllables, splitIntoSyllables, getRhymeTail } from './utils/syllables';
import { analyzePhoneticsWithLLM, needsLLMAnalysis, LLMPhoneticResult } from './utils/llm-phonetic';
import { Language } from '@prisma/client';

export interface PhoneticAnalysis {
  original: string;
  phoneticFull: string;
  phoneticTail: string;
  simplified: string;
  syllableCount: number;
  stressPattern?: string;
  isPun: boolean;
  punExplanation?: string;
  source: 'rules' | 'llm' | 'cache';
}

@Injectable()
export class PhoneticService {
  private openaiApiKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  /**
   * Главный метод — анализирует текст и возвращает фонетику
   * 
   * 1. Проверяет кэш
   * 2. Если нужен LLM — вызывает его
   * 3. Иначе использует правила
   * 4. Сохраняет в кэш
   */
  async analyze(text: string, useLLM = true): Promise<PhoneticAnalysis> {
    const normalized = text.toLowerCase().trim();

    // 1. Проверяем кэш
    const cached = await this.getFromCache(normalized);
    if (cached) {
      return {
        original: text,
        phoneticFull: cached.phoneticFull,
        phoneticTail: cached.phoneticTail,
        simplified: simplifiedTransliterate(normalized),
        syllableCount: countSyllables(normalized),
        stressPattern: cached.stressPattern || undefined,
        isPun: false,
        source: 'cache',
      };
    }

    // 2. Определяем, нужен ли LLM
    let llmResult: LLMPhoneticResult | null = null;
    
    if (useLLM && this.openaiApiKey && needsLLMAnalysis(normalized)) {
      llmResult = await analyzePhoneticsWithLLM(text, this.openaiApiKey);
    }

    // 3. Формируем результат
    let result: PhoneticAnalysis;

    if (llmResult) {
      result = {
        original: text,
        phoneticFull: llmResult.phoneticFull,
        phoneticTail: llmResult.phoneticTail,
        simplified: simplifiedTransliterate(normalized),
        syllableCount: countSyllables(normalized),
        stressPattern: llmResult.stressPattern,
        isPun: llmResult.isPun,
        punExplanation: llmResult.punExplanation,
        source: 'llm',
      };
    } else {
      // Используем правила
      const { phonetic, simplified } = transliterate(normalized, true);
      const phoneticTail = getPhoneticTail(normalized, 2);

      result = {
        original: text,
        phoneticFull: phonetic,
        phoneticTail,
        simplified,
        syllableCount: countSyllables(normalized),
        isPun: false,
        source: 'rules',
      };
    }

    // 4. Сохраняем в кэш
    await this.saveToCache(normalized, result);

    return result;
  }

  /**
   * Быстрый анализ без LLM (только правила)
   */
  analyzeSync(text: string): PhoneticAnalysis {
    const normalized = text.toLowerCase().trim();
    const { phonetic, simplified } = transliterate(normalized, true);
    const phoneticTail = getPhoneticTail(normalized, 2);

    return {
      original: text,
      phoneticFull: phonetic,
      phoneticTail,
      simplified,
      syllableCount: countSyllables(normalized),
      isPun: false,
      source: 'rules',
    };
  }

  /**
   * Сравнивает два текста и возвращает информацию о рифме
   */
  async compareRhymes(textA: string, textB: string): Promise<{
    similarity: number;
    matchType: 'EXACT' | 'SLANT' | 'ASSONANCE' | 'CONSONANCE' | null;
    isRhyme: boolean;
    analysisA: PhoneticAnalysis;
    analysisB: PhoneticAnalysis;
  }> {
    const [analysisA, analysisB] = await Promise.all([
      this.analyze(textA),
      this.analyze(textB),
    ]);

    const similarity = calculatePhoneticSimilarity(
      analysisA.phoneticTail,
      analysisB.phoneticTail,
    );

    return {
      similarity,
      matchType: classifyRhymeMatch(similarity),
      isRhyme: areRhyming(analysisA.phoneticTail, analysisB.phoneticTail),
      analysisA,
      analysisB,
    };
  }

  /**
   * Быстрая проверка рифмы (только правила, без кэша)
   */
  isRhymeSync(textA: string, textB: string, threshold = 0.7): boolean {
    const tailA = getPhoneticTail(textA.toLowerCase(), 2);
    const tailB = getPhoneticTail(textB.toLowerCase(), 2);
    return areRhyming(tailA, tailB, threshold);
  }

  /**
   * Вычисляет similarity между двумя текстами
   */
  getSimilaritySync(textA: string, textB: string): number {
    const tailA = getPhoneticTail(textA.toLowerCase(), 2);
    const tailB = getPhoneticTail(textB.toLowerCase(), 2);
    return calculatePhoneticSimilarity(tailA, tailB);
  }

  // =====================================================
  // CACHE METHODS
  // =====================================================

  private async getFromCache(text: string) {
    return this.prisma.phoneticCache.findUnique({
      where: { text },
    });
  }

  private async saveToCache(text: string, analysis: PhoneticAnalysis) {
    try {
      await this.prisma.phoneticCache.upsert({
        where: { text },
        create: {
          text,
          language: Language.RU,
          phoneticFull: analysis.phoneticFull,
          phoneticTail: analysis.phoneticTail,
          stressPattern: analysis.stressPattern,
          source: analysis.source,
        },
        update: {
          phoneticFull: analysis.phoneticFull,
          phoneticTail: analysis.phoneticTail,
          stressPattern: analysis.stressPattern,
          source: analysis.source,
        },
      });
    } catch (error) {
      // Игнорируем ошибки кэширования — не критично
      console.error('Failed to cache phonetic analysis:', error);
    }
  }

  // =====================================================
  // UTILITY — экспортируем утилиты для использования в других модулях
  // =====================================================

  utils = {
    transliterate,
    simplifiedTransliterate,
    getPhoneticTail,
    calculatePhoneticSimilarity,
    classifyRhymeMatch,
    areRhyming,
    countSyllables,
    splitIntoSyllables,
    getRhymeTail,
  };
}
