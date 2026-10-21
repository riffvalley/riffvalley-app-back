import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { NationalRelease, DiscType } from './entities/national-release.entity';
import { CreateNationalReleaseDto } from './dto/create-national-release.dto';
import { UpdateNationalReleaseDto } from './dto/update-national-release.dto';
import { hasExactlyOneLinkDiscOption, LinkDiscDto } from './dto/link-disc.dto';
import { CreateNationalReleaseFromDiscDto } from './dto/create-national-release-from-disc.dto';
import { MailService } from '../../communications/mail/mail.service';
import { Disc } from '../../catalog/discs/entities/disc.entity';

interface SuggestedDiscCandidate {
  releaseId: string;
  discId: string | null;
}

interface PendingMonthRow {
  month: number;
}

export type NationalReleaseAdminItem = NationalRelease & {
  suggestedDisc: Disc | null;
};

export interface NationalReleaseAdminResult {
  data: NationalReleaseAdminItem[];
  pendingMonths?: number[];
}

function isSuggestedDiscCandidate(
  value: unknown,
): value is SuggestedDiscCandidate {
  return (
    typeof value === 'object' &&
    value !== null &&
    'releaseId' in value &&
    typeof value.releaseId === 'string' &&
    'discId' in value &&
    (typeof value.discId === 'string' || value.discId === null)
  );
}

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
    await this.checkDuplicate(dto.artistName, dto.discName, dto.discType);
    const release = await this.repo.save(this.repo.create(dto));
    await this.mailService.sendNationalReleaseNotification(dto);
    return release;
  }

  async createMany(
    dtos: CreateNationalReleaseDto[],
  ): Promise<NationalRelease[]> {
    // Check duplicates within the batch
    const seen = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.artistName.toLowerCase()}|${dto.discName.toLowerCase()}|${dto.discType}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Novedad duplicada en el lote: ${dto.artistName} – ${dto.discName}`,
        );
      }
      seen.add(key);
    }

    // Check duplicates against existing DB records in a single query
    if (dtos.length > 0) {
      const qb = this.repo.createQueryBuilder('r');
      dtos.forEach((dto, i) => {
        const condition = `(LOWER(r.artistName) = LOWER(:artist${i}) AND LOWER(r.discName) = LOWER(:disc${i}) AND r.discType = :discType${i})`;
        const params = {
          [`artist${i}`]: dto.artistName,
          [`disc${i}`]: dto.discName,
          [`discType${i}`]: dto.discType,
        };
        i === 0 ? qb.where(condition, params) : qb.orWhere(condition, params);
      });
      const conflicts = await qb.getMany();
      if (conflicts.length > 0) {
        const names = conflicts
          .map((c) => `${c.artistName} – ${c.discName}`)
          .join(', ');
        throw new BadRequestException(`Novedades duplicadas: ${names}`);
      }
    }

    return this.repo.save(this.repo.create(dtos));
  }

  findAll(month?: number, year?: number): Promise<NationalRelease[]> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'discArtist')
      .leftJoinAndSelect('disc.genre', 'discGenre')
      .where('r.approved = true');

    if (year) qb.andWhere('EXTRACT(YEAR FROM r.releaseDay) = :year', { year });
    if (month)
      qb.andWhere('EXTRACT(MONTH FROM r.releaseDay) = :month', { month });

    return qb.orderBy('r.releaseDay', 'ASC').getMany();
  }

  // Igual que findAll pero recortado a los campos esenciales, sin metadata
  // interna (needsReview, verified, pinned, timestamps...), para consumo
  // público sin autenticar.
  async findAllPublic(month?: number, year?: number) {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'discArtist')
      .leftJoinAndSelect('disc.genre', 'discGenre')
      .where('r.approved = true');

    if (year) qb.andWhere('EXTRACT(YEAR FROM r.releaseDay) = :year', { year });
    if (month)
      qb.andWhere('EXTRACT(MONTH FROM r.releaseDay) = :month', { month });

    const releases = await qb.orderBy('r.releaseDay', 'ASC').getMany();

    return releases.map((r) => ({
      id: r.id,
      artistName: r.artistName,
      discName: r.discName,
      discType: r.discType,
      genre: r.genre,
      releaseDay: r.releaseDay,
      link: r.link,
      discId: r.discId,
      disc: r.disc
        ? {
            id: r.disc.id,
            name: r.disc.name,
            image: r.disc.image,
            releaseDate: r.disc.releaseDate,
            link: r.disc.link,
            genre: r.disc.genre
              ? {
                  id: r.disc.genre.id,
                  name: r.disc.genre.name,
                  color: r.disc.genre.color,
                }
              : null,
            artist: r.disc.artist
              ? {
                  id: r.disc.artist.id,
                  name: r.disc.artist.name,
                  image: r.disc.artist.image,
                }
              : null,
          }
        : null,
    }));
  }

  async findAllAdmin(
    month?: number,
    year?: number,
    approved?: boolean,
  ): Promise<NationalReleaseAdminResult> {
    const currentYear = year ?? new Date().getFullYear();

    const dataQb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'discArtist')
      .leftJoinAndSelect('disc.genre', 'discGenre');
    if (year)
      dataQb.andWhere('EXTRACT(YEAR  FROM r.releaseDay) = :year', { year });
    if (month)
      dataQb.andWhere('EXTRACT(MONTH FROM r.releaseDay) = :month', { month });
    if (approved !== undefined)
      dataQb.andWhere('r.approved = :approved', { approved });
    dataQb.orderBy('r.releaseDay', 'ASC');

    const pendingQb = this.repo
      .createQueryBuilder('r')
      .select('DISTINCT EXTRACT(MONTH FROM r.releaseDay)::int', 'month')
      .where('r.approved = false')
      .andWhere('EXTRACT(YEAR FROM r.releaseDay) = :currentYear', {
        currentYear,
      });

    const queries: [Promise<NationalRelease[]>, Promise<PendingMonthRow[]>] = [
      dataQb.getMany(),
      approved === false
        ? Promise.resolve([])
        : pendingQb.getRawMany<PendingMonthRow>(),
    ];

    const [releases, pendingRows] = await Promise.all(queries);

    // Buscar sugerencias de disco para lanzamientos de tipo album/ep sin vincular
    const unlinked = releases.filter(
      (r) =>
        !r.discId &&
        (r.discType === DiscType.ALBUM || r.discType === DiscType.EP),
    );

    const suggestionMap = await this.findSuggestedDiscs(unlinked);

    const data = releases.map((r) => ({
      ...r,
      suggestedDisc: !r.discId ? (suggestionMap.get(r.id) ?? null) : null,
    }));

    const result: NationalReleaseAdminResult = { data };
    if (approved !== false)
      result.pendingMonths = pendingRows.map((r) => r.month);

    return result;
  }

  private async findSuggestedDiscs(
    releases: NationalRelease[],
  ): Promise<Map<string, Disc | null>> {
    if (releases.length === 0) return new Map();

    // Keep the original per-release LIMIT 1 selection semantics while sending
    // all lookups in one round trip. There is intentionally no ORDER BY here:
    // the old getOne() query did not define a priority among duplicate matches.
    const rawRows: unknown = await this.discRepo.query(
      `
        SELECT requested."releaseId" AS "releaseId", candidate.id AS "discId"
        FROM unnest($1::uuid[], $2::varchar[], $3::varchar[])
          AS requested("releaseId", "discName", "artistName")
        LEFT JOIN LATERAL (
          SELECT disc.id
          FROM "disc" AS disc
          LEFT JOIN "artist" AS artist ON artist.id = disc."artistId"
          WHERE LOWER(disc.name) = LOWER(requested."discName")
            AND LOWER(artist.name) = LOWER(requested."artistName")
          LIMIT 1
        ) AS candidate ON TRUE
      `,
      [
        releases.map((release) => release.id),
        releases.map((release) => release.discName),
        releases.map((release) => release.artistName),
      ],
    );

    if (!Array.isArray(rawRows) || !rawRows.every(isSuggestedDiscCandidate)) {
      throw new Error('Unexpected result while loading Disc suggestions');
    }

    const rows = rawRows;
    const discIds = [...new Set(rows.flatMap((row) => row.discId ?? []))];
    const discs =
      discIds.length === 0
        ? []
        : await this.discRepo
            .createQueryBuilder('disc')
            .leftJoinAndSelect('disc.artist', 'artist')
            .leftJoinAndSelect('disc.genre', 'genre')
            .where('disc.id IN (:...discIds)', { discIds })
            .getMany();
    const discsById = new Map(discs.map((disc) => [disc.id, disc]));

    return new Map(
      rows.map((row) => [
        row.releaseId,
        row.discId ? (discsById.get(row.discId) ?? null) : null,
      ]),
    );
  }

  async createFromDisc(
    dto: CreateNationalReleaseFromDiscDto,
  ): Promise<NationalRelease> {
    const disc = await this.discRepo.findOne({
      where: { id: dto.discId },
      relations: ['artist', 'genre'],
    });
    if (!disc) throw new NotFoundException(`Disc ${dto.discId} not found`);

    const discType = dto.discType ?? (disc.ep ? DiscType.EP : DiscType.ALBUM);
    await this.checkDuplicate(disc.artist?.name ?? '', disc.name, discType);
    const genre = dto.genre ?? disc.genre?.name ?? '';

    const release = this.repo.create({
      discId: disc.id,
      disc,
      artistName: disc.artist?.name ?? '',
      discName: disc.name,
      discType,
      genre,
      releaseDay: new Date(dto.releaseDay),
      approved: dto.approved ?? false,
      publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
      link: dto.link ?? disc.link ?? null,
    });

    return this.repo.save(release);
  }

  async linkDisc(id: string, dto: LinkDiscDto): Promise<NationalRelease> {
    if (!hasExactlyOneLinkDiscOption(dto)) {
      throw new BadRequestException(
        'Provide discId to link an existing disc, or name to create a new one',
      );
    }

    const release = await this.repo.findOne({
      where: { id },
      relations: ['disc'],
    });
    if (!release)
      throw new NotFoundException(`NationalRelease ${id} not found`);

    let disc: Disc;

    if (dto.discId) {
      const found = await this.discRepo.findOne({
        where: { id: dto.discId },
        relations: ['artist', 'genre'],
      });
      if (!found) throw new NotFoundException(`Disc ${dto.discId} not found`);
      disc = found;
    } else if (dto.name) {
      return this.repo.manager.transaction(async (manager) => {
        const discRepository = manager.getRepository(Disc);
        const releaseRepository = manager.getRepository(NationalRelease);
        const newDisc = discRepository.create({
          name: dto.name,
          ...(dto.artistId && { artist: { id: dto.artistId } }),
          ...(dto.genreId && { genre: { id: dto.genreId } }),
          ...(dto.releaseDate && { releaseDate: new Date(dto.releaseDate) }),
          ep: dto.ep,
          debut: dto.debut,
          link: dto.link,
          image: dto.image,
        });
        const disc = await discRepository.save(newDisc);

        release.disc = disc;
        return releaseRepository.save(release);
      });
    } else {
      throw new BadRequestException(
        'Provide discId to link an existing disc, or name to create a new one',
      );
    }

    release.disc = disc;
    return this.repo.save(release);
  }

  async findOne(id: string): Promise<NationalRelease> {
    const release = await this.repo.findOneBy({ id });
    if (!release)
      throw new NotFoundException(`NationalRelease ${id} not found`);
    return release;
  }

  async findOnePublic(id: string): Promise<NationalRelease> {
    const release = await this.repo.findOne({
      where: { id, approved: true },
    });
    if (!release)
      throw new NotFoundException(`NationalRelease ${id} not found`);
    return release;
  }

  async update(
    id: string,
    dto: UpdateNationalReleaseDto,
  ): Promise<NationalRelease> {
    const release = await this.findOne(id);
    Object.assign(release, dto);
    await this.checkDuplicate(
      release.artistName,
      release.discName,
      release.discType,
      id,
    );

    try {
      return await this.repo.save(release);
    } catch (error) {
      if (this.isNationalReleaseUniqueViolation(error)) {
        throw new BadRequestException(
          `Novedad duplicada: ${release.artistName} – ${release.discName}`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const release = await this.findOne(id);
    await this.repo.remove(release);
  }

  private async checkDuplicate(
    artistName: string,
    discName: string,
    discType: DiscType,
    excludeId?: string,
  ): Promise<void> {
    const query = this.repo
      .createQueryBuilder('r')
      .where('LOWER(r.artistName) = LOWER(:artistName)', { artistName })
      .andWhere('LOWER(r.discName) = LOWER(:discName)', { discName })
      .andWhere('r.discType = :discType', { discType });

    if (excludeId) query.andWhere('r.id != :excludeId', { excludeId });

    const existing = await query.getOne();

    if (existing) {
      throw new BadRequestException(
        `Novedad duplicada: ${artistName} – ${discName}`,
      );
    }
  }

  private isNationalReleaseUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError: unknown = error.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505' &&
      'table' in driverError &&
      driverError.table === 'national_release' &&
      'constraint' in driverError &&
      driverError.constraint === 'UQ_national_release_artist_disc_type'
    );
  }
}
