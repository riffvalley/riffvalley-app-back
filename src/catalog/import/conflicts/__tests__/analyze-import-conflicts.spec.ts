import { EventType } from '../../../events/entities/event.entity';
import { analyzeImportConflicts } from '../helpers/analyze-import-conflicts';
import {
  ExistingImportEventCandidate,
  ImportConflictArtist,
  ImportConflictRow,
} from '../import-conflicts.types';

const locality = { status: 'existing' as const, localityId: 'madrid' };
const artist = (name: string, artistId = name): ImportConflictArtist => ({
  name,
  status: 'existing',
  artistId,
});
const concert = (
  rowId: string,
  artists = [artist('Metallica')],
  overrides: Partial<ImportConflictRow> = {},
): ImportConflictRow => ({
  rowId,
  type: EventType.CONCERT,
  artists,
  startDate: '2027-05-15',
  locality,
  ...overrides,
});

function codes(
  results: ReturnType<typeof analyzeImportConflicts>,
  rowId: string,
): string[] {
  return (
    results
      .find((result) => result.rowId === rowId)
      ?.conflicts.map((conflict) => conflict.code) ?? []
  );
}

describe('analyzeImportConflicts', () => {
  it('detects concert conflicts by artist, date, and locality, symmetrically and for tours', () => {
    const rows = [
      concert('a', [artist('Metallica')], { venueId: 'physical-venue' }),
      concert('b', [artist('Metallica'), artist('Gojira')], {
        type: 'tour',
        venueId: 'generic-venue',
      }),
      concert('c', [artist('Kvelertak')], { startDate: '2027-05-16' }),
    ];
    const results = analyzeImportConflicts(rows, []);
    expect(codes(results, 'a')).toContain(
      'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
    );
    expect(codes(results, 'b')).toContain(
      'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
    );
    expect(codes(results, 'c')).toEqual([]);
    expect(
      results.find((result) => result.rowId === 'a')?.conflicts[0]
        .relatedRowIds,
    ).toEqual(['b']);
    expect(
      results.find((result) => result.rowId === 'b')?.conflicts[0]
        .relatedRowIds,
    ).toEqual(['a']);
  });

  it('does not confuse artists, dates, or homonymous localities', () => {
    const rows = [
      concert('same-day-other-artist', [artist('Gojira')]),
      concert('other-date', [artist('Metallica')], { startDate: '2027-05-16' }),
      concert('other-locality', [artist('Metallica')], {
        locality: { ...locality, localityId: 'other-city' },
      }),
      concert('same-name-different-geography', [artist('Metallica')], {
        locality: {
          status: 'created',
          provisionalIdentity: {
            administrativeRegionId: 'region-b',
            city: 'Santander',
          },
        },
      }),
    ];
    expect(
      analyzeImportConflicts(rows, []).every(
        (result) => result.conflicts.length === 0,
      ),
    ).toBe(true);
  });

  it('uses inequivalent-safe provisional artist and locality identities', () => {
    const localityA = {
      status: 'created' as const,
      provisionalIdentity: {
        administrativeRegionId: 'region-a',
        city: 'Santander',
        province: 'Cantabria',
      },
    };
    const rows = [
      concert('a', [{ name: 'Banda Nueva', status: 'created' }], {
        locality: localityA,
      }),
      concert('b', [{ name: 'banda-nueva', status: 'created' }], {
        locality: {
          ...localityA,
          provisionalIdentity: {
            ...localityA.provisionalIdentity,
            city: ' SANTANDER ',
          },
        },
      }),
      concert('ambiguous', [{ name: 'Banda Nueva', status: 'ambiguous' }], {
        locality: localityA,
      }),
    ];
    const results = analyzeImportConflicts(rows, []);
    expect(codes(results, 'a')).toContain(
      'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
    );
    expect(codes(results, 'b')).toContain(
      'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
    );
    expect(codes(results, 'ambiguous')).toEqual([]);
  });

  it('reports every incompatible pair among three rows while leaving independent rows clear', () => {
    const rows = [
      concert('a'),
      concert('b'),
      concert('c'),
      concert('clear', [artist('Kvelertak')], { startDate: '2027-05-16' }),
    ];
    const results = analyzeImportConflicts(rows, []);
    expect(
      results
        .find((result) => result.rowId === 'a')
        ?.conflicts.map((conflict) => conflict.relatedRowIds),
    ).toEqual([['b'], ['c']]);
    expect(
      results
        .find((result) => result.rowId === 'b')
        ?.conflicts.map((conflict) => conflict.relatedRowIds),
    ).toEqual([['a'], ['c']]);
    expect(
      results
        .find((result) => result.rowId === 'c')
        ?.conflicts.map((conflict) => conflict.relatedRowIds),
    ).toEqual([['a'], ['b']]);
    expect(codes(results, 'clear')).toEqual([]);
  });

  it('detects only one-day festival participation conflicts and ignores multi-day intervals across cities', () => {
    const singleDay = {
      rowId: 'festival-day',
      type: EventType.FESTIVAL,
      name: 'One Day',
      artists: [artist('Metallica')],
      startDate: '2027-05-15',
      endDate: '2027-05-15',
      locality,
    } satisfies ImportConflictRow;
    const multiDay = {
      ...singleDay,
      rowId: 'festival-multi',
      name: 'Z! Live',
      startDate: '2027-05-12',
      endDate: '2027-05-18',
      locality: { ...locality, localityId: 'zamora' },
    };
    const concertRow = concert('concert');
    const results = analyzeImportConflicts(
      [singleDay, multiDay, concertRow],
      [],
    );
    expect(codes(results, 'festival-day')).toContain(
      'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT',
    );
    expect(codes(results, 'concert')).toContain(
      'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT',
    );
    expect(codes(results, 'festival-multi')).toEqual([]);
  });

  it('flags same-name same-locality festival duplicates and overlapping periods but allows different cities', () => {
    const rows: ImportConflictRow[] = [
      {
        rowId: 'exact-a',
        type: EventType.FESTIVAL,
        name: 'Punk in Drublic',
        artists: [],
        startDate: '2027-06-12',
        endDate: '2027-06-14',
        locality,
      },
      {
        rowId: 'exact-b',
        type: EventType.FESTIVAL,
        name: 'PUNK IN DRUBLIC',
        artists: [],
        startDate: '2027-06-12',
        endDate: '2027-06-14',
        locality,
      },
      {
        rowId: 'overlap',
        type: EventType.FESTIVAL,
        name: 'Punk in Drublic',
        artists: [],
        startDate: '2027-06-14',
        endDate: '2027-06-16',
        locality,
      },
      {
        rowId: 'different-city',
        type: EventType.FESTIVAL,
        name: 'Punk in Drublic',
        artists: [],
        startDate: '2027-06-12',
        endDate: '2027-06-14',
        locality: { ...locality, localityId: 'barcelona' },
      },
      {
        rowId: 'other-festival',
        type: EventType.FESTIVAL,
        name: 'Different festival',
        artists: [artist('Metallica')],
        startDate: '2027-06-12',
        endDate: '2027-06-14',
        locality,
      },
    ];
    const results = analyzeImportConflicts(rows, []);
    expect(codes(results, 'exact-a')).toContain('FESTIVAL_DUPLICATE');
    expect(codes(results, 'exact-b')).toContain('FESTIVAL_DUPLICATE');
    expect(codes(results, 'exact-a')).toContain('FESTIVAL_POSSIBLE_DUPLICATE');
    expect(codes(results, 'overlap')).toContain('FESTIVAL_POSSIBLE_DUPLICATE');
    expect(codes(results, 'different-city')).toEqual([]);
    expect(codes(results, 'other-festival')).toEqual([]);
  });

  it('reports existing concert completion candidates, exact duplicates, festival duplicates, and missing candidates', () => {
    const existing: ExistingImportEventCandidate[] = [
      {
        id: 'event-1',
        type: EventType.CONCERT,
        name: null,
        startDate: '2027-05-15',
        endDate: null,
        localityId: 'madrid',
        lineup: [
          { artistId: 'Metallica', name: 'Metallica' },
          { artistId: 'Kvelertak', name: 'Kvelertak' },
        ],
      },
      {
        id: 'event-2',
        type: EventType.CONCERT,
        name: null,
        startDate: '2027-05-15',
        endDate: null,
        localityId: 'madrid',
        lineup: [{ artistId: 'Metallica', name: 'Metallica' }],
      },
      {
        id: 'festival-1',
        type: EventType.FESTIVAL,
        name: 'Hellfest',
        startDate: '2027-06-01',
        endDate: '2027-06-01',
        localityId: 'madrid',
        lineup: [{ artistId: 'Metallica', name: 'Metallica' }],
      },
      {
        id: 'festival-2',
        type: EventType.FESTIVAL,
        name: 'Hellfest',
        startDate: '2027-06-01',
        endDate: '2027-06-01',
        localityId: 'madrid',
        lineup: [{ artistId: 'Gojira', name: 'Gojira' }],
      },
    ];
    const rows = [
      concert('completion', [artist('Metallica'), artist('Gojira')]),
      concert('exact', [artist('Metallica')]),
      concert('uncertain', [
        artist('Metallica'),
        { name: 'Unknown Act', status: 'ambiguous' },
      ]),
      {
        ...concert('festival-exact', [artist('Metallica')], {
          startDate: '2027-06-01',
        }),
        type: EventType.FESTIVAL,
        name: 'Hellfest',
      },
      concert('absent', [artist('Gojira')], { startDate: '2027-06-02' }),
    ];
    const results = analyzeImportConflicts(rows, existing);
    const completionConflicts =
      results.find((result) => result.rowId === 'completion')?.conflicts ?? [];
    expect(
      completionConflicts
        .flatMap((conflict) => conflict.candidateEventIds)
        .sort(),
    ).toEqual(['event-1', 'event-2']);
    expect(
      completionConflicts.some((conflict) =>
        conflict.addableArtists.some((entry) => entry.artistId === 'Gojira'),
      ),
    ).toBe(true);
    expect(codes(results, 'exact')).toContain('CONCERT_DUPLICATE');
    expect(
      results.find((result) => result.rowId === 'exact')?.conflicts[0]
        .addableArtists,
    ).toEqual([]);
    expect(codes(results, 'uncertain')).toContain(
      'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
    );
    expect(codes(results, 'uncertain')).not.toContain('CONCERT_DUPLICATE');
    expect(codes(results, 'festival-exact')).toContain('FESTIVAL_DUPLICATE');
    expect(codes(results, 'absent')).toEqual([]);
  });

  it('treats only a complete concert lineup as unchanged and compares unresolved artists by normalized name', () => {
    const existing: ExistingImportEventCandidate[] = [
      {
        id: 'concert-with-extra-artist',
        type: EventType.CONCERT,
        name: null,
        startDate: '2027-05-15',
        endDate: null,
        localityId: 'madrid',
        lineup: [
          { artistId: 'metallica-id', name: 'Metallica' },
          { artistId: 'kvelertak-id', name: 'Kvelertak' },
        ],
      },
    ];
    const rows = [
      concert('partial', [artist('Metallica', 'metallica-id')]),
      concert('unresolved-exact', [
        { name: ' metallica ', status: 'created' },
        { name: 'KVELERTAK', status: 'created' },
      ]),
      concert('different-lineup', [artist('Gojira')]),
    ];

    const results = analyzeImportConflicts(rows, existing);

    expect(codes(results, 'partial')).toContain(
      'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
    );
    expect(codes(results, 'partial')).not.toContain('CONCERT_DUPLICATE');
    expect(codes(results, 'unresolved-exact')).toContain('CONCERT_DUPLICATE');
    expect(codes(results, 'different-lineup')).toEqual([]);
  });

  it('identifies a festival by normalized name, locality, and full period regardless of lineup', () => {
    const existing: ExistingImportEventCandidate[] = [
      {
        id: 'festival-existing',
        type: EventType.FESTIVAL,
        name: 'Rock in Río',
        startDate: '2027-06-12',
        endDate: '2027-06-14',
        localityId: 'madrid',
        lineup: [{ artistId: 'other-artist', name: 'Other Artist' }],
      },
    ];
    const festival: ImportConflictRow = {
      rowId: 'festival-different-lineup',
      type: EventType.FESTIVAL,
      name: ' ROCK IN RIO ',
      artists: [{ name: 'New Artist', status: 'created' }],
      startDate: '2027-06-12',
      endDate: '2027-06-14',
      locality,
    };

    const results = analyzeImportConflicts([festival], existing);

    expect(codes(results, festival.rowId)).toContain('FESTIVAL_DUPLICATE');
  });

  it('falls back to the stored artist name when a persisted lineup has no artist ID', () => {
    const result = analyzeImportConflicts(
      [
        concert('legacy-lineup', [
          artist('Legacy Artist', 'resolved-artist-id'),
        ]),
      ],
      [
        {
          id: 'legacy-event',
          type: EventType.CONCERT,
          name: null,
          startDate: '2027-05-15',
          endDate: null,
          localityId: 'madrid',
          lineup: [{ artistId: null, name: 'Legacy Artist' }],
        },
      ],
    );

    expect(codes(result, 'legacy-lineup')).toContain('CONCERT_DUPLICATE');
  });

  it('does not report participation conflicts with a persisted multi-day festival', () => {
    const existing: ExistingImportEventCandidate[] = [
      {
        id: 'long-festival',
        type: EventType.FESTIVAL,
        name: 'Z! Live',
        startDate: '2027-06-12',
        endDate: '2027-06-15',
        localityId: 'madrid',
        lineup: [{ artistId: 'Metallica', name: 'Metallica' }],
      },
    ];
    const results = analyzeImportConflicts(
      [concert('concert', [artist('Metallica')], { startDate: '2027-06-13' })],
      existing,
    );
    expect(codes(results, 'concert')).toEqual([]);
  });

  it('returns stable ordering and performs no mutations', () => {
    const input = [concert('b'), concert('a')];
    const before = structuredClone(input);
    const first = analyzeImportConflicts(input, []);
    const second = analyzeImportConflicts(input, []);
    expect(input).toEqual(before);
    expect(first).toEqual(second);
  });

  it('revalidates festival artists against same-day concerts but ignores multi-day overlap', () => {
    const existing: ExistingImportEventCandidate[] = [
      {
        id: 'same-day-concert',
        type: EventType.CONCERT,
        name: null,
        startDate: '2027-05-15',
        endDate: null,
        localityId: 'madrid',
        lineup: [{ artistId: 'Gojira', name: 'Gojira' }],
      },
    ];
    const oneDay: ImportConflictRow = {
      rowId: 'festival-one-day',
      type: EventType.FESTIVAL,
      name: 'One Day Fest',
      artists: [artist('Gojira')],
      startDate: '2027-05-15',
      endDate: '2027-05-15',
      locality,
    };
    const multiDay: ImportConflictRow = {
      ...oneDay,
      rowId: 'festival-multi-day',
      name: 'Weekend Fest',
      endDate: '2027-05-17',
    };
    const results = analyzeImportConflicts([oneDay, multiDay], existing);
    expect(codes(results, oneDay.rowId)).toContain(
      'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT',
    );
    expect(codes(results, multiDay.rowId)).toEqual([]);
  });
});
