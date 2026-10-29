import { RateVoteEventType } from '../../rates/entities/rate-vote-event.entity';

export interface ActivityHistoryPosition {
  occurredAt: string;
  id: string;
}

export interface ActivityHistoryContinuation {
  after: ActivityHistoryPosition;
  anchor: ActivityHistoryPosition;
}

export interface ActivityHistoryFilters {
  from?: string;
  to?: string;
  timeZone?: string;
  type?: RateVoteEventType;
  query?: string;
  limit?: number;
  continuation?: ActivityHistoryContinuation;
}

export interface ActivityHistoryArtist {
  id: string;
  name: string;
}

export interface ActivityHistoryGenre {
  id: string;
  name: string;
}

export interface ActivityHistoryDisc {
  id: string;
  title: string | null;
  artist: ActivityHistoryArtist | null;
  coverUrl: string | null;
  genre: ActivityHistoryGenre | null;
}

export interface ActivityHistoryItem {
  id: string;
  type: RateVoteEventType;
  occurredAt: string;
  previousValue: number | null;
  newValue: number | null;
  disc: ActivityHistoryDisc;
}

export interface ActivityHistoryPage {
  items: ActivityHistoryItem[];
  hasMore: boolean;
  nextPosition: ActivityHistoryContinuation | null;
}
