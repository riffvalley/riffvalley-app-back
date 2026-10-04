export function restoreRandomDiscOrder<T extends { id: string }>(
  discs: T[],
  randomIds: string[],
): T[] {
  const order = new Map(randomIds.map((id, index) => [id, index]));
  return [...discs].sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
