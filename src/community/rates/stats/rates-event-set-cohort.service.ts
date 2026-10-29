import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import { getEventSetCohortQuery } from './helpers/event-set-cohort-query';

export interface EventSetCohortRequest {
  userId: string;
  year: number;
  timeZone?: string;
}

export interface EligibleSetEvent {
  eventId: string;
  occurredAt: Date;
  discId: string;
  releaseDate: string;
}

interface EligibleSetEventRow {
  eventId: string;
  occurredAt: Date | string;
  discId: string;
  releaseDate: string;
}

export interface RatesEventSetCohort {
  year: number;
  timeZone: string;
  events: EligibleSetEvent[];
}

@Injectable()
export class RatesEventSetCohortService {
  constructor(
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async selectForUser(
    request: EventSetCohortRequest,
  ): Promise<RatesEventSetCohort> {
    const query = getEventSetCohortQuery(
      request.userId,
      request.year,
      request.timeZone,
    );
    const rows = await this.eventRepository.query<EligibleSetEventRow[]>(
      `WITH ${query.eligibleSetEventsCte}
       SELECT "eventId", "occurredAt", "discId", "releaseDate"
       FROM eligible_set_events
       ORDER BY "occurredAt" ASC, "eventId" ASC`,
      query.parameters,
    );

    return {
      year: query.year,
      timeZone: query.timeZone,
      events: rows.map((row) => ({
        ...row,
        occurredAt:
          row.occurredAt instanceof Date
            ? row.occurredAt
            : new Date(row.occurredAt),
      })),
    };
  }
}
