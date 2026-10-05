import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';

type HistoryOpts = {
  type?: 'rate' | 'cover' | 'both';
  dateRange?: [Date, Date]; // filtro sobre la fecha del EVENTO (creado/editado)
  order?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
};

@Injectable()
export class RatesHistoryService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
  ) {}

  async findUserActionHistoryPaginatedQB(
    userId: string,
    opts: HistoryOpts = {},
  ) {
    const {
      type = 'both',
      dateRange,
      order = 'DESC',
      limit = 20,
      offset = 0,
    } = opts;

    const typePredicate =
      type === 'rate'
        ? 'rate.rate IS NOT NULL'
        : type === 'cover'
          ? 'rate.cover IS NOT NULL'
          : '(rate.rate IS NOT NULL OR rate.cover IS NOT NULL)';

    const hasRange = !!(dateRange && dateRange.length === 2);
    const [start, end] = hasRange ? dateRange! : [undefined, undefined];

    // ------- BASE QB (con joins que necesites en la respuesta) -------
    const baseQB = this.rateRepository
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .where('rate.userId = :userId', { userId })
      .andWhere(typePredicate);

    // El rango de fechas para el HISTÓRICO se aplica a eventos:
    //  - creaciones: rate.createdAt
    //  - ediciones : rate.editedAt > rate.createdAt y dentro de rango
    // Para traer filas candidatas, filtramos por (createdAt EN rango) OR (editedAt EN rango)
    // y además traeremos suficientes filas para componer la página de eventos.
    const candidatesQB = baseQB.clone();
    if (hasRange) {
      candidatesQB.andWhere(
        '(rate.createdAt BETWEEN :start AND :end OR (rate.editedAt IS NOT NULL AND rate.editedAt > rate.createdAt AND rate.editedAt BETWEEN :start AND :end))',
        { start, end },
      );
    }

    // Orden aproximado por "último evento" para traer primero las filas más recientes.
    // (Luego ordenamos los eventos reales en memoria).
    candidatesQB
      .orderBy(
        'rate.editedAt',
        order as any,
        order === 'ASC' ? 'NULLS FIRST' : 'NULLS LAST',
      )
      .addOrderBy('rate.createdAt', order as any);

    // Para paginar por eventos (no por filas), traemos un "buffer".
    // Regla práctica: necesitarás ~offset+limit filas, pero algunas aportan 2 eventos.
    // Traemos el triple de lo que necesitamos para evitar quedarnos cortos sin hacer múltiples queries.
    const fetchCount = Math.max(limit + offset, limit * 3);
    candidatesQB.take(fetchCount);

    const rates = await candidatesQB.getMany();

    // ------- EXPANDIR A EVENTOS Y ORDENAR -------
    type EventRow = {
      rateId: string;
      action: 'created' | 'updated';
      timestamp: Date;
      dayLabel: string; // 'DD-M'
      rate: number | null;
      cover: number | null;
      disc: {
        id: string;
        name?: string;
        artist?: { id?: string; name?: string };
      };
    };

    const events: EventRow[] = [];
    for (const r of rates) {
      // evento creado siempre
      if (!hasRange || (start! <= r.createdAt && r.createdAt <= end!)) {
        const d = new Date(r.createdAt);
        events.push({
          rateId: r.id,
          action: 'created',
          timestamp: r.createdAt,
          dayLabel: `${d.getDate()}-${d.getMonth() + 1}`,
          rate: r.rate ?? null,
          cover: r.cover ?? null,
          disc: {
            id: (r as any).discId ?? r.disc?.id,
            name: r.disc?.name,
            artist: r.disc?.artist
              ? { id: r.disc.artist.id, name: r.disc.artist.name }
              : undefined,
          },
        });
      }

      // evento editado si procede
      if (r.editedAt && r.editedAt > r.createdAt) {
        if (!hasRange || (start! <= r.editedAt && r.editedAt <= end!)) {
          const d2 = new Date(r.editedAt);
          events.push({
            rateId: r.id,
            action: 'updated',
            timestamp: r.editedAt,
            dayLabel: `${d2.getDate()}-${d2.getMonth() + 1}`,
            rate: r.rate ?? null,
            cover: r.cover ?? null,
            disc: {
              id: (r as any).discId ?? r.disc?.id,
              name: r.disc?.name,
              artist: r.disc?.artist
                ? { id: r.disc.artist.id, name: r.disc.artist.name }
                : undefined,
            },
          });
        }
      }
    }

    // Orden real por timestamp del evento
    events.sort((a, b) =>
      order === 'ASC'
        ? a.timestamp.getTime() - b.timestamp.getTime()
        : b.timestamp.getTime() - a.timestamp.getTime(),
    );

    // ------- PAGINAR EN MEMORIA -------
    const data = events.slice(offset, offset + limit);

    // ------- TOTAL ITEMS (conteo exacto de eventos) -------
    const createdCountQB = baseQB.clone();
    if (hasRange) {
      createdCountQB.andWhere('rate.createdAt BETWEEN :start AND :end', {
        start,
        end,
      });
    }
    const createdCount = await createdCountQB.getCount();

    const editedCountQB = baseQB
      .clone()
      .andWhere('rate.editedAt IS NOT NULL')
      .andWhere('rate.editedAt > rate.createdAt');
    if (hasRange) {
      editedCountQB.andWhere('rate.editedAt BETWEEN :start AND :end', {
        start,
        end,
      });
    }
    const editedCount = await editedCountQB.getCount();

    const totalItems = createdCount + editedCount;
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      userId,
      type,
      order,
      totalItems,
      totalPages,
      currentPage,
      limit,
      data, // [{ rateId, action, timestamp, dayLabel, rate, cover, disc: {…} }]
    };
  }
}
