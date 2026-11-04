import { normalizeGeography } from '../../geography/helpers/normalize-geography';
import { AdministrativeRegion } from '../entities/administrative-region.entity';
import { SPANISH_ADMINISTRATIVE_REGIONS } from './spanish-regions.data';

export function buildSpanishRegionSeed(countryId: string): {
  regions: Array<
    Pick<AdministrativeRegion, 'name' | 'nameNormalized' | 'countryId' | 'code'>
  >;
  conflictPaths: Array<keyof AdministrativeRegion>;
} {
  return {
    regions: SPANISH_ADMINISTRATIVE_REGIONS.map(({ name, code }) => ({
      name,
      nameNormalized: normalizeGeography(name),
      countryId,
      code,
    })),
    conflictPaths: ['countryId', 'nameNormalized'],
  };
}
