import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ParserService } from './parser.service';
import { ParserProcessor } from './parser.processor';
import { ParserController } from './parser.controller';
import { PhoneticModule } from '../phonetic/phonetic.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'parser',
    }),
    PhoneticModule,
  ],
  controllers: [ParserController],
  providers: [ParserService, ParserProcessor],
  exports: [ParserService],
})
export class ParserModule {}
