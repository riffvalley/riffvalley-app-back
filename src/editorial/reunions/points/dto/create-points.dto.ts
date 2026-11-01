import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';

export class CreatePointDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsOptional() // Validar que sea opcional
  @IsString() // Si se proporciona, debe ser una cadena
  content?: string; // Ahora el campo puede ser opcional

  @IsNotEmpty()
  @IsUUID('4') // 👈 valida que sea UUID v4
  reunionId: string; // 👈 debe ser string

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
