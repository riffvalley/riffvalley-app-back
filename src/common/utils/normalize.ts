// utils/normalize.ts
export function normalizeForSearch(s: string) {
  return s
    .replace(/\+/g, ' ')           // trata + como espacio (ej: half+me → half me)
    .normalize('NFD')              // separa diacríticos
    .replace(/\p{Diacritic}/gu, '') // quita diacríticos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
