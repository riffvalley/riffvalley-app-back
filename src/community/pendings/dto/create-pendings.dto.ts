import { IsUUID } from 'class-validator';

export class CreatePendingDto {
  // ID de disco (UUID v4)
  @IsUUID('4')
  discId: string;
}
