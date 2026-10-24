import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ValidRoles } from '../../../authorization/interfaces/valid-roles';

const SORT_FIELDS = [
  'lastVoteAt',
  'daysSinceLastVote',
  'username',
  'lastPresenceAt',
  'lastRatingModifiedAt',
  'currentRatings',
] as const;

export type ActivityInactivitySortField = (typeof SORT_FIELDS)[number];
export type ActivityInactivitySortOrder = 'asc' | 'desc';

export class ActivityInactivityQueryDto {
  @IsOptional()
  @IsString()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOf?: string;

  @IsOptional()
  @IsIn(Object.values(ValidRoles))
  role?: ValidRoles;

  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: ActivityInactivitySortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: ActivityInactivitySortOrder;
}
