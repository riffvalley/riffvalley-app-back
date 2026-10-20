import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Point } from './entities/point.entity';
import { CreatePointDto } from './dto/create-points.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';

@Injectable()
export class PointService {
  constructor(
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
    @InjectRepository(Reunion)
    private readonly reunionRepository: Repository<Reunion>,
  ) {}

  async createPoint(createPointDto: CreatePointDto): Promise<Point> {
    const { reunionId, ...data } = createPointDto;

    const reunion = await this.reunionRepository.findOne({
      where: { id: reunionId },
    });
    if (!reunion) {
      throw new NotFoundException(`Reunion with ID ${reunionId} not found`);
    }

    const point = this.pointRepository.create({ ...data, reunion });
    return this.pointRepository.save(point);
  }

  async findAll(): Promise<Point[]> {
    return this.pointRepository.find({ relations: ['reunion'] }); // Incluir la relación con Reunion
  }

  async findOne(id: string): Promise<Point> {
    const point = await this.pointRepository.findOne({
      where: { id },
      relations: ['reunion'],
    });
    if (!point) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }
    return point;
  }

  async updatePoint(id: string, updateData: UpdatePointDto): Promise<Point> {
    const point = await this.findOne(id);
    const { reunionId, ...pointFields } = updateData;

    if (reunionId !== undefined) {
      if (reunionId === null) {
        throw new BadRequestException('reunionId must be a UUID v4');
      }

      const reunion = await this.reunionRepository.findOne({
        where: { id: reunionId },
      });
      if (!reunion) {
        throw new NotFoundException(`Reunion with ID ${reunionId} not found`);
      }
      point.reunion = reunion;
    }

    Object.assign(point, pointFields);
    return this.pointRepository.save(point);
  }

  async deletePoint(id: string): Promise<void> {
    const result = await this.pointRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }
  }
}
