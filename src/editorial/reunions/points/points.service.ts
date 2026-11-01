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
import { ReunionsEventPublisher } from '../realtime/reunions-event-publisher.service';
import {
  pointReference,
  reunionReference,
  ReunionsMutationContext,
  REUNIONS_SYSTEM_ACTOR,
} from '../realtime/contracts/reunions-event.contract';

@Injectable()
export class PointService {
  constructor(
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
    @InjectRepository(Reunion)
    private readonly reunionRepository: Repository<Reunion>,
    private readonly reunionsEventPublisher: ReunionsEventPublisher,
  ) {}

  async createPoint(
    createPointDto: CreatePointDto,
    context?: ReunionsMutationContext,
  ): Promise<Point> {
    const { reunionId, ...data } = createPointDto;

    const reunion = await this.reunionRepository.findOne({
      where: { id: reunionId },
    });
    if (!reunion) {
      throw new NotFoundException(`Reunion with ID ${reunionId} not found`);
    }

    const point = this.pointRepository.create({ ...data, reunion });
    const saved = await this.pointRepository.save(point);
    const mutation = context ?? { actor: REUNIONS_SYSTEM_ACTOR };
    this.reunionsEventPublisher.publishChangeSafely(() => ({
      type: 'reunions.invalidate',
      version: 1,
      reason: 'change',
      action: 'point.created',
      actor: mutation.actor,
      reunion: reunionReference(reunion),
      point: pointReference(saved),
      ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
    }));
    return saved;
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

  async updatePoint(
    id: string,
    updateData: UpdatePointDto,
    context?: ReunionsMutationContext,
  ): Promise<Point> {
    const point = await this.findOne(id);
    const previousReunion = point.reunion;
    const previousDone = point.done;
    const { reunionId, ...pointFields } = updateData;
    let changed =
      (pointFields.titulo !== undefined &&
        point.titulo !== pointFields.titulo) ||
      (pointFields.content !== undefined &&
        point.content !== pointFields.content) ||
      (pointFields.done !== undefined && point.done !== pointFields.done);

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
      if (point.reunion.id !== reunion.id) changed = true;
      point.reunion = reunion;
    }

    Object.assign(point, pointFields);
    const saved = await this.pointRepository.save(point);
    if (changed) {
      const mutation = context ?? { actor: REUNIONS_SYSTEM_ACTOR };
      const moved = previousReunion.id !== saved.reunion.id;
      const doneChanged = previousDone !== saved.done;
      const action = moved
        ? 'point.moved'
        : doneChanged && saved.done === true
          ? 'point.completed'
          : doneChanged && previousDone === true && saved.done !== true
            ? 'point.reopened'
            : 'point.updated';
      this.reunionsEventPublisher.publishChangeSafely(() =>
        action === 'point.moved'
          ? {
              type: 'reunions.invalidate',
              version: 1,
              reason: 'change',
              action,
              actor: mutation.actor,
              previousReunion: reunionReference(previousReunion),
              reunion: reunionReference(saved.reunion),
              point: pointReference(saved),
              ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
            }
          : {
              type: 'reunions.invalidate',
              version: 1,
              reason: 'change',
              action,
              actor: mutation.actor,
              reunion: reunionReference(saved.reunion),
              point: pointReference(saved),
              ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
            },
      );
    }
    return saved;
  }

  async deletePoint(
    id: string,
    context?: ReunionsMutationContext,
  ): Promise<void> {
    const point = await this.findOne(id);
    const result = await this.pointRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }
    const mutation = context ?? { actor: REUNIONS_SYSTEM_ACTOR };
    this.reunionsEventPublisher.publishChangeSafely(() => ({
      type: 'reunions.invalidate',
      version: 1,
      reason: 'change',
      action: 'point.deleted',
      actor: mutation.actor,
      reunion: reunionReference(point.reunion),
      point: pointReference(point),
      ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
    }));
  }
}
