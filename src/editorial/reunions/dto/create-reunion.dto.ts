import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsDate, IsOptional } from 'class-validator';

export class CreateReunionDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  fecha: Date;
}
