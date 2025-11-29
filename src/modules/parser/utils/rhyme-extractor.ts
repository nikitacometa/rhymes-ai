/**
 * Алгоритм извлечения рифм из текста
 * 
 * Использует sliding window для поиска рифмующихся строк
 */

import { ParsedLine, ParsedTrack, ParsedSection } from './text-parser';
import { getPhoneticTail, simplifiedTransliterate } from '../../phonetic/utils/transliterate';
import { calculatePhoneticSimilarity, classifyRhymeMatch } from '../../phonetic/utils/similarity';
import { MatchType } from '@prisma/client';

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
}

// Настройки алгоритма
const CONFIG = {
  windowSize: 4,           // Размер окна для поиска рифм
  minSimilarity: 0.7,      // Минимальный порог сходства
  minTailLength: 3,        // Минимальная длина хвоста
};

/**
 * Главная функция — извлекает рифмы из трека
 */
export function extractRhymes(track: ParsedTrack): ExtractionResult {
  const units: ExtractedRhymeUnit[] = [];
  const links: ExtractedRhymeLink[] = [];

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
      }
    }
  }

  // 3. Группируем в семейства
  const families = groupIntoFamilies(units, links);

  return { units, links, families };
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

