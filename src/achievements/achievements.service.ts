import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { AchievementCategory } from './entities/achievement-category.entity';
import { Genre } from '../genres/entities/genre.entity';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { UpdateAchievementDto } from './dto/update-achievement.dto';
import { AchievementMetricType } from './enums/achievement-metric-type.enum';
import { LevelSummary, resolveLevel } from './constants/level-thresholds';

interface CatalogFilters {
  categoryId?: string;
  categoryCode?: string;
}

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger('AchievementsService');

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(AchievementCategory)
    private readonly categoryRepository: Repository<AchievementCategory>,
    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
  ) {}

  async listCatalogForUser(userId: string, filters: CatalogFilters = {}) {
    const qb = this.achievementRepository
      .createQueryBuilder('achievement')
      .leftJoinAndSelect('achievement.genre', 'genre')
      .leftJoinAndSelect('achievement.category', 'category')
      .where('achievement.active = true')
      .orderBy('achievement.sortOrder', 'ASC')
      .addOrderBy('achievement.createdAt', 'ASC');

    // Filtros de catálogo (el front los usa para construir secciones por
    // categoría). Punto de extensión para futuros filtros/paginación.
    if (filters.categoryId) {
      qb.andWhere('category.id = :categoryId', {
        categoryId: filters.categoryId,
      });
    } else if (filters.categoryCode) {
      qb.andWhere('category.code = :categoryCode', {
        categoryCode: filters.categoryCode,
      });
    }

    const achievements = await qb.getMany();

    const userAchievements = await this.userAchievementRepository.find({
      where: { user: { id: userId } },
    });
    const progressByAchievementId = new Map(
      userAchievements.map((ua) => [ua.achievement.id, ua]),
    );

    return achievements.map((achievement) => {
      const progress = progressByAchievementId.get(achievement.id);
      const unlocked = !!progress?.unlockedAt;
      const category = this.toCategorySummary(achievement.category);

      if (achievement.secret && !unlocked) {
        return {
          id: achievement.id,
          secret: true,
          locked: true,
          unlocked: false,
          progressValue: 0,
          // La categoría se revela igualmente: es la que permite al front
          // ubicar el logro secreto en su sección aunque siga bloqueado.
          category,
        };
      }

      return {
        id: achievement.id,
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        metricType: achievement.metricType,
        criteria: achievement.criteria,
        genre: achievement.genre
          ? {
              id: achievement.genre.id,
              name: achievement.genre.name,
              color: achievement.genre.color,
            }
          : null,
        category,
        points: achievement.points,
        secret: achievement.secret,
        sortOrder: achievement.sortOrder,
        locked: false,
        unlocked,
        unlockedAt: progress?.unlockedAt ?? null,
        progressValue: progress?.progressValue ?? 0,
      };
    });
  }

  /** Catálogo de categorías activas, para que el front construya las secciones. */
  async listCategories(): Promise<AchievementCategory[]> {
    return this.categoryRepository.find({
      where: { active: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /** Logros desbloqueados de un usuario (propio o ajeno) — nunca expone progreso ni secretos sin desbloquear. */
  async listUnlockedForUser(userId: string) {
    const userAchievements = await this.userAchievementRepository.find({
      where: { user: { id: userId } },
      order: { unlockedAt: 'DESC' },
    });

    return userAchievements
      .filter((ua) => ua.unlockedAt)
      .map((ua) => ({
        id: ua.achievement.id,
        code: ua.achievement.code,
        name: ua.achievement.name,
        description: ua.achievement.description,
        icon: ua.achievement.icon,
        points: ua.achievement.points,
        genre: ua.achievement.genre
          ? { id: ua.achievement.genre.id, name: ua.achievement.genre.name }
          : null,
        category: this.toCategorySummary(ua.achievement.category),
        unlockedAt: ua.unlockedAt,
      }));
  }

  private toCategorySummary(category: AchievementCategory | null) {
    return category
      ? {
          id: category.id,
          code: category.code,
          name: category.name,
          icon: category.icon,
        }
      : null;
  }

  async getSummary(userId: string): Promise<LevelSummary> {
    const raw = await this.userAchievementRepository
      .createQueryBuilder('ua')
      .innerJoin('ua.achievement', 'achievement')
      .select('COALESCE(SUM(achievement.points), 0)', 'totalPoints')
      .where('ua.userId = :userId', { userId })
      .andWhere('ua.unlockedAt IS NOT NULL')
      .getRawOne<{ totalPoints: string }>();

    const totalPoints = parseInt(raw?.totalPoints ?? '0', 10);
    return resolveLevel(totalPoints);
  }

  async getLeaderboard(limit = 20) {
    const rows: { userId: string; username: string; totalPoints: string }[] =
      await this.userAchievementRepository.manager.query(
        `SELECT u.id as "userId", u.username, COALESCE(SUM(a.points), 0) as "totalPoints"
         FROM user_achievement ua
         JOIN "users" u ON u.id = ua."userId"
         JOIN achievement a ON a.id = ua."achievementId"
         WHERE ua."unlockedAt" IS NOT NULL
         GROUP BY u.id, u.username
         ORDER BY "totalPoints" DESC
         LIMIT $1`,
        [limit],
      );

    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      username: row.username,
      totalPoints: parseInt(row.totalPoints, 10),
    }));
  }

  async create(dto: CreateAchievementDto): Promise<Achievement> {
    const { genreId, categoryId, ...rest } = dto;
    const genre = await this.resolveGenre(dto.metricType, genreId);
    const category = await this.resolveCategory(categoryId, { required: true });

    const achievement = this.achievementRepository.create({
      ...rest,
      genre,
      category,
    });
    try {
      return await this.achievementRepository.save(achievement);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findOne(id: string): Promise<Achievement> {
    return this.findOneOrFail(id);
  }

  async update(id: string, dto: UpdateAchievementDto): Promise<Achievement> {
    const existing = await this.findOneOrFail(id);
    const { genreId, categoryId, ...rest } = dto;

    const metricType = rest.metricType ?? existing.metricType;
    const resolvedGenreId =
      genreId !== undefined ? genreId : existing.genre?.id;
    const genre = await this.resolveGenre(metricType, resolvedGenreId);

    const category =
      categoryId !== undefined
        ? await this.resolveCategory(categoryId, { required: true })
        : existing.category;

    const updated = await this.achievementRepository.preload({
      id,
      ...rest,
      genre,
      category,
    });
    if (!updated) {
      throw new NotFoundException(`Achievement with id ${id} not found`);
    }

    try {
      return await this.achievementRepository.save(updated);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  /** Soft-delete: un logro ya obtenido por algún usuario nunca se borra físicamente. */
  async softDelete(id: string): Promise<Achievement> {
    const achievement = await this.findOneOrFail(id);
    achievement.active = false;
    return this.achievementRepository.save(achievement);
  }

  private async resolveGenre(
    metricType: AchievementMetricType,
    genreId?: string,
  ): Promise<Genre | null> {
    const requiresGenre =
      metricType === AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE;

    if (requiresGenre) {
      if (!genreId) {
        throw new BadRequestException(
          `metricType ${metricType} requiere un genreId`,
        );
      }
      const genre = await this.genreRepository.findOneBy({ id: genreId });
      if (!genre) {
        throw new BadRequestException(`Genre with id ${genreId} not found`);
      }
      return genre;
    }

    if (genreId) {
      throw new BadRequestException(
        `metricType ${metricType} no admite genreId`,
      );
    }
    return null;
  }

  private async resolveCategory(
    categoryId: string | undefined,
    { required }: { required: boolean },
  ): Promise<AchievementCategory | null> {
    if (!categoryId) {
      if (required) {
        throw new BadRequestException('categoryId es obligatorio');
      }
      return null;
    }

    const category = await this.categoryRepository.findOneBy({
      id: categoryId,
    });
    if (!category) {
      throw new BadRequestException(
        `AchievementCategory with id ${categoryId} not found`,
      );
    }
    return category;
  }

  private async findOneOrFail(id: string): Promise<Achievement> {
    const achievement = await this.achievementRepository.findOneBy({ id });
    if (!achievement) {
      throw new NotFoundException(`Achievement with id ${id} not found`);
    }
    return achievement;
  }

  private handleDbExceptions(error: any): never {
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
