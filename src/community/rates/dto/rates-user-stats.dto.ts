export interface RatesStatsDiscDto {
  id: string;
  name: string;
  image: string | null;
  rate: number;
  artist: { name: string };
  genre: { name: string; color: string | null } | null;
}

export interface RatesStatsControversialDiscDto {
  id: string;
  name: string;
  image: string | null;
  userRate: number;
  communityAverage: number;
  diff: number;
  artist: { name: string };
  genre: { name: string; color: string | null } | null;
}

export interface RatesStatsRatedDiscDto {
  id: string;
  name: string;
  rate: number;
  artist: { name: string };
  genre: { name: string; color: string | null } | null;
}

export interface RatesUserStatsResponseDto {
  totalVotes: number;
  mean: string | number;
  median: number;
  votesByGenre: Array<{
    genre: string;
    count: number;
    topDisc: RatesStatsDiscDto | null;
  }>;
  votesByMonth: Array<{
    month: string;
    count: number;
    weeks: Array<{ week: string; count: number }>;
    topDisc: RatesStatsDiscDto | null;
  }>;
  votesByScore: Array<{ score: number; count: number }>;
  totalUsers: number;
  rank: number;
  topDiscOverall: RatesStatsDiscDto | null;
  mostControversial: RatesStatsControversialDiscDto[];
  votesByDay: Array<{ date: string; count: number }>;
  yearOverYear: {
    current: { year: number; votes: number; mean: number };
    previous: { year: number; votes: number; mean: number };
  };
}
