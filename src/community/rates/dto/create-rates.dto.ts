import {
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateRateDto {
  // Valor numérico con máximo 2 decimales, mínimo 1.00 y máximo 9.99
  @ValidateIf((o) => o.rate !== null && o.rate !== undefined)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10) // El valor 10 queda permitido
  rate: number;

  // Opcional, mismas validaciones que rate
  @ValidateIf((o) => o.cover !== null && o.cover !== undefined)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10) // El valor 10 queda permitido
  cover?: number;

  // ID de disco (UUID v4)
  @IsUUID('4')
  discId: string;
}
