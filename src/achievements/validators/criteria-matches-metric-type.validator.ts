import {
  registerDecorator,
  validateSync,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AchievementMetricType } from '../enums/achievement-metric-type.enum';
import { VoteStreakCriteriaDto } from '../dto/criteria/vote-streak-criteria.dto';
import { MinCountCriteriaDto } from '../dto/criteria/min-count-criteria.dto';
import { ControversialCriteriaDto } from '../dto/criteria/controversial-criteria.dto';

const CRITERIA_DTO_BY_METRIC_TYPE: Record<
  AchievementMetricType,
  new () => object
> = {
  [AchievementMetricType.VOTE_STREAK]: VoteStreakCriteriaDto,
  [AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE]: MinCountCriteriaDto,
  [AchievementMetricType.DISTINCT_GENRES]: MinCountCriteriaDto,
  [AchievementMetricType.DISTINCT_COUNTRIES]: MinCountCriteriaDto,
  [AchievementMetricType.TOTAL_VOTES]: MinCountCriteriaDto,
  [AchievementMetricType.TOTAL_COMMENTS]: MinCountCriteriaDto,
  [AchievementMetricType.TOTAL_FAVORITES]: MinCountCriteriaDto,
  [AchievementMetricType.CONTROVERSIAL_DISC_VOTE]: ControversialCriteriaDto,
};

// Valida `criteria` (jsonb libre en la entidad) contra el DTO específico que
// le corresponde según el `metricType` del propio payload, rechazando campos
// no esperados o de tipo incorrecto (whitelist estricta por tipo de logro).
@ValidatorConstraint({ name: 'CriteriaMatchesMetricType', async: false })
export class CriteriaMatchesMetricTypeConstraint
  implements ValidatorConstraintInterface
{
  private lastErrors: string[] = [];

  validate(criteria: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { metricType?: AchievementMetricType };
    const metricType = dto.metricType;
    const CriteriaDto = metricType
      ? CRITERIA_DTO_BY_METRIC_TYPE[metricType]
      : undefined;

    if (!CriteriaDto) {
      this.lastErrors = ['metricType inválido o no soportado'];
      return false;
    }

    if (
      typeof criteria !== 'object' ||
      criteria === null ||
      Array.isArray(criteria)
    ) {
      this.lastErrors = ['criteria debe ser un objeto'];
      return false;
    }

    const instance = plainToInstance(CriteriaDto, criteria);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    this.lastErrors = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    return errors.length === 0;
  }

  defaultMessage(): string {
    return `criteria inválido para este metricType: ${this.lastErrors.join(', ') || 'formato incorrecto'}`;
  }
}

export function CriteriaMatchesMetricType(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: CriteriaMatchesMetricTypeConstraint,
    });
  };
}
