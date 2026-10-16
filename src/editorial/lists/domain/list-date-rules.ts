import { BadRequestException } from '@nestjs/common';
import { ListType } from '../entities/list.entity';

export function isValidDateValue(value: unknown): boolean {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }

  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isFinite(Date.parse(value))
  );
}

export function assertRequiredEditorialDate(
  listType: ListType.WEEK | ListType.MONTH,
  value: unknown,
): void {
  if (!isValidDateValue(value)) {
    throw new BadRequestException(
      `Las listas ${listType.toUpperCase()} requieren una fecha de publicación válida.`,
    );
  }
}

export function hasAnyEditorialDate(value: {
  listDate?: Date | string | null;
  releaseDate?: Date | string | null;
  closeDate?: Date | string | null;
}): boolean {
  return [value.listDate, value.releaseDate, value.closeDate].some(
    (date) => date !== undefined && date !== null,
  );
}
