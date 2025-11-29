/**
 * Утилиты для парсинга текстов песен/треков
 */

export interface ParsedLine {
  index: number;        // Номер строки в секции
  globalIndex: number;  // Номер строки в тексте
  text: string;         // Полный текст строки
  cleanText: string;    // Текст без ремарок (Йе, А, etc.)
  tail: string;         // Хвост строки (последние 1-3 слова)
}

export interface ParsedSection {
  type: 'verse' | 'chorus' | 'intro' | 'outro' | 'bridge' | 'hook' | 'unknown';
  name: string;         // Оригинальное название: "Куплет 1", "Припев"
  lines: ParsedLine[];
}

export interface ParsedTrack {
  title: string;
  sections: ParsedSection[];
  allLines: ParsedLine[];
}

// Паттерны для определения секций
const SECTION_PATTERNS: Record<string, RegExp> = {
  verse: /^\[?(куплет|verse|куп\.?)\s*\d*\]?:?$/i,
  chorus: /^\[?(припев|chorus|хор|ref|refrain)\s*\d*\]?:?$/i,
  intro: /^\[?(интро|intro|вступление)\]?:?$/i,
  outro: /^\[?(аутро|outro|концовка)\]?:?$/i,
  bridge: /^\[?(бридж|bridge|переход)\]?:?$/i,
  hook: /^\[?(хук|hook)\]?:?$/i,
};

// Паттерн для заголовка трека (## Название)
const TRACK_TITLE_PATTERN = /^##\s+(.+)$/;

// Паттерн для ремарок в скобках: (Йе), (А), [?], etc.
const REMARK_PATTERN = /\s*[\(\[][^\)\]]*[\)\]]\s*/g;

// Паттерн для ad-libs в конце строки
const ADLIB_PATTERN = /\s*[\(\[][^\)\]]*[\)\]]$/;

/**
 * Парсит полный текст файла с несколькими треками
 */
export function parseFullText(text: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = [];
  const lines = text.split('\n');
  
  let currentTrack: ParsedTrack | null = null;
  let currentSection: ParsedSection | null = null;
  let globalLineIndex = 0;
  let sectionLineIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Пустая строка — пропускаем
    if (!trimmed) continue;

    // Заголовок трека (## Название)
    const trackMatch = trimmed.match(TRACK_TITLE_PATTERN);
    if (trackMatch) {
      // Сохраняем предыдущий трек
      if (currentTrack && currentSection) {
        currentTrack.sections.push(currentSection);
      }
      if (currentTrack) {
        tracks.push(currentTrack);
      }
      
      // Начинаем новый трек
      currentTrack = {
        title: trackMatch[1],
        sections: [],
        allLines: [],
      };
      currentSection = null;
      globalLineIndex = 0;
      continue;
    }

    // Заголовок секции ([Куплет 1], [Припев], etc.)
    const sectionType = detectSectionType(trimmed);
    if (sectionType) {
      // Сохраняем предыдущую секцию
      if (currentTrack && currentSection) {
        currentTrack.sections.push(currentSection);
      }
      
      currentSection = {
        type: sectionType,
        name: trimmed.replace(/[\[\]]/g, ''),
        lines: [],
      };
      sectionLineIndex = 0;
      continue;
    }

    // Обычная строка текста
    if (currentTrack) {
      // Если нет секции — создаём unknown
      if (!currentSection) {
        currentSection = {
          type: 'unknown',
          name: 'Unknown',
          lines: [],
        };
      }

      const parsedLine = parseLine(trimmed, sectionLineIndex, globalLineIndex);
      
      // Пропускаем строки только из ремарок
      if (parsedLine.cleanText.length > 0) {
        currentSection.lines.push(parsedLine);
        currentTrack.allLines.push(parsedLine);
        sectionLineIndex++;
        globalLineIndex++;
      }
    }
  }

  // Сохраняем последний трек и секцию
  if (currentTrack && currentSection) {
    currentTrack.sections.push(currentSection);
  }
  if (currentTrack) {
    tracks.push(currentTrack);
  }

  return tracks;
}

/**
 * Определяет тип секции по заголовку
 */
function detectSectionType(line: string): ParsedSection['type'] | null {
  for (const [type, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(line)) {
      return type as ParsedSection['type'];
    }
  }
  
  // Проверяем, похоже ли на заголовок секции
  if (/^\[.*\]$/.test(line) || /^[А-Яа-я]+\s*\d*:$/.test(line)) {
    return 'unknown';
  }
  
  return null;
}

/**
 * Парсит одну строку текста
 */
function parseLine(text: string, index: number, globalIndex: number): ParsedLine {
  // Убираем ремарки для cleanText
  const cleanText = text.replace(REMARK_PATTERN, ' ').trim();
  
  // Извлекаем хвост (последние 1-3 слова)
  const tail = extractTail(cleanText);

  return {
    index,
    globalIndex,
    text,
    cleanText,
    tail,
  };
}

/**
 * Извлекает "хвост" строки — последние значимые слова
 */
export function extractTail(text: string, maxWords = 3): string {
  // Убираем знаки препинания в конце
  const cleaned = text.replace(/[.,!?:;]+$/, '').trim();
  
  // Разбиваем на слова
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) return '';
  
  // Берём последние N слов
  const tailWords = words.slice(-maxWords);
  
  // Если последнее слово очень короткое (предлог, частица), берём больше
  if (tailWords.length > 0 && tailWords[tailWords.length - 1].length <= 2) {
    const extraWords = words.slice(-maxWords - 1);
    if (extraWords.length > tailWords.length) {
      return extraWords.join(' ');
    }
  }
  
  return tailWords.join(' ');
}

/**
 * Парсит один трек (без разделения на несколько)
 */
export function parseSingleTrack(text: string, title: string): ParsedTrack {
  const tracks = parseFullText(`## ${title}\n${text}`);
  return tracks[0] || { title, sections: [], allLines: [] };
}

