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
import { Localizacion } from './entities/localizacion.entity';
import { CreateLocalizacionDto } from './dto/create-localizacion.dto';
import { UpdateLocalizacionDto } from './dto/update-localizacion.dto';

@Injectable()
export class LocalizacionesService {
  private readonly logger = new Logger('LocalizacionesService');

  constructor(
    @InjectRepository(Localizacion)
    private readonly localizacionRepository: Repository<Localizacion>,
    private readonly httpService: HttpService,
  ) {}

  async create(dto: CreateLocalizacionDto) {
    try {
      const coords = await this.resolveCoords(dto);
      const localizacion = this.localizacionRepository.create({ ...dto, ...coords });
      return await this.localizacionRepository.save(localizacion);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll() {
    return this.localizacionRepository.find({ relations: ['country'] });
  }

  async findOne(id: string) {
    const localizacion = await this.localizacionRepository.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!localizacion) throw new NotFoundException(`Localizacion with id ${id} not found`);
    return localizacion;
  }

  async update(id: string, dto: UpdateLocalizacionDto) {
    const localizacion = await this.localizacionRepository.preload({ id, ...dto });
    if (!localizacion) throw new NotFoundException(`Localizacion with id ${id} not found`);

    if (dto.latitude === undefined && dto.longitude === undefined) {
      const coords = await this.resolveCoords({ ...localizacion, ...dto });
      localizacion.latitude = coords.latitude ?? localizacion.latitude;
      localizacion.longitude = coords.longitude ?? localizacion.longitude;
    }

    try {
      return await this.localizacionRepository.save(localizacion);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async geocode(id: string) {
    const localizacion = await this.findOne(id);
    const coords = await this.geocodeQuery(localizacion.name, localizacion.city);
    if (!coords) throw new NotFoundException('No geocoding results found for this location');
    localizacion.latitude = coords.latitude;
    localizacion.longitude = coords.longitude;
    return this.localizacionRepository.save(localizacion);
  }

  async remove(id: string) {
    const localizacion = await this.findOne(id);
    return this.localizacionRepository.remove(localizacion);
  }

  // Only calls Nominatim if lat/lng are not already provided
  private async resolveCoords(
    dto: Partial<CreateLocalizacionDto>,
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
