import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

// Модули приложения
import { PrismaModule } from './modules/prisma/prisma.module';
import { RhymeModule } from './modules/rhyme/rhyme.module';
import { PhoneticModule } from './modules/phonetic/phonetic.module';
import { ParserModule } from './modules/parser/parser.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    // Загружает переменные окружения из .env файла
    ConfigModule.forRoot({
      isGlobal: true, // доступен во всех модулях без импорта
    }),

    // Настройка BullMQ для фоновых задач
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),

    // Наши модули
    PrismaModule,
    RhymeModule,
    PhoneticModule,
    ParserModule,
    TelegramModule,
  ],
})
export class AppModule {}

