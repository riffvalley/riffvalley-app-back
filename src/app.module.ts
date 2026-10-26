import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmOptions } from './config/typeorm-options';
import { CrossDomainModule } from './app/cross-domain/cross-domain.module';

// Catalog
import { ArtistsModule } from './catalog/artists/artists.module';
import { CountriesModule } from './catalog/countries/countries.module';
import { DiscModule } from './catalog/discs/discs.module';
import { GenresModule } from './catalog/genres/genres.module';
import { CatalogImportModule } from './catalog/import/catalog-import.module';
import { LastfmModule } from './catalog/lastfm/lastfm.module';
import { CommonModule } from './catalog/overview/common.module';

// Community
import { FavoritesModule } from './community/favorites/favorites.module';
import { CommentsModule } from './community/comments/comments.module';
import { PendingsModule } from './community/pendings/pendings.module';
import { RatesModule } from './community/rates/rates.module';
import { RequestsModule } from './community/requests/requests.module';

// Editorial
import { AsignationsModule } from './editorial/lists/asignations/asignations.module';
import { ListsModule } from './editorial/lists/list.module';
import { ReunionsModule } from './editorial/reunions/reunions.module';
import { PointsModule } from './editorial/reunions/points/points.module';
import { RiffValleyPlaylistModule } from './editorial/playlists/riff-valley-playlists/riff-valley-playlist.module';
import { ContentsModule } from './editorial/contents/contents.module';
import { ArticlesModule } from './editorial/articles/articles.module';
import { VideosModule } from './editorial/videos/videos.module';
import { NationalReleasesModule } from './editorial/national-releases/national-releases.module';
import { SpotifyPlaylistsModule } from './editorial/playlists/spotify-playlists/spotify-playlists.module';

// Identity
import { AuthModule } from './identity/auth/auth.module';
import { AccessRequestsModule } from './identity/access-requests/access-requests.module';

// Integrations
import { SpotifyIntegrationModule } from './integrations/spotify-integration/spotify-integration.module';
import { TelegramIntegrationModule } from './integrations/telegram-integration/telegram-integration.module';
import { InstagramIntegrationModule } from './integrations/instagram-integration/instagram-integration.module';
import { TiktokIntegrationModule } from './integrations/tiktok-integration/tiktok-integration.module';

// Product
import { NewsModule } from './product/news/news.module';
import { SuggestionsModule } from './product/suggestions/suggestions.module';
import { VersionsModule } from './product/versions/versions.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot({
      cronJobs: !(
        process.env.STAGE === 'dev' &&
        process.env.DISABLE_SCHEDULED_TASKS === 'true'
      ),
    }),
    TypeOrmModule.forRoot(typeOrmOptions()),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),

    // Catalog
    ArtistsModule,
    CountriesModule,
    DiscModule,
    GenresModule,
    CatalogImportModule,
    LastfmModule,
    CommonModule,

    // Community
    CommentsModule,
    FavoritesModule,
    PendingsModule,
    RatesModule,
    RequestsModule,

    // Editorial
    AsignationsModule,
    ListsModule,
    ReunionsModule,
    PointsModule,
    RiffValleyPlaylistModule,
    ContentsModule,
    ArticlesModule,
    VideosModule,
    NationalReleasesModule,
    SpotifyPlaylistsModule,

    // Identity
    AuthModule,
    AccessRequestsModule,

    // Integrations
    SpotifyIntegrationModule,
    TelegramIntegrationModule,
    InstagramIntegrationModule,
    TiktokIntegrationModule,

    // Product
    NewsModule,
    SuggestionsModule,
    VersionsModule,

    // Application composition
    CrossDomainModule,
  ],
})
export class AppModule {}
