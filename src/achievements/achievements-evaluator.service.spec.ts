import { NotFoundException } from '@nestjs/common';
import { AchievementsEvaluatorService } from './achievements-evaluator.service';
import { AchievementMetricType } from './enums/achievement-metric-type.enum';
import { AchievementTrigger } from './enums/achievement-trigger.enum';
import { Achievement } from './entities/achievement.entity';

// QueryBuilder "chainable" genérico: todos los métodos de encadenado
// devuelven el propio mock, y los terminales (getMany/getCount/...) se
// configuran por test según lo que la consulta real necesite responder.
function mockQueryBuilder(
  terminals: {
    getMany?: unknown;
    getCount?: number;
    getRawOne?: unknown;
    getRawMany?: unknown[];
  } = {},
) {
  const qb: any = {};
  const chainMethods = [
    'leftJoinAndSelect',
    'leftJoin',
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'addOrderBy',
    'take',
    'skip',
    'limit',
  ];
  for (const method of chainMethods) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(terminals.getMany ?? []);
  qb.getCount = jest.fn().mockResolvedValue(terminals.getCount ?? 0);
  qb.getRawOne = jest.fn().mockResolvedValue(terminals.getRawOne ?? null);
  qb.getRawMany = jest.fn().mockResolvedValue(terminals.getRawMany ?? []);
  qb.getOne = jest.fn().mockResolvedValue(null);
  return qb;
}

function makeAchievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'ach-1',
    code: 'TEST',
    name: 'Test',
    description: null,
    icon: null,
    metricType: AchievementMetricType.TOTAL_VOTES,
    criteria: { minCount: 5 },
    genre: null,
    category: null,
    points: 10,
    secret: false,
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    userAchievements: [],
    ...overrides,
  } as Achievement;
}

// Emula `RETURNING` de Postgres: por defecto, refleja exactamente lo que se
// intentó insertar (como si no existiera fila previa). Para simular una fila
// YA desbloqueada antes (y así probar que el COALESCE no la revierte), un
// test puede sobreescribir el resultado de una fila concreta.
function makeUpsertEcho(overrides: Record<string, Date | null> = {}) {
  return jest.fn(async (_sql: string, params: unknown[]) => {
    const rows: { achievementId: string; unlockedAt: Date | null }[] = [];
    for (let i = 0; i < params.length; i += 5) {
      const achievementId = params[i + 1] as string;
      const candidateUnlockedAt = params[i + 4] as Date | null;
      const unlockedAt = Object.prototype.hasOwnProperty.call(
        overrides,
        achievementId,
      )
        ? overrides[achievementId]
        : candidateUnlockedAt;
      rows.push({ achievementId, unlockedAt });
    }
    return rows;
  });
}

describe('AchievementsEvaluatorService', () => {
  let service: AchievementsEvaluatorService;
  let achievementRepository: any;
  let userAchievementRepository: any;
  let rateRepository: any;
  let commentRepository: any;
  let favoriteRepository: any;

  beforeEach(() => {
    achievementRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    userAchievementRepository = {
      manager: { query: jest.fn() },
      createQueryBuilder: jest.fn(),
    };
    rateRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      manager: { query: jest.fn() },
    };
    commentRepository = { createQueryBuilder: jest.fn() };
    favoriteRepository = { createQueryBuilder: jest.fn() };

    service = new AchievementsEvaluatorService(
      achievementRepository,
      userAchievementRepository,
      rateRepository,
      commentRepository,
      favoriteRepository,
    );
  });

  describe('evaluate()', () => {
    it('no hace nada si el trigger no tiene metricTypes asociados (defensivo)', async () => {
      const result = await service.evaluate('user-1', 'UNKNOWN_TRIGGER' as any);
      expect(result).toEqual([]);
      expect(achievementRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('no consulta nada más si no hay logros candidatos', async () => {
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getMany: [] }),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
      );

      expect(result).toEqual([]);
      expect(rateRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('desbloquea TOTAL_VOTES cuando se alcanza el umbral y lo devuelve como recién desbloqueado', async () => {
      const achievement = makeAchievement({
        id: 'ach-total-votes',
        code: 'TOTAL_VOTES_5',
        metricType: AchievementMetricType.TOTAL_VOTES,
        criteria: { minCount: 5 },
      });
      achievementRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] })) // fetchCandidates
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] })); // select final de desbloqueados
      rateRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getCount: 5 }),
      );
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
        {
          discId: 'disc-1',
        },
      );

      expect(result).toEqual([achievement]);
      const [, params] = userAchievementRepository.manager.query.mock.calls[0];
      expect(params).toEqual([
        'user-1',
        'ach-total-votes',
        5,
        null,
        expect.any(Date),
      ]);
    });

    it('no marca como desbloqueado un logro por debajo del umbral, pero guarda el progreso', async () => {
      const achievement = makeAchievement({
        id: 'ach-total-votes',
        metricType: AchievementMetricType.TOTAL_VOTES,
        criteria: { minCount: 100 },
      });
      achievementRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder({ getMany: [achievement] }),
      );
      rateRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getCount: 3 }),
      );
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
      );

      expect(result).toEqual([]);
      const [, params] = userAchievementRepository.manager.query.mock.calls[0];
      expect(params).toEqual(['user-1', 'ach-total-votes', 3, null, null]);
    });

    it('no reporta como "recién desbloqueado" un logro que el upsert conserva ya desbloqueado (COALESCE)', async () => {
      const achievement = makeAchievement({
        id: 'ach-already',
        criteria: { minCount: 1 },
      });
      achievementRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder({ getMany: [achievement] }),
      );
      rateRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getCount: 1 }),
      );
      // Simula que la fila YA tenía un unlockedAt (distinto del candidato de esta llamada),
      // que es justo lo que hace COALESCE en Postgres cuando ya existía.
      const previouslyUnlockedAt = new Date('2020-01-01T00:00:00Z');
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho({ 'ach-already': previouslyUnlockedAt }),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
      );

      expect(result).toEqual([]);
      // No debe haberse hecho una segunda query para traer "recién desbloqueados".
      expect(achievementRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('agrupa por (metricType, genre): un solo cálculo sirve para varios umbrales del mismo género', async () => {
      const genre = {
        id: 'genre-black-metal',
        name: 'Black Metal',
        color: 'dimgray',
      };
      const bm5 = makeAchievement({
        id: 'bm-5',
        code: 'BLACK_METAL_5',
        metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
        criteria: { minCount: 5 },
        genre: genre as any,
      });
      const bm25 = makeAchievement({
        id: 'bm-25',
        code: 'BLACK_METAL_25',
        metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
        criteria: { minCount: 25 },
        genre: genre as any,
      });
      achievementRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [bm5, bm25] }))
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [bm5] }));
      const distinctArtistsQb = mockQueryBuilder({ getRawOne: { count: '5' } });
      rateRepository.createQueryBuilder.mockReturnValue(distinctArtistsQb);
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
        {
          genreId: genre.id,
        },
      );

      // Un único query de conteo para todo el grupo, no uno por logro.
      expect(distinctArtistsQb.getRawOne).toHaveBeenCalledTimes(1);
      expect(result).toEqual([bm5]);

      const [, params] = userAchievementRepository.manager.query.mock.calls[0];
      // 2 logros x 5 columnas = 10 valores; ambos comparten progressValue=5.
      expect(params).toHaveLength(10);
      expect(params[2]).toBe(5); // bm5.progressValue
      expect(params[7]).toBe(5); // bm25.progressValue
      expect(params[4]).toBeInstanceOf(Date); // bm5 desbloqueado
      expect(params[9]).toBeNull(); // bm25 sigue bloqueado (5 < 25)
    });
  });

  describe('racha de votos (VOTE_STREAK)', () => {
    beforeEach(() => {
      // Fija "hoy" en un día conocido para que la racha sea determinista.
      // (jest.useFakeTimers también afecta a `new Date()`, no solo a Date.now()).
      jest.useFakeTimers({ now: new Date('2026-01-10T12:00:00Z') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function evaluateStreak(
      days: string[],
      mode: 'current' | 'ever',
      minDays = 1,
    ) {
      const achievement = makeAchievement({
        id: 'streak-1',
        metricType: AchievementMetricType.VOTE_STREAK,
        criteria: { minDays, mode },
      });
      achievementRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] }))
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] }));
      rateRepository.manager.query.mockResolvedValue(
        days.map((day) => ({ day })),
      );
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
      );
      const [, params] = userAchievementRepository.manager.query.mock.calls[0];
      return params[2] as number; // progressValue calculado
    }

    it('racha actual de 3 días consecutivos terminando hoy', async () => {
      const progress = await evaluateStreak(
        ['2026-01-10', '2026-01-09', '2026-01-08'],
        'current',
      );
      expect(progress).toBe(3);
    });

    it('racha actual sigue contando si el último voto fue ayer', async () => {
      const progress = await evaluateStreak(
        ['2026-01-09', '2026-01-08'],
        'current',
      );
      expect(progress).toBe(2);
    });

    it('racha actual se rompe si el último voto fue hace 2+ días', async () => {
      const progress = await evaluateStreak(
        ['2026-01-07', '2026-01-06'],
        'current',
      );
      expect(progress).toBe(0);
    });

    it('sin votos, la racha es 0', async () => {
      const progress = await evaluateStreak([], 'current');
      expect(progress).toBe(0);
    });

    it('modo "ever" toma la racha máxima histórica aunque ya se haya roto', async () => {
      // Racha rota de 2 (hoy/ayer) + racha histórica más larga de 4 días sueltos atrás.
      const days = [
        '2026-01-10',
        '2026-01-09',
        '2025-12-05',
        '2025-12-04',
        '2025-12-03',
        '2025-12-02',
      ];
      const progress = await evaluateStreak(days, 'ever');
      expect(progress).toBe(4);
    });

    it('modo "ever" con huecos irregulares detecta la secuencia consecutiva más larga', async () => {
      const days = [
        '2026-01-10',
        '2026-01-08',
        '2026-01-07',
        '2026-01-06',
        '2026-01-04',
      ];
      const progress = await evaluateStreak(days, 'ever');
      expect(progress).toBe(3); // 01-08, 01-07, 01-06
    });
  });

  describe('disco polémico (CONTROVERSIAL_DISC_VOTE)', () => {
    it('excluye el voto propio al calcular la media comunitaria', async () => {
      const achievement = makeAchievement({
        id: 'controversial-1',
        metricType: AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
        criteria: { minAbsDeviation: 1.5, minCommunityVotes: 3 },
      });
      achievementRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] }))
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] }));
      rateRepository.findOne.mockResolvedValue({ rate: 9 });
      const communityQb = mockQueryBuilder({
        getRawOne: { avg: '5', count: '4' },
      });
      rateRepository.createQueryBuilder.mockReturnValue(communityQb);
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
        {
          discId: 'disc-1',
        },
      );

      expect(communityQb.andWhere).toHaveBeenCalledWith(
        'rate.userId != :userId',
        {
          userId: 'user-1',
        },
      );
      expect(communityQb.andWhere).toHaveBeenCalledWith(
        'rate.rate IS NOT NULL',
      );
      expect(result).toEqual([achievement]); // |9-5| = 4 >= 1.5, con 4 votos ajenos >= 3
    });

    it('no desbloquea si no hay suficientes votos de la comunidad', async () => {
      const achievement = makeAchievement({
        metricType: AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
        criteria: { minAbsDeviation: 0.5, minCommunityVotes: 10 },
      });
      achievementRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder({ getMany: [achievement] }),
      );
      rateRepository.findOne.mockResolvedValue({ rate: 9 });
      rateRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getRawOne: { avg: '2', count: '2' } }),
      );
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
        {
          discId: 'disc-1',
        },
      );

      expect(result).toEqual([]);
    });

    it('no evalúa nada si el usuario no ha votado ese disco con nota', async () => {
      const achievement = makeAchievement({
        metricType: AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
        criteria: { minAbsDeviation: 0.5, minCommunityVotes: 1 },
      });
      achievementRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder({ getMany: [achievement] }),
      );
      rateRepository.findOne.mockResolvedValue(null);

      const result = await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
        {
          discId: 'disc-1',
        },
      );

      expect(result).toEqual([]);
      expect(userAchievementRepository.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('upsert atómico (regresión)', () => {
    it('usa ON CONFLICT DO UPDATE con COALESCE para unlockedAt y nunca GREATEST en progressValue', async () => {
      const achievement = makeAchievement({ criteria: { minCount: 1 } });
      achievementRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] }))
        .mockReturnValueOnce(mockQueryBuilder({ getMany: [achievement] }));
      rateRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getCount: 1 }),
      );
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      await service.evaluate(
        'user-1',
        AchievementTrigger.RATE_CREATED_OR_UPDATED,
      );

      const [sql] = userAchievementRepository.manager.query.mock.calls[0];
      expect(sql).toContain(
        'ON CONFLICT ("userId","achievementId") DO UPDATE SET',
      );
      expect(sql).toContain('"progressValue" = EXCLUDED."progressValue"');
      expect(sql).toContain(
        '"unlockedAt" = COALESCE(user_achievement."unlockedAt", EXCLUDED."unlockedAt")',
      );
      expect(sql).not.toContain('GREATEST');
    });

    it('si la query de upsert falla, no rompe la evaluación (solo se loguea)', async () => {
      const achievement = makeAchievement({ criteria: { minCount: 1 } });
      achievementRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder({ getMany: [achievement] }),
      );
      rateRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getCount: 1 }),
      );
      userAchievementRepository.manager.query.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.evaluate('user-1', AchievementTrigger.RATE_CREATED_OR_UPDATED),
      ).resolves.toEqual([]);
    });
  });

  describe('recalculateForAchievement', () => {
    it('lanza NotFoundException si el logro no existe', async () => {
      achievementRepository.findOne.mockResolvedValue(null);

      await expect(
        service.recalculateForAchievement('missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('no evalúa usuarios que ya tienen el logro desbloqueado', async () => {
      const achievement = makeAchievement({
        id: 'ach-1',
        metricType: AchievementMetricType.TOTAL_COMMENTS,
        criteria: { minCount: 1 },
      });
      achievementRepository.findOne.mockResolvedValue(achievement);
      commentRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getRawMany: [{ userId: 'u1' }, { userId: 'u2' }] }),
      );
      userAchievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getRawMany: [{ userId: 'u1' }] }), // u1 ya lo tiene
      );
      userAchievementRepository.manager.query.mockImplementation(
        makeUpsertEcho(),
      );

      const result = await service.recalculateForAchievement('ach-1');

      expect(result.evaluatedUsers).toBe(2);
      // Solo debería haberse pedido el catálogo de candidatos para u2 (no para u1).
      expect(achievementRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('devuelve evaluatedUsers=0 sin más consultas si nadie es relevante', async () => {
      const achievement = makeAchievement({
        metricType: AchievementMetricType.TOTAL_FAVORITES,
      });
      achievementRepository.findOne.mockResolvedValue(achievement);
      favoriteRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getRawMany: [] }),
      );

      const result = await service.recalculateForAchievement('ach-1');

      expect(result).toEqual({ evaluatedUsers: 0, newlyUnlockedUsers: 0 });
      expect(
        userAchievementRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });

    it('DISTINCT_ARTISTS_IN_GENRE sin género asociado no evalúa a nadie', async () => {
      const achievement = makeAchievement({
        metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
        genre: null,
      });
      achievementRepository.findOne.mockResolvedValue(achievement);

      const result = await service.recalculateForAchievement('ach-1');

      expect(result).toEqual({ evaluatedUsers: 0, newlyUnlockedUsers: 0 });
    });
  });

  describe('recalculateForUser', () => {
    it('no restringe por género: pide el catálogo completo de metricTypes', async () => {
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ getMany: [] }),
      );

      const result = await service.recalculateForUser('user-1');

      expect(result).toEqual([]);
      const qb = achievementRepository.createQueryBuilder.mock.results[0].value;
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('genreId IS NULL'),
      );
    });
  });
});
