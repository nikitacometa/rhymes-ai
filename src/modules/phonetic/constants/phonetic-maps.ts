// Карта соответствия русских букв фонемам
// Фонемы записаны в упрощённой ASCII-транскрипции

export const VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я']);
export const CONSONANTS = new Set([
  'б', 'в', 'г', 'д', 'ж', 'з', 'й', 'к', 'л', 'м',
  'н', 'п', 'р', 'с', 'т', 'ф', 'х', 'ц', 'ч', 'ш', 'щ',
]);
export const SOFT_SIGN = 'ь';
export const HARD_SIGN = 'ъ';

// Базовая транслитерация букв в фонемы
export const LETTER_TO_PHONEME: Record<string, string> = {
  'а': 'a',
  'б': 'b',
  'в': 'v',
  'г': 'g',
  'д': 'd',
  'е': 'e',
  'ё': 'o',  // ё всегда ударная
  'ж': 'zh',
  'з': 'z',
  'и': 'i',
  'й': 'j',
  'к': 'k',
  'л': 'l',
  'м': 'm',
  'н': 'n',
  'о': 'o',
  'п': 'p',
  'р': 'r',
  'с': 's',
  'т': 't',
  'у': 'u',
  'ф': 'f',
  'х': 'h',
  'ц': 'ts',
  'ч': 'ch',
  'ш': 'sh',
  'щ': 'sch',
  'ъ': '',
  'ы': 'y',
  'ь': "'",  // мягкий знак как апостроф
  'э': 'e',
  'ю': 'yu',
  'я': 'ya',
};

// Йотированные гласные (после согласных дают мягкость + гласную)
export const IOTATED_VOWELS: Record<string, { soft: boolean; vowel: string }> = {
  'е': { soft: true, vowel: 'e' },
  'ё': { soft: true, vowel: 'o' },
  'ю': { soft: true, vowel: 'u' },
  'я': { soft: true, vowel: 'a' },
  'и': { soft: true, vowel: 'i' },
};

// Оглушение согласных в конце слова
export const DEVOICING: Record<string, string> = {
  'б': 'п',
  'в': 'ф',
  'г': 'к',
  'д': 'т',
  'ж': 'ш',
  'з': 'с',
};

// Редукция безударных гласных
export const VOWEL_REDUCTION: Record<string, string> = {
  'о': 'a',  // молоко -> малако
  'е': 'i',  // весна -> висна
  'я': 'i',  // язык -> изык
};

// Группы согласных по звучанию (для slant-рифм)
export const CONSONANT_GROUPS: Record<string, string[]> = {
  labial: ['б', 'п', 'в', 'ф', 'м'],      // губные
  dental: ['д', 'т', 'з', 'с', 'н', 'л'], // зубные
  velar: ['г', 'к', 'х'],                  // заднеязычные
  sibilant: ['ж', 'ш', 'ч', 'щ', 'ц'],    // шипящие/свистящие
  sonorant: ['м', 'н', 'л', 'р', 'й'],    // сонорные
};

// Веса для расчёта фонетического сходства
export const SIMILARITY_WEIGHTS = {
  vowelMatch: 1.0,        // совпадение гласной
  consonantMatch: 0.8,    // совпадение согласной
  consonantGroup: 0.4,    // согласные из одной группы
  stressMatch: 0.3,       // совпадение ударения
  lengthPenalty: 0.1,     // штраф за разницу в длине
};

