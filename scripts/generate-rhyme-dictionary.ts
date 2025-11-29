/**
 * Интеграционный тест: парсинг sample_rhymes_texts_oxxymiron.md
 * и генерация читаемого словаря рифм
 * 
 * Запуск: npx ts-node scripts/generate-rhyme-dictionary.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseFullText, ParsedTrack } from '../src/modules/parser/utils/text-parser';
import { extractRhymes, ExtractionResult, ExtractedRhymeFamily } from '../src/modules/parser/utils/rhyme-extractor';

// Путь к файлу с текстами
const SAMPLE_FILE = path.join(__dirname, '..', 'sample_rhymes_texts_oxxymiron.md');
const OUTPUT_FILE = path.join(__dirname, '..', 'rhyme-dictionary.md');

interface DictionaryEntry {
  family: ExtractedRhymeFamily;
  track: string;
  examples: string[];
}

function main() {
  console.log('📖 Reading sample file...');
  const text = fs.readFileSync(SAMPLE_FILE, 'utf-8');
  console.log(`   Read ${text.length} characters\n`);

  console.log('🔍 Parsing tracks...');
  const tracks = parseFullText(text);
  console.log(`   Found ${tracks.length} tracks\n`);

  // Собираем все семейства рифм из всех треков
  const allEntries: DictionaryEntry[] = [];
  let totalFamilies = 0;
  let totalUnits = 0;
  let totalLinks = 0;

  for (const track of tracks) {
    console.log(`   Processing: "${track.title}" (${track.allLines.length} lines)`);
    
    try {
      const result = extractRhymes(track);
      totalFamilies += result.families.length;
      totalUnits += result.units.length;
      totalLinks += result.links.length;

      for (const family of result.families) {
        allEntries.push({
          family,
          track: track.title,
          examples: family.units.map(u => u.text),
        });
      }
    } catch (error) {
      console.error(`   ❌ Error processing "${track.title}":`, error);
    }
  }

  console.log('\n📊 Statistics:');
  console.log(`   Tracks: ${tracks.length}`);
  console.log(`   Families: ${totalFamilies}`);
  console.log(`   Units: ${totalUnits}`);
  console.log(`   Links: ${totalLinks}`);

  // Сортируем по сложности и размеру семейства
  allEntries.sort((a, b) => {
    // Сначала по сложности
    if (b.family.complexity !== a.family.complexity) {
      return b.family.complexity - a.family.complexity;
    }
    // Потом по размеру семейства
    return b.family.units.length - a.family.units.length;
  });

  // Генерируем словарь
  console.log('\n📝 Generating dictionary...');
  const dictionary = generateDictionary(allEntries, tracks);
  
  fs.writeFileSync(OUTPUT_FILE, dictionary, 'utf-8');
  console.log(`   Saved to: ${OUTPUT_FILE}`);
  console.log('\n✅ Done!');
}

function generateDictionary(entries: DictionaryEntry[], tracks: ParsedTrack[]): string {
  const lines: string[] = [];

  // Дедупликация по фонетическому хвосту — объединяем все юниты в одно семейство
  const deduplicatedMap = new Map<string, DictionaryEntry>();
  for (const entry of entries) {
    const key = entry.family.phoneticTail;
    if (!deduplicatedMap.has(key)) {
      deduplicatedMap.set(key, { ...entry, examples: [...entry.examples] });
    } else {
      // Объединяем юниты из разных семейств с одинаковой фонетикой
      const existing = deduplicatedMap.get(key)!;
      const existingTexts = new Set(existing.family.units.map(u => u.textSpan));
      for (const unit of entry.family.units) {
        if (!existingTexts.has(unit.textSpan)) {
          existing.family.units.push(unit);
          existingTexts.add(unit.textSpan);
        }
      }
      // Пересчитываем сложность
      const syllables = Math.max(...existing.family.units.map(u => 
        (u.textSpan.match(/[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/gi) || []).length
      ));
      existing.family.complexity = Math.min(5, Math.max(1,
        1 + Math.floor(syllables / 2) + (existing.family.units.length > 2 ? 1 : 0)
      ));
    }
  }
  
  const dedupEntries = Array.from(deduplicatedMap.values())
    .sort((a, b) => {
      if (b.family.complexity !== a.family.complexity) {
        return b.family.complexity - a.family.complexity;
      }
      return b.family.units.length - a.family.units.length;
    });

  // Header
  lines.push('# 📖 Словарь рифм Oxxxymiron');
  lines.push('');
  lines.push('> Автоматически извлечено из miXXXtape I');
  lines.push('> Алгоритм: фонетический анализ + sliding window');
  lines.push('');

  // Statistics
  lines.push('## 📊 Статистика');
  lines.push('');
  lines.push(`| Метрика | Значение |`);
  lines.push(`|---------|----------|`);
  lines.push(`| Треков | ${tracks.length} |`);
  lines.push(`| Уникальных семейств рифм | ${dedupEntries.length} |`);
  lines.push(`| Уникальных рифмо-юнитов | ${dedupEntries.reduce((sum, e) => sum + e.family.units.length, 0)} |`);
  lines.push('');

  // Complexity legend
  lines.push('## 🎯 Легенда сложности');
  lines.push('');
  lines.push('- ⭐ — простая рифма (1-2 слога)');
  lines.push('- ⭐⭐ — средняя рифма');
  lines.push('- ⭐⭐⭐ — сложная рифма (3+ слога)');
  lines.push('- ⭐⭐⭐⭐ — мультисиллабическая рифма');
  lines.push('- ⭐⭐⭐⭐⭐ — уникальная/каламбур');
  lines.push('');

  // Top rhymes section
  lines.push('## 🏆 Топ рифмы (сложность 3+)');
  lines.push('');

  const topRhymes = dedupEntries.filter(e => e.family.complexity >= 3);
  
  if (topRhymes.length === 0) {
    lines.push('_Не найдено рифм со сложностью 3+_');
  } else {
    for (const entry of topRhymes.slice(0, 30)) {
      lines.push(formatFamilyEntry(entry));
    }
  }

  // All rhymes by track  
  lines.push('');
  lines.push('## 🎵 Рифмы по трекам');
  lines.push('');

  // Group by track (use original entries to keep track association)
  const byTrack = new Map<string, DictionaryEntry[]>();
  for (const entry of entries) {
    if (!byTrack.has(entry.track)) {
      byTrack.set(entry.track, []);
    }
    // Дедупликация внутри трека
    const existing = byTrack.get(entry.track)!;
    if (!existing.some(e => e.family.phoneticTail === entry.family.phoneticTail)) {
      byTrack.get(entry.track)!.push(entry);
    }
  }

  for (const [trackName, trackEntries] of byTrack) {
    // Сортируем по сложности
    trackEntries.sort((a, b) => b.family.complexity - a.family.complexity);
    
    lines.push(`### ${trackName}`);
    lines.push('');
    
    if (trackEntries.length === 0) {
      lines.push('_Рифм не найдено_');
    } else {
      // Показываем только топ-10 для каждого трека
      for (const entry of trackEntries.slice(0, 10)) {
        lines.push(formatFamilyEntryCompact(entry));
      }
      
      if (trackEntries.length > 10) {
        lines.push(`_...и ещё ${trackEntries.length - 10} семейств_`);
      }
    }
    
    lines.push('');
  }

  // Full dictionary (compact)
  lines.push('## 📚 Полный словарь');
  lines.push('');
  lines.push('Формат: `[фонетика]` варианты');
  lines.push('');

  // Sort alphabetically by phonetic tail
  const sortedEntries = [...dedupEntries].sort((a, b) => 
    a.family.phoneticTail.localeCompare(b.family.phoneticTail)
  );

  for (const entry of sortedEntries) {
    const uniqueUnits = [...new Set(entry.family.units.map(u => u.textSpan))].slice(0, 5);
    const more = entry.family.units.length > 5 ? ` (+${entry.family.units.length - 5})` : '';
    
    lines.push(`\`[${entry.family.phoneticTail}]\` ${uniqueUnits.join(' / ')}${more}`);
  }

  return lines.join('\n');
}

function formatFamilyEntry(entry: DictionaryEntry): string {
  const stars = '⭐'.repeat(Math.min(entry.family.complexity, 5));
  // Уникальные варианты
  const uniqueUnits = [...new Set(entry.family.units.map(u => u.textSpan))];
  const units = uniqueUnits.map(u => `"${u}"`).join(', ');
  
  return `
### ${stars} ${entry.family.patternText}

- **Фонетика:** \`${entry.family.phoneticTail}\`
- **Элементов:** ${uniqueUnits.length}
- **Варианты:** ${units}
`;
}

function formatFamilyEntryCompact(entry: DictionaryEntry): string {
  const stars = '⭐'.repeat(Math.min(entry.family.complexity, 5));
  const units = entry.family.units
    .slice(0, 4)
    .map(u => u.textSpan)
    .join(' / ');
  
  return `- ${stars} **${entry.family.patternText}** → ${units}`;
}

// Run
main();

