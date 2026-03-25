import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NationalRelease } from './entities/national-release.entity';
import { CreateNationalReleaseDto } from './dto/create-national-release.dto';
import { UpdateNationalReleaseDto } from './dto/update-national-release.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NationalReleasesService {
  constructor(
    @InjectRepository(NationalRelease)
    private readonly repo: Repository<NationalRelease>,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateNationalReleaseDto): Promise<NationalRelease> {
    const release = await this.repo.save(this.repo.create(dto));
    await this.mailService.sendNationalReleaseNotification(dto);
    return release;
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

  async findAllAdmin(month?: number, year?: number, approved?: boolean): Promise<{ data: NationalRelease[]; pendingMonths: number[] }> {
    const currentYear = year ?? new Date().getFullYear();

    const dataQb = this.repo.createQueryBuilder('r');
    if (year)  dataQb.andWhere('EXTRACT(YEAR  FROM r.releaseDay) = :year',  { year });
    if (month) dataQb.andWhere('EXTRACT(MONTH FROM r.releaseDay) = :month', { month });
    if (approved !== undefined) dataQb.andWhere('r.approved = :approved', { approved });
    dataQb.orderBy('r.releaseDay', 'ASC');

    const pendingQb = this.repo.createQueryBuilder('r')
      .select('DISTINCT EXTRACT(MONTH FROM r.releaseDay)::int', 'month')
      .where('r.approved = false')
      .andWhere('EXTRACT(YEAR FROM r.releaseDay) = :currentYear', { currentYear });

    const queries: [Promise<NationalRelease[]>, Promise<any[]>] = [
      dataQb.getMany(),
      approved === false ? Promise.resolve([]) : pendingQb.getRawMany(),
    ];

    const [data, pendingRows] = await Promise.all(queries);

    const result: any = { data };
    if (approved !== false) result.pendingMonths = pendingRows.map((r) => r.month);

    return result;
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
