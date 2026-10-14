/** Fields from an embedded WordPress posts response consumed by News. */
export interface WpPublicPost {
  title?: { rendered?: string };
  link?: string;
  date?: string;
  _embedded?: {
    'wp:featuredmedia'?: { source_url?: string }[];
  };
}

/** Fields from WordPress posts used by Lists when finding or writing posts. */
export interface WpPost {
  id: number;
  link: string;
  title: { rendered: string };
  status: string;
}

/** Authenticated edit-context response fields used to synchronize post content. */
export interface WpEditablePost {
  content: { raw: string };
  status: string;
}

export interface WpAuthor {
  id: number;
  name: string;
  link: string;
}

export interface WpTag {
  id: number;
  name: string;
}
