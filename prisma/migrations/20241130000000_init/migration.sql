-- CreateEnum
CREATE TYPE "Language" AS ENUM ('RU', 'EN', 'MIXED');

-- CreateEnum
CREATE TYPE "RhymeType" AS ENUM ('END', 'INTERNAL', 'MULTISYLLABIC', 'SLANT', 'CHAIN', 'PUN');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'SLANT', 'ASSONANCE', 'CONSONANCE');

-- CreateEnum
CREATE TYPE "CreatedBy" AS ENUM ('USER', 'IMPORT', 'GENERATED');

-- CreateTable
CREATE TABLE "rhyme_families" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'RU',
    "pattern_text" TEXT NOT NULL,
    "phonetic_key" TEXT NOT NULL,
    "phonetic_full" TEXT,
    "phonetic_tail" TEXT NOT NULL,
    "types" "RhymeType"[],
    "complexity" INTEGER NOT NULL DEFAULT 1,
    "topics" TEXT[],
    "created_by" "CreatedBy" NOT NULL DEFAULT 'IMPORT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rhyme_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rhyme_examples" (
    "id" TEXT NOT NULL,
    "family_id" TEXT,
    "source_title" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "section" TEXT,
    "line_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rhyme_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rhyme_units" (
    "id" TEXT NOT NULL,
    "family_id" TEXT,
    "example_id" TEXT NOT NULL,
    "line_index" INTEGER NOT NULL,
    "text_span" TEXT NOT NULL,
    "char_start" INTEGER NOT NULL,
    "char_end" INTEGER NOT NULL,
    "phonetic_full" TEXT,
    "phonetic_tail" TEXT,
    "stress_pattern" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rhyme_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rhyme_links" (
    "id" TEXT NOT NULL,
    "unit_a_id" TEXT NOT NULL,
    "unit_b_id" TEXT NOT NULL,
    "match_type" "MatchType" NOT NULL DEFAULT 'EXACT',
    "phonetic_similarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distance_lines" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rhyme_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phonetic_cache" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'RU',
    "phonetic_full" TEXT NOT NULL,
    "phonetic_tail" TEXT NOT NULL,
    "stress_pattern" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rules',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phonetic_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rhyme_families_slug_key" ON "rhyme_families"("slug");

-- CreateIndex
CREATE INDEX "rhyme_families_phonetic_tail_idx" ON "rhyme_families"("phonetic_tail");

-- CreateIndex
CREATE INDEX "rhyme_families_phonetic_key_idx" ON "rhyme_families"("phonetic_key");

-- CreateIndex
CREATE INDEX "rhyme_examples_family_id_idx" ON "rhyme_examples"("family_id");

-- CreateIndex
CREATE INDEX "rhyme_units_family_id_idx" ON "rhyme_units"("family_id");

-- CreateIndex
CREATE INDEX "rhyme_units_example_id_idx" ON "rhyme_units"("example_id");

-- CreateIndex
CREATE INDEX "rhyme_units_phonetic_tail_idx" ON "rhyme_units"("phonetic_tail");

-- CreateIndex
CREATE INDEX "rhyme_links_unit_a_id_idx" ON "rhyme_links"("unit_a_id");

-- CreateIndex
CREATE INDEX "rhyme_links_unit_b_id_idx" ON "rhyme_links"("unit_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "rhyme_links_unit_a_id_unit_b_id_key" ON "rhyme_links"("unit_a_id", "unit_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "phonetic_cache_text_key" ON "phonetic_cache"("text");

-- CreateIndex
CREATE INDEX "phonetic_cache_text_idx" ON "phonetic_cache"("text");

-- AddForeignKey
ALTER TABLE "rhyme_examples" ADD CONSTRAINT "rhyme_examples_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "rhyme_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rhyme_units" ADD CONSTRAINT "rhyme_units_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "rhyme_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rhyme_units" ADD CONSTRAINT "rhyme_units_example_id_fkey" FOREIGN KEY ("example_id") REFERENCES "rhyme_examples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rhyme_links" ADD CONSTRAINT "rhyme_links_unit_a_id_fkey" FOREIGN KEY ("unit_a_id") REFERENCES "rhyme_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rhyme_links" ADD CONSTRAINT "rhyme_links_unit_b_id_fkey" FOREIGN KEY ("unit_b_id") REFERENCES "rhyme_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
