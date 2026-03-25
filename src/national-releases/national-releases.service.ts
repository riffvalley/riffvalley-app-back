import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NationalRelease, DiscType } from './entities/national-release.entity';
import { CreateNationalReleaseDto } from './dto/create-national-release.dto';
import { UpdateNationalReleaseDto } from './dto/update-national-release.dto';
import { LinkDiscDto } from './dto/link-disc.dto';
import { MailService } from '../mail/mail.service';
import { Disc } from '../discs/entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';
import { Genre } from '../genres/entities/genre.entity';

@Injectable()
export class NationalReleasesService {
  constructor(
    @InjectRepository(NationalRelease)
    private readonly repo: Repository<NationalRelease>,
    @InjectRepository(Disc)
    private readonly discRepo: Repository<Disc>,
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
    const qb = this.repo.createQueryBuilder('r')
      .leftJoinAndSelect('r.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'discArtist')
      .leftJoinAndSelect('disc.genre', 'discGenre')
      .where('r.approved = true');

    if (year) qb.andWhere('EXTRACT(YEAR FROM r.releaseDay) = :year', { year });
    if (month) qb.andWhere('EXTRACT(MONTH FROM r.releaseDay) = :month', { month });

    return qb.orderBy('r.releaseDay', 'ASC').getMany();
  }

  async findAllAdmin(month?: number, year?: number, approved?: boolean): Promise<{ data: any[]; pendingMonths: number[] }> {
    const currentYear = year ?? new Date().getFullYear();

    const dataQb = this.repo.createQueryBuilder('r')
      .leftJoinAndSelect('r.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'discArtist')
      .leftJoinAndSelect('disc.genre', 'discGenre');
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

    const [releases, pendingRows] = await Promise.all(queries);

    // Buscar sugerencias de disco para lanzamientos de tipo album/ep sin vincular
    const unlinked = releases.filter(
      (r) => !r.discId && (r.discType === DiscType.ALBUM || r.discType === DiscType.EP),
    );

    const suggestions = await Promise.all(
      unlinked.map((r) =>
        this.discRepo
          .createQueryBuilder('disc')
          .leftJoinAndSelect('disc.artist', 'artist')
          .leftJoinAndSelect('disc.genre', 'genre')
          .where('LOWER(disc.name) = LOWER(:name)', { name: r.discName })
          .andWhere('LOWER(artist.name) = LOWER(:artistName)', { artistName: r.artistName })
          .getOne()
          .then((disc) => ({ id: r.id, disc })),
      ),
    );

    const suggestionMap = new Map(suggestions.map((s) => [s.id, s.disc]));

    const data = releases.map((r) => ({
      ...r,
      suggestedDisc: !r.discId ? (suggestionMap.get(r.id) ?? null) : null,
    }));

    const result: any = { data };
    if (approved !== false) result.pendingMonths = pendingRows.map((r) => r.month);

    return result;
  }

  async linkDisc(id: string, dto: LinkDiscDto): Promise<NationalRelease> {
    const release = await this.repo.findOne({ where: { id }, relations: ['disc'] });
    if (!release) throw new NotFoundException(`NationalRelease ${id} not found`);

    let disc: Disc;

    if (dto.discId) {
      const found = await this.discRepo.findOne({ where: { id: dto.discId }, relations: ['artist', 'genre'] });
      if (!found) throw new NotFoundException(`Disc ${dto.discId} not found`);
      disc = found;
    } else if (dto.name) {
      const newDisc = this.discRepo.create({
        name: dto.name,
        ...(dto.artistId && { artist: { id: dto.artistId } as Artist }),
        ...(dto.genreId && { genre: { id: dto.genreId } as Genre }),
        ...(dto.releaseDate && { releaseDate: new Date(dto.releaseDate) }),
        ep: dto.ep,
        debut: dto.debut,
        link: dto.link,
        image: dto.image,
      });
      disc = await this.discRepo.save(newDisc);
    } else {
      throw new BadRequestException('Provide discId to link an existing disc, or name to create a new one');
    }

    release.disc = disc;
    return this.repo.save(release);
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
