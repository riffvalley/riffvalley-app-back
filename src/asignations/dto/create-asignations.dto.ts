import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateAsignationDto {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsUUID('4')
  @IsOptional()
  userId?: string;

  @IsUUID('4')
  @IsOptional()
  discId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  similarBands?: string;

  // Id de pista de Spotify (formato base62 típico de Spotify), elegido en
  // el <select> del front a partir de GET /discs/:id/spotify-tracks.
  // Cadena vacía = "volver a la selección automática" (el <select> manda
  // "" de forma natural en su opción por defecto); solo se valida el
  // formato cuando viene un valor real.
  @IsOptional()
  @ValidateIf((o) => o.spotifyTrackId !== '')
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'spotifyTrackId must be a valid Spotify track id',
  })
  spotifyTrackId?: string;

  @IsUUID('4')
  listId: string;

  // Opcional, mismas validaciones que rate
  @ValidateIf((o) => o.rate !== null && o.rate !== undefined)
  @IsOptional()
  @IsNumber()
  position?: number;
}
