import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reunion } from './entities/reunion.entity';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { ReunionsEventPublisher } from './realtime/reunions-event-publisher.service';
import {
  reunionReference,
  ReunionsMutationContext,
  REUNIONS_SYSTEM_ACTOR,
} from './realtime/contracts/reunions-event.contract';

@Injectable()
export class ReunionService {
  constructor(
    @InjectRepository(Reunion)
    private readonly reunionRepository: Repository<Reunion>,
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly contentsService: ContentsService,
    private readonly reunionsEventPublisher: ReunionsEventPublisher,
  ) {}

  async createReunion(
    createReunionDto: CreateReunionDto,
    context?: ReunionsMutationContext,
  ): Promise<Reunion> {
    const reunion = this.reunionRepository.create(createReunionDto);
    const saved = await this.reunionRepository.save(reunion);
    const mutation = context ?? { actor: REUNIONS_SYSTEM_ACTOR };
    this.reunionsEventPublisher.publishChangeSafely(() => ({
      type: 'reunions.invalidate',
      version: 1,
      reason: 'change',
      action: 'reunion.created',
      actor: mutation.actor,
      reunion: reunionReference(saved),
      ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
    }));
    return saved;
  }

  async findAll(): Promise<Reunion[]> {
    return this.reunionRepository.find({
      relations: ['points'], // Incluir los puntos relacionados
      order: { fecha: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Reunion> {
    const reunion = await this.reunionRepository.findOne({
      where: { id },
      relations: ['points'],
    });
    if (!reunion) {
      throw new NotFoundException(`Reunion with ID ${id} not found`);
    }
    return reunion;
  }

  async updateReunion(
    id: string,
    updateData: UpdateReunionDto,
    context?: ReunionsMutationContext,
  ): Promise<Reunion> {
    const reunion = await this.findOne(id);
    const changed =
      (updateData.titulo !== undefined &&
        reunion.titulo !== updateData.titulo) ||
      (updateData.description !== undefined &&
        reunion.description !== updateData.description) ||
      (updateData.fecha !== undefined &&
        reunion.fecha.getTime() !== updateData.fecha.getTime());
    Object.assign(reunion, updateData);
    const saved = await this.reunionRepository.save(reunion);
    if (changed) {
      const mutation = context ?? { actor: REUNIONS_SYSTEM_ACTOR };
      this.reunionsEventPublisher.publishChangeSafely(() => ({
        type: 'reunions.invalidate',
        version: 1,
        reason: 'change',
        action: 'reunion.updated',
        actor: mutation.actor,
        reunion: reunionReference(saved),
        ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
      }));
    }
    return saved;
  }

  async deleteReunion(
    id: string,
    context?: ReunionsMutationContext,
  ): Promise<void> {
    const reunion = await this.findOne(id);
    // Check if there is associated content
    const content = await this.contentRepository.findOne({
      where: { reunionId: id },
    });

    if (content) {
      // If content exists, remove content (which will cascade remove this reunion)
      if (context) await this.contentsService.remove(content.id, context);
      else await this.contentsService.remove(content.id);
    } else {
      // If no content, just remove reunion
      const result = await this.reunionRepository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Reunion with ID ${id} not found`);
      }
      const mutation = context ?? { actor: REUNIONS_SYSTEM_ACTOR };
      this.reunionsEventPublisher.publishChangeSafely(() => ({
        type: 'reunions.invalidate',
        version: 1,
        reason: 'change',
        action: 'reunion.deleted',
        actor: mutation.actor,
        reunion: reunionReference(reunion),
        ...(mutation.sourceId ? { sourceId: mutation.sourceId } : {}),
      }));
    }
  }
}
