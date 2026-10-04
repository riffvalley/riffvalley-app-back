import type { Disc } from '../../entities/disc.entity';
import type { FridayWeekRange } from '../../shared/helpers/get-friday-week-ranges';

export type WeeklyDiscPayload = {
  artistName: string;
  name: string;
  genre: string;
  genreColor: string | null;
  link: string | null;
  ep: boolean;
  image: string | null;
  releaseDate: string;
};

export type WeeklyCalendarGroup = {
  week: number;
  label: string;
  startDate: string;
  endDate: string;
  discs: WeeklyDiscPayload[];
};

export function mapWeeklyDiscsToGroups(
  discs: Disc[],
  weekRanges: FridayWeekRange[],
  month: number,
  year: number,
  week?: number,
): WeeklyCalendarGroup[] {
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const monthLabel = monthNames[month - 1];
  const pad = (value: number) => String(value).padStart(2, '0');

  return weekRanges
    .filter((range) => week === undefined || range.week === week)
    .map((range) => {
      const label = `${range.from}-${range.to} ${monthLabel}`;
      const startDate = `${year}-${pad(month)}-${pad(range.from)}`;
      const endDate = `${year}-${pad(month)}-${pad(range.to)}`;

      const weekDiscs = discs
        .filter((disc) => {
          const day = new Date(disc.releaseDate).getUTCDate();
          return day >= range.from && day <= range.to;
        })
        .map((disc) => ({
          artistName: disc.artist?.name ?? '',
          countryCode: disc.artist?.country?.isoCode ?? null,
          countryName: disc.artist?.country?.name ?? null,
          name: disc.name,
          genre: disc.genre?.name ?? '',
          genreColor: disc.genre?.color ?? null,
          link: disc.link ?? null,
          ep: disc.ep ?? false,
          debut: disc.debut ?? false,
          image: disc.image ?? null,
          releaseDate: new Date(disc.releaseDate).toISOString().split('T')[0],
        }));

      return { week: range.week, label, startDate, endDate, discs: weekDiscs };
    });
}
