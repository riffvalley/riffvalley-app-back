import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, Repository } from 'typeorm';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { CreateListDto } from '../dto/create-list.dto';
import { List, ListStatus, ListType } from '../entities/list.entity';
import {
  assertRequiredEditorialDate,
  hasAnyEditorialDate,
} from '../domain/list-date-rules';

@Injectable()
export class ListCrudService {
  private readonly logger = new Logger('ListsService');

  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
  ) {}

  async create(createListDto: CreateListDto) {
    this.validateCreateDateRules(createListDto);

    try {
      const list = this.listRepository.create(createListDto);
      await this.listRepository.save(list);
      return list;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 40, offset = 0, statusExclusions = [] } = paginationDto;
    const whereConditions: any = {};

    if (statusExclusions.length > 0) {
      whereConditions.status = Not(In(statusExclusions));
    }

    const [lists, totalItems] = await this.listRepository.findAndCount({
      take: limit,
      skip: offset,
      where: whereConditions,
      order: { name: 'ASC' },
    });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: lists,
    };
  }

  async findOne(id: string): Promise<List> {
    try {
      return await this.listRepository.findOneByOrFail({ id });
    } catch (error) {
      throw new NotFoundException(`List with id ${id} not found`);
    }
  }

  async createVideoList(
    releaseDate?: Date,
    listDate?: Date,
    listName?: string,
    closeDate?: Date,
    manager?: EntityManager,
  ) {
    let targetReleaseDate: Date;

    if (releaseDate) {
      targetReleaseDate = new Date(releaseDate);
    } else {
      targetReleaseDate = new Date();
      targetReleaseDate.setDate(1);
      targetReleaseDate.setHours(0, 0, 0, 0);
    }

    const targetListDate = listDate
      ? new Date(listDate)
      : new Date(targetReleaseDate);
    const monthNames = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const currentMonthName = monthNames[targetListDate.getMonth()];
    const name = listName || `Videos ${currentMonthName}`;

    try {
      const repository = manager?.getRepository(List) ?? this.listRepository;
      const list = repository.create({
        name,
        type: ListType.VIDEO,
        status: ListStatus.NEW,
        listDate: targetListDate,
        releaseDate: targetReleaseDate,
        closeDate,
      });

      await repository.save(list);
      this.logger.log(`Video list created: ${name}`);
      return list;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async createWeeklyList(
    releaseDate?: Date,
    listDate?: Date,
    closeDate?: Date,
    manager?: EntityManager,
  ) {
    assertRequiredEditorialDate(ListType.WEEK, releaseDate);
    const targetReleaseDate = new Date(releaseDate!);
    const targetListDate = listDate
      ? new Date(listDate)
      : new Date(targetReleaseDate);
    if (!listDate) targetListDate.setHours(0, 0, 0, 0);

    const monthNames = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const currentMonthName = monthNames[targetListDate.getMonth()];
    const weekOfMonth = Math.ceil(targetListDate.getDate() / 7);
    const name = `Discos ${currentMonthName} Semana ${weekOfMonth}`;

    try {
      const list = this.listRepository.create({
        name,
        type: ListType.WEEK,
        status: ListStatus.NEW,
        listDate: targetListDate,
        releaseDate: targetReleaseDate,
        closeDate,
      });

      await (manager?.getRepository(List) ?? this.listRepository).save(list);
      this.logger.log(`Weekly list created: ${name}`);
      return list;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async createMonthlyList(
    releaseDate?: Date,
    listDate?: Date,
    closeDate?: Date,
    manager?: EntityManager,
  ) {
    assertRequiredEditorialDate(ListType.MONTH, releaseDate);
    const targetReleaseDate = new Date(releaseDate!);
    const targetListDate = listDate
      ? new Date(listDate)
      : new Date(targetReleaseDate);
    if (!listDate) targetListDate.setHours(0, 0, 0, 0);

    const monthNames = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const monthName = monthNames[targetListDate.getMonth()];
    const year = targetListDate.getFullYear();
    const name = `Discos ${monthName} ${year}`;

    try {
      const list = this.listRepository.create({
        name,
        type: ListType.MONTH,
        status: ListStatus.NEW,
        listDate: targetListDate,
        releaseDate: targetReleaseDate,
        closeDate,
      });

      await (manager?.getRepository(List) ?? this.listRepository).save(list);
      this.logger.log(`Monthly list created: ${name}`);
      return list;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  private validateCreateDateRules(createListDto: CreateListDto): void {
    if (createListDto.type === ListType.WEEK) {
      assertRequiredEditorialDate(ListType.WEEK, createListDto.releaseDate);
    } else if (createListDto.type === ListType.MONTH) {
      assertRequiredEditorialDate(ListType.MONTH, createListDto.releaseDate);
    }

    if (
      createListDto.type === ListType.SPECIAL &&
      hasAnyEditorialDate(createListDto)
    ) {
      throw new BadRequestException(
        'Las listas SPECIAL no admiten fechas editoriales.',
      );
    }
  }

  private handleDbExceptions(error: any): never {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException(
      'An unexpected error occurred',
      error,
    );
  }
}
