import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Artist } from '../../entities/artist.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Genre } from '../../../genres/entities/genre.entity';
import { normalizeForSearch } from '../../helpers/normalize-for-search';
import { normalizeMusicName } from '../../../shared/music-name/normalize-music-name';
import { ArtistDirectoryService } from '../artist-directory.service';

const runPostgres =
  process.env.CATALOG_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

runPostgres('Artist directory PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: ArtistDirectoryService;
  let fixturePrefix: string;
  let fixtureGenreName: string;
  let artistIds: string[] = [];
  let genreId: string;

  beforeAll(async () => {
    if (
      process.env.STAGE !== 'dev' ||
      process.env.DB_HOST !== '127.0.0.1' ||
      process.env.DB_PORT !== '55432' ||
      process.env.DB_NAME !== 'riffvalley_catalog_test_20261015' ||
      process.env.DB_USERNAME !== 'riffvalley_catalog_test' ||
      !process.env.CATALOG_TEST_DB_PASSWORD ||
      process.env.DATABASE_URL
    ) {
      throw new Error(
        'Artist directory PostgreSQL integration requires the isolated local Catalog test database.',
      );
    }
    process.env.DB_PASSWORD = process.env.CATALOG_TEST_DB_PASSWORD;
    const { default: configuredDataSource } = await import(
      '../../../../data-source'
    );
    dataSource = configuredDataSource;
    dataSource.setOptions({
      installExtensions: false,
      logging: false,
      migrations: [],
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();

    const [identity] = (await dataSource.query(`
      SELECT current_database() AS database,
             current_user AS username,
             pg_get_userbyid(datdba) AS owner,
             inet_server_port() AS port
      FROM pg_database
      WHERE datname = current_database()
    `)) as Array<{
      database: string;
      username: string;
      owner: string;
      port: number;
    }>;
    if (
      identity?.database !== 'riffvalley_catalog_test_20261015' ||
      identity.username !== 'riffvalley_catalog_test' ||
      identity.owner !== 'riffvalley_catalog_test' ||
      Number(identity.port) !== 5432
    ) {
      throw new Error(
        'PostgreSQL identity did not match the isolated test DB.',
      );
    }

    fixturePrefix = `CAT-ART-2b-${randomUUID()}`;
    fixtureGenreName = `${fixturePrefix.slice(0, 38)} genre`;
    const genre = await dataSource.getRepository(Genre).save({
      name: fixtureGenreName,
      color: '#abcdef',
    });
    genreId = genre.id;
    const names = [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split('')
        .map((letter) => `${letter} ${fixturePrefix}`),
      `Ä ${fixturePrefix}`,
      `Ö ${fixturePrefix}`,
      `Ñ ${fixturePrefix}`,
      `7 ${fixturePrefix}`,
      `! ${fixturePrefix}`,
      `The ${fixturePrefix}`,
      `A ${fixturePrefix} article`,
    ];
    const artists = await dataSource.getRepository(Artist).save(
      names.map((name) => ({
        name,
        nameNormalized: normalizeForSearch(name),
        searchNameNormalized: normalizeMusicName(name),
        needsReview: false,
      })),
    );
    artistIds = artists.map(({ id }) => id);
    service = new ArtistDirectoryService(dataSource.getRepository(Artist));

    const theArtist = artists.find(({ name }) => name.startsWith('The '));
    if (!theArtist) throw new Error('The article fixture was not saved.');
    const tieDiscIds = [randomUUID(), randomUUID()].sort();
    await dataSource.getRepository(Disc).save({
      id: tieDiscIds[0],
      name: `${fixturePrefix} tie first`,
      artist: theArtist,
      genre,
      releaseDate: new Date('2020-01-01'),
    });
    await dataSource.getRepository(Disc).save({
      id: tieDiscIds[1],
      name: `${fixturePrefix} tie second`,
      artist: theArtist,
      genre: null,
      releaseDate: new Date('2020-01-01'),
    });
    await dataSource.getRepository(Disc).save({
      id: randomUUID(),
      name: `${fixturePrefix} undated`,
      artist: theArtist,
      genre: null,
      releaseDate: null,
    });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (artistIds.length) {
        await dataSource.query(
          'DELETE FROM disc WHERE "artistId" = ANY($1::uuid[])',
          [artistIds],
        );
        await dataSource.query(
          'DELETE FROM artist WHERE id = ANY($1::uuid[])',
          [artistIds],
        );
      }
      if (genreId)
        await dataSource.getRepository(Genre).delete({ id: genreId });
      await dataSource.destroy();
    }
  });

  it('filters all A–Z letters and the special category before counting', async () => {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const result = await service.findDirectory({
        letter,
        limit: 100,
      });
      expect(
        result.data.some((artist) =>
          artist.name.startsWith(`${letter} ${fixturePrefix}`),
        ),
      ).toBe(true);
    }
    const special = await service.findDirectory({
      letter: '#',
      limit: 100,
    });
    expect(special.data.some(({ name }) => name === `! ${fixturePrefix}`)).toBe(
      true,
    );
    expect(special.data.some(({ name }) => name === `7 ${fixturePrefix}`)).toBe(
      true,
    );
  });

  it('normalizes Ä/Ö/Ñ and classifies initial articles under their written letter', async () => {
    for (const [letter, name] of [
      ['A', `Ä ${fixturePrefix}`],
      ['O', `Ö ${fixturePrefix}`],
      ['N', `Ñ ${fixturePrefix}`],
      ['T', `The ${fixturePrefix}`],
      ['A', `A ${fixturePrefix} article`],
    ]) {
      const result = await service.findDirectory({
        letter,
        limit: 100,
      });
      expect(result.data.some((artist) => artist.name === name)).toBe(true);
    }
    const letterQ = await service.findDirectory({ letter: 'Q', limit: 100 });
    expect(
      letterQ.data.find((artist) => artist.name === `Q ${fixturePrefix}`),
    ).toMatchObject({ genre: null, genreColor: null });
  });

  it('searches independently of the chosen letter, paginates, and returns the newest related disc genre', async () => {
    const result = await service.findDirectory({
      letter: 'Z',
      q: `${fixturePrefix} tie`,
      limit: 1,
      offset: 0,
    });
    expect(result.totalItems).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.data).toEqual([
      expect.objectContaining({
        genre: fixtureGenreName,
        genreColor: '#abcdef',
      }),
    ]);
  });
});
