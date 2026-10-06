import { getFridayWeekRanges } from './get-friday-week-ranges';

describe('getFridayWeekRanges', () => {
  it.each([
    [2, 2021, [
      { week: 1, from: 1, to: 11 },
      { week: 2, from: 12, to: 18 },
      { week: 3, from: 19, to: 25 },
      { week: 4, from: 26, to: 28 },
    ]],
    [2, 2024, [
      { week: 1, from: 1, to: 8 },
      { week: 2, from: 9, to: 15 },
      { week: 3, from: 16, to: 22 },
      { week: 4, from: 23, to: 29 },
    ]],
    [4, 2024, [
      { week: 1, from: 1, to: 11 },
      { week: 2, from: 12, to: 18 },
      { week: 3, from: 19, to: 25 },
      { week: 4, from: 26, to: 30 },
    ]],
    [5, 2024, [
      { week: 1, from: 1, to: 9 },
      { week: 2, from: 10, to: 16 },
      { week: 3, from: 17, to: 23 },
      { week: 4, from: 24, to: 30 },
      { week: 5, from: 31, to: 31 },
    ]],
  ])('preserves ranges for month %s in %s', (month, year, ranges) => {
    expect(getFridayWeekRanges(month as number, year as number)).toEqual(ranges);
  });

  it('starts the first range on day one and aligns later ranges with Friday', () => {
    for (const [month, year] of [[2, 2021], [2, 2024], [4, 2024], [5, 2024]]) {
      const ranges = getFridayWeekRanges(month, year);

      expect(ranges[0].from).toBe(1);
      expect(ranges.slice(1).every(({ from }) => new Date(year, month - 1, from).getDay() === 5)).toBe(true);
      expect(ranges.slice(1).every((range, index) => ranges[index].to + 1 === range.from)).toBe(true);
    }
  });

  it('resets ranges at the month transition without crossing month boundaries', () => {
    expect(getFridayWeekRanges(12, 2023)).toEqual([
      { week: 1, from: 1, to: 7 },
      { week: 2, from: 8, to: 14 },
      { week: 3, from: 15, to: 21 },
      { week: 4, from: 22, to: 28 },
      { week: 5, from: 29, to: 31 },
    ]);
    expect(getFridayWeekRanges(1, 2024)).toEqual([
      { week: 1, from: 1, to: 11 },
      { week: 2, from: 12, to: 18 },
      { week: 3, from: 19, to: 25 },
      { week: 4, from: 26, to: 31 },
    ]);
  });
});
