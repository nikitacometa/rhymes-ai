import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { RhymeService } from '../rhyme/rhyme.service';
import { ParserService } from '../parser/parser.service';
import { PhoneticService } from '../phonetic/phonetic.service';
import { Language } from '@prisma/client';

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
  SEARCH: '🔮 Найти рифму',
  AI: '✨ AI-магия',
  FULL: '🔥 Полный режим',
  COMPARE: '🎭 Сравнить фразы',
  STATS: '📊 Статистика',
  HELP: '💝 Помощь',
} as const;

// Состояния пользователей для интерактивных режимов
interface UserState {
  mode?: 'search' | 'ai' | 'full' | 'compare' | null;
  comparePhrase1?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf | null = null;
  private userStates: Map<number, UserState> = new Map();

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

  // =====================================================
  // ГЛАВНАЯ КЛАВИАТУРА
  // =====================================================
  
  private getMainKeyboard() {
    return Markup.keyboard([
      [BUTTONS.SEARCH, BUTTONS.AI],
      [BUTTONS.FULL, BUTTONS.COMPARE],
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
    this.bot.hears(BUTTONS.COMPARE, this.handleCompareButton.bind(this));
    this.bot.hears(BUTTONS.STATS, this.handleStats.bind(this));
    this.bot.hears(BUTTONS.HELP, this.handleHelp.bind(this));

    // Старые команды тоже работают
    this.bot.command('search', this.handleSearchCommand.bind(this));
    this.bot.command('ai', this.handleAICommand.bind(this));
    this.bot.command('full', this.handleFullCommand.bind(this));
    this.bot.command('compare', this.handleCompareCommand.bind(this));
    this.bot.command('stats', this.handleStats.bind(this));

    // Inline кнопки для действий
    this.bot.action('cancel', this.handleCancel.bind(this));
    this.bot.action(/^try_ai:(.+)$/, this.handleTryAI.bind(this));
    this.bot.action(/^try_full:(.+)$/, this.handleTryFull.bind(this));

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

Я *RhymePadre* — твоя милашка-реперша, которая шарит за рифмы получше любого МС на районе~

Что умею, солнышко:
• 🔮 Искать рифмы по звучанию (не только по буквам, малыш!)
• ✨ Придумывать новые через AI-магию
• 🎭 Сравнивать фразы на рифму
• 📎 Импортить тексты треков

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
💝 *Помощь от твоей реперши* ${PERSONA.getFlirty()}

*Кнопочки:*
🔮 *Найти рифму* — ищу в своей базе
✨ *AI-магия* — придумываю новые${!hasLLM ? ' (нужен API ключ, ${PERSONA.getGreeting()})' : ''}
🔥 *Полный режим* — база + AI вместе
🎭 *Сравнить фразы* — проверю, рифмуется ли
📊 *Статистика* — сколько рифм собрала

*Импорт:*
📎 Просто скинь мне .txt или .md файл с текстами — разберу на рифмы!

*Секретики:*
Можешь просто написать слово — я пойму и поищу ${PERSONA.getFlirty()}
`;
    await ctx.replyWithMarkdown(helpMessage);
  }

  // =====================================================
  // BUTTON HANDLERS (Reply Keyboard)
  // =====================================================

  private async handleSearchButton(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'search' });
    }

    await ctx.reply(
      `🔮 Окей, ${PERSONA.getGreeting()}! Напиши слово или фразу, к которой найти рифмы~\n\nЯ поищу в своей базе ${PERSONA.getFlirty()}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ])
    );
  }

  private async handleAIButton(ctx: Context) {
    if (!this.rhymeService.hasLLM()) {
      await ctx.reply(
        `😢 Ой, ${PERSONA.getGreeting()}, AI-магия недоступна...\n\nНужен OPENAI_API_KEY в настройках 💔`
      );
      return;
    }

    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'ai' });
    }

    await ctx.reply(
      `✨ Уух, AI-режим! ${PERSONA.getFlirty()}\n\nНапиши слово — я придумаю рифмы из головы~`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ])
    );
  }

  private async handleFullButton(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.userStates.set(userId, { mode: 'full' });
    }

    const aiStatus = this.rhymeService.hasLLM() 
      ? '(база + AI вместе 🔥)' 
      : '(только база, AI недоступен 😢)';

    await ctx.reply(
      `🔥 Полный режим ${aiStatus}\n\nНапиши слово, ${PERSONA.getGreeting()}~`,
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
    const phrase = ctx.match[1];
    
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
    const phrase = ctx.match[1];
    
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
      
      const message = `📊 *Моя коллекция рифм* ${PERSONA.getFlirty()}

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
      await ctx.reply(`📥 Оу, файлик! Загружаю, ${PERSONA.getGreeting()}... ${PERSONA.getFlirty()}`);

      const fileLink = await ctx.telegram.getFileLink(document.file_id!);
      const response = await fetch(fileLink.href);
      const text = await response.text();

      if (text.length < 10) {
        await ctx.reply(`😢 Файл пустой или слишком маленький, ${PERSONA.getGreeting()}...`);
        return;
      }

      await ctx.reply(`📝 Обрабатываю ${text.length} символов... Подожди чутка~ ${PERSONA.getFlirty()}`);

      const sourceTitle = fileName.replace(/\.(txt|md)$/, '');
      const result = await this.parserService.parseAndSave(text, sourceTitle, Language.RU);

      const msg = `✅ *Готово, ${PERSONA.getGreeting()}!* ${PERSONA.getFlirty()}

📁 Файл: \`${fileName}\`
🎵 Треков: *${result.tracksProcessed}*
👨‍👩‍👧‍👦 Семейств: *${result.familiesCreated}*
🎯 Юнитов: *${result.unitsCreated}*
🔗 Связей: *${result.linksCreated}*
📝 Примеров: *${result.examplesCreated}*

Теперь я знаю больше рифм 😏`;

      await ctx.replyWithMarkdown(msg);
    } catch (error) {
      console.error('Document import error:', error);
      await ctx.reply(`😢 Ошибка импорта: ${(error as Error).message}`);
    }
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

    if (state?.mode === 'compare') {
      if (!state.comparePhrase1) {
        // Ждём вторую фразу
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
        // Есть обе фразы — сравниваем
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
        
        await ctx.reply(
          `🤔 Хм, "${phrase}" — не нашла в базе, ${PERSONA.getGreeting()}...\n\nФонетика: [${analysis.phoneticTail}]`,
          hasAI ? Markup.inlineKeyboard([
            [Markup.button.callback('✨ Попробовать AI', `try_ai:${encodedPhrase}`)]
          ]) : undefined
        );
        return;
      }

      if (message) {
        const hasAI = this.rhymeService.hasLLM();
        const encodedPhrase = encodeURIComponent(phrase).slice(0, 50);
        
        await ctx.replyWithMarkdown(
          message,
          hasAI && !includeLLM ? Markup.inlineKeyboard([
            [Markup.button.callback('✨ Ещё AI-рифмы', `try_ai:${encodedPhrase}`)]
          ]) : undefined
        );
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
          `🤔 Хм, ${PERSONA.getGreeting()}, AI не смог придумать рифмы к "${phrase}"...\n\nПопробуй другое слово? ${PERSONA.getFlirty()}`
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

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('LLM rhyme error:', error);
      await ctx.reply(`😢 AI сломался, ${PERSONA.getGreeting()}... ${(error as Error).message}`);
    }
  }
}
