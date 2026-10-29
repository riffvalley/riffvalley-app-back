export interface HistoricalMadridYearBounds {
  releaseDateStart: string;
  releaseDateEnd: string;
  rateCreatedAtStartLocal: string;
  rateCreatedAtEndLocal: string;
  rateCreatedAtStartInstantUtc: string;
  rateCreatedAtEndInstantUtc: string;
}

export function getHistoricalMadridYearBounds(
  year: number,
): HistoricalMadridYearBounds {
  if (year !== 2025 && year !== 2026) {
    throw new RangeError('Historical Rate cohorts support only 2025 and 2026.');
  }

  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;
  return {
    releaseDateStart: startDate,
    releaseDateEnd: endDate,
    rateCreatedAtStartLocal: `${startDate} 00:00:00`,
    rateCreatedAtEndLocal: `${endDate} 00:00:00`,
    rateCreatedAtStartInstantUtc: madridMidnightAsUtc(startDate),
    rateCreatedAtEndInstantUtc: madridMidnightAsUtc(endDate),
  };
}

function madridMidnightAsUtc(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  let guess = localMidnightAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
    const representedAsUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    guess += localMidnightAsUtc - representedAsUtc;
  }

  return new Date(guess).toISOString();
}
