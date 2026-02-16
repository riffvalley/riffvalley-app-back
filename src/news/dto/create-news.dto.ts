import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { NewsStatus, NewsType } from '../entities/news.entity';

export class CreateNewsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  body: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsDateString()
  @IsOptional()
  publishDate?: string;

  @IsEnum(NewsType)
  type: NewsType;

  @IsEnum(NewsStatus)
  @IsOptional()
  status?: NewsStatus;
}
