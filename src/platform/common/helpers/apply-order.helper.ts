// apply-order.helper.ts
import { SelectQueryBuilder } from 'typeorm';

export type OrderDirection = 'ASC' | 'DESC';

export type OrderOption = {
  field: string;
  direction?: OrderDirection;
  nulls?: 'NULLS FIRST' | 'NULLS LAST'; // 👈 así
};

export type ParseOptions = {
  /** Campos permitidos tal cual o un mapa alias->columna real */
  allowlist?: Set<string> | Record<string, string>;
  /** Dirección por defecto si no se especifica */
  defaultDirection?: OrderDirection;
};

export function parseOrdersRaw(
  raw?: string,
  opts: ParseOptions = {},
): OrderOption[] | undefined {
  if (!raw) return undefined;

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const defaultDir = opts.defaultDirection ?? 'ASC';

  const normalize = (field: string) => {
    if (!opts.allowlist) return field;
    if (opts.allowlist instanceof Set) {
      return opts.allowlist.has(field) ? field : undefined;
    }
    // allowlist como mapa alias->col
    const map = opts.allowlist as Record<string, string>;
    if (map[field]) return map[field];
    // si el field está como clave y valor a la vez, también vale
    const ok = Object.values(map).includes(field);
    return ok ? field : undefined;
  };

  const parsed: OrderOption[] = [];

  for (const part of parts) {
    const [rawField, rawDir] = part.split(':');
    const field = normalize(rawField?.trim() ?? '');
    if (!field) continue;
    const dir = (rawDir?.toUpperCase() as OrderDirection) || defaultDir;
    if (dir !== 'ASC' && dir !== 'DESC') continue;
    parsed.push({ field, direction: dir });
  }

  return parsed.length ? parsed : undefined;
}

export function applyOrder<T>(
  qb: SelectQueryBuilder<T>,
  orders?: OrderOption[],
  fallback: OrderOption[] = [],
) {
  const effectiveOrders = orders?.length ? orders : fallback;

  effectiveOrders.forEach((order, index) => {
    const { field, direction = 'ASC', nulls } = order;

    if (index === 0) {
      qb.orderBy(field, direction, nulls);
    } else {
      qb.addOrderBy(field, direction, nulls);
    }
  });

  return qb;
}
