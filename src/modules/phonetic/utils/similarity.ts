import { CONSONANT_GROUPS, SIMILARITY_WEIGHTS } from '../constants/phonetic-maps';

/**
 * Вычисляет фонетическое сходство двух строк (0.0 - 1.0)
 * 
 * Алгоритм:
 * 1. Сравниваем символы с конца (рифма определяется окончанием)
 * 2. Точное совпадение гласных даёт больше очков
 * 3. Согласные из одной группы дают частичное совпадение
 */
export function calculatePhoneticSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  
  if (shorter.length === 0) return 0;
  
  let score = 0;
  let maxScore = 0;
  
  // Сравниваем с конца
  for (let i = 0; i < shorter.length; i++) {
    const charA = shorter[shorter.length - 1 - i];
    const charB = longer[longer.length - 1 - i];
    
    const isVowelA = /[aeiouya]/.test(charA);
    const isVowelB = /[aeiouya]/.test(charB);
    
    // Оба — гласные
    if (isVowelA && isVowelB) {
      maxScore += SIMILARITY_WEIGHTS.vowelMatch;
      if (charA === charB) {
        score += SIMILARITY_WEIGHTS.vowelMatch;
      }
    }
    // Оба — согласные
    else if (!isVowelA && !isVowelB) {
      maxScore += SIMILARITY_WEIGHTS.consonantMatch;
      
      if (charA === charB) {
        score += SIMILARITY_WEIGHTS.consonantMatch;
      } else if (areInSameConsonantGroup(charA, charB)) {
        score += SIMILARITY_WEIGHTS.consonantGroup;
      }
    }
    // Разные типы — штраф
    else {
      maxScore += SIMILARITY_WEIGHTS.consonantMatch;
    }
  }
  
  // Штраф за разницу в длине
  const lengthDiff = longer.length - shorter.length;
  const lengthPenalty = lengthDiff * SIMILARITY_WEIGHTS.lengthPenalty;
  
  if (maxScore === 0) return 0;
  
  const similarity = Math.max(0, (score - lengthPenalty) / maxScore);
  return Math.round(similarity * 100) / 100;
}

/**
 * Проверяет, принадлежат ли две согласные к одной фонетической группе
 */
function areInSameConsonantGroup(a: string, b: string): boolean {
  for (const group of Object.values(CONSONANT_GROUPS)) {
    // Нужно конвертировать фонемы обратно в русские буквы для проверки
    // Или хранить группы в фонемах — упростим, проверим по звучанию
    const phonemeGroups: Record<string, string[]> = {
      labial: ['b', 'p', 'v', 'f', 'm'],
      dental: ['d', 't', 'z', 's', 'n', 'l'],
      velar: ['g', 'k', 'h'],
      sibilant: ['zh', 'sh', 'ch', 'sch', 'ts'],
      sonorant: ['m', 'n', 'l', 'r', 'j'],
    };
    
    for (const phonemes of Object.values(phonemeGroups)) {
      if (phonemes.includes(a) && phonemes.includes(b)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Определяет тип рифмы на основе сходства
 */
export function classifyRhymeMatch(
  similarity: number,
): 'EXACT' | 'SLANT' | 'ASSONANCE' | 'CONSONANCE' | null {
  if (similarity >= 0.95) return 'EXACT';
  if (similarity >= 0.7) return 'SLANT';
  if (similarity >= 0.5) return 'ASSONANCE';
  if (similarity >= 0.3) return 'CONSONANCE';
  return null;
}

/**
 * Проверяет, рифмуются ли два фонетических хвоста
 */
export function areRhyming(tailA: string, tailB: string, threshold = 0.7): boolean {
  return calculatePhoneticSimilarity(tailA, tailB) >= threshold;
}

