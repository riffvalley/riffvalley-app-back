import { normalizeGeography } from '../../../geography/helpers/normalize-geography';
import {
  compareNormalizedMusicNames,
  normalizeMusicName,
} from '../../../shared/music-name/normalize-music-name';
import { EventType } from '../../../events/entities/event.entity';
import {
  ExistingImportEventCandidate,
  ImportConflictAnalysis,
  ImportConflictArtist,
  ImportConflictCode,
  ImportConflictKind,
  ImportConflictLocality,
  ImportConflictResult,
  ImportConflictRow,
} from '../import-conflicts.types';

function concertLike(type: ImportConflictRow['type']): boolean {
  return type === EventType.CONCERT || type === 'tour';
}

function oneDay(
  row: Pick<ImportConflictRow, 'startDate' | 'endDate'>,
): boolean {
  return !row.endDate || row.endDate === row.startDate;
}

function artistIdentity(artist: ImportConflictArtist): string | null {
  if (artist.status === 'ambiguous' || artist.status === 'invalid') return null;
  if (artist.artistId) return `id:${artist.artistId}`;
  if (artist.status !== 'created') return null;
  const normalized = normalizeMusicName(artist.name);
  return normalized ? `new:${normalized}` : null;
}

function localityIdentity(locality: ImportConflictLocality): string | null {
  if (locality.localityId) return `id:${locality.localityId}`;
  if (
    locality.status !== 'created' ||
    !locality.provisionalIdentity?.administrativeRegionId
  )
    return null;
  const city = normalizeGeography(locality.provisionalIdentity.city);
  const province = normalizeGeography(
    locality.provisionalIdentity.province ?? '',
  );
  if (!city) return null;
  return `new:${locality.provisionalIdentity.administrativeRegionId}:${province}:${city}`;
}

function matchingArtists(
  left: ImportConflictArtist[],
  right: ImportConflictArtist[],
): ImportConflictArtist[] {
  const rightIdentities = new Set(
    right.map(artistIdentity).filter((id): id is string => id !== null),
  );
  return left.filter((artist) => {
    const identity = artistIdentity(artist);
    return identity !== null && rightIdentities.has(identity);
  });
}

function eventMatchesArtist(
  artist: ImportConflictArtist,
  eventArtist: { artistId: string | null; name: string },
): boolean {
  if (artist.status === 'ambiguous' || artist.status === 'invalid')
    return false;
  if (artist.artistId && eventArtist.artistId)
    return artist.artistId === eventArtist.artistId;
  return (
    (artist.status === 'created' || !eventArtist.artistId) &&
    compareNormalizedMusicNames(artist.name, eventArtist.name)
  );
}

function sameConcertLineup(
  rowArtists: ImportConflictArtist[],
  eventArtists: ExistingImportEventCandidate['lineup'],
): boolean {
  if (!rowArtists.length || !eventArtists.length) return false;
  if (rowArtists.some((artist) => artistIdentity(artist) === null))
    return false;
  return (
    rowArtists.length === eventArtists.length &&
    rowArtists.every(
      (artist) =>
        eventArtists.filter((eventArtist) =>
          eventMatchesArtist(artist, eventArtist),
        ).length === 1,
    ) &&
    eventArtists.every(
      (eventArtist) =>
        rowArtists.filter((artist) => eventMatchesArtist(artist, eventArtist))
          .length === 1,
    )
  );
}

function makeResult(
  rowId: string,
  code: ImportConflictCode,
  kind: ImportConflictKind,
  severity: ImportConflictResult['severity'],
  message: string,
  values: Partial<
    Pick<
      ImportConflictResult,
      | 'relatedRowIds'
      | 'existingEventIds'
      | 'matchingArtists'
      | 'addableArtists'
      | 'candidateEventIds'
    >
  > = {},
): ImportConflictResult {
  return {
    rowId,
    kind,
    code,
    severity,
    message,
    relatedRowIds: [...(values.relatedRowIds ?? [])].sort(),
    existingEventIds: [...(values.existingEventIds ?? [])].sort(),
    matchingArtists: [...(values.matchingArtists ?? [])]
      .map(({ artistId, name }) => ({ artistId: artistId ?? null, name }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          (a.artistId ?? '').localeCompare(b.artistId ?? ''),
      ),
    addableArtists: [...(values.addableArtists ?? [])]
      .map(({ artistId, name }) => ({ artistId: artistId ?? null, name }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          (a.artistId ?? '').localeCompare(b.artistId ?? ''),
      ),
    candidateEventIds: [...(values.candidateEventIds ?? [])].sort(),
  };
}

function festivalDateRelation(
  left: Pick<ImportConflictRow, 'startDate' | 'endDate'>,
  right: Pick<ImportConflictRow, 'startDate' | 'endDate'>,
): 'same' | 'overlap' | null {
  const leftEnd = left.endDate ?? left.startDate;
  const rightEnd = right.endDate ?? right.startDate;
  if (left.startDate === right.startDate && leftEnd === rightEnd) return 'same';
  return left.startDate <= rightEnd && right.startDate <= leftEnd
    ? 'overlap'
    : null;
}

export function analyzeImportConflicts(
  rows: ImportConflictRow[],
  existingEvents: ExistingImportEventCandidate[],
): ImportConflictAnalysis[] {
  const results = new Map(
    rows.map((row) => [row.rowId, [] as ImportConflictResult[]]),
  );
  const add = (result: ImportConflictResult) =>
    results.get(result.rowId)?.push(result);

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rows.length;
      rightIndex += 1
    ) {
      const right = rows[rightIndex];
      const sameLocality =
        localityIdentity(left.locality) !== null &&
        localityIdentity(left.locality) === localityIdentity(right.locality);
      if (!sameLocality) continue;
      if (
        concertLike(left.type) &&
        concertLike(right.type) &&
        left.startDate === right.startDate
      ) {
        const shared = matchingArtists(left.artists, right.artists);
        if (shared.length) {
          for (const [row, other] of [
            [left, right],
            [right, left],
          ])
            add(
              makeResult(
                row.rowId,
                'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
                'participation',
                'blocking',
                'La fila comparte artista, fecha y localidad con otra fila del lote.',
                {
                  relatedRowIds: [other.rowId],
                  matchingArtists: shared.map(({ artistId, name }) => ({
                    artistId: artistId ?? null,
                    name,
                  })),
                },
              ),
            );
        }
      } else if (concertLike(left.type) !== concertLike(right.type)) {
        const concert = concertLike(left.type) ? left : right;
        const festival = concertLike(left.type) ? right : left;
        if (
          festival.type !== EventType.FESTIVAL ||
          !oneDay(festival) ||
          festival.startDate !== concert.startDate
        )
          continue;
        const shared = matchingArtists(concert.artists, festival.artists);
        if (shared.length) {
          for (const [row, other] of [
            [left, right],
            [right, left],
          ])
            add(
              makeResult(
                row.rowId,
                'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT',
                'participation',
                'review',
                'La participación del artista en el concierto y el festival de un día requiere revisión.',
                {
                  relatedRowIds: [other.rowId],
                  matchingArtists: shared.map(({ artistId, name }) => ({
                    artistId: artistId ?? null,
                    name,
                  })),
                },
              ),
            );
        }
      } else if (
        left.type === EventType.FESTIVAL &&
        right.type === EventType.FESTIVAL
      ) {
        const leftName = normalizeGeography(left.name ?? '');
        const rightName = normalizeGeography(right.name ?? '');
        const relation =
          leftName && leftName === rightName
            ? festivalDateRelation(left, right)
            : null;
        if (relation) {
          const code =
            relation === 'same'
              ? 'FESTIVAL_DUPLICATE'
              : 'FESTIVAL_POSSIBLE_DUPLICATE';
          const severity = relation === 'same' ? 'blocking' : 'review';
          for (const [row, other] of [
            [left, right],
            [right, left],
          ])
            add(
              makeResult(
                row.rowId,
                code,
                'duplicate',
                severity,
                relation === 'same'
                  ? 'Coincide nombre, localidad y periodo con otra fila del lote.'
                  : 'El nombre y la localidad coinciden con otra fila del lote y los periodos se solapan.',
                { relatedRowIds: [other.rowId] },
              ),
            );
        }
      }
    }
  }

  for (const row of rows) {
    const localityId = row.locality.localityId;
    if (!localityId) continue;
    const matchingEvents = existingEvents.filter(
      (event) => event.localityId === localityId,
    );
    if (concertLike(row.type)) {
      for (const event of matchingEvents) {
        if (
          event.type === EventType.CONCERT &&
          event.startDate === row.startDate
        ) {
          const shared = row.artists.filter((artist) =>
            event.lineup.some((lineupArtist) =>
              eventMatchesArtist(artist, lineupArtist),
            ),
          );
          if (!shared.length) continue;
          const addable = row.artists.filter(
            (artist) =>
              !event.lineup.some((lineupArtist) =>
                eventMatchesArtist(artist, lineupArtist),
              ) &&
              artist.status !== 'ambiguous' &&
              artist.status !== 'invalid',
          );
          const resolvedArtists = row.artists.filter(
            (artist) =>
              artist.status === 'existing' || artist.status === 'created',
          );
          const duplicate =
            shared.length > 0 &&
            resolvedArtists.length === row.artists.length &&
            sameConcertLineup(row.artists, event.lineup);
          add(
            makeResult(
              row.rowId,
              duplicate
                ? 'CONCERT_DUPLICATE'
                : 'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
              duplicate ? 'duplicate' : 'participation',
              'blocking',
              duplicate
                ? 'Todos los artistas resueltos ya están asociados al concierto coincidente.'
                : addable.length
                  ? 'Hay un concierto coincidente; se puede proponer completar su lineup tras revisión.'
                  : 'Hay artistas sin identidad inequívoca y no se puede confirmar si el lineup coincide.',
              {
                existingEventIds: [event.id],
                matchingArtists: shared.map(({ artistId, name }) => ({
                  artistId: artistId ?? null,
                  name,
                })),
                addableArtists: addable.map(({ artistId, name }) => ({
                  artistId: artistId ?? null,
                  name,
                })),
                candidateEventIds: [event.id],
              },
            ),
          );
        }
        if (
          event.type === EventType.FESTIVAL &&
          event.startDate === row.startDate &&
          (event.endDate === null || event.endDate === event.startDate)
        ) {
          const shared = row.artists.filter((artist) =>
            event.lineup.some((lineupArtist) =>
              eventMatchesArtist(artist, lineupArtist),
            ),
          );
          if (shared.length)
            add(
              makeResult(
                row.rowId,
                'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT',
                'participation',
                'review',
                'La participación del artista en un concierto y un festival de un día requiere revisión.',
                {
                  existingEventIds: [event.id],
                  matchingArtists: shared.map(({ artistId, name }) => ({
                    artistId: artistId ?? null,
                    name,
                  })),
                  candidateEventIds: [event.id],
                },
              ),
            );
        }
      }
    } else if (row.type === EventType.FESTIVAL) {
      const nameKey = normalizeGeography(row.name ?? '');
      for (const event of matchingEvents) {
        if (
          oneDay(row) &&
          event.type === EventType.CONCERT &&
          event.startDate === row.startDate
        ) {
          const shared = row.artists.filter((artist) =>
            event.lineup.some((lineupArtist) =>
              eventMatchesArtist(artist, lineupArtist),
            ),
          );
          if (shared.length)
            add(
              makeResult(
                row.rowId,
                'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT',
                'participation',
                'review',
                'La participación del artista en un concierto y un festival de un día requiere revisión.',
                {
                  existingEventIds: [event.id],
                  matchingArtists: shared.map(({ artistId, name }) => ({
                    artistId: artistId ?? null,
                    name,
                  })),
                  candidateEventIds: [event.id],
                },
              ),
            );
        }
        if (!nameKey) continue;
        if (
          event.type !== EventType.FESTIVAL ||
          normalizeGeography(event.name ?? '') !== nameKey
        )
          continue;
        const relation = festivalDateRelation(row, event);
        if (!relation) continue;
        const code =
          relation === 'same'
            ? 'FESTIVAL_DUPLICATE'
            : 'FESTIVAL_POSSIBLE_DUPLICATE';
        const shared = row.artists.filter((artist) =>
          event.lineup.some((lineupArtist) =>
            eventMatchesArtist(artist, lineupArtist),
          ),
        );
        const addable = row.artists.filter(
          (artist) =>
            !event.lineup.some((lineupArtist) =>
              eventMatchesArtist(artist, lineupArtist),
            ) &&
            artist.status !== 'ambiguous' &&
            artist.status !== 'invalid',
        );
        add(
          makeResult(
            row.rowId,
            code,
            'duplicate',
            relation === 'same' ? 'blocking' : 'review',
            relation === 'same'
              ? 'Ya existe un festival con el mismo nombre, localidad y periodo.'
              : 'Existe un festival con el mismo nombre y localidad en un periodo solapado.',
            {
              existingEventIds: [event.id],
              matchingArtists: shared.map(({ artistId, name }) => ({
                artistId: artistId ?? null,
                name,
              })),
              addableArtists: addable.map(({ artistId, name }) => ({
                artistId: artistId ?? null,
                name,
              })),
              candidateEventIds: [event.id],
            },
          ),
        );
      }
    }
  }

  return rows.map((row) => ({
    rowId: row.rowId,
    conflicts: (results.get(row.rowId) ?? []).sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.relatedRowIds
          .join(',')
          .localeCompare(right.relatedRowIds.join(',')) ||
        left.existingEventIds
          .join(',')
          .localeCompare(right.existingEventIds.join(',')),
    ),
  }));
}
