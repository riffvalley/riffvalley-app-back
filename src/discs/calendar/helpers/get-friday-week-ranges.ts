export type FridayWeekRange = { week: number; from: number; to: number };

export function getFridayWeekRanges(
  month: number,
  year: number,
): FridayWeekRange[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks: FridayWeekRange[] = [];

  // Find first Friday of the month (getDay: 0=Sun … 5=Fri)
  let firstFriday = 1;
  while (new Date(year, month - 1, firstFriday).getDay() !== 5) {
    firstFriday++;
  }

  let weekNum = 1;

  // Week 1: from day 1 through firstFriday+6 (pre-Friday days merged into first Friday week)
  const firstWeekEnd = Math.min(firstFriday + 6, daysInMonth);
  weeks.push({ week: weekNum++, from: 1, to: firstWeekEnd });

  // Remaining weeks: each starts on a Friday, runs 7 days
  let start = firstFriday + 7;
  while (start <= daysInMonth) {
    weeks.push({ week: weekNum++, from: start, to: Math.min(start + 6, daysInMonth) });
    start += 7;
  }

  return weeks;
}
