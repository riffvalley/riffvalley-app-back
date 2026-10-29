import { Transform } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
  ValidateIf,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { parseLocalDate } from '../helpers/local-date-range';

function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            parseLocalDate(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

function IsIanaTimeZone(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length === 0) return false;
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

function IsTrimmedText(
  maxCharacters: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isTrimmedText',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      constraints: [maxCharacters],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          return (
            typeof value === 'string' &&
            value === value.trim() &&
            Array.from(value).length >= 1 &&
            Array.from(value).length <= Number(args.constraints[0])
          );
        },
      },
    });
  };
}

function IsOrderedDateRange(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOrderedDateRange',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const query = args.object as ActivityHistoryQueryDto;
          return !query.from || !query.to || query.from <= query.to;
        },
      },
    });
  };
}

function IsZoneForDateFilters(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isZoneForDateFilters',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const query = args.object as ActivityHistoryQueryDto;
          if (!query.from && !query.to) return true;
          if (typeof value !== 'string' || value.length === 0) return false;
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

export class ActivityHistoryQueryDto {
  @IsOptional()
  @IsCalendarDate({ message: 'from must be a real date in YYYY-MM-DD format' })
  @IsOrderedDateRange({ message: 'from must be on or before to' })
  from?: string;

  @IsOptional()
  @IsCalendarDate({ message: 'to must be a real date in YYYY-MM-DD format' })
  to?: string;

  @ValidateIf(
    (query: ActivityHistoryQueryDto, value: unknown) =>
      value !== undefined || Boolean(query.from || query.to),
  )
  @IsIanaTimeZone({ message: 'timeZone must be a valid IANA time zone' })
  @IsZoneForDateFilters({
    message: 'timeZone is required and must be valid when from or to is used',
  })
  timeZone?: string;

  @IsOptional()
  @IsIn(['set', 'change'])
  type?: 'set' | 'change';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsTrimmedText(100, { message: 'q must contain 1 to 100 trimmed characters' })
  q?: string;

  @Transform(({ value }) =>
    value === undefined
      ? 30
      : typeof value === 'string' && /^\d+$/u.test(value)
        ? Number(value)
        : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ValidateIf(
    (_query: ActivityHistoryQueryDto, value: unknown) => value !== undefined,
  )
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
  @IsTrimmedText(4096, { message: 'cursor is malformed' })
  cursor?: string;
}
