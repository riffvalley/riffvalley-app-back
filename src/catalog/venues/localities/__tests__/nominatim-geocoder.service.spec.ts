import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Locality } from '../../entities/locality.entity';
import { NominatimGeocoderService } from '../nominatim-geocoder.service';

describe('NominatimGeocoderService', () => {
  let service: NominatimGeocoderService;
  let query: jest.Mock;
  let fetchSpy: jest.SpyInstance;
  let moduleRef: TestingModule;

  const locality = {
    id: 'locality-id',
    name: 'San Sebastián',
    nameNormalized: 'san sebastian',
    province: 'Gipuzkoa',
    administrativeRegion: {
      id: 'region-id',
      name: 'País Vasco',
      country: { id: 'country-id', name: 'Spain', isoCode: 'ES' },
    },
  } as Locality;

  function createRunner() {
    const runner = {
      isReleased: false,
      connect: jest.fn(async () => undefined),
      query,
      release: jest.fn(async () => {
        runner.isReleased = true;
      }),
    };
    return runner;
  }

  beforeEach(async () => {
    query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT last_request_at'))
        return [{ last_request_at: new Date(Date.now() - 1500) }];
      if (sql.startsWith('SELECT latitude'))
        return [
          { latitude: null, longitude: null, osm_type: null, osm_id: null },
        ];
      return [];
    });
    const dataSource = { createQueryRunner: jest.fn(() => createRunner()) };
    const config = {
      get: jest.fn((key: string) =>
        key === 'GEOCODING_PROVIDER_URL'
          ? 'https://geo.test'
          : key === 'NOMINATIM_ACCEPT_LANGUAGE'
            ? 'es,ca,eu,gl'
            : 'RiffValleyTest/1.0 (contact@example.test)',
      ),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        NominatimGeocoderService,
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(NominatimGeocoderService);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await moduleRef.close();
  });

  it('accepts a single exact locality, division and country match and stores the global rate reservation', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: '43.3183',
          lon: '-1.9812',
          osm_type: 'relation',
          osm_id: 123,
          address: {
            city: 'Donostia / San Sebastián',
            state: 'País Vasco',
            province: 'Gipuzkoa',
            country: 'Spain',
          },
        },
      ],
    } as Response);
    const result = await service.geocode(locality);
    expect(result).toEqual({
      status: 'geocoded',
      latitude: 43.3183,
      longitude: -1.9812,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_lock(118205, 1)'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('last_request_at = clock_timestamp()'),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('San+Sebasti%C3%A1n'),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'RiffValleyTest/1.0 (contact@example.test)',
        }),
      }),
    );
    const requestedUrl = fetchSpy.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.get('namedetails')).toBe('1');
    expect(requestedUrl.searchParams.get('accept-language')).toBe(
      'es,ca,eu,gl',
    );
  });

  it('rejects multiple matching geographic results as ambiguous', async () => {
    const hit = {
      lat: '43',
      lon: '-2',
      osm_type: 'relation',
      osm_id: 1,
      address: {
        city: 'San Sebastián',
        state: 'País Vasco',
        province: 'Gipuzkoa',
        country: 'Spain',
      },
    };
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [hit, { ...hit, osm_id: 2 }],
    } as Response);
    await expect(service.geocode(locality)).resolves.toEqual({
      status: 'ambiguous',
    });
  });

  it('keeps only verified linguistic and alternate names from namedetails', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: '43.3',
          lon: '-1.9',
          osm_type: 'relation',
          osm_id: 77,
          address: {
            city: 'San Sebastián',
            state: 'País Vasco',
            province: 'Gipuzkoa',
            country: 'Spain',
          },
          namedetails: {
            'name:eu': 'Donostia',
            'name:es': 'San Sebastián',
            alt_name: 'Donostia / San Sebastián; Donostia-San Sebastián',
            old_name: 'Antigua Villa',
            ref: 'ES-SS',
            brand: 'Marca',
            'name:en': '',
          },
        },
      ],
    } as Response);
    await expect(service.geocode(locality)).resolves.toMatchObject({
      status: 'geocoded',
      aliases: [
        { name: 'Donostia', language: 'eu', kind: 'linguistic' },
        { name: 'Donostia-San Sebastián', language: null, kind: 'alternate' },
      ],
    });
  });

  it('returns no aliases when Nominatim omits namedetails', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: '43.3',
          lon: '-1.9',
          osm_type: 'relation',
          osm_id: 77,
          address: {
            city: 'San Sebastián',
            state: 'País Vasco',
            province: 'Gipuzkoa',
            country: 'Spain',
          },
        },
      ],
    } as Response);
    await expect(service.geocode(locality)).resolves.toMatchObject({
      aliases: [],
    });
  });

  it('matches administrative divisions without assuming a fixed Nominatim level', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: '43.3',
          lon: '-1.9',
          osm_type: 'relation',
          osm_id: 12,
          address: {
            town: 'San Sebastián',
            region: 'País Vasco',
            county: 'Gipuzkoa',
            country: 'Spain',
          },
        },
      ],
    } as Response);
    await expect(service.geocode(locality)).resolves.toMatchObject({
      status: 'geocoded',
      latitude: 43.3,
      longitude: -1.9,
    });
  });

  it('returns controlled not-found and unavailable outcomes without inventing coordinates', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    await expect(service.geocode(locality)).resolves.toEqual({
      status: 'not_found',
    });
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await expect(service.geocode(locality)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('reuses coordinates found after taking the shared lock without making another provider request', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT last_request_at'))
        return [{ last_request_at: null, wait_ms: 0 }];
      if (sql.startsWith('SELECT latitude'))
        return [
          { latitude: 43.3, longitude: -1.9, osm_type: 'node', osm_id: '42' },
        ];
      return [];
    });
    await expect(service.geocode(locality)).resolves.toEqual({
      status: 'cached',
      latitude: 43.3,
      longitude: -1.9,
      osmType: 'node',
      osmId: '42',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('waits for the database-calculated interval before starting the provider request', async () => {
    jest.useFakeTimers();
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT last_request_at'))
        return [{ last_request_at: new Date(), wait_ms: 1000 }];
      if (sql.startsWith('SELECT latitude'))
        return [
          { latitude: null, longitude: null, osm_type: null, osm_id: null },
        ];
      return [];
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    const pending = service.geocode(locality);
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchSpy).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ status: 'not_found' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
