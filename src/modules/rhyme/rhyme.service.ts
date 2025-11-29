import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRhymeFamilyDto,
  CreateRhymeExampleDto,
  CreateRhymeUnitDto,
  CreateRhymeLinkDto,
  SearchRhymeDto,
} from './dto';
import { RhymeFamily, RhymeExample, RhymeUnit, RhymeLink } from '@prisma/client';

@Injectable()
export class RhymeService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // RHYME FAMILIES
  // =====================================================

  async createFamily(dto: CreateRhymeFamilyDto): Promise<RhymeFamily> {
    return this.prisma.rhymeFamily.create({
      data: dto,
    });
  }

  async findAllFamilies(limit = 100): Promise<RhymeFamily[]> {
    return this.prisma.rhymeFamily.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        units: true,
        examples: true,
      },
    });
  }

  async findFamilyById(id: string): Promise<RhymeFamily> {
    const family = await this.prisma.rhymeFamily.findUnique({
      where: { id },
      include: {
        units: true,
        examples: true,
      },
    });
    
    if (!family) {
      throw new NotFoundException(`RhymeFamily with id ${id} not found`);
    }
    
    return family;
  }

  async findFamilyBySlug(slug: string): Promise<RhymeFamily | null> {
    return this.prisma.rhymeFamily.findUnique({
      where: { slug },
      include: {
        units: true,
        examples: true,
      },
    });
  }

  async updateFamily(id: string, dto: Partial<CreateRhymeFamilyDto>): Promise<RhymeFamily> {
    return this.prisma.rhymeFamily.update({
      where: { id },
      data: dto,
    });
  }

  async deleteFamily(id: string): Promise<void> {
    await this.prisma.rhymeFamily.delete({
      where: { id },
    });
  }

  // =====================================================
  // RHYME EXAMPLES
  // =====================================================

  async createExample(dto: CreateRhymeExampleDto): Promise<RhymeExample> {
    return this.prisma.rhymeExample.create({
      data: dto,
    });
  }

  async createManyExamples(examples: CreateRhymeExampleDto[]): Promise<{ count: number }> {
    return this.prisma.rhymeExample.createMany({
      data: examples,
    });
  }

  async findExamplesByFamilyId(familyId: string): Promise<RhymeExample[]> {
    return this.prisma.rhymeExample.findMany({
      where: { familyId },
      orderBy: { lineIndex: 'asc' },
    });
  }

  async findExamplesByTrack(track: string): Promise<RhymeExample[]> {
    return this.prisma.rhymeExample.findMany({
      where: { track: { contains: track, mode: 'insensitive' } },
      orderBy: { lineIndex: 'asc' },
    });
  }

  // =====================================================
  // RHYME UNITS
  // =====================================================

  async createUnit(dto: CreateRhymeUnitDto): Promise<RhymeUnit> {
    return this.prisma.rhymeUnit.create({
      data: dto,
    });
  }

  async createManyUnits(units: CreateRhymeUnitDto[]): Promise<{ count: number }> {
    return this.prisma.rhymeUnit.createMany({
      data: units,
    });
  }

  async findUnitsByFamilyId(familyId: string): Promise<RhymeUnit[]> {
    return this.prisma.rhymeUnit.findMany({
      where: { familyId },
      include: {
        example: true,
      },
    });
  }

  async findUnitsByPhoneticTail(phoneticTail: string): Promise<RhymeUnit[]> {
    return this.prisma.rhymeUnit.findMany({
      where: {
        phoneticTail: { contains: phoneticTail },
      },
      include: {
        family: true,
        example: true,
      },
    });
  }

  async updateUnitFamily(unitId: string, familyId: string): Promise<RhymeUnit> {
    return this.prisma.rhymeUnit.update({
      where: { id: unitId },
      data: { familyId },
    });
  }

  // =====================================================
  // RHYME LINKS (связи между рифмующимися юнитами)
  // =====================================================

  async createLink(dto: CreateRhymeLinkDto): Promise<RhymeLink> {
    return this.prisma.rhymeLink.create({
      data: dto,
    });
  }

  async createManyLinks(links: CreateRhymeLinkDto[]): Promise<{ count: number }> {
    // Используем skipDuplicates чтобы не падать на дубликатах
    return this.prisma.rhymeLink.createMany({
      data: links,
      skipDuplicates: true,
    });
  }

  async findLinksByUnitId(unitId: string): Promise<RhymeLink[]> {
    return this.prisma.rhymeLink.findMany({
      where: {
        OR: [{ unitAId: unitId }, { unitBId: unitId }],
      },
      include: {
        unitA: true,
        unitB: true,
      },
    });
  }

  // =====================================================
  // SEARCH — главная функция поиска рифм
  // =====================================================

  async search(dto: SearchRhymeDto): Promise<RhymeFamily[]> {
    const { phrase, language, type, limit } = dto;

    // Пока простой поиск по phoneticTail
    // В будущем здесь будет фонетизация phrase и поиск по похожести
    const where: Record<string, unknown> = {};

    // Поиск по phoneticTail (подстрока)
    if (phrase) {
      where.OR = [
        { phoneticTail: { contains: phrase.toLowerCase() } },
        { patternText: { contains: phrase, mode: 'insensitive' } },
        { phoneticKey: { contains: phrase.toLowerCase() } },
      ];
    }

    if (language) {
      where.language = language;
    }

    if (type) {
      where.types = { has: type };
    }

    return this.prisma.rhymeFamily.findMany({
      where,
      take: limit,
      orderBy: { complexity: 'desc' },
      include: {
        units: {
          include: {
            example: true,
          },
        },
        examples: true,
      },
    });
  }

  // =====================================================
  // UTILITY — вспомогательные методы
  // =====================================================

  async getStats(): Promise<{
    familiesCount: number;
    examplesCount: number;
    unitsCount: number;
    linksCount: number;
  }> {
    const [familiesCount, examplesCount, unitsCount, linksCount] = await Promise.all([
      this.prisma.rhymeFamily.count(),
      this.prisma.rhymeExample.count(),
      this.prisma.rhymeUnit.count(),
      this.prisma.rhymeLink.count(),
    ]);

    return { familiesCount, examplesCount, unitsCount, linksCount };
  }
}
