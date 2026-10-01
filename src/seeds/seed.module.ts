import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { User } from 'src/auth/entities/user.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { Country } from 'src/countries/entities/country.entity';
import { Achievement } from 'src/achievements/entities/achievement.entity';
import { AchievementCategory } from 'src/achievements/entities/achievement-category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Genre,
      Country,
      Achievement,
      AchievementCategory,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
