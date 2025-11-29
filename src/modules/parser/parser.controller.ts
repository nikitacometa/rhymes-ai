import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ParserService, ParseJobData } from './parser.service';
import { Language } from '@prisma/client';

class ImportTextDto {
  text: string;
  sourceTitle: string;
  language?: Language;
  async?: boolean;  // Обрабатывать асинхронно через очередь?
}

@Controller('api/parser')
export class ParserController {
  constructor(private readonly parserService: ParserService) {}

  /**
   * POST /api/parser/import
   * Импортирует текст и извлекает рифмы
   */
  @Post('import')
  async importText(@Body() dto: ImportTextDto) {
    const { text, sourceTitle, language = Language.RU, async: isAsync = false } = dto;

    // Для больших текстов используем очередь
    if (isAsync || text.length > 10000) {
      return this.parserService.queueForParsing({
        text,
        sourceTitle,
        language,
      });
    }

    // Для маленьких — синхронно
    return this.parserService.parseAndSave(text, sourceTitle, language);
  }

  /**
   * GET /api/parser/job/:id
   * Проверяет статус задачи парсинга
   */
  @Get('job/:id')
  async getJobStatus(@Param('id') jobId: string) {
    const status = await this.parserService.getJobStatus(jobId);
    
    if (!status) {
      return { error: 'Job not found' };
    }
    
    return status;
  }
}

