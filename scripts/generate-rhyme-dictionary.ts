/**
 * Генерация словаря рифм из sample_rhymes_texts_oxxymiron.md
 * 
 * Запуск без LLM:  npx ts-node scripts/generate-rhyme-dictionary.ts
 * Запуск с LLM:    OPENAI_API_KEY=sk-xxx npx ts-node scripts/generate-rhyme-dictionary.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseFullText } from '../src/modules/parser/utils/text-parser';
import { 
  extractRhymes, 
  extractRhymesWithLLM,
  ExtractedRhymeFamily,
  LLMVerifiedRhyme,
} from '../src/modules/parser/utils/rhyme-extractor';

const SAMPLE_FILE = path.join(__dirname, '..', 'sample_rhymes_texts_oxxymiron.md');
const OUTPUT_FILE = path.join(__dirname, '..', 'rhyme-dictionary.md');

// API key из env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface RhymeEntry {
  phonetic: string;
  variants: string[];  // Уникальные варианты рифм
  complexity: number;
  isLLM?: boolean;     // Найдено через LLM
  explanation?: string; // Объяснение (для каламбуров)
}

async function main() {
  console.log('📖 Читаем файл...');
  const text = fs.readFileSync(SAMPLE_FILE, 'utf-8');
  
  console.log('🔍 Парсим треки...');
  const tracks = parseFullText(text);
  console.log(`   Найдено ${tracks.length} треков`);

  if (OPENAI_API_KEY) {
    console.log('🤖 LLM включён — будем искать креативные рифмы!\n');
  } else {
    console.log('⚠️  LLM выключен (нет OPENAI_API_KEY)\n');
  }

  // Собираем все рифмы, группируя по фонетике
  const allRhymes = new Map<string, RhymeEntry>();
  const llmRhymes: LLMVerifiedRhyme[] = [];
  let totalFamilies = 0;
  let totalLinks = 0;
  let totalCandidates = 0;

  for (const track of tracks) {
    console.log(`   Обрабатываем: "${track.title}"`);
    
    if (OPENAI_API_KEY) {
      // С LLM — полный pipeline
      const result = await extractRhymesWithLLM(track, OPENAI_API_KEY);
      totalFamilies += result.families.length;
      totalLinks += result.links.length;
      totalCandidates += result.candidates?.length || 0;
      
      // Добавляем LLM-рифмы
      for (const llm of result.llmRhymes) {
        llmRhymes.push(llm);
      }
      
      // Добавляем rule-based рифмы
      addFamiliesToMap(result.families, allRhymes);
    } else {
      // Без LLM — только правила
      const result = extractRhymes(track, false);
      totalFamilies += result.families.length;
      totalLinks += result.links.length;
      
      addFamiliesToMap(result.families, allRhymes);
    }
  }

  // Добавляем LLM-рифмы в общий список
  for (const llm of llmRhymes) {
    const key = `llm_${llm.tailA}_${llm.tailB}`;
    if (!allRhymes.has(key)) {
      allRhymes.set(key, {
        phonetic: llm.rhymeType,
        variants: [llm.tailA, llm.tailB],
        complexity: llm.rhymeType === 'pun' ? 5 : 4,
        isLLM: true,
        explanation: llm.explanation,
      });
    }
  }

  console.log('\n📊 Статистика:');
  console.log(`   Треков: ${tracks.length}`);
  console.log(`   Семейств (правила): ${totalFamilies}`);
  console.log(`   Уникальных паттернов: ${allRhymes.size}`);
  console.log(`   Связей: ${totalLinks}`);
  if (OPENAI_API_KEY) {
    console.log(`   LLM кандидатов: ${totalCandidates}`);
    console.log(`   LLM подтверждённых: ${llmRhymes.length}`);
  }

  // Генерируем словарь
  console.log('\n📝 Генерируем словарь...');
  const dictionary = generateDictionary(allRhymes, tracks.length, llmRhymes.length);
  
  fs.writeFileSync(OUTPUT_FILE, dictionary, 'utf-8');
  console.log(`   Сохранено: ${OUTPUT_FILE}`);
  console.log('\n✅ Готово!');
}

function addFamiliesToMap(families: ExtractedRhymeFamily[], map: Map<string, RhymeEntry>) {
  for (const family of families) {
    const key = family.phoneticTail;
    const newVariants = [...new Set(family.units.map(u => u.textSpan))];
    
    if (!map.has(key)) {
      map.set(key, {
        phonetic: key,
        variants: newVariants,
        complexity: family.complexity,
      });
    } else {
      const existing = map.get(key)!;
      for (const v of newVariants) {
        if (!existing.variants.includes(v)) {
          existing.variants.push(v);
        }
      }
      existing.complexity = Math.max(existing.complexity, family.complexity);
    }
  }
}

function generateDictionary(rhymes: Map<string, RhymeEntry>, trackCount: number, llmCount: number): string {
  const lines: string[] = [];

  // Конвертируем в массив и сортируем
  const entries = Array.from(rhymes.values())
    .filter(e => e.variants.length >= 2) // Только настоящие рифмы (2+ варианта)
    .sort((a, b) => {
      // LLM-рифмы первые
      if (a.isLLM !== b.isLLM) return a.isLLM ? -1 : 1;
      // Потом по количеству вариантов
      if (b.variants.length !== a.variants.length) {
        return b.variants.length - a.variants.length;
      }
      // Потом по сложности
      return b.complexity - a.complexity;
    });

  const llmEntries = entries.filter(e => e.isLLM);
  const ruleEntries = entries.filter(e => !e.isLLM);

  // Header
  lines.push('# Словарь рифм Oxxxymiron');
  lines.push('');
  lines.push(`> Автоматически извлечено из miXXXtape I (${trackCount} треков)`);
  lines.push('');
  lines.push(`**Всего рифмо-паттернов:** ${entries.length}`);
  if (llmCount > 0) {
    lines.push(`**Креативных (LLM):** ${llmEntries.length}`);
  }
  lines.push('');

  // LLM-рифмы (каламбуры, креативные)
  if (llmEntries.length > 0) {
    lines.push('## 🎭 Креативные рифмы (найдены LLM)');
    lines.push('');
    for (const entry of llmEntries) {
      lines.push(formatEntry(entry));
    }
    lines.push('');
  }

  // Топ рифмы (4+ варианта)
  const topRhymes = ruleEntries.filter(e => e.variants.length >= 4);
  if (topRhymes.length > 0) {
    lines.push('## 🏆 Топ (4+ варианта)');
    lines.push('');
    for (const entry of topRhymes) {
      lines.push(formatEntry(entry));
    }
    lines.push('');
  }

  // Все рифмы
  lines.push('## 📚 Все рифмы');
  lines.push('');
  
  for (const entry of ruleEntries) {
    lines.push(formatEntry(entry));
  }

  return lines.join('\n');
}

function formatEntry(entry: RhymeEntry): string {
  const variants = entry.variants.join(' / ');
  const suffix = entry.explanation ? ` _(${entry.explanation})_` : '';
  return `- ${variants}${suffix}`;
}

main().catch(console.error);
