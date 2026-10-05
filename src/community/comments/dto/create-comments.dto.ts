import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';

export class CreateCommentDto {
  // Contenido del comentario
  @IsNotEmpty()
  @IsString()
  comment: string;

  // ID del disco al que pertenece el comentario (UUID v4)
  @IsUUID('4')
  discId: string;

  // ID del comentario padre (opcional) para indicar que es una respuesta
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  // Fecha de creación (opcional, ya que se asigna automáticamente en la entidad)
  @IsOptional()
  @IsDateString()
  createdAt?: Date;
}
