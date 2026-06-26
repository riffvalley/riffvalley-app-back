import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';

export class PublishPostDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  dryRun?: boolean;
}
