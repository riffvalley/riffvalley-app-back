import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportVenuesBatchDto {
  @IsUUID()
  localityId: string;

  // Rows are validated independently by the service so one invalid row does
  // not reject the rest of the request.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  // The global ValidationPipe enables implicit conversion. Declaring the
  // element type prevents class-transformer from treating each unknown[] row
  // as an Array and converting venue objects into arrays.
  @Type(() => Object)
  venues: unknown[];
}
