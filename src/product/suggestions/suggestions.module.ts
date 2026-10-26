import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuggestionsService } from './suggestions.service';
import { SuggestionsController } from './suggestions.controller';
import { Suggestion } from './entities/suggestion.entity';
import { VersionItem } from '../versions/entities/version-item.entity';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Suggestion, VersionItem]),
    AuthorizationModule,
  ],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
