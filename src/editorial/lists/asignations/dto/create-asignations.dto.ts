import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  Min,
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

  // Texto libre para "Género:" en el post de WordPress. Ver comentario en
  // la entidad: no toca el genre estructurado del disco.
  @IsString()
  @IsOptional()
  genre?: string;

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

  // Preserva el tipo JSON recibido: el ValidationPipe global tiene conversión
  // implícita y no debe convertir strings a números antes de validar.
  @Type(() => Object)
  @IsOptional()
  @IsInt()
  @Min(-2147483648)
  @Max(2147483647)
  position?: number;
}
