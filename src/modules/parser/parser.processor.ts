import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('parser')
export class ParserProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    // TODO: Обработка задач парсинга в Milestone 4
    console.log(`Processing job ${job.id} of type ${job.name}`);
  }
}

