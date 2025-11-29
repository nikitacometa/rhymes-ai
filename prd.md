# RhymePadre — Техническое задание

## 1. Цель проекта

Создать Telegram-бота **RhymePadre**, который:

- Хранит и структурирует **сложные рифмы** (мультисиллабические, внутренние, слант-рифмы).
- Позволяет:
  - добавлять рифмы по одной и импортом текстовых файлов (треки, баттлы),
  - находить рифмы к словам/фразам **по звучанию**, а не только по буквам,
  - выдавать примеры рифм из корпуса.
- В перспективе (вторая версия) — умеет **генерировать новые рифмы** на основе имеющегося корпуса, используя LLM.

Фокус стека — **Node.js / TypeScript**, PostgreSQL, Redis, REST API.  
GraphQL *не обязателен* и на данном этапе считается избыточным.

---

## 2. Технологический стек

### 2.1. Backend

- **Язык:** TypeScript (Node.js 20+).
- **Фреймворк:** NestJS (структура модулей, DI, валидация, тестируемость).
- **API:** REST (HTTP + JSON).
- **БД:** PostgreSQL + расширение **pgvector**.
- **ORM:** Prisma ORM (миграции, типобезопасный доступ).
- **Кэш/очереди:** Redis + BullMQ (для фоновых задач: импорт, фонетика, эмбеддинги).
- **LLM / Embeddings:** внешний API (конфигурируемый провайдер).
- **Инфраструктура:**
  - Docker / docker-compose.
  - CI/CD: GitHub Actions (линт, тесты, сборка, деплой).

### 2.2. Telegram

- **Библиотека:** `node-telegram-bot-api` или `telegraf`.
- Бот — тонкий слой: пересылает команды/сообщения в backend через REST.

---

## 3. Основные функции

1. **Поиск рифм**:
   - Ввод: слово / фраза (русский или английский).
   - Вывод: список “семейств рифм” + конкретные примеры (строки, куски).

2. **Добавление рифм вручную**:
   - Пользователь отправляет набор строк (2–4 строки).
   - Бот сохраняет их, выделяет рифмо-юниты и формирует/обновляет семейства.

3. **Импорт текстов**:
   - Пользователь отправляет файл (`.txt`, `.md`).
   - Бэкграунд-задача разбирает текст на строки, находит рифмы, пополняет базу.

4. **(v2) Генерация новых рифм**:
   - API для генерации новых рифм к фразе с использованием корпуса + LLM.

---

## 4. Модель данных

### 4.1. `rhyme_families`

Семейство рифм — фонетически родственные куски (например, `пол-оскала / Ла Скала / полоскала / поласкала`).

Поля:

- `id` (UUID, PK)
- `slug` (TEXT, уникальный человекочитаемый идентификатор)
- `language` (TEXT: `"ru" | "en" | "mixed"`)
- `pattern_text` (TEXT) — опорная форма/пример.
- `phonetic_key` (TEXT) — нормализованный фонетический ключ.
- `phonetic_full` (TEXT) — фонемная запись паттерна.
- `phonetic_tail` (TEXT) — хвост фонем/слогов.
- `types` (ARRAY<TEXT>) — теги: `"end"`, `"internal"`, `"multisyllabic"`, `"slant"`, `"chain"`, `"pun"`.
- `complexity` (INT) — 1–5, субъективная “сложность”.
- `topics` (ARRAY<TEXT>) — опционально: `"battle"`, `"london"`, `"religion"` и т.п.
- `created_by` (TEXT: `"user" | "import" | "generated"`)
- `created_at`, `updated_at` (TIMESTAMP)

### 4.2. `rhyme_examples`

Конкретные строки из текстов.

- `id` (UUID, PK)
- `family_id` (UUID, FK → `rhyme_families.id`, nullable)
- `source_title` (TEXT) — альбом/микстейп/сборник
- `track` (TEXT)
- `section` (TEXT) — например `"Куплет 1"`, `"Припев"`
- `line_index` (INT)
- `text` (TEXT)
- `note` (TEXT, nullable)

### 4.3. `rhyme_units`

Атомарный рифмующийся фрагмент (слово/слова) внутри строки.

- `id` (UUID, PK)
- `family_id` (UUID, FK → `rhyme_families.id`, nullable)
- `example_id` (UUID, FK → `rhyme_examples.id`)
- `line_index` (INT)
- `text_span` (TEXT) — конкретный кусок (например `"пол-оскала"`)
- `char_start`, `char_end` (INT) — позиция в строке
- `phonetic_full` (TEXT) — фонемная запись юнита
- `phonetic_tail` (TEXT) — хвост фонем
- `stress_pattern` (TEXT) — паттерн ударений, например `"0 1 0"`
- `syllable_start`, `syllable_end` (INT, nullable)

### 4.4. `rhyme_schemes` (опционально, v2)

Схема рифмовки блока (куплет, фрагмент): AAAA, ABAB и т.п.

- `id` (UUID, PK)
- `source_title`, `track`, `section` (TEXT)
- `pattern_code` (TEXT) — `"AAAA"`, `"ABAB"`, `"AABB"`, `"chain"` и т.п.
- `unit_ids` (ARRAY<UUID>) — ordered список `rhyme_units.id`
- `description` (TEXT)

### 4.5. `rhyme_patterns` (для генерации v2)

Обобщённые фонетические шаблоны.

- `id` (UUID, PK)
- `language` (TEXT)
- `syllable_count` (INT)
- `stress_positions` (ARRAY<INT>) — индексы ударных слогов
- `phoneme_template` (TEXT) — шаблон хвоста с вайлдкардом, наподобие `"*oskala"`
- (join) `pattern_families` — связи с `rhyme_families`

### 4.6. `rhyme_vectors`

Векторные представления для поиска по звучанию/смыслу.

- `id` (UUID, PK)
- `family_id` (UUID, FK → `rhyme_families.id`, unique)
- `embedding_text` (VECTOR) — эмбеддинг текстовой формы (`pattern_text`)
- `embedding_phonetic` (VECTOR) — эмбеддинг фонетики (`phonetic_full` или `phonetic_tail`)

---

## 5. Фонетический слой

Нужен отдельный сервис/модуль (может быть на Node.js с биндингами или отдельный микросервис), который умеет:

1. **Определять язык** строки (ru/en, простой heuristic).
2. Строить фонемную транскрипцию:
   - для русского,
   - для английского.
3. Выделять:
   - `phonetic_full` — вся строка / юнит,
   - `phonetic_tail` — последняя N-слоговая часть,
   - `stress_pattern` — позиции ударений.

Результаты сохраняются в БД и используются:

- при импорте и добавлении,
- при поиске рифм,
- при генерации новых вариантов (v2).

---

## 6. REST API

### 6.1. `POST /api/rhyme/search`

**Вход:**

```json
{
  "phrase": "вин дизель",
  "language": "ru",
  "limit": 10
}