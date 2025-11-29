import { IsString, IsOptional, IsArray, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Language, RhymeType, CreatedBy } from '@prisma/client';

// DTO (Data Transfer Object) — объект для передачи данных между слоями
// Используется для валидации входящих данных

export class CreateRhymeFamilyDto {
  @IsString()
  slug: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language = Language.RU;

  @IsString()
  patternText: string;

  @IsString()
  phoneticKey: string;

  @IsString()
  @IsOptional()
  phoneticFull?: string;

  @IsString()
  phoneticTail: string;

  @IsArray()
  @IsEnum(RhymeType, { each: true })
  @IsOptional()
  types?: RhymeType[] = [];

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  complexity?: number = 1;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  topics?: string[] = [];

  @IsEnum(CreatedBy)
  @IsOptional()
  createdBy?: CreatedBy = CreatedBy.IMPORT;
}

