import { Module } from '@nestjs/common';
import { RhymeService } from './rhyme.service';
import { RhymeController } from './rhyme.controller';

@Module({
  controllers: [RhymeController],
  providers: [RhymeService],
  exports: [RhymeService],
})
export class RhymeModule {}

