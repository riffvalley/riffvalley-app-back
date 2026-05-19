import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reunion } from './entities/reunion.entity';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { Content } from 'src/contents/entities/content.entity';
import { ContentsService } from 'src/contents/contents.service';

@Injectable()
export class ReunionService {
  constructor(
    @InjectRepository(Reunion)
    private readonly reunionRepository: Repository<Reunion>,
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    @Inject(forwardRef(() => ContentsService))
    private readonly contentsService: ContentsService,
  ) { }

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
    updateData: Partial<Reunion>,
  ): Promise<Reunion> {
    const reunion = await this.findOne(id);
    Object.assign(reunion, updateData);
    return this.reunionRepository.save(reunion);
  }

  async deleteReunion(id: string): Promise<void> {
    // Check if there is associated content
    const content = await this.contentRepository.findOne({ where: { reunionId: id } });

    if (content) {
      // If content exists, remove content (which will cascade remove this reunion)
      await this.contentsService.remove(content.id);
    } else {
      // If no content, just remove reunion
      const result = await this.reunionRepository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Reunion with ID ${id} not found`);
      }
    }
  }
}
