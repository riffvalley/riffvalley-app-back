import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/auth/entities/user.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  async createSeed(): Promise<void> {
    await this.seedUsers();
    await this.seedGenres();
    await this.seedCountries();
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
}
