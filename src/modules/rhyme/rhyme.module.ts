import { Module } from '@nestjs/common';
import { RhymeService } from './rhyme.service';
import { RhymeController } from './rhyme.controller';
import { PhoneticModule } from '../phonetic/phonetic.module';

@Module({
  imports: [PhoneticModule],
  controllers: [RhymeController],
  providers: [RhymeService],
  exports: [RhymeService],
})
export class RhymeModule {}
