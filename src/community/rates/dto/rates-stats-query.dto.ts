import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

function IsStatsYear(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isStatsYear',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string' || !/^\d{4}$/u.test(value)) {
            return false;
          }

          const selectedYear = Number(value);
          const query = args.object as RatesStatsQueryDto;
          const timeZone =
            typeof query.timeZone === 'string' ? query.timeZone : 'UTC';
          const currentYear = getYearInTimeZone(timeZone);
          return selectedYear >= 2025 && selectedYear <= currentYear;
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

function getYearInTimeZone(timeZone: string): number {
  try {
    const year = new Intl.DateTimeFormat('en', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
    }).format(new Date());
    return Number(year);
  } catch {
    return Number.NaN;
  }
}

export class RatesStatsQueryDto {
  @IsStatsYear({
    message:
      'year must be a four-digit year from 2025 through the current year',
  })
  year!: unknown;

  @IsIanaTimeZone({ message: 'timeZone must be a valid IANA time zone' })
  timeZone: unknown = 'UTC';
}
