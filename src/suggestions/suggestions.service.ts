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

  private async getCounts(filters: { type?: SuggestionType; userId?: string }) {
    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'count');
    if (filters.type) qb.where('s.type = :type', { type: filters.type });
    if (filters.userId) qb.andWhere('s.userId = :userId', { userId: filters.userId });
    const rows = await qb.groupBy('s.status').getRawMany();
    return {
      in_progress: 0,
      done: 0,
      rejected: 0,
      ...Object.fromEntries(rows.map((r) => [r.status, parseInt(r.count, 10)])),
    };
  }

  async findAll(filters: { type?: SuggestionType; status?: SuggestionStatus }) {
    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    const [data, counts] = await Promise.all([
      this.repo.find({ where, relations: ['versionItem'], order: { createdAt: 'DESC' } }),
      this.getCounts({ type: filters.type }),
    ]);
    return { data, counts };
  }

  async findByUser(user: User, filters: { type?: SuggestionType; status?: SuggestionStatus }) {
    const where: any = { userId: user.id };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    const [data, counts] = await Promise.all([
      this.repo.find({ where, relations: ['versionItem'], order: { createdAt: 'DESC' } }),
      this.getCounts({ type: filters.type, userId: user.id }),
    ]);
    return { data, counts };
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
