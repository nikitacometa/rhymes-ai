import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { RhymeModule } from '../rhyme/rhyme.module';
import { ParserModule } from '../parser/parser.module';
import { PhoneticModule } from '../phonetic/phonetic.module';

@Module({
  imports: [RhymeModule, ParserModule, PhoneticModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
