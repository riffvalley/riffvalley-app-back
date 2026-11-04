import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportEventsBatchDto {
  @IsUUID()
  batchId: string;

  @IsUUID()
  countryId: string;

  /** Rows are validated individually so one malformed row cannot reject the batch. */
  @IsArray()
  @ArrayMaxSize(50)
  // The global ValidationPipe enables implicit conversion. Preserve each row
  // as an object instead of inferring Array as the element type of unknown[].
  @Type(() => Object)
  rows: unknown[];
}
