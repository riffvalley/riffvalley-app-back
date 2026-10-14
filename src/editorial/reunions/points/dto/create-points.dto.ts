import {
  IsNotEmpty,
  IsString,
  IsObject,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Column } from 'typeorm';

export class CreatePointDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @Column({ type: 'text', nullable: true }) // El campo es opcional y permite nulos en la base de datos
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
