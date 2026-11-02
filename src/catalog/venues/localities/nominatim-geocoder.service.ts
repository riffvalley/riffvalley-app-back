import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { Locality } from '../entities/locality.entity';
import { normalizeGeography } from '../../geography/helpers/normalize-geography';
import { LocalityAliasKind } from '../entities/locality-alias.entity';

export interface GeocodingAlias {
  name: string;
  normalizedName: string;
  language: string | null;
  kind: LocalityAliasKind;
}

export type GeocodingResult =
  | {
      status: 'geocoded';
      latitude: number;
      longitude: number;
      osmType: string;
      osmId: string;
      aliases: GeocodingAlias[];
    }
  | {
      status: 'cached';
      latitude: number;
      longitude: number;
      osmType: string | null;
      osmId: string | null;
    }
  | { status: 'not_found' | 'ambiguous' | 'unavailable' };

interface NominatimAddress {
  city?: unknown;
  town?: unknown;
  village?: unknown;
  municipality?: unknown;
  hamlet?: unknown;
  county?: unknown;
  state?: unknown;
  state_district?: unknown;
  region?: unknown;
  province?: unknown;
  country?: unknown;
  country_code?: unknown;
}

interface NominatimResult {
  name?: unknown;
  lat?: unknown;
  lon?: unknown;
  osm_type?: unknown;
  osm_id?: unknown;
  address?: unknown;
  namedetails?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isAddress(value: unknown): value is NominatimAddress {
  return isRecord(value);
}

function matchesGeography(
  result: NominatimResult,
  locality: Locality,
): boolean {
  const address = isAddress(result.address) ? result.address : {};
  const localityNames = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.hamlet,
  ]
    .map(stringValue)
    .filter((value): value is string => value !== null)
    .flatMap((value) => value.split(/\s*\/\s*/u));
  const divisions = [
    address.county,
    address.state,
    address.state_district,
    address.region,
    address.province,
  ]
    .map(stringValue)
    .filter((value): value is string => value !== null);
  const country = stringValue(address.country);
  const regionName = locality.administrativeRegion?.name;
  const countryName = locality.administrativeRegion?.country?.name;

  const namedetails = isRecord(result.namedetails) ? result.namedetails : {};
  const queriedNameMatches = Object.entries(namedetails).some(
    ([key, value]) =>
      isTrustedAliasField(key) &&
      typeof value === 'string' &&
      value
        .split(/\s*[;/]\s*/u)
        .some((name) => normalizeGeography(name) === locality.nameNormalized),
  );

  return (
    (localityNames.some(
      (value) => normalizeGeography(value) === locality.nameNormalized,
    ) ||
      queriedNameMatches) &&
    normalizeGeography(country ?? '') ===
      normalizeGeography(countryName ?? '') &&
    regionName !== undefined &&
    divisions.some(
      (value) => normalizeGeography(value) === normalizeGeography(regionName),
    ) &&
    (locality.province === null ||
      divisions.some(
        (value) =>
          normalizeGeography(value) ===
          normalizeGeography(locality.province ?? ''),
      ))
  );
}

function isTrustedAliasField(key: string): boolean {
  return /^(?:name:[a-z]{2,3}(?:-[a-z0-9]{2,8})*|alt_name(?::[a-z]{2,3}(?:-[a-z0-9]{2,8})*)?)$/iu.test(
    key,
  );
}

function parseAliases(value: unknown, canonicalName: string): GeocodingAlias[] {
  if (!isRecord(value)) return [];
  const canonical = normalizeGeography(canonicalName);
  const aliases = new Map<string, GeocodingAlias>();
  for (const [key, raw] of Object.entries(value)) {
    if (!isTrustedAliasField(key) || typeof raw !== 'string') continue;
    const languageMatch = key.match(
      /^(?:name|alt_name):([a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/iu,
    );
    for (const rawName of raw.split(/\s*[;/]\s*/u)) {
      const name = rawName.trim().replace(/\s+/gu, ' ');
      const normalizedName = normalizeGeography(name);
      if (
        !name ||
        name.length > 150 ||
        !/\p{L}/u.test(name) ||
        normalizedName === canonical
      )
        continue;
      if (!aliases.has(normalizedName)) {
        aliases.set(normalizedName, {
          name,
          normalizedName,
          language: languageMatch?.[1]?.toLowerCase() ?? null,
          kind: key.toLowerCase().startsWith('name:')
            ? 'linguistic'
            : 'alternate',
        });
      }
    }
  }
  return [...aliases.values()];
}

function parseCandidate(
  value: unknown,
  canonicalName: string,
): GeocodingResult | null {
  if (!isRecord(value)) return null;
  const latitude = Number(value.lat);
  const longitude = Number(value.lon);
  const osmType = stringValue(value.osm_type);
  const osmId = value.osm_id;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !osmType ||
    !['node', 'way', 'relation'].includes(osmType) ||
    (typeof osmId !== 'number' && typeof osmId !== 'string')
  )
    return null;
  return {
    status: 'geocoded',
    latitude,
    longitude,
    osmType,
    osmId: String(osmId),
    aliases: parseAliases(value.namedetails, canonicalName),
  };
}

@Injectable()
export class NominatimGeocoderService {
  private readonly logger = new Logger(NominatimGeocoderService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async geocode(locality: Locality): Promise<GeocodingResult> {
    const baseUrl = (
      this.config.get<string>('GEOCODING_PROVIDER_URL') ??
      'https://nominatim.openstreetmap.org'
    ).replace(/\/$/u, '');
    const userAgent =
      this.config.get<string>('NOMINATIM_USER_AGENT') ??
      'RiffValley/1.0 (https://riffvalley.es; contacto@riffvalley.es)';
    const query = [
      locality.name,
      locality.province,
      locality.administrativeRegion?.name,
      locality.administrativeRegion?.country?.name,
    ]
      .filter(Boolean)
      .join(', ');
    let url: URL;
    try {
      url = new URL(`${baseUrl}/search`);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { status: 'unavailable' };
      }
    } catch {
      return { status: 'unavailable' };
    }
    if (!userAgent.trim()) return { status: 'unavailable' };
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set(
      'accept-language',
      this.config.get<string>('NOMINATIM_ACCEPT_LANGUAGE') ?? 'es,ca,eu,gl',
    );

    let runner: QueryRunner | null = null;
    let acquiredGlobalLock = false;
    try {
      runner = this.dataSource.createQueryRunner();
      await runner.connect();
      await runner.query("SET lock_timeout = '10s'");
      await runner.query('SELECT pg_advisory_lock(118205, 1)');
      acquiredGlobalLock = true;
      const rows: Array<{
        last_request_at: Date | string | null;
        wait_ms: number | string | null;
      }> = await runner.query(
        'SELECT last_request_at, GREATEST(0, CEIL(1000 - EXTRACT(EPOCH FROM (clock_timestamp() - last_request_at)) * 1000)) AS wait_ms FROM locality_geocoding_rate_limit WHERE id = 1',
      );
      if (rows.length !== 1)
        throw new Error('Geocoding throttle row is missing');
      const cached: Array<{
        latitude: number | null;
        longitude: number | null;
        osm_type: string | null;
        osm_id: string | null;
      }> = await runner.query(
        'SELECT latitude, longitude, osm_type, osm_id FROM localities WHERE id = $1',
        [locality.id],
      );
      if (
        cached.length === 1 &&
        cached[0].latitude !== null &&
        cached[0].longitude !== null
      ) {
        return {
          status: 'cached',
          latitude: Number(cached[0].latitude),
          longitude: Number(cached[0].longitude),
          osmType: cached[0].osm_type,
          osmId: cached[0].osm_id,
        };
      }
      const waitMs =
        rows[0].last_request_at === null
          ? 0
          : Math.max(0, Number(rows[0].wait_ms) || 0);
      if (waitMs > 0)
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      await runner.query(
        'UPDATE locality_geocoding_rate_limit SET last_request_at = clock_timestamp() WHERE id = 1',
      );

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
      } catch (error) {
        this.logger.warn(
          `Nominatim request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        return { status: 'unavailable' };
      }
      if (!response.ok) {
        this.logger.warn(`Nominatim returned HTTP ${response.status}`);
        return { status: 'unavailable' };
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { status: 'unavailable' };
      }
      if (!Array.isArray(payload)) return { status: 'unavailable' };

      const matching = payload.filter((result): result is NominatimResult => {
        if (!isRecord(result) || !isAddress(result.address)) return false;
        return matchesGeography(result, locality);
      });
      if (matching.length === 0) return { status: 'not_found' };
      if (matching.length !== 1) return { status: 'ambiguous' };
      const candidate = parseCandidate(matching[0], locality.name);
      if (!candidate || candidate.status !== 'geocoded')
        return { status: 'unavailable' };
      await runner.query(
        'UPDATE localities SET latitude = $2, longitude = $3, updated_at = clock_timestamp() WHERE id = $1',
        [locality.id, candidate.latitude, candidate.longitude],
      );
      return candidate;
    } catch (error) {
      this.logger.warn(
        `Geocoding coordination unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { status: 'unavailable' };
    } finally {
      if (runner?.isReleased === false) {
        if (acquiredGlobalLock) {
          await runner
            .query('SELECT pg_advisory_unlock(118205, 1)')
            .catch(() => undefined);
        }
        await runner.query('RESET lock_timeout').catch(() => undefined);
        await runner.release();
      }
    }
  }
}
