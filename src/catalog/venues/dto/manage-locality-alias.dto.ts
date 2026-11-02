import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LocalityAliasKind } from '../entities/locality-alias.entity';

export class ManageLocalityAliasDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/u)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  @Matches(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu)
  language?: string | null;

  @IsOptional()
  @IsIn(['linguistic', 'alternate'])
  kind?: LocalityAliasKind;
}
