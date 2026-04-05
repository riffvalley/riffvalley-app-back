import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Suggestion, SuggestionStatus, SuggestionType } from './entities/suggestion.entity';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { UpdateSuggestionDto, RejectSuggestionDto, DoneSuggestionDto } from './dto/update-suggestion.dto';
import { User } from '../auth/entities/user.entity';
import { VersionItem } from '../versions/entities/version-item.entity';

@Injectable()
export class SuggestionsService {
  constructor(
    @InjectRepository(Suggestion)
    private readonly repo: Repository<Suggestion>,
    @InjectRepository(VersionItem)
    private readonly versionItemRepo: Repository<VersionItem>,
  ) {}

  async create(dto: CreateSuggestionDto, user: User): Promise<Suggestion> {
    const suggestion = this.repo.create({ ...dto, user });
    return this.repo.save(suggestion);
  }

  findAll(filters: { type?: SuggestionType; status?: SuggestionStatus }): Promise<Suggestion[]> {
    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    return this.repo.find({
      where,
      relations: ['versionItem'],
      order: { createdAt: 'DESC' },
    });
  }

  findByUser(user: User, filters: { type?: SuggestionType; status?: SuggestionStatus }): Promise<Suggestion[]> {
    const where: any = { userId: user.id };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    return this.repo.find({
      where,
      relations: ['versionItem'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Suggestion> {
    const suggestion = await this.repo.findOne({
      where: { id },
      relations: ['versionItem'],
    });
    if (!suggestion) throw new NotFoundException(`Suggestion ${id} not found`);
    return suggestion;
  }

  async update(id: string, dto: UpdateSuggestionDto): Promise<Suggestion> {
    const suggestion = await this.findOne(id);
    Object.assign(suggestion, dto);
    return this.repo.save(suggestion);
  }

  async setInProgress(id: string): Promise<Suggestion> {
    const suggestion = await this.findOne(id);
    if (suggestion.status === SuggestionStatus.DONE) {
      throw new BadRequestException('No se puede cambiar a en progreso una sugerencia ya realizada');
    }
    suggestion.status = SuggestionStatus.IN_PROGRESS;
    suggestion.rejectionReason = null;
    return this.repo.save(suggestion);
  }

  async reject(id: string, dto: RejectSuggestionDto): Promise<Suggestion> {
    const suggestion = await this.findOne(id);
    if (suggestion.status === SuggestionStatus.DONE) {
      throw new BadRequestException('No se puede rechazar una sugerencia ya realizada');
    }
    suggestion.status = SuggestionStatus.REJECTED;
    suggestion.rejectionReason = dto.rejectionReason;
    return this.repo.save(suggestion);
  }

  async markDone(id: string, dto: DoneSuggestionDto): Promise<Suggestion> {
    const suggestion = await this.findOne(id);

    const versionItem = await this.versionItemRepo.findOneBy({ id: dto.versionItemId });
    if (!versionItem) {
      throw new NotFoundException(`VersionItem ${dto.versionItemId} not found`);
    }

    suggestion.status = SuggestionStatus.DONE;
    suggestion.versionItem = versionItem;
    suggestion.rejectionReason = null;
    return this.repo.save(suggestion);
  }

  async remove(id: string): Promise<void> {
    const suggestion = await this.findOne(id);
    await this.repo.remove(suggestion);
  }
}
