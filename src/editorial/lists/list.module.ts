import { Module } from '@nestjs/common';
import { ListsService } from './list.service';
import { ListsController } from './list.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { List } from './entities/list.entity';
import { AuthModule } from 'src/identity/auth/auth.module';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { WordpressIntegrationModule } from 'src/integrations/wordpress-integration/wordpress-integration.module';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';
import { ListCalendarService } from './application/list-calendar.service';
import { ListCrudService } from './application/list-crud.service';
import { ListContentCoordinator } from './application/list-content-coordinator.service';
import { ListWordPressReconciliationService } from './wordpress/list-wordpress-reconciliation.service';
import { WeeklyListPublisherService } from './wordpress/weekly-list-publisher.service';
import { MonthlyListPublisherService } from './wordpress/monthly-list-publisher.service';

@Module({
  controllers: [ListsController],
  providers: [
    ListsService,
    ListCalendarService,
    ListCrudService,
    ListContentCoordinator,
    ListWordPressReconciliationService,
    WeeklyListPublisherService,
    MonthlyListPublisherService,
  ],
  imports: [
    TypeOrmModule.forFeature([List, Content]),
    AuthModule,
    WordpressIntegrationModule,
    SpotifyIntegrationModule,
  ],
  exports: [ListsService],
})
export class ListsModule {}
