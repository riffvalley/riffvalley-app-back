export interface LocalYearInstantBounds {
  start: Date;
  end: Date;
}

/** Finds the UTC instants at which a local calendar year starts and ends. */
export function getLocalYearInstantBounds(
  year: number,
  timeZone: string,
): LocalYearInstantBounds {
  return {
    start: startOfLocalDate(`${year}-01-01`, timeZone),
    end: startOfLocalDate(`${year + 1}-01-01`, timeZone),
  };
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

  let low = target - 48 * 60 * 60 * 1000;
  let high = target + 48 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDateAt(middle) < localDate) low = middle + 1;
    else high = middle;
  }
  if (localDateAt(low) !== localDate) {
    throw new RangeError(
      `Local date ${localDate} does not exist in ${timeZone}.`,
    );
  }
  return new Date(low);
}
