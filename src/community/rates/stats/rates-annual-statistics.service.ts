import { Injectable } from '@nestjs/common';
import {
  RatesStatsControversialDiscDto,
  RatesStatsDailyActivityDto,
  RatesStatsGenreActivityDto,
  RatesStatsMonthlyActivityDto,
  RatesStatsRatedDiscDto,
  RatesStatsScoreDistributionDto,
  RatesUserStatsResponseDto,
} from '../dto/rates-user-stats.dto';
import { RatesControversialDiscsService } from './rates-controversial-discs.service';
import { RatesCurrentScoresService } from './rates-current-scores.service';
import { RatesEventSetAggregationsService } from './rates-event-set-aggregations.service';
import { RatesFeaturedDiscService } from './rates-featured-disc.service';
import { RatesGalaxyDiscsService } from './rates-galaxy-discs.service';
import { RatesHistoricalAggregationsService } from './rates-historical-aggregations.service';

@Injectable()
export class RatesAnnualStatisticsService {
  constructor(
    private readonly historicalAggregations: RatesHistoricalAggregationsService,
    private readonly eventSetAggregations: RatesEventSetAggregationsService,
    private readonly currentScores: RatesCurrentScoresService,
    private readonly featuredDisc: RatesFeaturedDiscService,
    private readonly controversialDiscs: RatesControversialDiscsService,
    private readonly galaxyDiscs: RatesGalaxyDiscsService,
  ) {}

  async getUserStats(
    userId: string,
    year: number,
    timeZone = 'UTC',
  ): Promise<RatesUserStatsResponseDto> {
    const historical = year <= 2026;
    const activity = historical
      ? await this.historicalAggregations.aggregateActivityForUser(userId, year)
      : await this.eventSetAggregations.aggregateActivityForUser(
          userId,
          year,
          timeZone,
        );
    const [scores, highlights, controversy] = await Promise.all([
      this.currentScores.aggregateForUser(userId, year, timeZone),
      this.featuredDisc.selectAnnualHighlightsForUser(userId, year, timeZone),
      this.controversialDiscs.analyzeForUser(userId, year, timeZone),
    ]);

    assertSameYear(year, activity.year, scores.year);
    return {
      year,
      timeZone,
      activityBasis: historical ? 'rate_created_at_estimate' : 'set_events',
      activityCoverage: historical ? 'unknown' : 'partial',
      activityCount: activity.activityCount,
      scoredDiscs: scores.scoredDiscs,
      mean: scores.mean,
      median: scores.median,
      standardDeviation: scores.standardDeviation,
      activityByGenre: activity.activityByGenre.map(
        (item): RatesStatsGenreActivityDto => ({
          genre: item.genre,
          activityCount: item.activityCount,
          topDisc:
            highlights.byGenre.find(
              (highlight) => highlight.genre === item.genre,
            )?.topDisc ?? null,
        }),
      ),
      activityByMonth: activity.activityByMonth.map(
        (item): RatesStatsMonthlyActivityDto => ({
          month: item.month,
          activityCount: item.activityCount,
          topDisc:
            highlights.byMonth.find(
              (highlight) => highlight.month === item.month,
            )?.topDisc ?? null,
        }),
      ),
      scoreDistribution: scores.scoreDistribution.map(
        (item): RatesStatsScoreDistributionDto => ({ ...item }),
      ),
      topDiscOverall: highlights.topDiscOverall,
      mostControversial: controversy.map(toContractControversy),
      activityByDay: activity.activityByDay.map(
        (item): RatesStatsDailyActivityDto => ({
          date: item.date,
          activityCount: item.activityCount,
          assignments: item.assignments,
        }),
      ),
      activityWithoutGenre: activity.activityWithoutGenre,
    };
  }

  getRatedDiscs(
    userId: string,
    year: number,
    timeZone = 'UTC',
  ): Promise<RatesStatsRatedDiscDto[]> {
    return this.galaxyDiscs.selectForUser(userId, year, timeZone);
  }
}

function assertSameYear(
  requestedYear: number,
  activityYear: number,
  scoresYear: number,
): void {
  if (requestedYear !== activityYear || requestedYear !== scoresYear) {
    throw new Error('Annual statistics services returned mismatched years.');
  }
}

function toContractControversy(
  candidate: Awaited<
    ReturnType<RatesControversialDiscsService['analyzeForUser']>
  >[number],
): RatesStatsControversialDiscDto {
  return {
    id: candidate.id,
    name: candidate.name,
    image: candidate.image,
    userRate: candidate.userRate,
    communityAverage: candidate.communityAverage,
    diff: candidate.diff,
    artist: candidate.artist,
    genre: candidate.genre,
  };
}
