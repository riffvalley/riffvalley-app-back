import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Localizacion } from './entities/localizacion.entity';
import { CreateLocalizacionDto } from './dto/create-localizacion.dto';
import { UpdateLocalizacionDto } from './dto/update-localizacion.dto';

@Injectable()
export class LocalizacionesService {
  private readonly logger = new Logger('LocalizacionesService');

  constructor(
    @InjectRepository(Localizacion)
    private readonly localizacionRepository: Repository<Localizacion>,
  ) {}

  async create(dto: CreateLocalizacionDto) {
    try {
      const localizacion = this.localizacionRepository.create(dto);
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
    try {
      return await this.localizacionRepository.save(localizacion);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const localizacion = await this.findOne(id);
    return this.localizacionRepository.remove(localizacion);
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('Database error', error);
  }
}
