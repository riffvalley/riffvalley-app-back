import { MODULE_METADATA } from '@nestjs/common/constants';
import { SpotifyPlaylistsModule } from '../spotify-playlists.module';
import { SpotifyPlaylistsService } from '../spotify-playlists.service';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';
import { SpotifyConnectionService } from 'src/integrations/spotify-integration/oauth/spotify-connection.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SpotifyAccountApiService,
  SpotifyOAuthApiService,
} from 'src/integrations/spotify-integration/api';
import { ConfigService } from '@nestjs/config';
import { FestivalSetlistService } from '../setlist/festival-setlist.service';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';
import { SpotifyPlaylistArtistSyncService } from '../artist-sync/spotify-playlist-artist-sync.service';
import { SpotifyPlaylistTrackMaintenanceService } from '../track-maintenance/spotify-playlist-track-maintenance.service';
import { FestivalPlaylistsController } from '../festival-playlists.controller';
import { GenrePlaylistsController } from '../genre-playlists.controller';

const moduleMetadata = (key: string): unknown[] => {
  const metadata: unknown = Reflect.getMetadata(key, SpotifyPlaylistsModule);
  return Array.isArray(metadata) ? metadata : [];
};

describe('SpotifyPlaylistsModule authorization wiring', () => {
  it('composes the facade from each responsibility once and keeps providers private', () => {
    const providers = moduleMetadata(MODULE_METADATA.PROVIDERS);
    const expectedProviders = [
      SpotifyPlaylistsService,
      SpotifyPlaylistAuthorizationService,
      FestivalSetlistService,
      SpotifyPlaylistManagementService,
      SpotifyPlaylistArtistSyncService,
      SpotifyPlaylistTrackMaintenanceService,
    ];
    const facadeDependencies: unknown = Reflect.getMetadata(
      'design:paramtypes',
      SpotifyPlaylistsService,
    );
    const controllers = moduleMetadata(MODULE_METADATA.CONTROLLERS);
    const exports = moduleMetadata(MODULE_METADATA.EXPORTS);
    const festivalControllerDependencies: unknown = Reflect.getMetadata(
      'design:paramtypes',
      FestivalPlaylistsController,
    );
    const genreControllerDependencies: unknown = Reflect.getMetadata(
      'design:paramtypes',
      GenrePlaylistsController,
    );

    expect(providers).toEqual(expect.arrayContaining(expectedProviders));
    for (const provider of expectedProviders) {
      expect(
        providers.filter((registered) => registered === provider),
      ).toHaveLength(1);
    }
    expect(facadeDependencies).toEqual([
      SpotifyPlaylistAuthorizationService,
      FestivalSetlistService,
      SpotifyPlaylistManagementService,
      SpotifyPlaylistArtistSyncService,
      SpotifyPlaylistTrackMaintenanceService,
    ]);
    expect(controllers).toEqual([
      FestivalPlaylistsController,
      GenrePlaylistsController,
    ]);
    expect(festivalControllerDependencies).toEqual([
      SpotifyPlaylistsService,
      ConfigService,
    ]);
    expect(genreControllerDependencies).toEqual([SpotifyPlaylistsService]);
    expect(exports).toEqual([]);
  });

  it('keeps the authorization cron and connection provider in Spotify Integration', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyPlaylistsModule,
    ) as unknown[];
    const integrationProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyIntegrationModule,
    ) as unknown[];
    const integrationExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      SpotifyIntegrationModule,
    ) as unknown[];
    const cronOptions = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      Reflect.get(
        SpotifyConnectionService.prototype,
        'checkSpotifyAuthorizationLifetime',
      ),
    );
    const facadeCron = Reflect.get(
      SpotifyPlaylistAuthorizationService.prototype,
      'checkSpotifyAuthorizationLifetime',
    );

    expect(
      providers.filter(
        (provider) => provider === SpotifyPlaylistAuthorizationService,
      ),
    ).toHaveLength(1);
    expect(providers).toContain(SpotifyPlaylistsService);
    expect(integrationProviders).toContain(SpotifyConnectionService);
    expect(integrationExports).toContain(SpotifyConnectionService);
    expect(integrationExports).not.toContain(TypeOrmModule);
    expect(cronOptions).toEqual({
      cronTime: '0 9 * * *',
      timeZone: 'Europe/Madrid',
    });
    expect(facadeCron).toBeUndefined();
  });

  it('registra una instancia del servicio de administración con dependencias unidireccionales', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyPlaylistsModule,
    ) as unknown[];
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      SpotifyPlaylistManagementService,
    ) as unknown[];

    expect(
      providers.filter(
        (provider) => provider === SpotifyPlaylistManagementService,
      ),
    ).toHaveLength(1);
    expect(dependencies.slice(1)).toEqual([
      SpotifyAccountApiService,
      SpotifyPlaylistAuthorizationService,
    ]);
    expect(dependencies).not.toContain(SpotifyPlaylistsService);
  });

  it('registra una sola sincronización de artistas que depende de management y nunca de la fachada', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyPlaylistsModule,
    ) as unknown[];
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      SpotifyPlaylistArtistSyncService,
    ) as unknown[];

    expect(
      providers.filter(
        (provider) => provider === SpotifyPlaylistArtistSyncService,
      ),
    ).toHaveLength(1);
    expect(dependencies.slice(3)).toEqual([
      SpotifyAccountApiService,
      SpotifyPlaylistAuthorizationService,
      FestivalSetlistService,
      SpotifyPlaylistManagementService,
    ]);
    expect(dependencies).not.toContain(SpotifyPlaylistsService);
  });

  it('registra una sola instancia de mantenimiento con dependencias unidireccionales', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyPlaylistsModule,
    ) as unknown[];
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      SpotifyPlaylistTrackMaintenanceService,
    ) as unknown[];

    expect(
      providers.filter(
        (provider) => provider === SpotifyPlaylistTrackMaintenanceService,
      ),
    ).toHaveLength(1);
    expect(dependencies.slice(2)).toEqual([
      SpotifyAccountApiService,
      SpotifyPlaylistAuthorizationService,
      SpotifyPlaylistManagementService,
    ]);
    expect(dependencies).not.toContain(SpotifyPlaylistsService);
    expect(dependencies).not.toContain(SpotifyPlaylistArtistSyncService);
  });

  it('keeps Spotify integration as a one-way dependency without duplicating API providers', () => {
    const editorialImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      SpotifyPlaylistsModule,
    ) as unknown[];
    const integrationImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      SpotifyIntegrationModule,
    ) as unknown[];
    const integrationProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyIntegrationModule,
    ) as unknown[];
    const editorialProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyPlaylistsModule,
    ) as unknown[];

    expect(editorialImports).toContain(SpotifyIntegrationModule);
    expect(integrationImports).not.toContain(SpotifyPlaylistsModule);
    expect(integrationProviders).toContain(SpotifyAccountApiService);
    expect(integrationProviders).toContain(SpotifyOAuthApiService);
    expect(editorialProviders).not.toContain(SpotifyAccountApiService);
    expect(editorialProviders).not.toContain(SpotifyOAuthApiService);
  });

  it('registers the setlist provider with only its configuration dependency', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SpotifyPlaylistsModule,
    ) as unknown[];
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      FestivalSetlistService,
    ) as unknown[];

    expect(
      providers.filter((provider) => provider === FestivalSetlistService),
    ).toHaveLength(1);
    expect(dependencies).toEqual([ConfigService]);
    expect(providers).not.toContain(SpotifyAccountApiService);
    expect(providers).not.toContain(SpotifyOAuthApiService);
  });
});
