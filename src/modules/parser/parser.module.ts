import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ParserService } from './parser.service';
import { ParserProcessor } from './parser.processor';
import { PhoneticModule } from '../phonetic/phonetic.module';

@Module({
  imports: [
    // Регистрируем очередь для фоновых задач парсинга
    BullModule.registerQueue({
      name: 'parser',
    }),
    PhoneticModule,
  ],
  providers: [ParserService, ParserProcessor],
  exports: [ParserService],
})
export class ParserModule {}

