import { IsUUID, ValidateIf } from 'class-validator';

export class UpdateEventArtistTourDto {
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  tourId: string | null;
}
