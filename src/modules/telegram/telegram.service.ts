import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { RhymeService } from '../rhyme/rhyme.service';
import { ParserService } from '../parser/parser.service';
import { PhoneticService } from '../phonetic/phonetic.service';
import { Language } from '@prisma/client';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly rhymeService: RhymeService,
    private readonly parserService: ParserService,
    private readonly phoneticService: PhoneticService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    
    if (!token) {
      console.log('⚠️ TELEGRAM_BOT_TOKEN not set, bot disabled');
      return;
    }

    this.bot = new Telegraf(token);
    this.setupCommands();
    this.setupHandlers();

    // Запускаем бота
    this.bot.launch();
    console.log('🤖 Telegram bot started');
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }

  private setupCommands() {
    if (!this.bot) return;

    // Регистрируем команды в меню Telegram
    this.bot.telegram.setMyCommands([
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'help', description: 'Справка по командам' },
      { command: 'search', description: 'Найти рифмы в базе' },
      { command: 'ai', description: '🤖 Придумать рифмы (LLM)' },
      { command: 'full', description: '🔥 База + AI вместе' },
      { command: 'add', description: 'Добавить рифму вручную' },
      { command: 'stats', description: 'Статистика базы рифм' },
      { command: 'compare', description: 'Сравнить две фразы на рифму' },
    ]);
  }

  private setupHandlers() {
    if (!this.bot) return;

    // /start
    this.bot.start(this.handleStart.bind(this));

    // /help
    this.bot.help(this.handleHelp.bind(this));

    // /search <phrase>
    this.bot.command('search', this.handleSearch.bind(this));

    // /ai <phrase> — только LLM
    this.bot.command('ai', this.handleAI.bind(this));

    // /full <phrase> — БД + LLM
    this.bot.command('full', this.handleFull.bind(this));

    // /add — начинает диалог добавления
    this.bot.command('add', this.handleAddStart.bind(this));

    // /stats
    this.bot.command('stats', this.handleStats.bind(this));

    // /compare <phrase1> | <phrase2>
    this.bot.command('compare', this.handleCompare.bind(this));

    // Обработка файлов (.txt, .md)
    this.bot.on(message('document'), this.handleDocument.bind(this));

    // Обработка текстовых сообщений (поиск рифмы)
    this.bot.on(message('text'), this.handleTextMessage.bind(this));
  }

  // =====================================================
  // COMMAND HANDLERS
  // =====================================================

  private async handleStart(ctx: Context) {
    const welcomeMessage = `
🎤 *RhymePadre* — бот для поиска сложных рифм

Что я умею:
• Искать рифмы по звучанию (не только по буквам!)
• Хранить мультисиллабические, внутренние, слант-рифмы
• Импортировать тексты треков

*Быстрый старт:*
Просто напиши слово или фразу — я найду рифмы.

Или используй команды:
/search <фраза> — поиск рифм
/compare фраза1 | фраза2 — проверить рифму
/stats — статистика базы

📎 Отправь .txt или .md файл — я извлеку из него рифмы.
`;
    await ctx.replyWithMarkdown(welcomeMessage);
  }

  private async handleHelp(ctx: Context) {
    const hasLLM = this.rhymeService.hasLLM();
    const helpMessage = `📖 Команды RhymePadre

/search <фраза> — поиск в базе
/ai <фраза> — 🤖 AI придумает рифмы${!hasLLM ? ' (нужен API ключ)' : ''}
/full <фраза> — 🔥 база + AI вместе

/compare фраза1 | фраза2 — сравнить
/stats — статистика

📎 Импорт: отправь .txt или .md файл

💡 Просто напиши слово — поиск в базе`;
    await ctx.reply(helpMessage);
  }

  private async handleSearch(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const phrase = text.replace(/^\/search\s*/i, '').trim();

    if (!phrase) {
      await ctx.reply('Укажи фразу: /search <фраза>');
      return;
    }

    await this.searchAndReply(ctx, phrase, false);
  }

  private async handleAI(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const phrase = text.replace(/^\/ai\s*/i, '').trim();

    if (!phrase) {
      await ctx.reply('Укажи фразу: /ai <фраза>');
      return;
    }

    if (!this.rhymeService.hasLLM()) {
      await ctx.reply('❌ AI недоступен (не настроен OPENAI_API_KEY)');
      return;
    }

    await ctx.sendChatAction('typing');
    await this.replyWithLLMRhymes(ctx, phrase);
  }

  private async handleFull(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const phrase = text.replace(/^\/full\s*/i, '').trim();

    if (!phrase) {
      await ctx.reply('Укажи фразу: /full <фраза>');
      return;
    }

    await this.searchAndReply(ctx, phrase, true);
  }

  private async handleAddStart(ctx: Context) {
    await ctx.reply(
      '✏️ Функция добавления рифм в разработке.\n\n' +
      'Пока можешь импортировать текст файлом (.txt, .md)'
    );
  }

  private async handleStats(ctx: Context) {
    try {
      const stats = await this.rhymeService.getStats();
      
      const message = `📊 Статистика RhymePadre

Семейств рифм: ${stats.familiesCount}
Примеров (строк): ${stats.examplesCount}
Рифмо-юнитов: ${stats.unitsCount}
Связей: ${stats.linksCount}`;
      await ctx.reply(message);
    } catch (error) {
      console.error('Stats error:', error);
      await ctx.reply('❌ Ошибка получения статистики');
    }
  }

  private async handleCompare(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const args = text.replace(/^\/compare\s*/i, '').trim();
    
    const parts = args.split('|').map(p => p.trim());
    
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      await ctx.reply('Формат: /compare фраза1 | фраза2');
      return;
    }

    try {
      const result = await this.phoneticService.compareRhymes(parts[0], parts[1]);
      
      const emoji = result.isRhyme ? '✅' : '❌';
      const matchTypeRu: Record<string, string> = {
        'EXACT': 'Точная рифма',
        'SLANT': 'Приблизительная',
        'ASSONANCE': 'Ассонанс',
        'CONSONANCE': 'Консонанс',
      };

      const message = `${emoji} Сравнение рифм

"${parts[0]}" ↔ "${parts[1]}"

Сходство: ${Math.round(result.similarity * 100)}%
Тип: ${result.matchType ? matchTypeRu[result.matchType] || result.matchType : 'Не рифмуется'}
Рифма: ${result.isRhyme ? 'Да' : 'Нет'}

Фонетика: [${result.analysisA.phoneticTail}] ↔ [${result.analysisB.phoneticTail}]`;
      await ctx.reply(message);
    } catch (error) {
      console.error('Compare error:', error);
      await ctx.reply('❌ Ошибка сравнения');
    }
  }

  // =====================================================
  // FILE HANDLER
  // =====================================================

  private async handleDocument(ctx: Context) {
    const document = (ctx.message as { document?: { file_name?: string; file_id?: string } })?.document;
    
    if (!document) {
      await ctx.reply('❌ Не удалось получить файл');
      return;
    }

    const fileName = document.file_name || 'unknown';
    const isValidFormat = fileName.endsWith('.txt') || fileName.endsWith('.md');

    if (!isValidFormat) {
      await ctx.reply('❌ Поддерживаются только .txt и .md файлы');
      return;
    }

    try {
      await ctx.reply('📥 Загружаю файл...');

      // Получаем ссылку на файл
      const fileLink = await ctx.telegram.getFileLink(document.file_id!);
      
      // Скачиваем содержимое
      const response = await fetch(fileLink.href);
      const text = await response.text();

      if (text.length < 10) {
        await ctx.reply('❌ Файл пустой или слишком маленький');
        return;
      }

      await ctx.reply(`📝 Обрабатываю ${text.length} символов...`);

      // Импортируем
      const sourceTitle = fileName.replace(/\.(txt|md)$/, '');
      const result = await this.parserService.parseAndSave(text, sourceTitle, Language.RU);

      const msg = `✅ Импорт завершён!

📁 Файл: ${fileName}
🎵 Треков: ${result.tracksProcessed}
👨‍👩‍👧‍👦 Семейств рифм: ${result.familiesCreated}
📝 Юнитов: ${result.unitsCreated}
🔗 Связей: ${result.linksCreated}
📄 Примеров: ${result.examplesCreated}`;
      await ctx.reply(msg);
    } catch (error) {
      console.error('Document import error:', error);
      await ctx.reply('❌ Ошибка импорта файла: ' + (error as Error).message);
    }
  }

  // =====================================================
  // TEXT MESSAGE HANDLER (fallback search)
  // =====================================================

  private async handleTextMessage(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    
    // Игнорируем короткие сообщения
    if (text.length < 2) return;
    
    // Игнорируем команды (они обрабатываются отдельно)
    if (text.startsWith('/')) return;

    await this.searchAndReply(ctx, text, false);
  }

  // =====================================================
  // SEARCH HELPERS
  // =====================================================

  /**
   * Поиск в БД + опционально LLM
   */
  private async searchAndReply(ctx: Context, phrase: string, includeLLM: boolean) {
    try {
      await ctx.sendChatAction('typing');

      const results = await this.rhymeService.search({
        phrase,
        limit: 5,
      });

      let message = '';
      const hasDBResults = results.length > 0;

      // БД результаты
      if (hasDBResults) {
        message += `📚 Из базы "${phrase}":\n\n`;

        for (const family of results) {
          const complexity = '⭐'.repeat(family.complexity);
          message += `${complexity} ${family.patternText}\n`;

          const familyWithUnits = family as typeof family & { units?: { textSpan: string }[] };
          if (familyWithUnits.units && familyWithUnits.units.length > 0) {
            const examples = familyWithUnits.units
              .slice(0, 3)
              .map(u => `• ${u.textSpan}`)
              .join('\n');
            message += `${examples}\n`;
          }
          message += '\n';
        }
      }

      // LLM результаты
      if (includeLLM && this.rhymeService.hasLLM()) {
        if (hasDBResults) {
          await ctx.reply(message);
          message = '';
        }
        await ctx.sendChatAction('typing');
        await this.replyWithLLMRhymes(ctx, phrase);
        return;
      }

      // Если нет результатов в БД и не просили LLM
      if (!hasDBResults && !includeLLM) {
        const analysis = this.phoneticService.analyzeSync(phrase);
        const hint = this.rhymeService.hasLLM() 
          ? '\n\n💡 Попробуй /ai ' + phrase + ' для AI-рифм'
          : '';
        
        await ctx.reply(
          `🔍 По запросу "${phrase}" рифм не найдено.\n` +
          `Фонетика: [${analysis.phoneticTail}]` +
          hint
        );
        return;
      }

      if (message) {
        await ctx.reply(message);
      }
    } catch (error) {
      console.error('Search error:', error);
      await ctx.reply('❌ Ошибка поиска: ' + (error as Error).message);
    }
  }

  /**
   * Генерация рифм через LLM
   */
  private async replyWithLLMRhymes(ctx: Context, phrase: string) {
    try {
      const suggestions = await this.rhymeService.suggestRhymesWithLLM(phrase);

      if (suggestions.length === 0) {
        await ctx.reply('🤖 AI не смог придумать рифмы. Попробуй другое слово.');
        return;
      }

      const typeEmoji: Record<string, string> = {
        exact: '✅',
        slant: '🔶',
        assonance: '🔷',
        pun: '🎭',
      };

      let message = `🤖 AI рифмы к "${phrase}":\n\n`;

      for (const s of suggestions) {
        const emoji = typeEmoji[s.type] || '•';
        message += `${emoji} ${s.rhyme}`;
        if (s.explanation) {
          message += ` — ${s.explanation}`;
        }
        message += '\n';
      }

      message += '\n✅точная 🔶неточная 🔷ассонанс 🎭каламбур';

      await ctx.reply(message);
    } catch (error) {
      console.error('LLM rhyme error:', error);
      await ctx.reply('❌ Ошибка AI: ' + (error as Error).message);
    }
  }
}
