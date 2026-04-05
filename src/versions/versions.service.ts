// versions/versions.service.ts
import { Version, VersionStatus } from './entities/version.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { VersionItem } from './entities/version-item.entity';
import { CreateVersionDto } from './dto/create-version.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { CreateVersionItemDto } from './dto/create-version-item.dto';
import { UpdateVersionItemDto } from './dto/update-version-item.dto';
import { DevState } from './entities/version-item.entity';

@Injectable()
export class VersionsService {
  constructor(
    @InjectRepository(Version)
    private readonly versionsRepo: Repository<Version>,
    @InjectRepository(VersionItem)
    private readonly itemsRepo: Repository<VersionItem>,
  ) { }

  // ------- VERSION -------
  async create(dto: CreateVersionDto): Promise<Version> {
    // 1. No permitir crear una version si no esta cerrada la version en desarrollo.
    const existingDevVersion = await this.versionsRepo.findOne({
      where: { status: VersionStatus.EN_DESARROLLO },
    });

    if (existingDevVersion) {
      throw new BadRequestException(
        'Cannot create a new version while another is in development.',
      );
    }

    const entity = this.versionsRepo.create({
      version: dto.version,
      releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : undefined,
      notes: dto.notes,
      link: dto.link,
      isActive: dto.isActive ?? false,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
      items: dto.items?.map((i) =>
        this.itemsRepo.create({
          type: i.type,
          description: i.description,
          scope: i.scope,
          priority: i.priority,
          state: i.state ?? DevState.TODO,
          branch: (i as any).branch, // 👈 NUEVO: recoger branch del DTO
        }),
      ),
      status: VersionStatus.EN_DESARROLLO, // Default to development
    });
    return this.versionsRepo.save(entity);
  }

  async findAll(): Promise<Version[]> {
    return this.versionsRepo.find({
      order: { releaseDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Version> {
    const entity = await this.versionsRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Version ${id} not found`);
    return entity;
  }

  async update(id: string, dto: UpdateVersionDto) {
    const v = await this.findOne(id);
    if (dto.version !== undefined) v.version = dto.version;
    if (dto.releaseDate !== undefined)
      v.releaseDate = dto.releaseDate ? new Date(dto.releaseDate) : null;
    if (dto.notes !== undefined) v.notes = dto.notes;
    if (dto.link !== undefined) v.link = dto.link;
    if (dto.isActive !== undefined) v.isActive = dto.isActive;
    if (dto.publishedAt !== undefined)
      v.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    if (dto.publishedAt !== undefined)
      v.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;

    // 2. No permitir cerrar una version en desarrollo si hay alguna tarea por hacer, en progreso o en dev.
    // Asumimos que "cerrar" significa cambiar el status a EN_PRODUCCION
    if (
      dto.status === VersionStatus.EN_PRODUCCION &&
      v.status !== VersionStatus.EN_PRODUCCION
    ) {
      const pendingItems = v.items.filter((item) => item.state !== DevState.DONE);
      if (pendingItems.length > 0) {
        throw new BadRequestException(
          'Cannot release version with pending items.',
        );
      }
      v.status = VersionStatus.EN_PRODUCCION;
    }

    return this.versionsRepo.save(v);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);

    // 3. No permitir borrar una version si esta en produccion.
    if (existing.status === VersionStatus.EN_PRODUCCION) {
      throw new BadRequestException('Cannot delete a production version.');
    }

    await this.versionsRepo.remove(existing);
  }

  // ------- NESTED ITEMS -------
  async listItems(versionId: string): Promise<VersionItem[]> {
    const version = await this.findOne(versionId); // valida que exista
    // Si 'items' es eager, ya viene cargado. Por si quitas eager, hacemos query explícita:
    return this.itemsRepo.find({ where: { version: { id: version.id } } });
  }

  async listCurrentVersionItems(): Promise<VersionItem[]> {
    const version = await this.versionsRepo.findOne({
      where: { status: VersionStatus.EN_DESARROLLO },
    });
    if (!version) return [];
    return this.itemsRepo.find({
      where: { version: { id: version.id } },
      order: { state: 'ASC' },
    });
  }

  async listIndependentItems(): Promise<VersionItem[]> {
    return this.itemsRepo.find({
      where: { version: IsNull() },
      order: { id: 'DESC' }, // O por fecha de creación si existiera
    });
  }

  async createItem(
    dto: CreateVersionItemDto,
    versionId?: string,
  ): Promise<VersionItem> {
    let version: Version | null = null;
    if (versionId) {
      version = await this.findOne(versionId);
    }

    // 1. Si no esta en una version la tarea esta en estado de TODO
    const state = version ? (dto.state ?? DevState.TODO) : DevState.TODO;

    const item = this.itemsRepo.create({
      type: dto.type,
      description: dto.description,
      scope: dto.scope,
      priority: dto.priority,
      state,
      branch: (dto as any).branch,
      version,
      backUser: dto.backUserId ? { id: dto.backUserId } as any : undefined,
      frontUser: dto.frontUserId ? { id: dto.frontUserId } as any : undefined,
    });
    return this.itemsRepo.save(item);
  }

  async updateItem(
    itemId: string,
    dto: UpdateVersionItemDto,
    versionId?: string,
  ): Promise<VersionItem> {
    // Si se pasa versionId, aseguramos que el item pertenece a esa versión
    const whereCondition: any = { id: itemId };
    if (versionId) {
      whereCondition.version = { id: versionId };
    }

    const item = await this.itemsRepo.findOne({
      where: whereCondition,
      relations: ['version'],
    });

    if (!item) {
      if (versionId) {
        throw new NotFoundException(
          `Item ${itemId} not found in version ${versionId}`,
        );
      } else {
        throw new NotFoundException(`Item ${itemId} not found`);
      }
    }

    if (dto.type !== undefined) item.type = dto.type;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.scope !== undefined) item.scope = dto.scope;
    if (dto.priority !== undefined) item.priority = dto.priority;

    // Handle user assignments
    if (dto.backUserId !== undefined) {
      item.backUser = dto.backUserId ? { id: dto.backUserId } as any : null;
    }
    if (dto.frontUserId !== undefined) {
      item.frontUser = dto.frontUserId ? { id: dto.frontUserId } as any : null;
    }

    // Handle version assignment
    let newVersion: Version | null | undefined = undefined;
    if (dto.version !== undefined) {
      if (dto.version === null) {
        newVersion = null;
        item.version = null;
      } else {
        newVersion = await this.findOne(dto.version);
        item.version = newVersion;
      }
    }

    // Determine effective version (current or new)
    const effectiveVersion =
      newVersion !== undefined ? newVersion : item.version;

    // Rule 1: State can only be updated if it belongs to a version
    if (dto.state !== undefined) {
      if (!effectiveVersion) {
        throw new BadRequestException(
          'Cannot update state of an independent item. Assign it to a version first.',
        );
      }
      item.state = dto.state;
    }

    // Rule 2: If unassigned from a version, state must be TODO
    if (newVersion === null) {
      item.state = DevState.TODO;
    } else if (!item.version) {
      // Fallback for existing independent items if touched without version change
      // (Though Rule 1 prevents changing state, this ensures consistency if other fields change)
      item.state = DevState.TODO;
    }

    return this.itemsRepo.save(item);
  }

  async removeItem(itemId: string, versionId?: string): Promise<void> {
    const whereCondition: any = { id: itemId };
    if (versionId) {
      whereCondition.version = { id: versionId };
    }

    const item = await this.itemsRepo.findOne({
      where: whereCondition,
    });

    if (!item) {
      if (versionId) {
        throw new NotFoundException(
          `Item ${itemId} not found in version ${versionId}`,
        );
      } else {
        throw new NotFoundException(`Item ${itemId} not found`);
      }
    }
    await this.itemsRepo.remove(item);
  }

  async setActive(id: string, active: boolean) {
    const v = await this.findOne(id);
    v.isActive = active;
    if (active && !v.publishedAt) v.publishedAt = new Date();
    return this.versionsRepo.save(v);
  }

  async findPublic(): Promise<Version[]> {
    const all = await this.versionsRepo.find({
      where: { isActive: true },
      order: { publishedAt: 'DESC', releaseDate: 'DESC', createdAt: 'DESC' },
    });
    // filtra items no públicos en memoria (si mantienes eager); si quitas eager, hazlo en query
    return all.map((v) => ({
      ...v,
      items: v.items ?? [],
    })) as Version[];
  }

  async findDevStatus() {
    const devVersion = await this.versionsRepo.findOne({
      where: { status: VersionStatus.EN_DESARROLLO },
      relations: ['items', 'items.backUser', 'items.frontUser'],
      order: { createdAt: 'DESC' },
    });

    const backlog = await this.itemsRepo.find({
      where: { version: IsNull() },
      relations: ['backUser', 'frontUser'],
      order: { id: 'DESC' },
    });

    return {
      version: devVersion,
      backlog,
    };
  }

  async findLatestDraft(): Promise<Version | null> {
    const draft = await this.versionsRepo.findOne({
      where: { publishedAt: null },
      order: { createdAt: 'DESC' },
      relations: ['items'],
    });
    return draft;
  }

  async findProductionPaginated(page: number = 1, limit: number = 9): Promise<{
    data: Version[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.versionsRepo.findAndCount({
      where: { status: VersionStatus.EN_PRODUCCION },
      order: { publishedAt: 'DESC', releaseDate: 'DESC', createdAt: 'DESC' },
      take: limit,
      skip: skip,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findLatestProductionVersion(): Promise<{ version: string } | null> {
    const latestProduction = await this.versionsRepo
      .createQueryBuilder('version')
      .select('version.version')
      .where('version.status = :status', { status: VersionStatus.EN_PRODUCCION })
      .orderBy('version.publishedAt', 'DESC')
      .addOrderBy('version.releaseDate', 'DESC')
      .addOrderBy('version.createdAt', 'DESC')
      .getOne();

    if (!latestProduction) {
      return null;
    }

    return { version: latestProduction.version };
  }
}
