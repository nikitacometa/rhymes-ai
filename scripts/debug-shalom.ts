/**
 * Дебаг: проверяем парсинг трека "Шалом" с знаменитой рифмой
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseFullText } from '../src/modules/parser/utils/text-parser';
import { extractRhymes } from '../src/modules/parser/utils/rhyme-extractor';
import { getPhoneticTail } from '../src/modules/phonetic/utils/transliterate';

const SAMPLE_FILE = path.join(__dirname, '..', 'sample_rhymes_texts_oxxymiron.md');

function main() {
  const text = fs.readFileSync(SAMPLE_FILE, 'utf-8');
  const tracks = parseFullText(text);
  
  // Найдём трек "Шалом"
  const shalom = tracks.find(t => t.title.includes('Шалом'));
  
  if (!shalom) {
    console.log('❌ Трек "Шалом" не найден');
    return;
  }
  
  console.log(`\n🎵 Трек: ${shalom.title}`);
  console.log(`   Секций: ${shalom.sections.length}`);
  console.log(`   Строк: ${shalom.allLines.length}\n`);
  
  // Ищем строки с "оскала/Скала"
  console.log('📍 Строки с "оскала/Скала":');
  for (const line of shalom.allLines) {
    if (line.cleanText.toLowerCase().includes('скала') || 
        line.cleanText.toLowerCase().includes('оскала') ||
        line.cleanText.toLowerCase().includes('ласкала') ||
        line.cleanText.toLowerCase().includes('лоскала')) {
      const tail = getPhoneticTail(line.tail, 2);
      console.log(`   [${line.globalIndex}] "${line.cleanText}"`);
      console.log(`       tail: "${line.tail}" → phonetic: "${tail}"`);
    }
  }
  
  // Извлекаем рифмы
  console.log('\n🔍 Извлечённые семейства:');
  const result = extractRhymes(shalom);
  
  // Ищем семейство с "skala"
  for (const family of result.families) {
    if (family.phoneticTail.includes('skala') || 
        family.patternText.toLowerCase().includes('скала')) {
      console.log(`\n   Family: "${family.patternText}"`);
      console.log(`   Phonetic: ${family.phoneticTail}`);
      console.log(`   Complexity: ${family.complexity}`);
      console.log(`   Units (${family.units.length}):`);
      for (const unit of family.units) {
        console.log(`     - "${unit.textSpan}" (line ${unit.lineIndex})`);
      }
    }
  }
  
  // Проверим все юниты со skala
  console.log('\n📋 Все юниты с phoneticTail содержащим "skala":');
  for (const unit of result.units) {
    if (unit.phoneticTail.includes('skala')) {
      console.log(`   "${unit.textSpan}" → ${unit.phoneticTail} (line ${unit.globalLineIndex})`);
    }
  }
}

main();

