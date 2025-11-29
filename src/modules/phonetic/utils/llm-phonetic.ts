import OpenAI from 'openai';

export interface LLMPhoneticResult {
  phoneticFull: string;
  phoneticTail: string;
  stressIndex: number;
  stressPattern: string;
  isPun: boolean;
  punExplanation?: string;
}

/**
 * Использует LLM для сложных случаев фонетизации:
 * - Омофоны и каламбуры
 * - Иностранные слова
 * - Нестандартное произношение
 */
export async function analyzePhoneticsWithLLM(
  text: string,
  apiKey: string,
): Promise<LLMPhoneticResult | null> {
  if (!apiKey) {
    return null;
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `Ты — эксперт по русской фонетике и рифмам в рэпе.

Проанализируй текст и верни JSON с фонетической информацией.

Текст: "${text}"

Верни ТОЛЬКО JSON без markdown:
{
  "phoneticFull": "полная фонетическая транскрипция на латинице",
  "phoneticTail": "последние 2-3 слога для рифмовки",
  "stressIndex": номер_ударного_слога_с_нуля,
  "stressPattern": "паттерн ударений как 0 1 0 где 1 - ударный слог",
  "isPun": true/false если это каламбур или омофон,
  "punExplanation": "объяснение каламбура если isPun=true"
}

Примеры:
- "пол-оскала" → phoneticTail: "askala"
- "Ла Скала" → phoneticTail: "askala" (рифмуется с пол-оскала)
- "Вин Дизель" (актёр) → phoneticTail: "izel'", isPun: false
- "вин дизель" (заливал дизель вместо вин) → isPun: true, punExplanation: "игра слов: вино + дизель"`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // Парсим JSON из ответа
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as LLMPhoneticResult;
  } catch (error) {
    console.error('LLM phonetic analysis failed:', error);
    return null;
  }
}

/**
 * Определяет, нужен ли LLM для анализа текста
 */
export function needsLLMAnalysis(text: string): boolean {
  // Иностранные слова (латиница)
  if (/[a-zA-Z]/.test(text)) return true;
  
  // Числа, которые могут читаться по-разному
  if (/\d/.test(text)) return true;
  
  // Дефисы — возможный каламбур
  if (text.includes('-') && text.split('-').length > 2) return true;
  
  // Короткие фразы с пробелами — возможный омофон
  const words = text.split(/\s+/);
  if (words.length >= 2 && words.length <= 4) {
    // Проверяем, может ли это быть омофоном
    const combined = words.join('').toLowerCase();
    if (combined.length <= 15) return true;
  }
  
  return false;
}

