import { IsString, IsOptional, IsInt, IsUUID } from 'class-validator';

export class CreateRhymeExampleDto {
  @IsUUID()
  @IsOptional()
  familyId?: string;

  @IsString()
  sourceTitle: string;

  @IsString()
  track: string;

  @IsString()
  @IsOptional()
  section?: string;

  @IsInt()
  lineIndex: number;

  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  note?: string;
}

