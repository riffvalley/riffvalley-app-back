import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reunion } from './entities/reunion.entity';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { ContentCalendarMutationContext } from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';

@Injectable()
export class ReunionService {
  constructor(
    @InjectRepository(Reunion)
    private readonly reunionRepository: Repository<Reunion>,
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly contentsService: ContentsService,
  ) {}

  async createReunion(createReunionDto: CreateReunionDto): Promise<Reunion> {
    const reunion = this.reunionRepository.create(createReunionDto);
    return this.reunionRepository.save(reunion);
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
  ): Promise<Reunion> {
    const reunion = await this.findOne(id);
    Object.assign(reunion, updateData);
    return this.reunionRepository.save(reunion);
  }

  async deleteReunion(
    id: string,
    context?: ContentCalendarMutationContext,
  ): Promise<void> {
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
    }
  }
}
