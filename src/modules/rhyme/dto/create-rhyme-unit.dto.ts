import { IsString, IsOptional, IsInt, IsUUID } from 'class-validator';

export class CreateRhymeUnitDto {
  @IsUUID()
  @IsOptional()
  familyId?: string;

  @IsUUID()
  exampleId: string;

  @IsInt()
  lineIndex: number;

  @IsString()
  textSpan: string;

  @IsInt()
  charStart: number;

  @IsInt()
  charEnd: number;

  @IsString()
  @IsOptional()
  phoneticFull?: string;

  @IsString()
  @IsOptional()
  phoneticTail?: string;

  @IsString()
  @IsOptional()
  stressPattern?: string;
}

