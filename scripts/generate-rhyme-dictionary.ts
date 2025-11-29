/**
 * Генерация словаря рифм из sample_rhymes_texts_oxxymiron.md
 * 
 * Запуск: npx ts-node scripts/generate-rhyme-dictionary.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseFullText } from '../src/modules/parser/utils/text-parser';
import { extractRhymes, ExtractedRhymeFamily } from '../src/modules/parser/utils/rhyme-extractor';

const SAMPLE_FILE = path.join(__dirname, '..', 'sample_rhymes_texts_oxxymiron.md');
const OUTPUT_FILE = path.join(__dirname, '..', 'rhyme-dictionary.md');

interface RhymeEntry {
  phonetic: string;
  variants: string[];  // Уникальные варианты рифм
  complexity: number;
}

function main() {
  console.log('📖 Читаем файл...');
  const text = fs.readFileSync(SAMPLE_FILE, 'utf-8');
  
  console.log('🔍 Парсим треки...');
  const tracks = parseFullText(text);
  console.log(`   Найдено ${tracks.length} треков`);

  // Собираем все рифмы, группируя по фонетике
  const allRhymes = new Map<string, RhymeEntry>();
  let totalFamilies = 0;
  let totalLinks = 0;

  for (const track of tracks) {
    const result = extractRhymes(track);
    totalFamilies += result.families.length;
    totalLinks += result.links.length;

    for (const family of result.families) {
      const key = family.phoneticTail;
      
      // Уникальные варианты текста
      const newVariants = [...new Set(family.units.map(u => u.textSpan))];
      
      if (!allRhymes.has(key)) {
        allRhymes.set(key, {
          phonetic: key,
          variants: newVariants,
          complexity: family.complexity,
        });
      } else {
        // Добавляем новые варианты
        const existing = allRhymes.get(key)!;
        for (const v of newVariants) {
          if (!existing.variants.includes(v)) {
            existing.variants.push(v);
          }
        }
        // Обновляем сложность (берём максимум)
        existing.complexity = Math.max(existing.complexity, family.complexity);
      }
    }
  }

  console.log('\n📊 Статистика:');
  console.log(`   Треков: ${tracks.length}`);
  console.log(`   Семейств рифм: ${totalFamilies}`);
  console.log(`   Уникальных паттернов: ${allRhymes.size}`);
  console.log(`   Связей: ${totalLinks}`);

  // Генерируем словарь
  console.log('\n📝 Генерируем словарь...');
  const dictionary = generateDictionary(allRhymes, tracks.length);
  
  fs.writeFileSync(OUTPUT_FILE, dictionary, 'utf-8');
  console.log(`   Сохранено: ${OUTPUT_FILE}`);
  console.log('\n✅ Готово!');
}

function generateDictionary(rhymes: Map<string, RhymeEntry>, trackCount: number): string {
  const lines: string[] = [];

  // Конвертируем в массив и сортируем
  const entries = Array.from(rhymes.values())
    .filter(e => e.variants.length >= 2) // Только настоящие рифмы (2+ варианта)
    .sort((a, b) => {
      // Сначала по количеству вариантов
      if (b.variants.length !== a.variants.length) {
        return b.variants.length - a.variants.length;
      }
      // Потом по сложности
      return b.complexity - a.complexity;
    });

  // Header
  lines.push('# Словарь рифм Oxxxymiron');
  lines.push('');
  lines.push(`> Автоматически извлечено из miXXXtape I (${trackCount} треков)`);
  lines.push('');
  lines.push(`**Всего рифмо-паттернов:** ${entries.length}`);
  lines.push('');

  // Топ рифмы (4+ варианта)
  const topRhymes = entries.filter(e => e.variants.length >= 4);
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
  
  for (const entry of entries) {
    lines.push(formatEntry(entry));
  }

  return lines.join('\n');
}

function formatEntry(entry: RhymeEntry): string {
  const variants = entry.variants.join(' / ');
  return `- ${variants}`;
}

main();
