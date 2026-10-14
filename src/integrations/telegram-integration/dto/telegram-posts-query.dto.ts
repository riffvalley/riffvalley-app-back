import { IsOptional, IsPositive, IsString, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TelegramPostsQueryDto {
  @IsOptional()
  @IsPositive()
  @Max(50)
  @Type(() => Number)
  limit?: number = 13;

  @IsOptional()
  @IsString()
  channel?: string = 'conciertosrockmetal';

  // Cursor de paginación: id del último post ya mostrado. Se pide al
  // scraping público de Telegram (t.me/s/{canal}?before=<id>), que solo
  // pagina por id de mensaje, no por offset.
  @IsOptional()
  @IsString()
  before?: string;
}
