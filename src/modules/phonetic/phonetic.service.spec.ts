import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PhoneticService } from './phonetic.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  transliterate,
  getPhoneticTail,
  simplifiedTransliterate,
} from './utils/transliterate';
import { calculatePhoneticSimilarity, areRhyming } from './utils/similarity';
import { countSyllables, splitIntoSyllables } from './utils/syllables';

// Мок PrismaService
const mockPrismaService = {
  phoneticCache: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
};

// Мок ConfigService
const mockConfigService = {
  get: jest.fn().mockReturnValue(''),
};

describe('PhoneticService', () => {
  let service: PhoneticService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneticService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PhoneticService>(PhoneticService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeSync', () => {
    it('should analyze Russian text', () => {
      const result = service.analyzeSync('пол-оскала');
      
      expect(result.original).toBe('пол-оскала');
      expect(result.phoneticTail).toBeTruthy();
      expect(result.syllableCount).toBeGreaterThan(0);
    });
  });

  describe('isRhymeSync', () => {
    it('should detect exact rhymes', () => {
      expect(service.isRhymeSync('пол-оскала', 'Ла Скала')).toBe(true);
      expect(service.isRhymeSync('полоскала', 'поласкала')).toBe(true);
    });

    it('should reject non-rhymes', () => {
      expect(service.isRhymeSync('молоко', 'картошка')).toBe(false);
    });
  });
});

// =====================================================
// UNIT TESTS FOR UTILITIES
// =====================================================

describe('transliterate', () => {
  it('should transliterate basic Russian text', () => {
    const result = transliterate('молоко');
    expect(result.phonetic).toContain('m');
    expect(result.phonetic).toContain('l');
    expect(result.phonetic).toContain('k');
  });

  it('should handle soft consonants', () => {
    const result = transliterate('мяч');
    expect(result.phonetic).toContain("'"); // мягкость
  });

  it('should handle iotated vowels', () => {
    const result = transliterate('яма');
    expect(result.phonetic).toMatch(/^j?y?a/); // Должен начинаться с й
  });
});

describe('getPhoneticTail', () => {
  it('should extract last syllables', () => {
    const tail = getPhoneticTail('пол-оскала', 2);
    expect(tail).toBeTruthy();
    expect(tail.length).toBeGreaterThan(2);
  });

  it('should return similar tails for rhyming words', () => {
    const tail1 = getPhoneticTail('пол-оскала');
    const tail2 = getPhoneticTail('Ла Скала');
    const tail3 = getPhoneticTail('полоскала');
    
    // Все три должны иметь похожие хвосты
    expect(tail1).toBe(tail2);
    expect(tail2).toBe(tail3);
  });
});

describe('calculatePhoneticSimilarity', () => {
  it('should return 1.0 for identical strings', () => {
    const similarity = calculatePhoneticSimilarity('askala', 'askala');
    expect(similarity).toBe(1.0);
  });

  it('should return high similarity for similar strings', () => {
    const similarity = calculatePhoneticSimilarity('askala', 'askalo');
    expect(similarity).toBeGreaterThan(0.7);
  });

  it('should return low similarity for different strings', () => {
    const similarity = calculatePhoneticSimilarity('askala', 'moloko');
    expect(similarity).toBeLessThan(0.5);
  });
});

describe('areRhyming', () => {
  it('should return true for rhyming tails', () => {
    expect(areRhyming('askala', 'askala')).toBe(true);
    expect(areRhyming('askala', 'askalo')).toBe(true);
  });

  it('should return false for non-rhyming tails', () => {
    expect(areRhyming('askala', 'moloko')).toBe(false);
  });
});

describe('countSyllables', () => {
  it('should count syllables correctly', () => {
    expect(countSyllables('молоко')).toBe(3);
    expect(countSyllables('мяч')).toBe(1);
    expect(countSyllables('пол-оскала')).toBe(4);
  });
});

describe('splitIntoSyllables', () => {
  it('should split words into syllables', () => {
    const syllables = splitIntoSyllables('молоко');
    expect(syllables.length).toBeGreaterThan(0);
  });
});

