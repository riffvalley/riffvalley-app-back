export function normalizeGeography(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('und');
}
