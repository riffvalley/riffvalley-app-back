import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export enum DiscListMode {
  ALL = 'all',
  RATES = 'rates',
  COVERS = 'covers',
  COMMENTS = 'comments',
  FAVORITES = 'favorites',
  PENDIENTES = 'pendientes',
}

export enum DiscListEligibility {
  ALL = 'all',
  UNVOTED_RATE = 'unvotedRate',
  UNVOTED_COVER = 'unvotedCover',
}

export enum DiscListSort {
  RELEASE_DATE_DESC = 'releaseDateDesc',
  RELEASE_DATE_ASC = 'releaseDateAsc',
  ARTIST_NAME_ASC = 'artistNameAsc',
  DISC_NAME_ASC = 'discNameAsc',
  CREATED_AT_DESC = 'createdAtDesc',
  CREATED_AT_ASC = 'createdAtAsc',
  MY_RATE_DESC = 'myRateDesc',
  MY_RATE_ASC = 'myRateAsc',
  MY_COVER_DESC = 'myCoverDesc',
  MY_COVER_ASC = 'myCoverAsc',
  AVERAGE_RATE_DESC = 'averageRateDesc',
  AVERAGE_RATE_ASC = 'averageRateAsc',
  AVERAGE_COVER_DESC = 'averageCoverDesc',
  AVERAGE_COVER_ASC = 'averageCoverAsc',
  VOTE_COUNT_DESC = 'voteCountDesc',
  COMMENT_COUNT_DESC = 'commentCountDesc',
}

@ValidatorConstraint({ name: 'orderedDiscListDateRange', async: false })
class OrderedDiscListDateRange implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value) || value.length !== 2) return true;
    const [start, end] = value as unknown[];
    return (
      start instanceof Date &&
      end instanceof Date &&
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start.getTime() <= end.getTime()
    );
  }

  defaultMessage(): string {
    return 'dateRange must be an ordered pair of valid calendar dates';
  }
}

const sortsByMode: Record<DiscListMode, readonly DiscListSort[]> = {
  [DiscListMode.ALL]: [
    DiscListSort.RELEASE_DATE_DESC,
    DiscListSort.RELEASE_DATE_ASC,
    DiscListSort.ARTIST_NAME_ASC,
    DiscListSort.DISC_NAME_ASC,
    DiscListSort.AVERAGE_RATE_DESC,
    DiscListSort.AVERAGE_RATE_ASC,
  ],
  [DiscListMode.RATES]: [
    DiscListSort.RELEASE_DATE_DESC,
    DiscListSort.RELEASE_DATE_ASC,
    DiscListSort.CREATED_AT_DESC,
    DiscListSort.CREATED_AT_ASC,
    DiscListSort.MY_RATE_DESC,
    DiscListSort.MY_RATE_ASC,
    DiscListSort.MY_COVER_DESC,
    DiscListSort.MY_COVER_ASC,
    DiscListSort.AVERAGE_RATE_DESC,
    DiscListSort.AVERAGE_RATE_ASC,
    DiscListSort.AVERAGE_COVER_DESC,
    DiscListSort.AVERAGE_COVER_ASC,
  ],
  [DiscListMode.COVERS]: [
    DiscListSort.RELEASE_DATE_DESC,
    DiscListSort.RELEASE_DATE_ASC,
    DiscListSort.CREATED_AT_DESC,
    DiscListSort.CREATED_AT_ASC,
    DiscListSort.MY_RATE_DESC,
    DiscListSort.MY_RATE_ASC,
    DiscListSort.MY_COVER_DESC,
    DiscListSort.MY_COVER_ASC,
    DiscListSort.AVERAGE_RATE_DESC,
    DiscListSort.AVERAGE_RATE_ASC,
    DiscListSort.AVERAGE_COVER_DESC,
    DiscListSort.AVERAGE_COVER_ASC,
  ],
  [DiscListMode.COMMENTS]: [
    DiscListSort.RELEASE_DATE_DESC,
    DiscListSort.RELEASE_DATE_ASC,
    DiscListSort.CREATED_AT_DESC,
    DiscListSort.CREATED_AT_ASC,
  ],
  [DiscListMode.FAVORITES]: [
    DiscListSort.RELEASE_DATE_DESC,
    DiscListSort.RELEASE_DATE_ASC,
    DiscListSort.CREATED_AT_DESC,
    DiscListSort.CREATED_AT_ASC,
    DiscListSort.MY_RATE_DESC,
    DiscListSort.MY_RATE_ASC,
    DiscListSort.MY_COVER_DESC,
    DiscListSort.MY_COVER_ASC,
    DiscListSort.AVERAGE_RATE_DESC,
    DiscListSort.AVERAGE_RATE_ASC,
    DiscListSort.AVERAGE_COVER_DESC,
    DiscListSort.AVERAGE_COVER_ASC,
  ],
  [DiscListMode.PENDIENTES]: [
    DiscListSort.RELEASE_DATE_DESC,
    DiscListSort.RELEASE_DATE_ASC,
    DiscListSort.CREATED_AT_DESC,
    DiscListSort.CREATED_AT_ASC,
    DiscListSort.MY_RATE_DESC,
    DiscListSort.MY_RATE_ASC,
    DiscListSort.MY_COVER_DESC,
    DiscListSort.MY_COVER_ASC,
    DiscListSort.AVERAGE_RATE_DESC,
    DiscListSort.AVERAGE_RATE_ASC,
    DiscListSort.AVERAGE_COVER_DESC,
    DiscListSort.AVERAGE_COVER_ASC,
  ],
};

function parseGenreIds(value: unknown): unknown {
  if (typeof value === 'string') return value.split(',');
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string' ? item.split(',') : [item],
    );
  }
  return value;
}

function normalizeGenreIds(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return [
    ...new Set(
      value.map((item) =>
        typeof item === 'string' ? item.toLowerCase() : item,
      ),
    ),
  ];
}

@ValidatorConstraint({ name: 'discListSortForMode', async: false })
class DiscListSortForMode implements ValidatorConstraintInterface {
  validate(sort: unknown, args: { object: object }): boolean {
    if (sort === undefined) return true;
    const query = args.object as DiscListFiltersDto;
    return (
      Object.values(DiscListMode).includes(query.mode) &&
      sortsByMode[query.mode].includes(sort as DiscListSort)
    );
  }

  defaultMessage(): string {
    return 'sort is not supported for the selected mode';
  }
}

@ValidatorConstraint({ name: 'discListEligibilityForMode', async: false })
class DiscListEligibilityForMode implements ValidatorConstraintInterface {
  validate(eligibility: unknown, args: { object: object }): boolean {
    if (eligibility === undefined) return true;
    const query = args.object as DiscListFiltersDto;
    return (
      query.mode === DiscListMode.ALL &&
      Object.values(DiscListEligibility).includes(
        eligibility as DiscListEligibility,
      )
    );
  }

  defaultMessage(): string {
    return 'eligibility is only supported for mode all';
  }
}

function parseCalendarDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(Number.NaN);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

export class DiscListFiltersDto {
  @IsEnum(DiscListMode)
  mode!: DiscListMode;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsDate({ each: true })
  @Validate(OrderedDiscListDateRange)
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(parseCalendarDate) : value,
  )
  dateRange?: [Date, Date];

  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @IsOptional()
  @IsUUID('4')
  genreId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => normalizeGenreIds(parseGenreIds(value)))
  genreIds?: string[];

  @IsOptional()
  @IsEnum(DiscListEligibility)
  @Validate(DiscListEligibilityForMode)
  eligibility?: DiscListEligibility;
}

export class DiscListQueryDto extends DiscListFiltersDto {
  static readonly DEFAULT_LIMIT = 20;
  static readonly MAX_LIMIT = 100;

  @IsOptional()
  @IsEnum(DiscListSort)
  @Validate(DiscListSortForMode)
  sort?: DiscListSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DiscListQueryDto.MAX_LIMIT)
  limit = DiscListQueryDto.DEFAULT_LIMIT;
}

export class DiscListOptionsQueryDto extends DiscListFiltersDto {}

export class DiscListSuggestionsQueryDto {
  @IsOptional()
  @IsString()
  query?: string;
}
