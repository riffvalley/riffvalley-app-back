import { Country } from '../src/catalog/countries/entities/country.entity';
import { AdministrativeRegion } from '../src/catalog/administrative-regions/entities/administrative-region.entity';
import { buildSpanishRegionSeed } from '../src/catalog/administrative-regions/seeds/spanish-regions.seed';
import dataSource from '../src/data-source';

async function seedSpanishAdministrativeRegions(): Promise<void> {
  // This one-off data seed does not run migrations; avoid loading migration specs.
  dataSource.setOptions({ migrations: [] });
  await dataSource.initialize();
  try {
    const countryRepository = dataSource.getRepository(Country);
    const matches = await countryRepository
      .createQueryBuilder('country')
      .where('UPPER(country.isoCode) IN (:...codes)', { codes: ['ES', 'ESP'] })
      .orWhere('LOWER(TRIM(country.name)) IN (:...names)', {
        names: ['spain', 'españa'],
      })
      .getMany();
    const isoMatches = matches.filter(
      (country) => country.isoCode?.toUpperCase() === 'ES',
    );
    const country =
      isoMatches.length === 1
        ? isoMatches[0]
        : isoMatches.length === 0 && matches.length === 1
          ? matches[0]
          : null;
    if (!country) {
      throw new Error(
        'Expected exactly one existing Spain Country (preferably ISO ES); no Country was created',
      );
    }

    const seed = buildSpanishRegionSeed(country.id);
    await dataSource
      .getRepository(AdministrativeRegion)
      .upsert(seed.regions, seed.conflictPaths);
    process.stdout.write(
      `Spanish administrative regions synchronized: ${seed.regions.length} records for Country ${country.id}.\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seedSpanishAdministrativeRegions().catch((error: unknown) => {
  process.stderr.write(
    `Could not seed Spanish administrative regions: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
