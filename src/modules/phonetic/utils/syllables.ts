import { VOWELS } from '../constants/phonetic-maps';

/**
 * Разбивает слово на слоги
 * Правило: граница слога проходит перед согласной, за которой следует гласная
 */
export function splitIntoSyllables(word: string): string[] {
  const normalized = word.toLowerCase();
  const syllables: string[] = [];
  let currentSyllable = '';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    currentSyllable += char;

    // Если текущий символ — гласная
    if (VOWELS.has(char)) {
      // Смотрим вперёд: если после гласной идёт согласная + гласная,
      // то согласная относится к следующему слогу
      const nextChar = normalized[i + 1];
      const afterNext = normalized[i + 2];

      if (nextChar && !VOWELS.has(nextChar)) {
        // Если после согласной идёт гласная — граница перед согласной
        if (afterNext && VOWELS.has(afterNext)) {
          syllables.push(currentSyllable);
          currentSyllable = '';
        }
        // Если несколько согласных подряд — сложнее
        // Упрощённо: оставляем одну согласную в текущем слоге
      }
    }
  }

  // Добавляем последний слог
  if (currentSyllable) {
    syllables.push(currentSyllable);
  }

  return syllables;
}

/**
 * Подсчитывает количество слогов в слове
 */
export function countSyllables(word: string): number {
  const normalized = word.toLowerCase();
  let count = 0;
  
  for (const char of normalized) {
    if (VOWELS.has(char)) {
      count++;
    }
  }
  
  return count;
}

/**
 * Извлекает последние N слогов (для phoneticTail)
 */
export function getLastSyllables(word: string, count: number): string {
  const syllables = splitIntoSyllables(word);
  const lastN = syllables.slice(-count);
  return lastN.join('');
}

/**
 * Извлекает "хвост" слова для рифмы
 * От последней ударной гласной до конца
 * Если ударение неизвестно — от последней гласной
 */
export function getRhymeTail(word: string, stressIndex?: number): string {
  const normalized = word.toLowerCase();
  
  // Если известна позиция ударения
  if (stressIndex !== undefined && stressIndex >= 0) {
    return normalized.slice(stressIndex);
  }
  
  // Иначе ищем последнюю гласную
  for (let i = normalized.length - 1; i >= 0; i--) {
    if (VOWELS.has(normalized[i])) {
      return normalized.slice(i);
    }
  }
  
  return normalized;
}

