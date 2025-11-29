import {
  VOWELS,
  LETTER_TO_PHONEME,
  IOTATED_VOWELS,
  DEVOICING,
  VOWEL_REDUCTION,
  SOFT_SIGN,
} from '../constants/phonetic-maps';

export interface TransliterationResult {
  phonetic: string;      // Полная фонетическая запись
  simplified: string;    // Упрощённая (только ключевые звуки)
}

/**
 * Транслитерирует русский текст в фонетическую запись
 * 
 * @param text - Исходный текст
 * @param applyReduction - Применять ли редукцию безударных гласных
 * @param stressIndex - Позиция ударной гласной (если известна)
 */
export function transliterate(
  text: string,
  applyReduction = false,
  stressIndex?: number,
): TransliterationResult {
  const normalized = text.toLowerCase().trim();
  const chars = normalized.split('');
  
  let phonetic = '';
  let simplified = '';
  let vowelIndex = 0;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const prevChar = chars[i - 1];
    const nextChar = chars[i + 1];

    // Пропускаем небуквенные символы (кроме дефиса)
    if (!/[а-яё\-]/.test(char)) {
      if (char === ' ' || char === '-') {
        phonetic += char;
        simplified += char;
      }
      continue;
    }

    // Обрабатываем мягкий знак
    if (char === SOFT_SIGN) {
      phonetic += "'";
      continue;
    }

    // Обрабатываем гласные
    if (VOWELS.has(char)) {
      const isStressed = stressIndex !== undefined && vowelIndex === stressIndex;
      const iotated = IOTATED_VOWELS[char];

      let vowelPhoneme: string;

      // Йотированные после гласной или в начале слова дают й+гласная
      if (iotated && (i === 0 || VOWELS.has(prevChar) || prevChar === SOFT_SIGN)) {
        vowelPhoneme = 'j' + iotated.vowel;
      } else if (iotated) {
        // После согласной — только гласная (мягкость уже учтена)
        vowelPhoneme = iotated.vowel;
      } else {
        vowelPhoneme = LETTER_TO_PHONEME[char] || char;
      }

      // Редукция безударных гласных
      if (applyReduction && !isStressed && VOWEL_REDUCTION[char]) {
        vowelPhoneme = VOWEL_REDUCTION[char];
      }

      phonetic += vowelPhoneme;
      simplified += vowelPhoneme;
      vowelIndex++;
      continue;
    }

    // Обрабатываем согласные
    let consonantPhoneme = LETTER_TO_PHONEME[char] || char;

    // Оглушение в конце слова
    if (DEVOICING[char] && (!nextChar || nextChar === ' ' || nextChar === '-')) {
      consonantPhoneme = LETTER_TO_PHONEME[DEVOICING[char]] || consonantPhoneme;
    }

    // Мягкость перед йотированными гласными
    if (nextChar && IOTATED_VOWELS[nextChar]) {
      consonantPhoneme += "'";
    }

    phonetic += consonantPhoneme;
    
    // Для simplified пропускаем мягкость
    simplified += consonantPhoneme.replace("'", '');
  }

  return { phonetic, simplified };
}

/**
 * Упрощённая транслитерация для быстрого сравнения
 * Убирает мягкость, редуцирует гласные
 */
export function simplifiedTransliterate(text: string): string {
  return transliterate(text, true).simplified;
}

/**
 * Извлекает фонетический хвост (для поиска рифм)
 * Последние 2-3 слога в фонетической записи
 */
export function getPhoneticTail(text: string, syllableCount = 2): string {
  const { simplified } = transliterate(text, true);
  
  // Считаем гласные с конца
  let vowelCount = 0;
  let tailStart = simplified.length;
  
  for (let i = simplified.length - 1; i >= 0; i--) {
    if (/[aeiouya]/.test(simplified[i])) {
      vowelCount++;
      if (vowelCount >= syllableCount) {
        // Ищем начало слога (согласная перед этой гласной)
        tailStart = i;
        while (tailStart > 0 && !/[aeiouya\s\-]/.test(simplified[tailStart - 1])) {
          tailStart--;
        }
        break;
      }
    }
  }
  
  return simplified.slice(tailStart);
}

