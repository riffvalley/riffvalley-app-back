import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { toBoolean } from './options-query.dto';
import { RANDOM_DISC_DIFFICULTIES } from '../../../community/rates/random-selection/random-disc-difficulty';
import type { RandomDiscDifficulty } from '../../../community/rates/random-selection/random-disc-difficulty';

@ValidatorConstraint({ name: 'unratedCommunityWithoutDifficulty' })
class UnratedCommunityWithoutDifficultyConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value !== true) return true;
    const query = args.object as { difficulty?: unknown };
    return query.difficulty === undefined;
  }

  defaultMessage(): string {
    return 'unratedByCommunity=true cannot be combined with difficulty';
  }
}

export class RandomQueryDto {
  @IsOptional()
  @IsIn(RANDOM_DISC_DIFFICULTIES)
  difficulty?: RandomDiscDifficulty;

  @IsOptional()
  @IsUUID()
  previousDiscId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  @Validate(UnratedCommunityWithoutDifficultyConstraint)
  unratedByCommunity?: boolean;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  ep?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  debut?: boolean;

  @IsOptional()
  @IsPositive()
  @Max(50)
  @Type(() => Number)
  limit?: number;
}
