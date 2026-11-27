import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTourDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
