const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
} as const;

export function parseManualDate(dateStr: string): Date | null {
  if (typeof dateStr !== 'string') return null;

  const match = dateStr.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (!match) return null;

  const [, monthName, dayString, yearString] = match;
  const day = Number(dayString);
  const year = Number(yearString);

  const monthIndex = MONTHS[monthName.toLowerCase() as keyof typeof MONTHS];
  if (monthIndex === undefined || year === 0) return null;

  const date = new Date(0);
  date.setFullYear(year, monthIndex, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}
