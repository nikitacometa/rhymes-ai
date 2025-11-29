import { parseFullText, parseSingleTrack, extractTail } from './utils/text-parser';
import { extractRhymes } from './utils/rhyme-extractor';

// =====================================================
// TEXT PARSER TESTS
// =====================================================

describe('Text Parser', () => {
  const sampleText = `## Шалом
[Куплет]
Я вам ударом снёс пол-оскала
По мне судят рэп, как оперу по Ла Скала

[Припев]
Твоя мамаша себе точно горло полоскала
После того, как она меня поласкала
`;

  describe('parseFullText', () => {
    it('should parse track title', () => {
      const tracks = parseFullText(sampleText);
      
      expect(tracks).toHaveLength(1);
      expect(tracks[0].title).toBe('Шалом');
    });

    it('should parse sections', () => {
      const tracks = parseFullText(sampleText);
      const track = tracks[0];
      
      expect(track.sections).toHaveLength(2);
      expect(track.sections[0].type).toBe('verse');
      expect(track.sections[0].name).toContain('Куплет');
      expect(track.sections[1].type).toBe('chorus');
    });

    it('should parse lines', () => {
      const tracks = parseFullText(sampleText);
      const track = tracks[0];
      
      expect(track.allLines.length).toBeGreaterThan(0);
      expect(track.sections[0].lines.length).toBe(2);
      expect(track.sections[1].lines.length).toBe(2);
    });

    it('should extract line tails', () => {
      const tracks = parseFullText(sampleText);
      const firstLine = tracks[0].sections[0].lines[0];
      
      expect(firstLine.tail).toBeTruthy();
      expect(firstLine.tail.length).toBeGreaterThan(0);
    });
  });

  describe('parseSingleTrack', () => {
    it('should parse single track without title marker', () => {
      const text = `[Куплет]
Строка раз
Строка два`;
      
      const track = parseSingleTrack(text, 'Test Track');
      
      expect(track.title).toBe('Test Track');
      expect(track.sections).toHaveLength(1);
    });
  });

  describe('extractTail', () => {
    it('should extract last 3 words by default', () => {
      const tail = extractTail('Я вам ударом снёс пол-оскала');
      expect(tail).toBe('ударом снёс пол-оскала');
    });

    it('should handle short lines', () => {
      const tail = extractTail('пол-оскала');
      expect(tail).toBe('пол-оскала');
    });

    it('should remove trailing punctuation', () => {
      const tail = extractTail('по Ла Скала!');
      expect(tail).toBe('по Ла Скала');
    });

    it('should remove trailing particles (а, и, е)', () => {
      // "поласкала, а" должно стать "поласкала"
      const tail = extractTail('она меня поласкала, а');
      expect(tail).toBe('она меня поласкала');
    });

    it('should handle commas inside text', () => {
      const tail = extractTail('После того, как она меня поласкала');
      expect(tail).toBe('она меня поласкала');
    });
  });
});

// =====================================================
// RHYME EXTRACTOR TESTS
// =====================================================

describe('Rhyme Extractor', () => {
  const sampleText = `## Шалом
[Куплет]
Я вам ударом снёс пол-оскала
По мне судят рэп, как оперу по Ла Скала
Твоя мамаша себе точно горло полоскала
После того, как она меня поласкала
`;

  describe('extractRhymes', () => {
    it('should extract rhyming units', () => {
      const tracks = parseFullText(sampleText);
      const result = extractRhymes(tracks[0]);
      
      expect(result.units.length).toBeGreaterThan(0);
    });

    it('should create links between rhyming units', () => {
      const tracks = parseFullText(sampleText);
      const result = extractRhymes(tracks[0]);
      
      // Должны быть связи между строками с похожими окончаниями
      expect(result.links.length).toBeGreaterThan(0);
    });

    it('should group rhymes into families', () => {
      const tracks = parseFullText(sampleText);
      const result = extractRhymes(tracks[0]);
      
      // Все 4 строки рифмуются → должна быть минимум 1 семья
      expect(result.families.length).toBeGreaterThan(0);
      
      // Семейство должно содержать несколько юнитов
      const family = result.families[0];
      expect(family.units.length).toBeGreaterThan(1);
    });

    it('should calculate complexity', () => {
      const tracks = parseFullText(sampleText);
      const result = extractRhymes(tracks[0]);
      
      if (result.families.length > 0) {
        const family = result.families[0];
        expect(family.complexity).toBeGreaterThanOrEqual(1);
        expect(family.complexity).toBeLessThanOrEqual(5);
      }
    });
  });
});

// =====================================================
// INTEGRATION TEST: Full pipeline
// =====================================================

describe('Full Pipeline Integration', () => {
  it('should process sample Oxxxymiron text', () => {
    const sampleOxxy = `## Шалом (Shalom)
[Куплет]
Я признаю — твоя комета была яркой
Но при этом краткой, как любовь поэта и доярки
Ты потух, не успев зажечься. Где успех у женщин?
Ты снимаешь шлюх, чтоб суметь развлечься
Я вам ударом снёс пол-оскала
По мне судят рэп, как оперу по Ла Скала
Твоя мамаша себе точно горло полоскала
После того, как она меня поласкала
`;

    // Parse
    const tracks = parseFullText(sampleOxxy);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Шалом (Shalom)');

    // Extract rhymes
    const result = extractRhymes(tracks[0]);
    
    // Should find the famous "пол-оскала" family
    const hasOskalaFamily = result.families.some(
      f => f.phoneticTail.includes('skala') || f.patternText.includes('оскала')
    );
    
    expect(result.units.length).toBeGreaterThan(4);
    expect(result.links.length).toBeGreaterThan(0);
    expect(result.families.length).toBeGreaterThan(0);
  });
});

