export interface SidebarSummaryResponse {
  version: {
    latest: string | null;
  };
  petitions?: {
    pending: number;
  };
  suggestions?: {
    inProgressIds: string[];
  };
}
