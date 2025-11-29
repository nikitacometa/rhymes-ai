import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Language, RhymeType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class SearchRhymeDto {
  @IsString()
  phrase: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;

  @IsEnum(RhymeType)
  @IsOptional()
  type?: RhymeType;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 10;
}

