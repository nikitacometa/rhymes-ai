import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() делает модуль доступным везде без явного импорта
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

