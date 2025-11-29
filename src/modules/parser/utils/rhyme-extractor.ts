/**
 * Алгоритм извлечения рифм из текста
 * 
 * Использует sliding window для поиска рифмующихся строк
 * + LLM для сложных случаев (каламбуры, омофоны)
 */

import { ParsedLine, ParsedTrack, ParsedSection } from './text-parser';
import { getPhoneticTail, simplifiedTransliterate } from '../../phonetic/utils/transliterate';
import { calculatePhoneticSimilarity, classifyRhymeMatch } from '../../phonetic/utils/similarity';
import { MatchType } from '@prisma/client';
import OpenAI from 'openai';

export interface ExtractedRhymeUnit {
  lineIndex: number;
  globalLineIndex: number;
  text: string;          // Полный текст строки
  textSpan: string;      // Рифмующийся фрагмент (хвост)
  charStart: number;     // Позиция начала в строке
  charEnd: number;       // Позиция конца
  phoneticTail: string;  // Фонетический хвост
  section: string;       // Название секции
}

export interface ExtractedRhymeLink {
  unitAIndex: number;    // Индекс первого юнита
  unitBIndex: number;    // Индекс второго юнита
  matchType: MatchType;
  similarity: number;
  distanceLines: number;
}

export interface ExtractedRhymeFamily {
  patternText: string;
  phoneticTail: string;
  units: ExtractedRhymeUnit[];
  links: ExtractedRhymeLink[];
  complexity: number;
}

export interface ExtractionResult {
  units: ExtractedRhymeUnit[];
  links: ExtractedRhymeLink[];
  families: ExtractedRhymeFamily[];
  candidates?: RhymeCandidate[];  // Кандидаты для LLM-проверки
}

/** Кандидат на рифму — пара строк, которые могут рифмоваться */
export interface RhymeCandidate {
  lineA: string;
  lineB: string;
  tailA: string;
  tailB: string;
  distance: number;
  ruleSimilarity: number;  // Сходство по правилам (низкое)
}

/** Результат LLM-верификации */
export interface LLMVerifiedRhyme {
  tailA: string;
  tailB: string;
  isRhyme: boolean;
  rhymeType: 'exact' | 'slant' | 'assonance' | 'pun' | 'none';
  explanation?: string;
  confidence: number;
}

// Настройки алгоритма
const CONFIG = {
  windowSize: 4,           // Размер окна для поиска рифм
  minSimilarity: 0.7,      // Минимальный порог сходства для правил
  candidateSimilarity: 0.3, // Порог для кандидатов на LLM-проверку
  minTailLength: 3,        // Минимальная длина хвоста
  maxCandidates: 50,       // Макс. кандидатов на LLM за трек
};

/**
 * Главная функция — извлекает рифмы из трека
 * 
 * @param collectCandidates — собирать ли кандидатов для LLM
 */
export function extractRhymes(track: ParsedTrack, collectCandidates = false): ExtractionResult {
  const units: ExtractedRhymeUnit[] = [];
  const links: ExtractedRhymeLink[] = [];
  const candidates: RhymeCandidate[] = [];

  // 1. Создаём юниты из всех строк
  for (const section of track.sections) {
    for (const line of section.lines) {
      const unit = createUnit(line, section.name);
      if (unit) {
        units.push(unit);
      }
    }
  }

  // 2. Ищем рифмы sliding window
  for (let i = 0; i < units.length; i++) {
    // Сравниваем с предыдущими N строками
    for (let j = Math.max(0, i - CONFIG.windowSize); j < i; j++) {
      const similarity = calculatePhoneticSimilarity(
        units[i].phoneticTail,
        units[j].phoneticTail,
      );

      if (similarity >= CONFIG.minSimilarity) {
        // Хорошая рифма — добавляем как link
        const matchType = classifyRhymeMatch(similarity);
        
        if (matchType) {
          links.push({
            unitAIndex: j,
            unitBIndex: i,
            matchType: matchType as MatchType,
            similarity,
            distanceLines: i - j,
          });
        }
      } else if (collectCandidates && 
                 similarity >= CONFIG.candidateSimilarity &&
                 candidates.length < CONFIG.maxCandidates) {
        // Низкая похожесть, но близкие строки — кандидат на LLM
        // Приоритизируем: соседние строки (distance=1) и интересные случаи
        const isInteresting = 
          hasLatinChars(units[i].textSpan) || 
          hasLatinChars(units[j].textSpan) ||
          units[i].textSpan.includes('-') ||
          units[j].textSpan.includes('-') ||
          (i - j === 1); // Соседние строки почти наверняка должны рифмоваться

        if (isInteresting) {
          candidates.push({
            lineA: units[j].text,
            lineB: units[i].text,
            tailA: units[j].textSpan,
            tailB: units[i].textSpan,
            distance: i - j,
            ruleSimilarity: similarity,
          });
        }
      }
    }
  }

  // 3. Группируем в семейства
  const families = groupIntoFamilies(units, links);

  return { units, links, families, candidates: collectCandidates ? candidates : undefined };
}

/** Проверяет наличие латиницы (иностранные слова) */
function hasLatinChars(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

/**
 * Создаёт RhymeUnit из ParsedLine
 */
function createUnit(line: ParsedLine, section: string): ExtractedRhymeUnit | null {
  const tail = line.tail;
  
  // Пропускаем слишком короткие хвосты
  if (tail.length < CONFIG.minTailLength) {
    return null;
  }

  const phoneticTail = getPhoneticTail(tail, 2);
  
  // Пропускаем если фонетический хвост пустой
  if (phoneticTail.length < 2) {
    return null;
  }

  // Находим позицию хвоста в строке
  const charStart = line.cleanText.lastIndexOf(tail);
  const charEnd = charStart + tail.length;

  return {
    lineIndex: line.index,
    globalLineIndex: line.globalIndex,
    text: line.cleanText,
    textSpan: tail,
    charStart: charStart >= 0 ? charStart : 0,
    charEnd: charEnd >= 0 ? charEnd : line.cleanText.length,
    phoneticTail,
    section,
  };
}

/**
 * Группирует юниты и связи в семейства рифм
 * 
 * Группировка по phoneticTail (не Union-Find!)
 * Union-Find создавал транзитивные связи между нерифмующимися элементами
 */
function groupIntoFamilies(
  units: ExtractedRhymeUnit[],
  links: ExtractedRhymeLink[],
): ExtractedRhymeFamily[] {
  // Группируем юниты по phoneticTail
  const byPhonetic = new Map<string, number[]>();
  
  for (let i = 0; i < units.length; i++) {
    const phonetic = units[i].phoneticTail;
    if (!byPhonetic.has(phonetic)) {
      byPhonetic.set(phonetic, []);
    }
    byPhonetic.get(phonetic)!.push(i);
  }

  // Создаём семейства только из групп с 2+ юнитами
  const families: ExtractedRhymeFamily[] = [];
  
  for (const [phonetic, indices] of byPhonetic) {
    if (indices.length < 2) continue;

    const familyUnits = indices.map(i => units[i]);
    
    // Фильтруем связи — только между юнитами этой группы
    const familyLinks = links.filter(
      l => indices.includes(l.unitAIndex) && indices.includes(l.unitBIndex),
    );

    // Выбираем паттерн — самый длинный хвост
    const patternUnit = familyUnits.reduce((a, b) => 
      a.textSpan.length >= b.textSpan.length ? a : b
    );

    // Рассчитываем сложность
    const complexity = calculateComplexity(familyUnits, familyLinks);

    families.push({
      patternText: patternUnit.textSpan,
      phoneticTail: phonetic,
      units: familyUnits,
      links: familyLinks,
      complexity,
    });
  }

  // Сортируем по сложности (сложные первые)
  families.sort((a, b) => b.complexity - a.complexity);

  return families;
}

/**
 * Рассчитывает сложность семейства рифм
 * 
 * complexity = 1
 *   + syllables * 0.5
 *   + (has_slant ? 1 : 0)
 *   + (chain_length > 2 ? 1 : 0)
 */
function calculateComplexity(
  units: ExtractedRhymeUnit[],
  links: ExtractedRhymeLink[],
): number {
  let complexity = 1;

  // Длина хвоста (количество слогов)
  const avgTailLength = units.reduce((sum, u) => sum + u.phoneticTail.length, 0) / units.length;
  const syllables = Math.floor(avgTailLength / 2); // примерно 2 символа на слог
  complexity += syllables * 0.5;

  // Есть ли slant-рифмы?
  const hasSlant = links.some(l => l.matchType === 'SLANT');
  if (hasSlant) complexity += 1;

  // Длина цепочки > 2?
  if (units.length > 2) complexity += 1;

  // Ограничиваем 1-5
  return Math.min(5, Math.max(1, Math.round(complexity)));
}

/**
 * Извлекает рифмы из секции (для обработки по частям)
 */
export function extractRhymesFromSection(
  section: ParsedSection,
  globalOffset = 0,
): ExtractionResult {
  const pseudoTrack: ParsedTrack = {
    title: section.name,
    sections: [section],
    allLines: section.lines.map((l, i) => ({
      ...l,
      globalIndex: globalOffset + i,
    })),
  };
  
  return extractRhymes(pseudoTrack);
}

/**
 * Проверяет кандидатов через LLM
 * 
 * @param candidates — пары строк для проверки
 * @param apiKey — OpenAI API key
 * @returns — верифицированные рифмы
 */
export async function verifyRhymesWithLLM(
  candidates: RhymeCandidate[],
  apiKey: string,
): Promise<LLMVerifiedRhyme[]> {
  if (!apiKey || candidates.length === 0) {
    return [];
  }

  const openai = new OpenAI({ apiKey });
  const results: LLMVerifiedRhyme[] = [];

  // Батчим кандидатов по 10 для эффективности
  const batchSize = 10;
  
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    
    const prompt = `Ты — эксперт по русским рифмам в рэпе. Проверь, рифмуются ли эти пары строк.

Важно: рэп-рифмы могут быть:
- exact: точная рифма (кошка/ложка)
- slant: неточная рифма (звучит похоже, но не идеально)
- assonance: созвучие гласных
- pun: каламбур/игра слов (Вин Дизель/вин дизель, эманация/Эма нация)
- none: не рифмуются

Пары для проверки:
${batch.map((c, idx) => `${idx + 1}. "${c.tailA}" — "${c.tailB}"`).join('\n')}

Верни JSON массив (без markdown):
[
  {"idx": 1, "isRhyme": true/false, "type": "exact|slant|assonance|pun|none", "confidence": 0.0-1.0, "explanation": "почему"}
]`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) continue;

      // Парсим JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        idx: number;
        isRhyme: boolean;
        type: string;
        confidence: number;
        explanation?: string;
      }>;

      for (const item of parsed) {
        const candidate = batch[item.idx - 1];
        if (!candidate) continue;

        results.push({
          tailA: candidate.tailA,
          tailB: candidate.tailB,
          isRhyme: item.isRhyme,
          rhymeType: item.type as LLMVerifiedRhyme['rhymeType'],
          explanation: item.explanation,
          confidence: item.confidence,
        });
      }
    } catch (error) {
      console.error('LLM verification failed:', error);
    }
  }

  return results;
}

/**
 * Полный pipeline: правила + LLM для сложных случаев
 */
export async function extractRhymesWithLLM(
  track: ParsedTrack,
  apiKey?: string,
): Promise<ExtractionResult & { llmRhymes: LLMVerifiedRhyme[] }> {
  // 1. Извлекаем рифмы правилами + собираем кандидатов
  const result = extractRhymes(track, !!apiKey);
  
  // 2. Если есть API key — проверяем кандидатов через LLM
  let llmRhymes: LLMVerifiedRhyme[] = [];
  
  if (apiKey && result.candidates && result.candidates.length > 0) {
    console.log(`   🤖 LLM: проверяем ${result.candidates.length} кандидатов...`);
    llmRhymes = await verifyRhymesWithLLM(result.candidates, apiKey);
    
    // Фильтруем только подтверждённые рифмы
    llmRhymes = llmRhymes.filter(r => r.isRhyme && r.confidence >= 0.7);
    console.log(`   ✅ Найдено ${llmRhymes.length} дополнительных рифм`);
  }

  return { ...result, llmRhymes };
}

