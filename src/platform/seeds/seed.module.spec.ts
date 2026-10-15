import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

describe('SeedModule dependency wiring', () => {
  let moduleRef: TestingModule;
  const userRepository = { name: 'users' };
  const genreRepository = { name: 'genres' };
  const countryRepository = { name: 'countries' };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [SeedModule] })
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepository)
      .overrideProvider(getRepositoryToken(Genre))
      .useValue(genreRepository)
      .overrideProvider(getRepositoryToken(Country))
      .useValue(countryRepository)
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  it('resolves SeedService with the User, Genre, and Country repositories', () => {
    const service = moduleRef.get(SeedService) as any;

    expect(service.userRepository).toBe(userRepository);
    expect(service.genreRepository).toBe(genreRepository);
    expect(service.countryRepository).toBe(countryRepository);
  });
});
