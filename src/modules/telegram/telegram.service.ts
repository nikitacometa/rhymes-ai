import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Telegraf(token);
    }
  }

  async onModuleInit() {
    if (!this.bot) {
      console.log('⚠️ Telegram bot token not configured, skipping...');
      return;
    }

    // TODO: Реализовать команды бота в Milestone 5
    this.bot.start((ctx) => ctx.reply('👋 Привет! Я RhymePadre — бот для поиска рифм.'));
    
    this.bot.launch();
    console.log('🤖 Telegram bot started');
  }
}

