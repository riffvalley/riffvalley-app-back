const MADRID_TIMEZONE = 'Europe/Madrid';

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface MadridWeekBoundaries {
  start: Date;
  endExclusive: Date;
  previousStart: Date;
}

const madridCalendarFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function getMadridWeekBoundaries(
  referenceDate: Date,
): MadridWeekBoundaries {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('A valid reference date is required');
  }

  const localDate = getCalendarParts(referenceDate);
  const weekday = new Date(
    Date.UTC(localDate.year, localDate.month - 1, localDate.day),
  ).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStartCalendar = new Date(
    Date.UTC(
      localDate.year,
      localDate.month - 1,
      localDate.day - daysSinceMonday,
    ),
  );
  const previousWeekStartCalendar = new Date(
    Date.UTC(
      weekStartCalendar.getUTCFullYear(),
      weekStartCalendar.getUTCMonth(),
      weekStartCalendar.getUTCDate() - 7,
    ),
  );
  const nextWeekStartCalendar = new Date(
    Date.UTC(
      weekStartCalendar.getUTCFullYear(),
      weekStartCalendar.getUTCMonth(),
      weekStartCalendar.getUTCDate() + 7,
    ),
  );

  return {
    start: madridMidnightToInstant(weekStartCalendar),
    endExclusive: madridMidnightToInstant(nextWeekStartCalendar),
    previousStart: madridMidnightToInstant(previousWeekStartCalendar),
  };
}

function madridMidnightToInstant(calendarDate: Date): Date {
  const targetWallClock = Date.UTC(
    calendarDate.getUTCFullYear(),
    calendarDate.getUTCMonth(),
    calendarDate.getUTCDate(),
  );
  let instant = targetWallClock;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getCalendarParts(new Date(instant));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const adjustment = targetWallClock - observedAsUtc;
    if (adjustment === 0) return new Date(instant);
    instant += adjustment;
  }

  throw new Error('Could not resolve a Madrid week boundary');
}

function getCalendarParts(date: Date): CalendarParts {
  const parts = madridCalendarFormatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
}
