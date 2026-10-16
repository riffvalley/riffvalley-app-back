import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './catalog/overview/common.module';
import { I18nConfigModule } from './platform/i18n/i18n.module';

//MODULES
import { ArtistsModule } from './catalog/artists/artists.module';
import { CountriesModule } from './catalog/countries/countries.module';
import { DiscModule } from './catalog/discs/discs.module';
import { GenresModule } from './catalog/genres/genres.module';
import { CatalogImportModule } from './catalog/import/catalog-import.module';
import { AuthModule } from './identity/auth/auth.module';
import { RatesModule } from './community/rates/rates.module';
import { AsignationsModule } from './editorial/lists/asignations/asignations.module';
import { ListsModule } from './editorial/lists/list.module';
import { ReunionsModule } from './editorial/reunions/reunions.module';
import { PointsModule } from './editorial/reunions/points/points.module';
import { LinksModule } from './editorial/links/links.module';
import { SeedModule } from './platform/seeds/seed.module';
import { FavoritesModule } from './community/favorites/favorites.module';
import { PendingsModule } from './community/pendings/pendings.module';
import { CommentsModule } from './community/comments/comments.module';
import { VersionsModule } from './product/versions/versions.module';
import { SpotifyIntegrationModule } from './integrations/spotify-integration/spotify-integration.module';
import { RiffValleyPlaylistModule } from './editorial/playlists/riff-valley-playlists/riff-valley-playlist.module';
import { ContentsModule } from './editorial/contents/contents.module';
import { ArticlesModule } from './editorial/articles/articles.module';
import { VideosModule } from './editorial/videos/videos.module';
import { TelegramIntegrationModule } from './integrations/telegram-integration/telegram-integration.module';
import { NewsModule } from './product/news/news.module';
import { UploadsModule } from './platform/uploads/uploads.module';
import { RequestsModule } from './community/requests/requests.module';
import { NationalReleasesModule } from './editorial/national-releases/national-releases.module';
import { LastfmModule } from './catalog/lastfm/lastfm.module';
import { SuggestionsModule } from './product/suggestions/suggestions.module';
import { AccessRequestsModule } from './identity/access-requests/access-requests.module';
import { InstagramIntegrationModule } from './integrations/instagram-integration/instagram-integration.module';
import { FestivalPlaylistsModule } from './editorial/playlists/festival-playlists/festival-playlists.module';
import { TiktokIntegrationModule } from './integrations/tiktok-integration/tiktok-integration.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      ssl: process.env.STAGE === 'prod',
      extra: {
        ssl:
          process.env.STAGE === 'prod' ? { rejectUnauthorized: false } : null,
      },
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    I18nConfigModule,
    CommonModule,

    //MODULES
    ArtistsModule,
    CountriesModule,
    DiscModule,
    GenresModule,
    CatalogImportModule,
    AuthModule,
    RatesModule,
    AsignationsModule,
    ListsModule,
    ReunionsModule,
    PointsModule,
    LinksModule,
    SeedModule,
    FavoritesModule,
    PendingsModule,
    CommentsModule,
    VersionsModule,
    SpotifyIntegrationModule,
    RiffValleyPlaylistModule,
    ContentsModule,
    ArticlesModule,
    VideosModule,
    TelegramIntegrationModule,
    NewsModule,
    UploadsModule,
    RequestsModule,
    NationalReleasesModule,
    LastfmModule,
    SuggestionsModule,
    AccessRequestsModule,
    InstagramIntegrationModule,
    FestivalPlaylistsModule,
    TiktokIntegrationModule,
  ],
})
export class AppModule {}
