import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AchievementsService } from './achievements.service';
import { AchievementsEvaluatorService } from './achievements-evaluator.service';
import { AchievementsController } from './achievements.controller';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { Rate } from 'src/rates/entities/rate.entity';
import { Comment } from 'src/comments/entities/comment.entity';
import { Favorite } from 'src/favorites/entities/favorite.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [AchievementsController],
  providers: [AchievementsService, AchievementsEvaluatorService],
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      UserAchievement,
      Genre,
      Rate,
      Comment,
      Favorite,
    ]),
    AuthModule,
  ],
  // Exportado para que RatesModule/FavoritesModule/CommentsModule puedan
  // invocar evaluate() tras crear un rate/favorite/comment.
  exports: [AchievementsEvaluatorService],
})
export class AchievementsModule {}
