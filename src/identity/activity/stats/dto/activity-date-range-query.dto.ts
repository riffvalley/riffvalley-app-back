import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export class ActivityDateRangeQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class ActivityUsersQueryDto extends ActivityDateRangeQueryDto {
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
}

@ValidatorConstraint({ name: 'periodExcludesCustomDates', async: false })
class PeriodExcludesCustomDatesConstraint
  implements ValidatorConstraintInterface
{
  validate(period: unknown, args: ValidationArguments): boolean {
    if (period === undefined || period === null) return true;
    const query: unknown = args.object;
    if (typeof query !== 'object' || query === null) return false;
    const hasFrom = 'from' in query && query.from !== undefined;
    const hasTo = 'to' in query && query.to !== undefined;
    return !hasFrom && !hasTo;
  }

  defaultMessage(): string {
    return 'period cannot be combined with from or to';
  }
}

/** Query contract for GET /activity/summary. */
export class ActivitySummaryQueryDto extends ActivityDateRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  @Validate(PeriodExcludesCustomDatesConstraint)
  period?: 7 | 30 | 90;
}
