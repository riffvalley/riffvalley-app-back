import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class ImportEventsBatchDto {
  @IsUUID()
  batchId: string;

  @IsUUID()
  countryId: string;

  /** Rows are validated individually so one malformed row cannot reject the batch. */
  @IsArray()
  @ArrayMaxSize(100)
  rows: unknown[];
}
