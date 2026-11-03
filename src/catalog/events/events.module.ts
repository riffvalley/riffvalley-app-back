import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from '../artists/entities/artist.entity';
import { VenuesModule } from '../venues/venues.module';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { CatalogImportModule } from '../import/catalog-import.module';
import { ImportRowReceiptsModule } from '../import/receipts/import-row-receipts.module';
import { EventArtist } from './entities/event-artist.entity';
import { Event } from './entities/event.entity';
import { Tour } from '../tours/entities/tour.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsImportBatchService } from './import-batch/events-import-batch.service';
import { ImportEventLineupService } from './import-lineup/import-event-lineup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventArtist, Artist, Tour]),
    VenuesModule,
    AuthorizationModule,
    CatalogImportModule,
    ImportRowReceiptsModule,
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsImportBatchService,
    ImportEventLineupService,
  ],
})
export class EventsModule {}
