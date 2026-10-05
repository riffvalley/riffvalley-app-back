export function normalizeArtistName(artistName: string): string {
  return artistName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
