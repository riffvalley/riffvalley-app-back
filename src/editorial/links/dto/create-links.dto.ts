import { IsString, IsUUID } from 'class-validator';

export class CreateLinkDto {
  @IsUUID('4')
  listId: string;

  @IsString()
  link: string;

  @IsString()
  name: string;
}
