import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Max } from 'class-validator';

// El ValidationPipe global usa enableImplicitConversion: true, que convierte
// primitivos vía Boolean(value) ANTES de que corra este @Transform — y
// Boolean('false') es true en JS. Leemos el valor crudo desde obj/key en vez
// de `value` para no heredar ese booleano ya corrompido.
export function toBoolean({ obj, key }: { obj: Record<string, unknown>; key: string }) {
  const raw = obj[key];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

export class OptionsQueryDto {
  @IsIn(['country', 'genre', 'year', 'ep', 'debut'])
  field: 'country' | 'genre' | 'year' | 'ep' | 'debut';

  @IsOptional()
  @IsString()
  country?: string; // id

  @IsOptional()
  @IsString()
  genre?: string; // id

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  ep?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  debut?: boolean;

  @IsOptional()
  @IsPositive()
  @Max(10)
  @Type(() => Number)
  limit?: number; // default 3
}
