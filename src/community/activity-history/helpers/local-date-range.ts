export interface LocalDateRange {
  fromInstant?: Date;
  toExclusiveInstant?: Date;
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MIN_SUPPORTED_YEAR = 1;
const MAX_SUPPORTED_YEAR = 9999;

export function resolveLocalDateRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string | undefined,
): LocalDateRange {
  if (!from && !to) return {};
  if (!timeZone || !isValidTimeZone(timeZone)) {
    throw new Error('A valid IANA time zone is required with date filters.');
  }

  const fromDate = from ? parseLocalDate(from) : undefined;
  const toDate = to ? parseLocalDate(to) : undefined;
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error('The from date must be on or before the to date.');
  }

  return {
    fromInstant: fromDate ? startOfLocalDate(fromDate, timeZone) : undefined,
    toExclusiveInstant: toDate
      ? startOfLocalDate(addCalendarDay(toDate), timeZone)
      : undefined,
  };
}

export function parseLocalDate(value: string): string {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new Error('Dates must use YYYY-MM-DD format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < MIN_SUPPORTED_YEAR ||
    year > MAX_SUPPORTED_YEAR ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new Error('The date is outside the supported calendar range.');
  }
  return value;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function startOfLocalDate(localDate: string, timeZone: string): Date {
  const target = Date.parse(`${localDate}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateAt = (instant: number): string => {
    const parts = formatter.formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
  };

  // Time-zone offsets stay within this two-day window. Binary search finds the
  // first instant whose local calendar date is the requested day, including
  // midnight gaps and overlaps without assuming a 24-hour UTC day.
  let low = target - 48 * 60 * 60 * 1000;
  let high = target + 48 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDateAt(middle) < localDate) low = middle + 1;
    else high = middle;
  }
  if (localDateAt(low) !== localDate) {
    throw new Error(
      'The requested local date does not exist in this time zone.',
    );
  }
  return new Date(low);
}

function addCalendarDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}
