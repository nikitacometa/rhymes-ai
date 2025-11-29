import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PhoneticService } from './phonetic.service';

class AnalyzeDto {
  text: string;
  useLLM?: boolean;
}

class CompareDto {
  textA: string;
  textB: string;
}

@Controller('api/phonetic')
export class PhoneticController {
  constructor(private readonly phoneticService: PhoneticService) {}

  /**
   * POST /api/phonetic/analyze
   * Анализирует текст и возвращает фонетическую информацию
   */
  @Post('analyze')
  async analyze(@Body() dto: AnalyzeDto) {
    return this.phoneticService.analyze(dto.text, dto.useLLM);
  }

  /**
   * GET /api/phonetic/analyze?text=...
   * То же самое через GET
   */
  @Get('analyze')
  async analyzeGet(@Query('text') text: string) {
    return this.phoneticService.analyze(text);
  }

  /**
   * POST /api/phonetic/compare
   * Сравнивает два текста на предмет рифмы
   */
  @Post('compare')
  async compare(@Body() dto: CompareDto) {
    return this.phoneticService.compareRhymes(dto.textA, dto.textB);
  }

  /**
   * GET /api/phonetic/compare?a=...&b=...
   * Быстрое сравнение через GET
   */
  @Get('compare')
  async compareGet(@Query('a') a: string, @Query('b') b: string) {
    const similarity = this.phoneticService.getSimilaritySync(a, b);
    const isRhyme = this.phoneticService.isRhymeSync(a, b);
    
    return {
      textA: a,
      textB: b,
      similarity,
      isRhyme,
    };
  }
}

