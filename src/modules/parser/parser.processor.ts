import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseFullText } from './utils/text-parser';
import { extractRhymes } from './utils/rhyme-extractor';
import { ParserService, ParseJobData, ImportResult } from './parser.service';
import { Language } from '@prisma/client';

@Injectable()
@Processor('parser')
export class ParserProcessor extends WorkerHost {
  constructor(
    private readonly parserService: ParserService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ParseJobData>): Promise<ImportResult> {
    const { text, sourceTitle, language = Language.RU } = job.data;

    console.log(`[Parser] Processing job ${job.id}: ${sourceTitle}`);

    // Обновляем прогресс
    await job.updateProgress(10);

    // Парсим текст
    const tracks = parseFullText(text);
    console.log(`[Parser] Found ${tracks.length} tracks`);

    await job.updateProgress(30);

    // Обрабатываем каждый трек
    let result: ImportResult = {
      tracksProcessed: 0,
      familiesCreated: 0,
      unitsCreated: 0,
      linksCreated: 0,
      examplesCreated: 0,
    };

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      
      try {
        const trackResult = await this.parserService.processTrack(
          track,
          sourceTitle,
          language,
        );

        result.tracksProcessed++;
        result.familiesCreated += trackResult.familiesCreated;
        result.unitsCreated += trackResult.unitsCreated;
        result.linksCreated += trackResult.linksCreated;
        result.examplesCreated += trackResult.examplesCreated;

        // Обновляем прогресс
        const progress = 30 + Math.floor((i + 1) / tracks.length * 70);
        await job.updateProgress(progress);
        
        console.log(`[Parser] Processed track "${track.title}": ${trackResult.familiesCreated} families`);
      } catch (error) {
        console.error(`[Parser] Error processing track "${track.title}":`, error);
        // Продолжаем с остальными треками
      }
    }

    console.log(`[Parser] Job ${job.id} completed:`, result);
    return result;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log(`[Parser] Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    console.error(`[Parser] Job ${job.id} failed:`, error.message);
  }
}
