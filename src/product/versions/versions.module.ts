// versions/versions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VersionsService } from './versions.service';
import { VersionsController } from './versions.controller';
import { Version } from './entities/version.entity';
import { VersionItem } from './entities/version-item.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Version, VersionItem]),
    AuthorizationModule,
  ],
  controllers: [VersionsController],
  providers: [VersionsService],
})
export class VersionsModule {}
