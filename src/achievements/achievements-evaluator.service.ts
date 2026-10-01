import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { Rate } from '../rates/entities/rate.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Favorite } from '../favorites/entities/favorite.entity';
import { AchievementMetricType } from './enums/achievement-metric-type.enum';
import { AchievementTrigger } from './enums/achievement-trigger.enum';
import { EvaluationContext } from './interfaces/evaluation-context.interface';
import { ACHIEVEMENT_STREAK_TIMEZONE } from './constants/timezone';

// Qué metricTypes son relevantes para cada trigger, para no recomputar todo
// el catálogo cada vez que alguien vota/comenta/marca favorito.
const TRIGGER_METRIC_MAP: Record<AchievementTrigger, AchievementMetricType[]> =
  {
    [AchievementTrigger.RATE_CREATED_OR_UPDATED]: [
      AchievementMetricType.VOTE_STREAK,
      AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
      AchievementMetricType.DISTINCT_GENRES,
      AchievementMetricType.DISTINCT_COUNTRIES,
      AchievementMetricType.TOTAL_VOTES,
      AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
    ],
    [AchievementTrigger.FAVORITE_CREATED]: [
      AchievementMetricType.TOTAL_FAVORITES,
    ],
    [AchievementTrigger.COMMENT_CREATED]: [
      AchievementMetricType.TOTAL_COMMENTS,
    ],
  };

interface VoteStreakCriteria {
  minDays: number;
  mode: 'current' | 'ever';
}

interface MinCountCriteria {
  minCount: number;
}

interface ControversialCriteria {
  minAbsDeviation: number;
  minCommunityVotes: number;
}

interface AchievementGroup {
  metricType: AchievementMetricType;
  genreId?: string;
  achievements: Achievement[];
}

interface UpsertRow {
  userId: string;
  achievementId: string;
  progressValue: number;
  progressMeta: Record<string, unknown> | null;
  unlockedAt: Date | null;
}

interface ControversialResult {
  discId: string;
  deviation: number;
  communityVotes: number;
}

@Injectable()
export class AchievementsEvaluatorService {
  private readonly logger = new Logger('AchievementsEvaluatorService');

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
  ) {}

  /**
   * Evalúa solo los metricTypes relevantes para el trigger, agrupando por
   * (metricType, genreId) para no repetir queries por logro. Nunca lanza:
   * los llamadores (RatesService, FavoritesService, CommentsService) deben
   * envolver la llamada en try/catch para que un fallo aquí no rompa el
   * flujo principal de votar/comentar/marcar favorito.
   */
  async evaluate(
    userId: string,
    trigger: AchievementTrigger,
    context: EvaluationContext = {},
  ): Promise<Achievement[]> {
    const metricTypes = TRIGGER_METRIC_MAP[trigger];
    if (!metricTypes?.length) return [];

    const candidates = await this.fetchCandidates(
      userId,
      metricTypes,
      context.genreId,
    );
    return this.evaluateCandidates(userId, candidates, context);
  }

  /** Recalcula TODOS los metricTypes para un usuario (backfill tras crear un logro nuevo). */
  async recalculateForUser(userId: string): Promise<Achievement[]> {
    const allMetricTypes = Object.values(AchievementMetricType);
    const candidates = await this.fetchCandidates(userId, allMetricTypes);
    return this.evaluateCandidates(userId, candidates, {});
  }

  /** Recalcula un logro concreto contra todos los usuarios con actividad relevante. */
  async recalculateForAchievement(
    achievementId: string,
  ): Promise<{ evaluatedUsers: number; newlyUnlockedUsers: number }> {
    const achievement = await this.achievementRepository.findOne({
      where: { id: achievementId },
    });
    if (!achievement) {
      throw new NotFoundException(
        `Achievement with id ${achievementId} not found`,
      );
    }

    const userIds = await this.findRelevantUserIds(achievement);
    if (!userIds.length) return { evaluatedUsers: 0, newlyUnlockedUsers: 0 };

    const alreadyUnlockedRows = await this.userAchievementRepository
      .createQueryBuilder('ua')
      .select('ua.userId', 'userId')
      .where('ua.achievementId = :achievementId', { achievementId })
      .andWhere('ua.unlockedAt IS NOT NULL')
      .getRawMany<{ userId: string }>();
    const alreadyUnlocked = new Set(
      alreadyUnlockedRows.map((row) => row.userId),
    );

    const pendingUserIds = userIds.filter((id) => !alreadyUnlocked.has(id));
    let newlyUnlockedUsers = 0;

    for (const userId of pendingUserIds) {
      const unlocked = await this.evaluateCandidates(userId, [achievement], {});
      if (unlocked.length) newlyUnlockedUsers += 1;
    }

    return { evaluatedUsers: userIds.length, newlyUnlockedUsers };
  }

  private async evaluateCandidates(
    userId: string,
    candidates: Achievement[],
    context: EvaluationContext,
  ): Promise<Achievement[]> {
    if (!candidates.length) return [];

    const groups = this.groupByMetricAndGenre(candidates);
    const rows: UpsertRow[] = [];

    for (const group of groups.values()) {
      rows.push(...(await this.computeRowsForGroup(userId, group, context)));
    }

    if (!rows.length) return [];
    return this.upsertAndReturnNewlyUnlocked(rows);
  }

  private async fetchCandidates(
    userId: string,
    metricTypes: AchievementMetricType[],
    genreId?: string,
  ): Promise<Achievement[]> {
    const qb = this.achievementRepository
      .createQueryBuilder('achievement')
      .leftJoinAndSelect('achievement.genre', 'genre')
      .where('achievement.active = true')
      .andWhere('achievement.metricType IN (:...metricTypes)', { metricTypes });

    // Si se pasa un género concreto (trigger de voto), solo trae logros de ese
    // género o sin género; si no se pasa (recálculo completo), trae todos.
    if (genreId) {
      qb.andWhere(
        new Brackets((qb2) => {
          qb2
            .where('achievement.genreId IS NULL')
            .orWhere('achievement.genreId = :genreId', {
              genreId,
            });
        }),
      );
    }

    qb.andWhere(
      `NOT EXISTS (
        SELECT 1 FROM user_achievement ua
        WHERE ua."achievementId" = achievement.id
          AND ua."userId" = :userId
          AND ua."unlockedAt" IS NOT NULL
      )`,
      { userId },
    );

    return qb.getMany();
  }

  private groupByMetricAndGenre(
    achievements: Achievement[],
  ): Map<string, AchievementGroup> {
    const groups = new Map<string, AchievementGroup>();

    for (const achievement of achievements) {
      const genreId = achievement.genre?.id;
      const key = `${achievement.metricType}:${genreId ?? 'null'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          metricType: achievement.metricType,
          genreId,
          achievements: [],
        });
      }
      groups.get(key).achievements.push(achievement);
    }

    return groups;
  }

  private async computeRowsForGroup(
    userId: string,
    group: AchievementGroup,
    context: EvaluationContext,
  ): Promise<UpsertRow[]> {
    const { metricType, genreId, achievements } = group;

    if (metricType === AchievementMetricType.VOTE_STREAK) {
      const { current, ever } = await this.computeVoteStreak(userId);
      return achievements.map((achievement) => {
        const criteria = achievement.criteria as unknown as VoteStreakCriteria;
        const value = criteria.mode === 'ever' ? ever : current;
        return this.buildRow(userId, achievement, value, criteria.minDays, {
          current,
          ever,
        });
      });
    }

    if (metricType === AchievementMetricType.CONTROVERSIAL_DISC_VOTE) {
      const result = context.discId
        ? await this.computeControversialForDisc(userId, context.discId)
        : await this.computeMaxControversial(userId);
      if (!result) return [];

      return achievements.map((achievement) => {
        const criteria =
          achievement.criteria as unknown as ControversialCriteria;
        const progressValue = Math.round(result.deviation * 100); // basis points (1.75 -> 175)
        const threshold = Math.round(criteria.minAbsDeviation * 100);
        const unlocked =
          result.communityVotes >= criteria.minCommunityVotes &&
          progressValue >= threshold;
        return this.buildRow(
          userId,
          achievement,
          progressValue,
          threshold,
          {
            deviation: result.deviation,
            communityVotes: result.communityVotes,
            discId: result.discId,
          },
          unlocked,
        );
      });
    }

    // Tipos "conteo": DISTINCT_ARTISTS_IN_GENRE, DISTINCT_GENRES, DISTINCT_COUNTRIES,
    // TOTAL_VOTES, TOTAL_COMMENTS, TOTAL_FAVORITES. Un único valor para todo el grupo.
    const value = await this.computeCountMetric(userId, metricType, genreId);
    return achievements.map((achievement) => {
      const criteria = achievement.criteria as unknown as MinCountCriteria;
      return this.buildRow(userId, achievement, value, criteria.minCount);
    });
  }

  private buildRow(
    userId: string,
    achievement: Achievement,
    progressValue: number,
    threshold: number,
    meta: Record<string, unknown> | null = null,
    forceUnlocked?: boolean,
  ): UpsertRow {
    const unlocked = forceUnlocked ?? progressValue >= threshold;
    return {
      userId,
      achievementId: achievement.id,
      progressValue,
      progressMeta: meta,
      unlockedAt: unlocked ? new Date() : null,
    };
  }

  private async computeCountMetric(
    userId: string,
    metricType: AchievementMetricType,
    genreId?: string,
  ): Promise<number> {
    switch (metricType) {
      case AchievementMetricType.TOTAL_VOTES:
        return this.rateRepository
          .createQueryBuilder('rate')
          .where('rate.userId = :userId', { userId })
          .andWhere('rate.rate IS NOT NULL')
          .getCount();

      case AchievementMetricType.TOTAL_COMMENTS:
        return this.commentRepository
          .createQueryBuilder('comment')
          .where('comment.userId = :userId', { userId })
          .getCount();

      case AchievementMetricType.TOTAL_FAVORITES:
        return this.favoriteRepository
          .createQueryBuilder('favorite')
          .where('favorite.userId = :userId', { userId })
          .getCount();

      case AchievementMetricType.DISTINCT_GENRES: {
        const raw = await this.rateRepository
          .createQueryBuilder('rate')
          .innerJoin('rate.disc', 'disc')
          .select('COUNT(DISTINCT disc.genreId)', 'count')
          .where('rate.userId = :userId', { userId })
          .andWhere('rate.rate IS NOT NULL')
          .getRawOne<{ count: string }>();
        return parseInt(raw?.count ?? '0', 10);
      }

      case AchievementMetricType.DISTINCT_COUNTRIES: {
        const raw = await this.rateRepository
          .createQueryBuilder('rate')
          .innerJoin('rate.disc', 'disc')
          .innerJoin('disc.artist', 'artist')
          .select('COUNT(DISTINCT artist.countryId)', 'count')
          .where('rate.userId = :userId', { userId })
          .andWhere('rate.rate IS NOT NULL')
          .andWhere('artist.countryId IS NOT NULL')
          .getRawOne<{ count: string }>();
        return parseInt(raw?.count ?? '0', 10);
      }

      case AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE: {
        if (!genreId) return 0;
        const raw = await this.rateRepository
          .createQueryBuilder('rate')
          .innerJoin('rate.disc', 'disc')
          .select('COUNT(DISTINCT disc.artistId)', 'count')
          .where('rate.userId = :userId', { userId })
          .andWhere('rate.rate IS NOT NULL')
          .andWhere('disc.genreId = :genreId', { genreId })
          .getRawOne<{ count: string }>();
        return parseInt(raw?.count ?? '0', 10);
      }

      default:
        return 0;
    }
  }

  /**
   * Racha basada SOLO en rate.createdAt (nunca editedAt): editar un voto
   * existente no debe mantener viva la racha sin haber votado algo nuevo
   * ese día. Los "días" se calculan en ACHIEVEMENT_STREAK_TIMEZONE, no en el
   * timezone implícito del servidor.
   *
   * NOTA: `rate.createdAt` es un `timestamp` de Postgres. Verificar contra
   * el timezone de sesión de la conexión real si esta lógica da resultados
   * inesperados cerca de medianoche.
   */
  private async computeVoteStreak(
    userId: string,
  ): Promise<{ current: number; ever: number }> {
    const rows: { day: string }[] = await this.rateRepository.manager.query(
      `SELECT DISTINCT TO_CHAR(rate."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $2, 'YYYY-MM-DD') AS day
       FROM rate
       WHERE rate."userId" = $1
       ORDER BY day DESC`,
      [userId, ACHIEVEMENT_STREAK_TIMEZONE],
    );

    if (!rows.length) return { current: 0, ever: 0 };

    const dayNumbers = rows.map((row) => this.dayStringToNumber(row.day));

    let ever = 1;
    let run = 1;
    for (let i = 1; i < dayNumbers.length; i++) {
      run = dayNumbers[i - 1] - dayNumbers[i] === 1 ? run + 1 : 1;
      ever = Math.max(ever, run);
    }

    const todayNum = this.dayStringToNumber(this.todayInStreakTimezone());
    let current = 0;
    if (dayNumbers[0] === todayNum || dayNumbers[0] === todayNum - 1) {
      current = 1;
      for (let i = 1; i < dayNumbers.length; i++) {
        if (dayNumbers[i - 1] - dayNumbers[i] === 1) {
          current += 1;
        } else {
          break;
        }
      }
    }

    return { current, ever };
  }

  private dayStringToNumber(day: string): number {
    return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  }

  private todayInStreakTimezone(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: ACHIEVEMENT_STREAK_TIMEZONE,
    }).format(new Date());
  }

  /** Media comunitaria SIEMPRE excluye el voto propio del usuario que dispara la evaluación. */
  private async computeControversialForDisc(
    userId: string,
    discId: string,
  ): Promise<ControversialResult | null> {
    const own = await this.rateRepository.findOne({
      where: { user: { id: userId }, disc: { id: discId } },
    });
    if (!own || own.rate === null || own.rate === undefined) return null;

    const raw = await this.rateRepository
      .createQueryBuilder('rate')
      .select('AVG(rate.rate)', 'avg')
      .addSelect('COUNT(rate.id)', 'count')
      .where('rate.discId = :discId', { discId })
      .andWhere('rate.userId != :userId', { userId })
      .andWhere('rate.rate IS NOT NULL')
      .getRawOne<{ avg: string | null; count: string }>();

    const communityVotes = parseInt(raw?.count ?? '0', 10);
    if (!communityVotes) return { discId, deviation: 0, communityVotes: 0 };

    const communityAverage = parseFloat(raw.avg);
    const deviation = Math.abs(Number(own.rate) - communityAverage);

    return { discId, deviation, communityVotes };
  }

  /** Usado en recálculo masivo (sin disco concreto de contexto): toma la mayor desviación entre todos los discos votados por el usuario. */
  private async computeMaxControversial(
    userId: string,
  ): Promise<ControversialResult | null> {
    const raw: {
      discId: string;
      userRate: string;
      communityAverage: string | null;
      communityVotes: string;
    }[] = await this.rateRepository.manager.query(
      `SELECT r."discId" as "discId", r.rate as "userRate",
              (SELECT AVG(r2.rate) FROM rate r2 WHERE r2."discId" = r."discId" AND r2."userId" != r."userId" AND r2.rate IS NOT NULL) as "communityAverage",
              (SELECT COUNT(*) FROM rate r2 WHERE r2."discId" = r."discId" AND r2."userId" != r."userId" AND r2.rate IS NOT NULL) as "communityVotes"
       FROM rate r
       WHERE r."userId" = $1 AND r.rate IS NOT NULL`,
      [userId],
    );

    let best: ControversialResult | null = null;
    for (const row of raw) {
      if (row.communityAverage === null) continue;
      const deviation = Math.abs(
        parseFloat(row.userRate) - parseFloat(row.communityAverage),
      );
      const communityVotes = parseInt(row.communityVotes, 10);
      if (!best || deviation > best.deviation) {
        best = { discId: row.discId, deviation, communityVotes };
      }
    }
    return best;
  }

  private async findRelevantUserIds(
    achievement: Achievement,
  ): Promise<string[]> {
    switch (achievement.metricType) {
      case AchievementMetricType.TOTAL_VOTES:
      case AchievementMetricType.DISTINCT_GENRES:
      case AchievementMetricType.DISTINCT_COUNTRIES:
      case AchievementMetricType.CONTROVERSIAL_DISC_VOTE:
      case AchievementMetricType.VOTE_STREAK: {
        const rows = await this.rateRepository
          .createQueryBuilder('rate')
          .select('DISTINCT rate.userId', 'userId')
          .where('rate.rate IS NOT NULL')
          .getRawMany<{ userId: string }>();
        return rows.map((row) => row.userId);
      }

      case AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE: {
        if (!achievement.genre) return [];
        const rows = await this.rateRepository
          .createQueryBuilder('rate')
          .innerJoin('rate.disc', 'disc')
          .select('DISTINCT rate.userId', 'userId')
          .where('rate.rate IS NOT NULL')
          .andWhere('disc.genreId = :genreId', {
            genreId: achievement.genre.id,
          })
          .getRawMany<{ userId: string }>();
        return rows.map((row) => row.userId);
      }

      case AchievementMetricType.TOTAL_COMMENTS: {
        const rows = await this.commentRepository
          .createQueryBuilder('comment')
          .select('DISTINCT comment.userId', 'userId')
          .getRawMany<{ userId: string }>();
        return rows.map((row) => row.userId);
      }

      case AchievementMetricType.TOTAL_FAVORITES: {
        const rows = await this.favoriteRepository
          .createQueryBuilder('favorite')
          .select('DISTINCT favorite.userId', 'userId')
          .getRawMany<{ userId: string }>();
        return rows.map((row) => row.userId);
      }

      default:
        return [];
    }
  }

  /**
   * Upsert atómico: INSERT ... ON CONFLICT DO UPDATE en una sola sentencia
   * multi-fila, para que dos evaluaciones concurrentes del mismo usuario no
   * pisen ni pierdan un desbloqueo. `progressValue` se sobrescribe siempre
   * con el valor recién calculado (una racha puede bajar); `unlockedAt` usa
   * COALESCE para que un logro ya desbloqueado nunca se revierta.
   */
  private async upsertAndReturnNewlyUnlocked(
    rows: UpsertRow[],
  ): Promise<Achievement[]> {
    const values: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    for (const row of rows) {
      values.push(
        `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, now(), now())`,
      );
      params.push(
        row.userId,
        row.achievementId,
        row.progressValue,
        row.progressMeta ? JSON.stringify(row.progressMeta) : null,
        row.unlockedAt,
      );
    }

    const sql = `
      INSERT INTO user_achievement ("userId","achievementId","progressValue","progressMeta","unlockedAt","createdAt","updatedAt")
      VALUES ${values.join(', ')}
      ON CONFLICT ("userId","achievementId") DO UPDATE SET
        "progressValue" = EXCLUDED."progressValue",
        "progressMeta" = EXCLUDED."progressMeta",
        "unlockedAt" = COALESCE(user_achievement."unlockedAt", EXCLUDED."unlockedAt"),
        "updatedAt" = now()
      RETURNING "achievementId", "unlockedAt";
    `;

    let result: { achievementId: string; unlockedAt: Date | null }[] = [];
    try {
      result = await this.userAchievementRepository.manager.query(sql, params);
    } catch (error) {
      this.logger.error('Error en upsert de user_achievement', error);
      return [];
    }

    const newlyUnlockedIds = rows
      .filter((row) => row.unlockedAt)
      .filter((row) => {
        const returned = result.find(
          (r) => r.achievementId === row.achievementId,
        );
        if (!returned?.unlockedAt) return false;
        // "recién desbloqueado en esta llamada" si el timestamp coincide con el
        // que mandamos como candidato; si ya estaba desbloqueado antes, COALESCE
        // conserva el valor viejo y no coincide.
        return (
          Math.abs(
            new Date(returned.unlockedAt).getTime() - row.unlockedAt.getTime(),
          ) < 1000
        );
      })
      .map((row) => row.achievementId);

    if (!newlyUnlockedIds.length) return [];

    // Estos son los Achievement completos que se devuelven al caller (ej.
    // unlockedAchievements en POST /rates), así que sí necesitan category
    // cargada — a diferencia de fetchCandidates, category es puro dato de
    // presentación aquí, no interviene en ningún cálculo.
    return this.achievementRepository
      .createQueryBuilder('achievement')
      .leftJoinAndSelect('achievement.genre', 'genre')
      .leftJoinAndSelect('achievement.category', 'category')
      .where('achievement.id IN (:...ids)', { ids: newlyUnlockedIds })
      .getMany();
  }
}
