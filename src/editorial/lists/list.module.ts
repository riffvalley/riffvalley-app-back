import { Module } from '@nestjs/common';
import { ListsService } from './list.service';
import { ListsController } from './list.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { List } from './entities/list.entity';
import { AuthModule } from 'src/identity/auth/auth.module';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { WordpressIntegrationModule } from 'src/integrations/wordpress-integration/wordpress-integration.module';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';

@Module({
  controllers: [ListsController],
  providers: [ListsService],
  imports: [
    TypeOrmModule.forFeature([List, Content]),
    AuthModule,
    WordpressIntegrationModule,
    SpotifyIntegrationModule,
  ],
  exports: [ListsService],
})
export class ListsModule {}
