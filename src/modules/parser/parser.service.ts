import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ParserService {
  constructor(@InjectQueue('parser') private parserQueue: Queue) {}

  // TODO: Реализовать парсинг в Milestone 4
}

