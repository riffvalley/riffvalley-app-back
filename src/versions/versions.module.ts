// versions/versions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VersionsService } from './versions.service';
import { VersionsController } from './versions.controller';
import { Version } from './entities/version.entity';
import { VersionItem } from './entities/version-item.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Version, VersionItem]), AuthModule],
  controllers: [VersionsController],
  providers: [VersionsService],
})
export class VersionsModule {}
