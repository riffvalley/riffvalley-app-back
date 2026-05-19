import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAccessRequestDto {
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  email: string;

  @IsString({ message: 'El alias debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El alias es obligatorio' })
  @MinLength(3, { message: 'El alias debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El alias no puede superar los 50 caracteres' })
  alias: string;
}
