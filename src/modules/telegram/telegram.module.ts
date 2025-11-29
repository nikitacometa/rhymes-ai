import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { RhymeModule } from '../rhyme/rhyme.module';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [RhymeModule, ParserModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}

