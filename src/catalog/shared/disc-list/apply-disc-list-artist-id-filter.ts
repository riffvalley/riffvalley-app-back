import { SelectQueryBuilder } from 'typeorm';

/** Applies the exact Artist identity criterion shared by DiscList owners. */
export function applyDiscListArtistIdFilter<Entity extends object>(
  queryBuilder: Pick<SelectQueryBuilder<Entity>, 'andWhere'>,
  artistId?: string,
): void {
  if (!artistId) return;

  queryBuilder.andWhere('artist.id = :discListArtistId', {
    discListArtistId: artistId,
  });
}
