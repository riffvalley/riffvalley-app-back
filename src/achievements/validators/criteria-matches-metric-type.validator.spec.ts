import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAchievementDto } from '../dto/create-achievement.dto';
import { AchievementMetricType } from '../enums/achievement-metric-type.enum';

// Payload mínimo válido salvo por `criteria`, que cada test sobreescribe.
function basePayload(overrides: Partial<CreateAchievementDto> = {}) {
  return {
    code: 'TEST_CODE',
    name: 'Test achievement',
    metricType: AchievementMetricType.TOTAL_VOTES,
    criteria: { minCount: 5 },
    ...overrides,
  };
}

async function validateCriteria(overrides: Partial<CreateAchievementDto>) {
  const dto = plainToInstance(CreateAchievementDto, basePayload(overrides));
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'criteria');
}

describe('CriteriaMatchesMetricType', () => {
  it('acepta VOTE_STREAK con minDays y mode válidos', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.VOTE_STREAK,
      criteria: { minDays: 7, mode: 'current' },
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza VOTE_STREAK con mode inválido', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.VOTE_STREAK,
      criteria: { minDays: 7, mode: 'sometimes' },
    });
    expect(errors).toHaveLength(1);
  });

  it('rechaza VOTE_STREAK sin minDays', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.VOTE_STREAK,
      criteria: { mode: 'current' },
    });
    expect(errors).toHaveLength(1);
  });

  it.each([
    AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
    AchievementMetricType.DISTINCT_GENRES,
    AchievementMetricType.DISTINCT_COUNTRIES,
    AchievementMetricType.TOTAL_VOTES,
    AchievementMetricType.TOTAL_COMMENTS,
    AchievementMetricType.TOTAL_FAVORITES,
  ])('acepta %s con { minCount } válido', async (metricType) => {
    const errors = await validateCriteria({
      metricType,
      criteria: { minCount: 10 },
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza minCount no numérico', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.TOTAL_VOTES,
      criteria: { minCount: 'diez' },
    });
    expect(errors).toHaveLength(1);
  });

  it('rechaza minCount menor que 1', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.TOTAL_VOTES,
      criteria: { minCount: 0 },
    });
    expect(errors).toHaveLength(1);
  });

  it('rechaza campos extra no esperados para el tipo (whitelist estricta)', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.TOTAL_VOTES,
      criteria: { minCount: 10, genreId: 'colado-por-error' },
    });
    expect(errors).toHaveLength(1);
  });

  it('acepta CONTROVERSIAL_DISC_VOTE con minAbsDeviation y minCommunityVotes', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
      criteria: { minAbsDeviation: 1.5, minCommunityVotes: 5 },
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza CONTROVERSIAL_DISC_VOTE sin minCommunityVotes', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
      criteria: { minAbsDeviation: 1.5 },
    });
    expect(errors).toHaveLength(1);
  });

  it('rechaza que criteria sea un array en lugar de un objeto', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.TOTAL_VOTES,
      criteria: [1, 2, 3] as any,
    });
    expect(errors).toHaveLength(1);
  });

  it('rechaza que criteria sea null', async () => {
    const errors = await validateCriteria({
      metricType: AchievementMetricType.TOTAL_VOTES,
      criteria: null as any,
    });
    expect(errors).toHaveLength(1);
  });
});
