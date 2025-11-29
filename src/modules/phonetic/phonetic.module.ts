import { Module } from '@nestjs/common';
import { PhoneticService } from './phonetic.service';

@Module({
  providers: [PhoneticService],
  exports: [PhoneticService],
})
export class PhoneticModule {}

