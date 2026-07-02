import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Location } from './entities/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger('LocationsService');

  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly httpService: HttpService,
  ) {}

  async create(dto: CreateLocationDto) {
    try {
      const coords = await this.resolveCoords(dto);
      const location = this.locationRepository.create({ ...dto, ...coords });
      return await this.locationRepository.save(location);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll() {
    return this.locationRepository.find({ relations: ['country'] });
  }

  async findOne(id: string) {
    const location = await this.locationRepository.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!location) throw new NotFoundException(`Location with id ${id} not found`);
    return location;
  }

  async update(id: string, dto: UpdateLocationDto) {
    const location = await this.locationRepository.preload({ id, ...dto });
    if (!location) throw new NotFoundException(`Location with id ${id} not found`);

    if (dto.latitude === undefined && dto.longitude === undefined) {
      const coords = await this.resolveCoords({ ...location, ...dto });
      location.latitude = coords.latitude ?? location.latitude;
      location.longitude = coords.longitude ?? location.longitude;
    }

    try {
      return await this.locationRepository.save(location);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async geocode(id: string) {
    const location = await this.findOne(id);
    const coords = await this.geocodeQuery(location.name, location.city);
    if (!coords) throw new NotFoundException('No geocoding results found for this location');
    location.latitude = coords.latitude;
    location.longitude = coords.longitude;
    return this.locationRepository.save(location);
  }

  async remove(id: string) {
    const location = await this.findOne(id);
    return this.locationRepository.remove(location);
  }

  // Only calls Nominatim if lat/lng are not already provided
  private async resolveCoords(
    dto: Partial<CreateLocationDto>,
  ): Promise<{ latitude?: number; longitude?: number }> {
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      return { latitude: dto.latitude, longitude: dto.longitude };
    }
    const result = await this.geocodeQuery(dto.name, dto.city);
    return result ?? {};
  }

  private async geocodeQuery(
    name: string,
    city: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const query = [name, city].filter(Boolean).join(', ');
    try {
      const response = await firstValueFrom(
        this.httpService.get('https://nominatim.openstreetmap.org/search', {
          params: { q: query, format: 'json', limit: 1 },
          headers: { 'User-Agent': 'SpamMusic/1.0 (tottiesp@gmail.com)' },
        }),
      );
      const [result] = response.data;
      if (!result) return null;
      return { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) };
    } catch (error) {
      this.logger.warn(`Nominatim geocoding failed for "${query}": ${error.message}`);
      return null;
    }
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('Database error', error);
  }
}
