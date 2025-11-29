import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Подключаемся к БД при старте приложения
    await this.$connect();
    console.log('📦 Database connected');
  }

  async onModuleDestroy() {
    // Отключаемся при остановке
    await this.$disconnect();
  }
}

