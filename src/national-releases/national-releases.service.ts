import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NationalRelease } from './entities/national-release.entity';
import { CreateNationalReleaseDto } from './dto/create-national-release.dto';
import { UpdateNationalReleaseDto } from './dto/update-national-release.dto';

@Injectable()
export class NationalReleasesService {
  constructor(
    @InjectRepository(NationalRelease)
    private readonly repo: Repository<NationalRelease>,
  ) {}

  create(dto: CreateNationalReleaseDto): Promise<NationalRelease> {
    return this.repo.save(this.repo.create(dto));
  }

  createMany(dtos: CreateNationalReleaseDto[]): Promise<NationalRelease[]> {
    return this.repo.save(this.repo.create(dtos));
  }

  findAll(month?: number, year?: number): Promise<NationalRelease[]> {
    const qb = this.repo.createQueryBuilder('r').where('r.approved = true');

    if (year) qb.andWhere('EXTRACT(YEAR FROM r.releaseDay) = :year', { year });
    if (month) qb.andWhere('EXTRACT(MONTH FROM r.releaseDay) = :month', { month });

    return qb.orderBy('r.releaseDay', 'ASC').getMany();
  }

  async findOne(id: string): Promise<NationalRelease> {
    const release = await this.repo.findOneBy({ id });
    if (!release) throw new NotFoundException(`NationalRelease ${id} not found`);
    return release;
  }

  async update(id: string, dto: UpdateNationalReleaseDto): Promise<NationalRelease> {
    const release = await this.findOne(id);
    Object.assign(release, dto);
    return this.repo.save(release);
  }

  async remove(id: string): Promise<void> {
    const release = await this.findOne(id);
    await this.repo.remove(release);
  }
}
