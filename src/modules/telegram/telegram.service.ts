import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { RhymeService } from '../rhyme/rhyme.service';
import { ParserService } from '../parser/parser.service';
import { PhoneticService } from '../phonetic/phonetic.service';
import { Language } from '@prisma/client';
import { parseFullText } from '../parser/utils/text-parser';
import { extractRhymes } from '../parser/utils/rhyme-extractor';

// =====================================================
// СУБЛИЧНОСТЬ: Милая реперша-флиртушка 💋
// =====================================================
const PERSONA = {
  // Приветственные обращения
  greetings: ['котик', 'малыш', 'солнышко', 'красавчик', 'зайка'],
  
  // Эмодзи для настроения
  flirty: ['💋', '😘', '✨', '💖', '🔥', '💝', '😏'],
  
  // Случайное обращение
  getGreeting(): string {
    return this.greetings[Math.floor(Math.random() * this.greetings.length)];
  },
  
  // Случайный флирт-эмодзи
  getFlirty(): string {
    return this.flirty[Math.floor(Math.random() * this.flirty.length)];
  },
};

// =====================================================
// КНОПКИ МЕНЮ
// =====================================================
const BUTTONS = {
  SEARCH: '🔮 Найти в базе',
  AI: '✨ AI рифмы',
  FULL: '🔥 Найти все рифмы',
  SHOW_ALL: '📚 Все рифмы',
  ANALYZE: '🔍 Анализ текста',
  COMPARE: '🎭 Сравнить',
  STATS: '📊 Статистика',
  HELP: '💝 Помощь',
} as const;

// Состояния пользователей для интерактивных режимов
interface UserState {
  mode?: 'search' | 'ai' | 'full' | 'compare' | 'analyze' | null;
  comparePhrase1?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf | null = null;
  private userStates: Map<number, UserState> = new Map();
  private botName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly rhymeService: RhymeService,
    private readonly parserService: ParserService,
    private readonly phoneticService: PhoneticService,
  ) {
    this.botName = this.configService.get<string>('BOT_NAME') || 'Рифмоплётка';
  }

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
    console.log(`🤖 Telegram bot "${this.botName}" started`);
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }

  // =====================================================
  // ГЛАВНАЯ КЛАВИАТУРА
  // =====================================================
  
  private getMainKeyboard() {
    return Markup.keyboard([
      [BUTTONS.SEARCH, BUTTONS.AI],
      [BUTTONS.FULL, BUTTONS.SHOW_ALL],
      [BUTTONS.ANALYZE, BUTTONS.COMPARE],
      [BUTTONS.STATS, BUTTONS.HELP],
    ])
    .resize()
    .persistent();
  }

  private setupCommands() {
    if (!this.bot) return;

    // Регистрируем команды в меню Telegram (для тех, кто любит олдскул)
    this.bot.telegram.setMyCommands([
      { command: 'start', description: '🎀 Начать заново' },
      { command: 'menu', description: '📱 Показать меню' },
      { command: 'help', description: '💝 Справка' },
    ]);
  }

  private setupHandlers() {
    if (!this.bot) return;

    // /start
    this.bot.start(this.handleStart.bind(this));
    
    // /menu
    this.bot.command('menu', this.handleMenu.bind(this));

    // /help
    this.bot.help(this.handleHelp.bind(this));

    // Обработка кнопок главного меню
    this.bot.hears(BUTTONS.SEARCH, this.handleSearchButton.bind(this));
    this.bot.hears(BUTTONS.AI, this.handleAIButton.bind(this));
    this.bot.hears(BUTTONS.FULL, this.handleFullButton.bind(this));
    this.bot.hears(BUTTONS.SHOW_ALL, this.handleShowAllButton.bind(this));
    this.bot.hears(BUTTONS.ANALYZE, this.handleAnalyzeButton.bind(this));
    this.bot.hears(BUTTONS.COMPARE, this.handleCompareButton.bind(this));
    this.bot.hears(BUTTONS.STATS, this.handleStats.bind(this));
    this.bot.hears(BUTTONS.HELP, this.handleHelp.bind(this));

    // Старые команды тоже работают
    this.bot.command('search', this.handleSearchCommand.bind(this));
    this.bot.command('ai', this.handleAICommand.bind(this));
    this.bot.command('full', this.handleFullCommand.bind(this));
    this.bot.command('compare', this.handleCompareCommand.bind(this));
    this.bot.command('stats', this.handleStats.bind(this));
    this.bot.command('all', this.handleShowAllButton.bind(this));

    // Inline кнопки для действий
    this.bot.action('cancel', this.handleCancel.bind(this));
    this.bot.action('search_again', this.handleSearchButton.bind(this));
    this.bot.action('ai_again', this.handleAIButton.bind(this));
    this.bot.action('full_again', this.handleFullButton.bind(this));
    this.bot.action(/^try_ai:(.+)$/, this.handleTryAI.bind(this));
    this.bot.action(/^try_full:(.+)$/, this.handleTryFull.bind(this));
    this.bot.action(/^page:(\d+)$/, this.handleShowAllPage.bind(this));

    // Обработка файлов (.txt, .md)
    this.bot.on(message('document'), this.handleDocument.bind(this));

    // Обработка текстовых сообщений (контекстно)
    this.bot.on(message('text'), this.handleTextMessage.bind(this));
  }

  // =====================================================
  // COMMAND HANDLERS
  // =====================================================

  private async handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: null });
    }

    const welcomeMessage = `
💋 Хэй, ${PERSONA.getGreeting()}! ${PERSONA.getFlirty()}

Я *${this.botName}* — твоя милашка-реперша, которая шарит за рифмы получше любого МС на районе~

Что умею, солнышко:
• 🔮 Искать рифмы по звучанию
• ✨ Придумывать новые через AI
• 📚 Показывать всю коллекцию рифм
• 🔍 Анализировать тексты на рифмы
• 🎭 Сравнивать фразы

*Просто тыкни кнопку внизу и погнали* 👇

Или напиши слово — я пойму ${PERSONA.getFlirty()}
`;
    await ctx.replyWithMarkdown(welcomeMessage, this.getMainKeyboard());
  }

  private async handleMenu(ctx: Context) {
    await ctx.reply(
      `Вот твоё меню, ${PERSONA.getGreeting()}~ ${PERSONA.getFlirty()}`,
      this.getMainKeyboard()
    );
  }

  private async handleHelp(ctx: Context) {
    const hasLLM = this.rhymeService.hasLLM();
    
    const helpMessage = `
💝 *Помощь от ${this.botName}* ${PERSONA.getFlirty()}

*Кнопочки:*
🔮 *Найти в базе* — ищу рифмы в своей коллекции
✨ *AI рифмы* — придумываю новые через AI${!hasLLM ? ' (нужен API ключ)' : ''}
🔥 *Найти все рифмы* — база + AI вместе
📚 *Все рифмы* — показываю всю коллекцию
🔍 *Анализ текста* — найду рифмы в твоём тексте
🎭 *Сравнить* — проверю, рифмуется ли
📊 *Статистика* — сколько рифм собрала

*Импорт в базу:*
📎 Скинь .txt или .md файл — добавлю рифмы в базу

*Секретики:*
Просто напиши слово — я пойму и поищу ${PERSONA.getFlirty()}
`;
    await ctx.replyWithMarkdown(helpMessage);
  }

  // =====================================================
  // BUTTON HANDLERS (Reply Keyboard)
  // =====================================================

  private async handleSearchButton(ctx: Context) {
    // Отвечаем на callback если это inline кнопка
    if ('callbackQuery' in ctx.update) {
      await (ctx as Context & { answerCbQuery: (text?: string) => Promise<boolean> }).answerCbQuery();
    }

    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'search' });
    }

    await ctx.reply(
      `🔮 Окей, ${PERSONA.getGreeting()}! Напиши слово или фразу~\n\nПоищу в своей базе ${PERSONA.getFlirty()}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ])
    );
  }

  private async handleAIButton(ctx: Context) {
    // Отвечаем на callback если это inline кнопка
    if ('callbackQuery' in ctx.update) {
      await (ctx as Context & { answerCbQuery: (text?: string) => Promise<boolean> }).answerCbQuery();
    }

    if (!this.rhymeService.hasLLM()) {
      await ctx.reply(
        `😢 Ой, ${PERSONA.getGreeting()}, AI недоступен...\n\nНужен OPENAI_API_KEY в настройках 💔`
      );
      return;
    }

    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'ai' });
    }

    await ctx.reply(
      `✨ AI-режим! ${PERSONA.getFlirty()}\n\nНапиши слово — придумаю рифмы~`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ])
    );
  }

  private async handleFullButton(ctx: Context) {
    // Отвечаем на callback если это inline кнопка
    if ('callbackQuery' in ctx.update) {
      await (ctx as Context & { answerCbQuery: (text?: string) => Promise<boolean> }).answerCbQuery();
    }

    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'full' });
    }

    const aiStatus = this.rhymeService.hasLLM() 
      ? '(база + AI 🔥)' 
      : '(только база, AI недоступен 😢)';

    await ctx.reply(
      `🔥 Полный поиск ${aiStatus}\n\nНапиши слово, ${PERSONA.getGreeting()}~`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ])
    );
  }

  private async handleShowAllButton(ctx: Context) {
    await this.showAllRhymes(ctx, 0);
  }

  private async handleShowAllPage(ctx: Context & { match?: RegExpExecArray }) {
    if (!ctx.match) return;
    const page = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    await this.showAllRhymes(ctx, page);
  }

  private async showAllRhymes(ctx: Context, page: number) {
    try {
      await ctx.sendChatAction('typing');
      
      const pageSize = 10;
      const families = await this.rhymeService.findAllFamilies(100);
      
      if (families.length === 0) {
        await ctx.reply(
          `📚 База пустая, ${PERSONA.getGreeting()}...\n\nСкинь мне файл с текстами — наполню! ${PERSONA.getFlirty()}`
        );
        return;
      }

      const totalPages = Math.ceil(families.length / pageSize);
      const currentPage = Math.min(page, totalPages - 1);
      const startIdx = currentPage * pageSize;
      const pageFamilies = families.slice(startIdx, startIdx + pageSize);

      let message = `📚 *Моя коллекция рифм* ${PERSONA.getFlirty()}\n`;
      message += `_Страница ${currentPage + 1}/${totalPages} (всего ${families.length})_\n\n`;

      for (const family of pageFamilies) {
        const stars = '⭐'.repeat(family.complexity);
        const unitCount = family.units?.length || 0;
        
        message += `${stars} *${family.patternText}*\n`;
        message += `   📌 \`[${family.phoneticTail}]\` • ${unitCount} примеров\n`;
        
        // Показываем до 3 юнитов
        if (family.units && family.units.length > 0) {
          const samples = family.units.slice(0, 3).map(u => u.textSpan);
          message += `   → _${samples.join(', ')}_\n`;
        }
        message += '\n';
      }

      // Кнопки навигации
      const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
      const navRow: ReturnType<typeof Markup.button.callback>[] = [];
      
      if (currentPage > 0) {
        navRow.push(Markup.button.callback('⬅️ Назад', `page:${currentPage - 1}`));
      }
      if (currentPage < totalPages - 1) {
        navRow.push(Markup.button.callback('Вперёд ➡️', `page:${currentPage + 1}`));
      }
      
      if (navRow.length > 0) {
        buttons.push(navRow);
      }

      await ctx.replyWithMarkdown(
        message,
        buttons.length > 0 ? Markup.inlineKeyboard(buttons) : undefined
      );
    } catch (error) {
      console.error('Show all error:', error);
      await ctx.reply(`😢 Ошибка, ${PERSONA.getGreeting()}...`);
    }
  }

  private async handleAnalyzeButton(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'analyze' });
    }

    await ctx.reply(
      `🔍 Режим анализа текста!\n\nСкинь мне .txt или .md файл, ${PERSONA.getGreeting()}~\nЯ найду в нём все рифмы и покажу тебе (без сохранения в базу) ${PERSONA.getFlirty()}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ])
    );
  }

  private async handleCompareButton(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'compare', comparePhrase1: undefined });
    }

    await ctx.reply(
      `🎭 Режим сравнения!\n\nНапиши *первую* фразу, ${PERSONA.getGreeting()}~`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel')]
        ])
      }
    );
  }

  private async handleCancel(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: null });
    }

    await ctx.answerCbQuery('Отменено~');
    await ctx.reply(
      `Окей, ${PERSONA.getGreeting()}, отменила! ${PERSONA.getFlirty()}\n\nВыбирай что делать дальше 👇`,
      this.getMainKeyboard()
    );
  }

  // =====================================================
  // INLINE ACTION HANDLERS
  // =====================================================

  private async handleTryAI(ctx: Context & { match?: RegExpExecArray }) {
    if (!ctx.match) return;
    const phrase = decodeURIComponent(ctx.match[1]);
    
    await ctx.answerCbQuery('Запускаю AI~ ✨');
    
    if (!this.rhymeService.hasLLM()) {
      await ctx.reply('😢 AI недоступен (нужен OPENAI_API_KEY)');
      return;
    }

    await ctx.sendChatAction('typing');
    await this.replyWithLLMRhymes(ctx, phrase);
  }

  private async handleTryFull(ctx: Context & { match?: RegExpExecArray }) {
    if (!ctx.match) return;
    const phrase = decodeURIComponent(ctx.match[1]);
    
    await ctx.answerCbQuery('Полный режим! 🔥');
    await this.searchAndReply(ctx, phrase, true);
  }

  // =====================================================
  // COMMAND HANDLERS (для олдскул /command пользователей)
  // =====================================================

  private async handleSearchCommand(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const phrase = text.replace(/^\/search\s*/i, '').trim();

    if (!phrase) {
      await this.handleSearchButton(ctx);
      return;
    }

    await this.searchAndReply(ctx, phrase, false);
  }

  private async handleAICommand(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const phrase = text.replace(/^\/ai\s*/i, '').trim();

    if (!phrase) {
      await this.handleAIButton(ctx);
      return;
    }

    if (!this.rhymeService.hasLLM()) {
      await ctx.reply(`😢 AI недоступен, ${PERSONA.getGreeting()}... (нужен OPENAI_API_KEY)`);
      return;
    }

    await ctx.sendChatAction('typing');
    await this.replyWithLLMRhymes(ctx, phrase);
  }

  private async handleFullCommand(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const phrase = text.replace(/^\/full\s*/i, '').trim();

    if (!phrase) {
      await this.handleFullButton(ctx);
      return;
    }

    await this.searchAndReply(ctx, phrase, true);
  }

  private async handleCompareCommand(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const args = text.replace(/^\/compare\s*/i, '').trim();
    
    const parts = args.split('|').map(p => p.trim());
    
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      await this.handleCompareButton(ctx);
      return;
    }

    await this.performCompare(ctx, parts[0], parts[1]);
  }

  private async handleStats(ctx: Context) {
    try {
      const stats = await this.rhymeService.getStats();
      
      const message = `📊 *Коллекция ${this.botName}* ${PERSONA.getFlirty()}

👨‍👩‍👧‍👦 Семейств: *${stats.familiesCount}*
📝 Примеров: *${stats.examplesCount}*
🎯 Юнитов: *${stats.unitsCount}*
🔗 Связей: *${stats.linksCount}*

Неплохо, да, ${PERSONA.getGreeting()}? 😏`;

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Stats error:', error);
      await ctx.reply(`😢 Ой, ошибка... Не могу достать статистику, ${PERSONA.getGreeting()}`);
    }
  }

  // =====================================================
  // FILE HANDLER
  // =====================================================

  private async handleDocument(ctx: Context) {
    const document = (ctx.message as { document?: { file_name?: string; file_id?: string } })?.document;
    const userId = ctx.from?.id;
    const state = userId ? this.userStates.get(userId) : null;
    
    if (!document) {
      await ctx.reply(`😢 Не могу получить файл, ${PERSONA.getGreeting()}...`);
      return;
    }

    const fileName = document.file_name || 'unknown';
    const isValidFormat = fileName.endsWith('.txt') || fileName.endsWith('.md');

    if (!isValidFormat) {
      await ctx.reply(`🙈 ${PERSONA.getGreeting()}, я понимаю только .txt и .md файлы~`);
      return;
    }

    try {
      await ctx.reply(`📥 Загружаю файл, ${PERSONA.getGreeting()}... ${PERSONA.getFlirty()}`);

      const fileLink = await ctx.telegram.getFileLink(document.file_id!);
      const response = await fetch(fileLink.href);
      const text = await response.text();

      if (text.length < 10) {
        await ctx.reply(`😢 Файл пустой или слишком маленький, ${PERSONA.getGreeting()}...`);
        return;
      }

      // Если режим анализа — анализируем без сохранения
      if (state?.mode === 'analyze') {
        this.userStates.set(userId!, { mode: null });
        await this.analyzeTextFile(ctx, text, fileName);
        return;
      }

      // Иначе — импорт в базу
      await ctx.reply(`📝 Импортирую ${text.length} символов... Подожди чутка~ ${PERSONA.getFlirty()}`);

      const sourceTitle = fileName.replace(/\.(txt|md)$/, '');
      const result = await this.parserService.parseAndSave(text, sourceTitle, Language.RU);

      const msg = `✅ *Импорт завершён, ${PERSONA.getGreeting()}!* ${PERSONA.getFlirty()}

📁 Файл: \`${fileName}\`
🎵 Треков: *${result.tracksProcessed}*
👨‍👩‍👧‍👦 Семейств: *${result.familiesCreated}*
🎯 Юнитов: *${result.unitsCreated}*
🔗 Связей: *${result.linksCreated}*
📝 Примеров: *${result.examplesCreated}*

Теперь я знаю больше рифм 😏`;

      await ctx.replyWithMarkdown(msg);
    } catch (error) {
      console.error('Document error:', error);
      await ctx.reply(`😢 Ошибка: ${(error as Error).message}`);
    }
  }

  /**
   * Анализ текста без сохранения — показывает найденные рифмы
   */
  private async analyzeTextFile(ctx: Context, text: string, fileName: string) {
    try {
      await ctx.reply(`🔍 Анализирую "${fileName}"... ${PERSONA.getFlirty()}`);
      await ctx.sendChatAction('typing');

      // Парсим текст
      const tracks = parseFullText(text);
      
      if (tracks.length === 0) {
        await ctx.reply(`😢 Не нашла треков в файле, ${PERSONA.getGreeting()}...`);
        return;
      }

      let totalFamilies = 0;
      let message = `🔍 *Анализ "${fileName}"* ${PERSONA.getFlirty()}\n\n`;

      for (const track of tracks) {
        const extraction = extractRhymes(track);
        
        if (extraction.families.length === 0) continue;

        message += `🎵 *${track.title}*\n`;
        
        // Показываем до 5 семейств на трек
        const topFamilies = extraction.families.slice(0, 5);
        
        for (const family of topFamilies) {
          const stars = '⭐'.repeat(family.complexity);
          const examples = family.units.slice(0, 3).map(u => u.textSpan);
          
          message += `${stars} \`${family.phoneticTail}\`\n`;
          message += `   → _${examples.join(' / ')}_\n`;
        }
        
        if (extraction.families.length > 5) {
          message += `   _...и ещё ${extraction.families.length - 5} семейств_\n`;
        }
        
        message += '\n';
        totalFamilies += extraction.families.length;
      }

      message += `\n📊 *Итого:* ${totalFamilies} семейств рифм в ${tracks.length} треках\n`;
      message += `\n💡 _Это анализ без сохранения. Чтобы добавить в базу — просто скинь файл без режима анализа~_`;

      // Разбиваем на части если слишком длинное
      if (message.length > 4000) {
        const parts = this.splitMessage(message, 4000);
        for (const part of parts) {
          await ctx.replyWithMarkdown(part);
        }
      } else {
        await ctx.replyWithMarkdown(message);
      }
    } catch (error) {
      console.error('Analyze error:', error);
      await ctx.reply(`😢 Ошибка анализа: ${(error as Error).message}`);
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const parts: string[] = [];
    let current = '';
    
    for (const line of text.split('\n')) {
      if (current.length + line.length + 1 > maxLength) {
        parts.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }
    
    if (current) {
      parts.push(current);
    }
    
    return parts;
  }

  // =====================================================
  // TEXT MESSAGE HANDLER
  // =====================================================

  private async handleTextMessage(ctx: Context) {
    const text = (ctx.message as { text?: string })?.text || '';
    const userId = ctx.from?.id;
    
    // Игнорируем короткие сообщения
    if (text.length < 2) return;
    
    // Игнорируем команды
    if (text.startsWith('/')) return;

    // Проверяем состояние пользователя
    const state = userId ? this.userStates.get(userId) : null;

    if (state?.mode === 'search') {
      this.userStates.set(userId!, { mode: null });
      await this.searchAndReply(ctx, text, false);
      return;
    }

    if (state?.mode === 'ai') {
      this.userStates.set(userId!, { mode: null });
      if (!this.rhymeService.hasLLM()) {
        await ctx.reply(`😢 AI недоступен, ${PERSONA.getGreeting()}...`);
        return;
      }
      await ctx.sendChatAction('typing');
      await this.replyWithLLMRhymes(ctx, text);
      return;
    }

    if (state?.mode === 'full') {
      this.userStates.set(userId!, { mode: null });
      await this.searchAndReply(ctx, text, true);
      return;
    }

    if (state?.mode === 'analyze') {
      await ctx.reply(
        `🔍 Для анализа нужен файл, ${PERSONA.getGreeting()}!\n\nСкинь .txt или .md файл~`,
        Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel')]
        ])
      );
      return;
    }

    if (state?.mode === 'compare') {
      if (!state.comparePhrase1) {
        this.userStates.set(userId!, { mode: 'compare', comparePhrase1: text });
        await ctx.reply(
          `✅ Первая фраза: "${text}"\n\nТеперь напиши *вторую* фразу~`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('❌ Отмена', 'cancel')]
            ])
          }
        );
        return;
      } else {
        const phrase1 = state.comparePhrase1;
        this.userStates.set(userId!, { mode: null });
        await this.performCompare(ctx, phrase1, text);
        return;
      }
    }

    // Дефолтное поведение — поиск в базе
    await this.searchAndReply(ctx, text, false);
  }

  // =====================================================
  // SEARCH & COMPARE HELPERS
  // =====================================================

  private async searchAndReply(ctx: Context, phrase: string, includeLLM: boolean) {
    try {
      await ctx.sendChatAction('typing');

      const results = await this.rhymeService.search({
        phrase,
        limit: 5,
      });

      let message = '';
      const hasDBResults = results.length > 0;

      if (hasDBResults) {
        message += `🔮 *Рифмы к "${phrase}"* ${PERSONA.getFlirty()}\n\n`;

        for (const family of results) {
          const complexity = '⭐'.repeat(family.complexity);
          message += `${complexity} *${family.patternText}*\n`;

          const familyWithUnits = family as typeof family & { units?: { textSpan: string }[] };
          if (familyWithUnits.units && familyWithUnits.units.length > 0) {
            const examples = familyWithUnits.units
              .slice(0, 3)
              .map(u => `  • ${u.textSpan}`)
              .join('\n');
            message += `${examples}\n`;
          }
          message += '\n';
        }
      }

      // LLM результаты
      if (includeLLM && this.rhymeService.hasLLM()) {
        if (hasDBResults) {
          await ctx.replyWithMarkdown(message);
          message = '';
        }
        await ctx.sendChatAction('typing');
        await this.replyWithLLMRhymes(ctx, phrase);
        return;
      }

      // Нет результатов в БД и не просили LLM
      if (!hasDBResults && !includeLLM) {
        const analysis = this.phoneticService.analyzeSync(phrase);
        const hasAI = this.rhymeService.hasLLM();
        
        const encodedPhrase = encodeURIComponent(phrase).slice(0, 50);
        
        const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
        if (hasAI) {
          buttons.push([Markup.button.callback('✨ Попробовать AI', `try_ai:${encodedPhrase}`)]);
        }
        buttons.push([Markup.button.callback('🔮 Искать другое слово', 'search_again')]);
        
        await ctx.reply(
          `🤔 Хм, "${phrase}" — не нашла в базе, ${PERSONA.getGreeting()}...\n\nФонетика: [${analysis.phoneticTail}]`,
          Markup.inlineKeyboard(buttons)
        );
        return;
      }

      if (message) {
        const hasAI = this.rhymeService.hasLLM();
        const encodedPhrase = encodeURIComponent(phrase).slice(0, 50);
        
        const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
        if (hasAI && !includeLLM) {
          buttons.push([Markup.button.callback('✨ Ещё AI-рифмы', `try_ai:${encodedPhrase}`)]);
        }
        buttons.push([Markup.button.callback('🔮 Искать другое слово', 'search_again')]);
        
        await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
      }
    } catch (error) {
      console.error('Search error:', error);
      await ctx.reply(`😢 Ошибка поиска, ${PERSONA.getGreeting()}... ${(error as Error).message}`);
    }
  }

  private async performCompare(ctx: Context, phrase1: string, phrase2: string) {
    try {
      await ctx.sendChatAction('typing');
      const result = await this.phoneticService.compareRhymes(phrase1, phrase2);
      
      const emoji = result.isRhyme ? '✅' : '❌';
      const verdict = result.isRhyme 
        ? `Да, ${PERSONA.getGreeting()}, это рифма! ${PERSONA.getFlirty()}`
        : `Неа, не рифмуется... 😢`;

      const matchTypeRu: Record<string, string> = {
        'EXACT': '✨ Точная рифма',
        'SLANT': '🔶 Приблизительная',
        'ASSONANCE': '🔷 Ассонанс',
        'CONSONANCE': '🎵 Консонанс',
      };

      const message = `${emoji} *Сравнение рифм*

"${phrase1}" ↔ "${phrase2}"

📊 Сходство: *${Math.round(result.similarity * 100)}%*
🏷 Тип: *${result.matchType ? matchTypeRu[result.matchType] || result.matchType : 'Не рифма'}*

🎤 ${verdict}

🔊 Фонетика:
\`[${result.analysisA.phoneticTail}]\` ↔ \`[${result.analysisB.phoneticTail}]\``;

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Compare error:', error);
      await ctx.reply(`😢 Ошибка сравнения, ${PERSONA.getGreeting()}...`);
    }
  }

  private async replyWithLLMRhymes(ctx: Context, phrase: string) {
    try {
      const suggestions = await this.rhymeService.suggestRhymesWithLLM(phrase);

      if (suggestions.length === 0) {
        await ctx.reply(
          `🤔 Хм, ${PERSONA.getGreeting()}, AI не смог придумать рифмы к "${phrase}"...\n\nПопробуй другое слово? ${PERSONA.getFlirty()}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✨ Ещё AI рифмы', 'ai_again')],
            [Markup.button.callback('🔮 Искать в базе', 'search_again')]
          ])
        );
        return;
      }

      const typeEmoji: Record<string, string> = {
        exact: '✅',
        slant: '🔶',
        assonance: '🔷',
        pun: '🎭',
      };

      let message = `✨ *AI-рифмы к "${phrase}"* ${PERSONA.getFlirty()}\n\n`;

      for (const s of suggestions) {
        const emoji = typeEmoji[s.type] || '•';
        message += `${emoji} *${s.rhyme}*`;
        if (s.explanation) {
          message += ` — _${s.explanation}_`;
        }
        message += '\n';
      }

      message += '\n_✅точная 🔶неточная 🔷ассонанс 🎭каламбур_';

      await ctx.replyWithMarkdown(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback('✨ Ещё AI рифмы', 'ai_again')],
          [Markup.button.callback('🔮 Искать в базе', 'search_again')]
        ])
      );
    } catch (error) {
      console.error('LLM rhyme error:', error);
      await ctx.reply(`😢 AI сломался, ${PERSONA.getGreeting()}... ${(error as Error).message}`);
    }
  }
}
