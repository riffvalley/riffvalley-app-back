import { IsUUID } from 'class-validator';

export class CreateFavoriteDto {
  // ID de disco (UUID v4)
  @IsUUID('4')
  discId: string;
}
