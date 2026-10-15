import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
  Matches,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { CreateVersionItemDto } from './create-version-item.dto';
import { VersionStatus } from '../entities/version.entity';

export class CreateVersionDto {
  @IsString()
  @Length(1, 50)
  // Si usas SemVer, puedes forzar formato (opcional):
  @Matches(/^\d+\.\d+\.\d+(-[\w.-]+)?$/, {
    message: 'version debe seguir SemVer, p.ej. 1.2.3 o 1.2.3-beta',
  })
  version: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string; // usa string ISO en DTO; TypeORM lo mapea a Date

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  link?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // 👈

  @IsOptional()
  @IsDateString()
  publishedAt?: string; // 👈 opcional

  @IsOptional()
  @IsEnum(VersionStatus)
  status?: VersionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVersionItemDto)
  items?: CreateVersionItemDto[];
}
