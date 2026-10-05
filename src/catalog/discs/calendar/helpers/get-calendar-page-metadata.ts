export function getCalendarPageMetadata(
  totalItems: number,
  limit: number,
  offset: number,
) {
  return {
    totalPages: Math.ceil(totalItems / limit),
    currentPage: Math.floor(offset / limit) + 1,
  };
}
