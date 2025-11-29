import { IsUUID, IsEnum, IsNumber, IsInt, Min, Max, IsOptional } from 'class-validator';
import { MatchType } from '@prisma/client';

export class CreateRhymeLinkDto {
  @IsUUID()
  unitAId: string;

  @IsUUID()
  unitBId: string;

  @IsEnum(MatchType)
  @IsOptional()
  matchType?: MatchType = MatchType.EXACT;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  phoneticSimilarity?: number = 0;

  @IsInt()
  @IsOptional()
  distanceLines?: number = 0;
}

