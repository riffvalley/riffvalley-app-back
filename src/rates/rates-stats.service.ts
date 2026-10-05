import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Rate } from './entities/rate.entity';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class RatesStatsService {
    private readonly logger = new Logger('RatesStatsService');

    constructor(
        @InjectRepository(Rate)
        private readonly rateRepository: Repository<Rate>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async getHomeInsights(user: User) {
        const userId = user.id;

        const topArtistsRaw = await this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .innerJoin('disc.artist', 'artist')
            .select('artist.id', 'id')
            .addSelect('artist.name', 'name')
            .addSelect('artist.image', 'image')
            .addSelect('AVG(rate.rate)', 'averageRate')
            .addSelect('COUNT(rate.id)', 'ratingCount')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL')
            .groupBy('artist.id')
            .addGroupBy('artist.name')
            .addGroupBy('artist.image')
            .orderBy('AVG(rate.rate)', 'DESC')
            .addOrderBy('COUNT(rate.id)', 'DESC')
            .addOrderBy('artist.name', 'ASC')
            .limit(7)
            .getRawMany();

        const countriesRaw = await this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .innerJoin('disc.artist', 'artist')
            .innerJoin('artist.country', 'country')
            .select('country.isoCode', 'isoCode')
            .addSelect('country.name', 'name')
            .addSelect('COUNT(rate.id)', 'count')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL')
            .andWhere('country.id IS NOT NULL')
            .andWhere('country.isoCode IS NOT NULL')
            .groupBy('country.isoCode')
            .addGroupBy('country.name')
            .orderBy('COUNT(rate.id)', 'DESC')
            .getRawMany();

        const totalWithCountry = countriesRaw.reduce(
            (total, country) => total + Number(country.count),
            0,
        );

        return {
            topArtists: topArtistsRaw.map((artist) => ({
                id: artist.id,
                name: artist.name,
                image: artist.image ?? '',
                averageRate: Number(artist.averageRate),
                ratingCount: Number(artist.ratingCount),
            })),
            countries: countriesRaw.slice(0, 10).map((country) => {
                const count = Number(country.count);
                return {
                    isoCode: country.isoCode,
                    name: country.name,
                    count,
                    percentage: totalWithCountry
                        ? Math.round((count / totalWithCountry) * 100)
                        : 0,
                };
            }),
        };
    }

    async getUserStats(user: User, year?: string) {
        const userId = user.id;
        // Sin año concreto => discos de todos los años (coherente con el leaderboard del dashboard).
        // Con año => discos publicados ese año, igual que el leaderboard (por fecha de lanzamiento
        // del disco, no por la fecha en la que se emitió el voto).
        const filterYear = year || undefined;

        // 1. Total de votos (rates) sobre discos del año filtrado (o de todos si no hay año)
        const totalVotesQb = this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL');
        if (filterYear) {
            totalVotesQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", { filterYear });
        }
        const totalVotes = await totalVotesQb.getCount();

        // 2. Votos por género - discos del año filtrado (o de todos si no hay año)
        const votesByGenreQb = this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .innerJoin('disc.genre', 'genre')
            .select('genre.name', 'genre')
            .addSelect('COUNT(rate.id)', 'count')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL');
        if (filterYear) {
            votesByGenreQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", { filterYear });
        }
        const votesByGenre = await votesByGenreQb.groupBy('genre.name').getRawMany();

        // Mapear resultados para asegurar formato numérico en count
        const formattedVotesByGenre = votesByGenre.map((item) => ({
            genre: item.genre,
            count: parseInt(item.count, 10),
        }));

        // 3. Votos por mes y semana (en la fecha en la que se emitió el voto), sobre discos del año filtrado
        const votesByMonthQb = this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .select("TO_CHAR(rate.createdAt, 'Month')", 'month')
            .addSelect("EXTRACT(MONTH FROM rate.createdAt)", 'month_num')
            .addSelect("TO_CHAR(rate.createdAt, 'W')", 'week')
            .addSelect('COUNT(rate.id)', 'count')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL');
        if (filterYear) {
            votesByMonthQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", { filterYear });
        }
        const votesByMonthRaw = await votesByMonthQb
            .groupBy('month')
            .addGroupBy('month_num')
            .addGroupBy('week')
            .orderBy('month_num', 'ASC')
            .addOrderBy('week', 'ASC')
            .getRawMany();

        // Agrupar por mes y luego por semana
        const votesByMonthMap = new Map<string, { month: string; count: number; weeks: { week: string; count: number }[] }>();

        votesByMonthRaw.forEach((item) => {
            const month = item.month.trim();
            const count = parseInt(item.count, 10);
            const week = item.week;

            if (!votesByMonthMap.has(month)) {
                votesByMonthMap.set(month, {
                    month,
                    count: 0,
                    weeks: [],
                });
            }

            const monthEntry = votesByMonthMap.get(month);
            monthEntry.count += count;
            monthEntry.weeks.push({
                week: week,
                count: count,
            });
        });

        const formattedVotesByMonth = Array.from(votesByMonthMap.values());

        // 4. Media y Mediana - sobre discos del año filtrado (o de todos si no hay año)
        const statsQb = this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .select('AVG(rate.rate)', 'mean')
            .addSelect('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate.rate)', 'median')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL');
        if (filterYear) {
            statsQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", { filterYear });
        }
        const stats = await statsQb.getRawOne();

        const mean = stats && stats.mean ? parseFloat(stats.mean).toFixed(2) : 0;
        const median = stats && stats.median ? parseFloat(stats.median) : 0;

        // 5. Desglose de votos (0-10) - sobre discos del año filtrado (o de todos si no hay año)
        const votesByScoreQb = this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .select('rate.rate', 'score')
            .addSelect('COUNT(rate.id)', 'count')
            .where('rate.userId = :userId', { userId })
            .andWhere('rate.rate IS NOT NULL');
        if (filterYear) {
            votesByScoreQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", { filterYear });
        }
        const votesByScoreRaw = await votesByScoreQb
            .groupBy('rate.rate')
            .orderBy('rate.rate', 'ASC')
            .getRawMany();

        // Inicializar array con 0s para todos los scores del 0 al 10
        const votesByScore = Array.from({ length: 11 }, (_, i) => ({
            score: i,
            count: 0,
        }));

        // Rellenar con los datos reales
        votesByScoreRaw.forEach((item) => {
            const score = Math.floor(parseFloat(item.score));
            const count = parseInt(item.count, 10);
            if (score >= 0 && score <= 10) {
                votesByScore[score].count += count;
            }
        });

        // 6. Total Usuarios y Ranking
        const totalUsers = await this.userRepository.count();

        // Ranking: Contar cuántos usuarios tienen más votos que el usuario actual sobre el mismo
        // conjunto de discos (año filtrado, o todos si no hay año) - misma lógica que el leaderboard
        const usersWithMoreVotesQb = this.rateRepository
            .createQueryBuilder('rate')
            .innerJoin('rate.disc', 'disc')
            .select('rate.user.id')
            .where('rate.rate IS NOT NULL');
        if (filterYear) {
            usersWithMoreVotesQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", { filterYear });
        }
        const usersWithMoreVotesRaw = await usersWithMoreVotesQb
            .groupBy('rate.user.id')
            .having('COUNT(rate.id) > :totalVotes', { totalVotes })
            .getRawMany();

        const rank = usersWithMoreVotesRaw.length + 1;

        return {
            totalVotes,
            mean,
            median,
            votesByGenre: formattedVotesByGenre,
            votesByMonth: formattedVotesByMonth,
            votesByScore,
            totalUsers,
            rank,
        };
    }
}
