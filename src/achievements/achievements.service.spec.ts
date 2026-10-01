import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { AchievementMetricType } from './enums/achievement-metric-type.enum';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';

function mockQueryBuilder(getMany: unknown[]) {
  const qb: any = {};
  const chainMethods = [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ];
  for (const method of chainMethods) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(getMany);
  return qb;
}

function makeAchievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'ach-1',
    code: 'TEST_ACHIEVEMENT',
    name: 'Logro de prueba',
    description: 'Descripción',
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

function makeUserAchievement(
  overrides: Partial<UserAchievement> = {},
): UserAchievement {
  return {
    id: 'ua-1',
    user: { id: 'user-1' } as any,
    achievement: makeAchievement(),
    unlockedAt: null,
    progressValue: 0,
    progressMeta: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserAchievement;
}

describe('AchievementsService', () => {
  let service: AchievementsService;
  let achievementRepository: any;
  let userAchievementRepository: any;
  let categoryRepository: any;
  let genreRepository: any;

  const defaultCategory = {
    id: 'cat-1',
    code: 'VOTING',
    name: 'Votación',
    icon: null,
  };

  beforeEach(() => {
    achievementRepository = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'ach-new', ...value })),
      preload: jest.fn(),
    };
    userAchievementRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: { query: jest.fn() },
    };
    categoryRepository = {
      findOneBy: jest.fn().mockResolvedValue(defaultCategory),
      find: jest.fn(),
    };
    genreRepository = { findOneBy: jest.fn() };

    service = new AchievementsService(
      achievementRepository,
      userAchievementRepository,
      categoryRepository,
      genreRepository,
    );
  });

  describe('create / resolveGenre', () => {
    it('exige genreId cuando metricType es DISTINCT_ARTISTS_IN_GENRE', async () => {
      await expect(
        service.create({
          code: 'X',
          name: 'X',
          metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
          criteria: { minCount: 5 },
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(achievementRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza un genreId que no existe', async () => {
      genreRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'X',
          name: 'X',
          metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
          criteria: { minCount: 5 },
          genreId: 'genre-404',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea un logro de género con el genre resuelto', async () => {
      const genre = { id: 'genre-1', name: 'Black Metal', color: 'dimgray' };
      genreRepository.findOneBy.mockResolvedValue(genre);

      await service.create({
        code: 'BLACK_METAL_5',
        name: 'Iniciado',
        metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
        criteria: { minCount: 5 },
        genreId: 'genre-1',
        categoryId: 'cat-1',
      } as any);

      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'BLACK_METAL_5',
          genre,
          category: defaultCategory,
        }),
      );
      // genreId/categoryId nunca se cuelan como propiedades sueltas en la entidad guardada.
      const saved = achievementRepository.save.mock.calls[0][0];
      expect(saved.genreId).toBeUndefined();
      expect(saved.categoryId).toBeUndefined();
    });

    it('rechaza un genreId cuando el metricType no es de género', async () => {
      await expect(
        service.create({
          code: 'X',
          name: 'X',
          metricType: AchievementMetricType.TOTAL_VOTES,
          criteria: { minCount: 5 },
          genreId: 'genre-1',
          categoryId: 'cat-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea un logro sin género cuando no se pide', async () => {
      await service.create({
        code: 'TOTAL_VOTES_100',
        name: 'Votante',
        metricType: AchievementMetricType.TOTAL_VOTES,
        criteria: { minCount: 100 },
        categoryId: 'cat-1',
      } as any);

      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ genre: null }),
      );
    });

    it('traduce un código duplicado (23505) en BadRequestException', async () => {
      achievementRepository.save.mockRejectedValue({
        code: '23505',
        detail: 'ya existe',
      });

      await expect(
        service.create({
          code: 'DUP',
          name: 'X',
          metricType: AchievementMetricType.TOTAL_VOTES,
          criteria: { minCount: 5 },
          categoryId: 'cat-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('convierte un error inesperado de BD en InternalServerErrorException', async () => {
      achievementRepository.save.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({
          code: 'X',
          name: 'X',
          metricType: AchievementMetricType.TOTAL_VOTES,
          criteria: { minCount: 5 },
          categoryId: 'cat-1',
        } as any),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('create / resolveCategory', () => {
    it('exige categoryId siempre (categoría obligatoria en todo logro nuevo)', async () => {
      await expect(
        service.create({
          code: 'X',
          name: 'X',
          metricType: AchievementMetricType.TOTAL_VOTES,
          criteria: { minCount: 5 },
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(achievementRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza un categoryId que no existe', async () => {
      categoryRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'X',
          name: 'X',
          metricType: AchievementMetricType.TOTAL_VOTES,
          criteria: { minCount: 5 },
          categoryId: 'cat-404',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('asigna la categoría resuelta al logro creado', async () => {
      await service.create({
        code: 'X',
        name: 'X',
        metricType: AchievementMetricType.TOTAL_VOTES,
        criteria: { minCount: 5 },
        categoryId: 'cat-1',
      } as any);

      expect(categoryRepository.findOneBy).toHaveBeenCalledWith({
        id: 'cat-1',
      });
      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ category: defaultCategory }),
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si el logro no existe', async () => {
      achievementRepository.findOneBy.mockResolvedValue(null);

      await expect(service.update('missing', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('conserva el género existente si el update no lo toca', async () => {
      const genre = { id: 'genre-1', name: 'Black Metal' };
      const existing = makeAchievement({
        metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
        genre: genre as any,
      });
      achievementRepository.findOneBy.mockResolvedValue(existing);
      genreRepository.findOneBy.mockResolvedValue(genre);
      achievementRepository.preload.mockImplementation((v: any) => v);

      await service.update(existing.id, { points: 99 } as any);

      expect(genreRepository.findOneBy).toHaveBeenCalledWith({ id: 'genre-1' });
      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ points: 99, genre }),
      );
    });

    it('lanza NotFoundException si preload no encuentra la fila (borrado concurrente)', async () => {
      achievementRepository.findOneBy.mockResolvedValue(makeAchievement());
      achievementRepository.preload.mockResolvedValue(undefined);

      await expect(
        service.update('ach-1', { points: 1 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('conserva la categoría existente si el update no la toca', async () => {
      const existing = makeAchievement({ category: defaultCategory as any });
      achievementRepository.findOneBy.mockResolvedValue(existing);
      achievementRepository.preload.mockImplementation((v: any) => v);

      await service.update(existing.id, { points: 5 } as any);

      // No debe volver a resolver la categoría por BD si no se pidió cambiarla.
      expect(categoryRepository.findOneBy).not.toHaveBeenCalled();
      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ category: defaultCategory }),
      );
    });

    it('reasigna la categoría cuando se envía un categoryId nuevo', async () => {
      const newCategory = { id: 'cat-2', code: 'STREAKS', name: 'Rachas' };
      const existing = makeAchievement({ category: defaultCategory as any });
      achievementRepository.findOneBy.mockResolvedValue(existing);
      achievementRepository.preload.mockImplementation((v: any) => v);
      categoryRepository.findOneBy.mockResolvedValue(newCategory);

      await service.update(existing.id, { categoryId: 'cat-2' } as any);

      expect(categoryRepository.findOneBy).toHaveBeenCalledWith({
        id: 'cat-2',
      });
      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ category: newCategory }),
      );
    });
  });

  describe('softDelete', () => {
    it('desactiva el logro sin borrarlo físicamente', async () => {
      const existing = makeAchievement({ active: true });
      achievementRepository.findOneBy.mockResolvedValue(existing);

      await service.softDelete('ach-1');

      expect(achievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ach-1', active: false }),
      );
    });

    it('lanza NotFoundException si el logro no existe', async () => {
      achievementRepository.findOneBy.mockResolvedValue(null);

      await expect(service.softDelete('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listCatalogForUser', () => {
    it('censura un logro secreto no desbloqueado, pero revela su categoría', async () => {
      const secretAchievement = makeAchievement({
        id: 'secret-1',
        code: 'CONTROVERSIAL_VOTER',
        secret: true,
        category: defaultCategory as any,
      });
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([secretAchievement]),
      );
      userAchievementRepository.find.mockResolvedValue([]);

      const [result] = await service.listCatalogForUser('user-1');

      expect(result).toEqual({
        id: 'secret-1',
        secret: true,
        locked: true,
        unlocked: false,
        progressValue: 0,
        category: { id: 'cat-1', code: 'VOTING', name: 'Votación', icon: null },
      });
      // No debe filtrarse nombre, descripción ni criteria de un secreto bloqueado.
      expect(result).not.toHaveProperty('name');
      expect(result).not.toHaveProperty('criteria');
    });

    it('revela un logro secreto una vez desbloqueado', async () => {
      const secretAchievement = makeAchievement({
        id: 'secret-1',
        code: 'CONTROVERSIAL_VOTER',
        secret: true,
      });
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([secretAchievement]),
      );
      const unlockedAt = new Date('2026-01-01T00:00:00Z');
      userAchievementRepository.find.mockResolvedValue([
        makeUserAchievement({
          achievement: secretAchievement,
          unlockedAt,
          progressValue: 3,
        }),
      ]);

      const [result] = await service.listCatalogForUser('user-1');

      expect(result).toMatchObject({
        code: 'CONTROVERSIAL_VOTER',
        secret: true,
        locked: false,
        unlocked: true,
        unlockedAt,
        progressValue: 3,
      });
    });

    it('un logro no secreto sin fila de progreso aparece con progressValue 0', async () => {
      const achievement = makeAchievement({
        id: 'ach-2',
        code: 'TOTAL_VOTES_100',
      });
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([achievement]),
      );
      userAchievementRepository.find.mockResolvedValue([]);

      const [result] = await service.listCatalogForUser('user-1');

      expect(result).toMatchObject({
        code: 'TOTAL_VOTES_100',
        unlocked: false,
        progressValue: 0,
        unlockedAt: null,
      });
    });

    it('incluye el género cuando el logro está clasificado por género', async () => {
      const genre = { id: 'genre-1', name: 'Black Metal', color: 'dimgray' };
      const achievement = makeAchievement({
        id: 'ach-3',
        code: 'BLACK_METAL_5',
        genre: genre as any,
      });
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([achievement]),
      );
      userAchievementRepository.find.mockResolvedValue([]);

      const [result] = await service.listCatalogForUser('user-1');

      expect((result as any).genre).toEqual(genre);
    });

    it('incluye un resumen de la categoría (id, code, name, icon) cuando el logro la tiene', async () => {
      const achievement = makeAchievement({ category: defaultCategory as any });
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([achievement]),
      );
      userAchievementRepository.find.mockResolvedValue([]);

      const [result] = await service.listCatalogForUser('user-1');

      expect((result as any).category).toEqual({
        id: 'cat-1',
        code: 'VOTING',
        name: 'Votación',
        icon: null,
      });
    });

    it('category es null cuando el logro no tiene categoría asignada', async () => {
      const achievement = makeAchievement({ category: null });
      achievementRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([achievement]),
      );
      userAchievementRepository.find.mockResolvedValue([]);

      const [result] = await service.listCatalogForUser('user-1');

      expect((result as any).category).toBeNull();
    });

    it('filtra por categoryId añadiendo el andWhere correspondiente', async () => {
      const qb = mockQueryBuilder([]);
      achievementRepository.createQueryBuilder.mockReturnValue(qb);
      userAchievementRepository.find.mockResolvedValue([]);

      await service.listCatalogForUser('user-1', { categoryId: 'cat-1' });

      expect(qb.andWhere).toHaveBeenCalledWith('category.id = :categoryId', {
        categoryId: 'cat-1',
      });
    });

    it('filtra por categoryCode cuando no se pasa categoryId', async () => {
      const qb = mockQueryBuilder([]);
      achievementRepository.createQueryBuilder.mockReturnValue(qb);
      userAchievementRepository.find.mockResolvedValue([]);

      await service.listCatalogForUser('user-1', { categoryCode: 'STREAKS' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'category.code = :categoryCode',
        {
          categoryCode: 'STREAKS',
        },
      );
    });

    it('categoryId tiene prioridad sobre categoryCode si se pasan ambos', async () => {
      const qb = mockQueryBuilder([]);
      achievementRepository.createQueryBuilder.mockReturnValue(qb);
      userAchievementRepository.find.mockResolvedValue([]);

      await service.listCatalogForUser('user-1', {
        categoryId: 'cat-1',
        categoryCode: 'STREAKS',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('category.id = :categoryId', {
        categoryId: 'cat-1',
      });
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'category.code = :categoryCode',
        expect.anything(),
      );
    });
  });

  describe('listCategories', () => {
    it('devuelve solo categorías activas ordenadas', async () => {
      categoryRepository.find.mockResolvedValue([defaultCategory]);

      const result = await service.listCategories();

      expect(categoryRepository.find).toHaveBeenCalledWith({
        where: { active: true },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      expect(result).toEqual([defaultCategory]);
    });
  });

  describe('listUnlockedForUser', () => {
    it('filtra los logros en progreso y solo devuelve los desbloqueados', async () => {
      const unlockedAt = new Date('2026-02-01T00:00:00Z');
      userAchievementRepository.find.mockResolvedValue([
        makeUserAchievement({ unlockedAt: null, progressValue: 2 }),
        makeUserAchievement({
          unlockedAt,
          achievement: makeAchievement({
            id: 'ach-9',
            code: 'STREAK_7_DAYS',
            points: 50,
            category: defaultCategory as any,
          }),
        }),
      ]);

      const result = await service.listUnlockedForUser('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        code: 'STREAK_7_DAYS',
        points: 50,
        unlockedAt,
        category: { id: 'cat-1', code: 'VOTING', name: 'Votación', icon: null },
      });
    });
  });

  describe('getSummary', () => {
    it('resuelve el nivel a partir de la suma de puntos de logros desbloqueados', async () => {
      userAchievementRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalPoints: '150' }),
      });

      const summary = await service.getSummary('user-1');

      expect(summary.totalPoints).toBe(150);
      expect(summary.level).toBe(3);
    });

    it('sin logros desbloqueados el total de puntos es 0', async () => {
      userAchievementRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalPoints: '0' }),
      });

      const summary = await service.getSummary('user-1');

      expect(summary.totalPoints).toBe(0);
      expect(summary.level).toBe(1);
    });
  });

  describe('getLeaderboard', () => {
    it('numera el ranking en el orden devuelto por la query', async () => {
      userAchievementRepository.manager.query.mockResolvedValue([
        { userId: 'u1', username: 'top', totalPoints: '500' },
        { userId: 'u2', username: 'segundo', totalPoints: '200' },
      ]);

      const result = await service.getLeaderboard(10);

      expect(result).toEqual([
        { rank: 1, userId: 'u1', username: 'top', totalPoints: 500 },
        { rank: 2, userId: 'u2', username: 'segundo', totalPoints: 200 },
      ]);
      expect(userAchievementRepository.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY "totalPoints" DESC'),
        [10],
      );
    });
  });
});
