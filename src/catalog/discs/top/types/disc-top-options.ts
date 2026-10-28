export type DiscTopCountryOption = {
  id: string;
  name: string;
  isoCode: string | null;
};

export type DiscTopGenreOption = {
  id: string;
  name: string;
  color: string | null;
};

export type DiscTopOptionsResult = {
  countries: DiscTopCountryOption[];
  genres: DiscTopGenreOption[];
};
