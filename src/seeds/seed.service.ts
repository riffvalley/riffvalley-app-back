import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/auth/entities/user.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { Country } from 'src/countries/entities/country.entity';
import { Achievement } from 'src/achievements/entities/achievement.entity';
import { AchievementMetricType } from 'src/achievements/enums/achievement-metric-type.enum';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
  ) {}

  async createSeed(): Promise<void> {
    await this.seedUsers();
    await this.seedGenres();
    await this.seedCountries();
    await this.seedAchievements();
  }

  private async seedUsers(): Promise<void> {
    const users = [
      {
        email: 'admin@example.com',
        username: 'admin',
        password: await bcrypt.hash('Password123', 10), // Encripta la contraseña
        isActive: true,
        roles: ['user', 'superUser'],
        image: null,
      },
      {
        email: 'user@example.com',
        username: 'user',
        password: await bcrypt.hash('Password123', 10),
        isActive: true,
        roles: ['user'],
        image: null,
      },
    ];

    for (const userData of users) {
      const userExists = await this.userRepository.findOneBy({
        email: userData.email,
      });
      if (!userExists) {
        const user = this.userRepository.create(userData);
        await this.userRepository.save(user);
      }
    }
  }

  private async seedGenres(): Promise<void> {
    const genres = [
      { name: 'Rapcore', color: 'blue' },
      { name: 'Crust', color: 'orange' },
      { name: 'Death Metal', color: 'dimgray' },
      { name: 'Deathcore', color: 'dimgray' },
      { name: 'Melodic Death', color: 'green' },
      { name: 'Hard Rock', color: 'red' },
      { name: 'Tech. Death', color: 'dimgray' },
      { name: 'Prog. Metal', color: 'pink' },
      { name: 'Black Metal', color: 'dimgray' },
      { name: 'Post Metal', color: 'blue' },
      { name: 'Experimental', color: 'silver' },
      { name: 'Crossover', color: 'lightcoral' },
      { name: 'Synthcore', color: 'pink' },
      { name: 'Stoner', color: 'sienna' },
      { name: 'Nu Metal', color: 'blue' },
      { name: 'Grindcore', color: 'dimgray' },
      { name: 'Prog. Rock', color: 'pink' },
      { name: 'Djent', color: 'black' },
      { name: 'Pop Punk', color: 'yellow' },
      { name: 'Rap Metal', color: 'blue' },
      { name: 'Groove Metal', color: 'lightcoral' },
      { name: 'Folk Metal', color: 'green' },
      { name: 'Glam Metal', color: 'red' },
      { name: 'Alt. Metal', color: 'silver' },
      { name: 'Avant', color: 'silver' },
      { name: 'Mathcore', color: 'orange' },
      { name: '?', color: 'silver' },
      { name: 'Alt. Rock', color: 'red' },
      { name: 'Blackened Death', color: 'dimgray' },
      { name: 'Black Prog.', color: 'silver' },
      { name: 'Noise Rock', color: 'silver' },
      { name: 'Goth Metal', color: 'green' },
      { name: 'Metalcore', color: 'pink' },
      { name: 'Death Prog.', color: 'dimgray' },
      { name: 'Punk Rock', color: 'yellow' },
      { name: 'Post-Hardcore', color: 'pink' },
      { name: 'Post Rock', color: 'pink' },
      { name: 'Industrial', color: 'silver' },
      { name: 'Pop Rock', color: 'red' },
    ];

    for (const genre of genres) {
      const genreExists = await this.genreRepository.findOneBy({
        name: genre.name,
      });
      if (!genreExists) {
        const newGenre = this.genreRepository.create(genre);
        await this.genreRepository.save(newGenre);
      }
    }
  }

  private async seedCountries(): Promise<void> {
    const countries = [
      { name: 'sin_pais' },
      { name: 'Argentina' },
      { name: 'Brazil' },
      { name: 'Mexico' },
      { name: 'España' },
    ];

    for (const country of countries) {
      const countryExists = await this.countryRepository.findOneBy({
        name: country.name,
      });
      if (!countryExists) {
        const newCountry = this.countryRepository.create(country);
        await this.countryRepository.save(newCountry);
      }
    }
  }

  private async seedAchievements(): Promise<void> {
    // Búsqueda case-insensitive (el nombre real en BD puede diferir en
    // mayúsculas del literal sembrado en seedGenres, visto en un dev DB real:
    // "Black metal") y, si hay varias filas duplicadas por esa razón, nos
    // quedamos con la que realmente tiene discos asociados.
    const blackMetal = await this.genreRepository
      .createQueryBuilder('genre')
      .leftJoin('genre.disc', 'disc')
      .where('genre.name ILIKE :name', { name: 'Black Metal' })
      .groupBy('genre.id')
      .orderBy('COUNT(disc.id)', 'DESC')
      .getOne();

    const achievements = [
      {
        code: 'STREAK_7_DAYS',
        name: 'Racha de una semana',
        description:
          'Vota al menos un disco nuevo durante 7 días consecutivos.',
        metricType: AchievementMetricType.VOTE_STREAK,
        criteria: { minDays: 7, mode: 'current' as const },
        genre: null,
        points: 50,
      },
      {
        code: 'STREAK_30_DAYS_EVER',
        name: 'Racha de un mes',
        description:
          'Alcanza alguna vez una racha de 30 días consecutivos votando.',
        metricType: AchievementMetricType.VOTE_STREAK,
        criteria: { minDays: 30, mode: 'ever' as const },
        genre: null,
        points: 200,
      },
      {
        code: 'COUNTRIES_10',
        name: 'Turista sonoro',
        description: 'Vota discos de 10 países distintos.',
        metricType: AchievementMetricType.DISTINCT_COUNTRIES,
        criteria: { minCount: 10 },
        genre: null,
        points: 40,
      },
      {
        code: 'TOTAL_VOTES_100',
        name: 'Votante constante',
        description: 'Alcanza 100 votos.',
        metricType: AchievementMetricType.TOTAL_VOTES,
        criteria: { minCount: 100 },
        genre: null,
        points: 60,
      },
      {
        code: 'CONTROVERSIAL_VOTER',
        name: '???',
        description:
          'Vota un disco muy por encima o por debajo de la media de la comunidad.',
        metricType: AchievementMetricType.CONTROVERSIAL_DISC_VOTE,
        criteria: { minAbsDeviation: 1.5, minCommunityVotes: 5 },
        genre: null,
        points: 25,
        secret: true,
      },
      ...(blackMetal
        ? [
            {
              code: 'BLACK_METAL_5',
              name: 'Iniciado del Black Metal',
              description: 'Vota discos de 5 bandas distintas de Black Metal.',
              metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
              criteria: { minCount: 5 },
              genre: blackMetal,
              points: 30,
            },
            {
              code: 'BLACK_METAL_25',
              name: 'Adepto del Black Metal',
              description: 'Vota discos de 25 bandas distintas de Black Metal.',
              metricType: AchievementMetricType.DISTINCT_ARTISTS_IN_GENRE,
              criteria: { minCount: 25 },
              genre: blackMetal,
              points: 100,
            },
          ]
        : []),
    ];

    for (const achievementData of achievements) {
      const achievementExists = await this.achievementRepository.findOneBy({
        code: achievementData.code,
      });
      if (!achievementExists) {
        const newAchievement =
          this.achievementRepository.create(achievementData);
        await this.achievementRepository.save(newAchievement);
      }
    }
  }
}
