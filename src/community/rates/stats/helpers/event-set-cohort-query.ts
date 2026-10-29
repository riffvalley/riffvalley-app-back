import { BadRequestException } from '@nestjs/common';
import { getLocalYearInstantBounds } from './local-year-instant-bounds';

export interface EventSetCohortQuery {
  year: number;
  timeZone: string;
  eligibleSetEventsCte: string;
  parameters: [string, string, string, Date, Date];
}

/** Shared eligible event population for modern Rates statistics. */
export function getEventSetCohortQuery(
  userId: string,
  year: number,
  requestedTimeZone?: string,
): EventSetCohortQuery {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new BadRequestException('A user is required for event cohorts.');
  }
  if (!Number.isInteger(year) || year < 2027 || year > 9998) {
    throw new BadRequestException(
      'Event set cohorts support years from 2027 onward.',
    );
  }

  const timeZone = requestedTimeZone ?? 'UTC';
  if (!isValidTimeZone(timeZone)) {
    throw new BadRequestException('timeZone must be a valid IANA time zone.');
  }
  const bounds = getLocalYearInstantBounds(year, timeZone);
  return {
    year,
    timeZone,
    eligibleSetEventsCte: `
      eligible_set_events AS (
        SELECT
          event.id AS "eventId",
          event.occurred_at AS "occurredAt",
          event.disc_id AS "discId",
          disc."releaseDate"::text AS "releaseDate"
        FROM rate_vote_events event
        INNER JOIN disc ON disc.id = event.disc_id
        WHERE event.user_id = $1
          AND event.event_type = 'set'
          AND event.previous_value IS NULL
          AND event.new_value IS NOT NULL
          AND disc."releaseDate" >= $2::date
          AND disc."releaseDate" < $3::date
          AND event.occurred_at >= $4::timestamptz
          AND event.occurred_at < $5::timestamptz
      )`,
    parameters: [
      userId,
      `${year}-01-01`,
      `${year + 1}-01-01`,
      bounds.start,
      bounds.end,
    ],
  };
}

function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}
