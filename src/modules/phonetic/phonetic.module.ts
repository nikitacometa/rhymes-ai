import { Module } from '@nestjs/common';
import { PhoneticService } from './phonetic.service';
import { PhoneticController } from './phonetic.controller';

@Module({
  controllers: [PhoneticController],
  providers: [PhoneticService],
  exports: [PhoneticService],
})
export class PhoneticModule {}
