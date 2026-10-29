import { SavedDiscFilterCriteria } from '../entities/saved-disc-filter.entity';

export interface SavedDiscFilterResponse {
  id: string;
  name: string;
  filters: SavedDiscFilterCriteria;
  missingGenreIds: string[];
  countryMissing: boolean;
  createdAt: Date;
  updatedAt: Date;
}
