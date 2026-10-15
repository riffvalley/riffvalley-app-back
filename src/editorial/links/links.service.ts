import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateLinkDto } from './dto/create-links.dto';
import { UpdateLinkDto } from './dto/update-links.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Link } from './entities/links.entity';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { List } from 'src/editorial/lists/entities/list.entity';

@Injectable()
export class LinksService {
  private readonly logger = new Logger('LinksService');

  constructor(
    @InjectRepository(Link)
    private readonly linkRepository: Repository<Link>,

    @InjectRepository(List)
    private readonly listRepository: Repository<List>,

    // private readonly discRespository: Repository<Disc>,
  ) {}

  async create(createLinkDto: CreateLinkDto) {
    const { listId, ...rest } = createLinkDto;

    try {
      // Buscar las entidades relacionadas

      const list = await this.listRepository.findOneBy({ id: listId });
      if (!list) throw new Error('List not found');

      // Crear la asignación y asignar las relaciones
      const link = this.linkRepository.create({
        ...rest,
        list,
      });

      // Guardar la asignación en la base de datos
      await this.linkRepository.save(link);

      return link;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [links, totalItems] = await this.linkRepository.findAndCount({
      take: limit,
      skip: offset,
    });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: links,
    };
  }

  async findOne(id: string): Promise<Link> {
    try {
      const link = await this.linkRepository.findOneByOrFail({
        id,
      });
      return link;
    } catch (error) {
      throw new NotFoundException(`Link with id ${id} not found`);
    }
  }

  async update(id: string, updateLinkDto: UpdateLinkDto) {
    // Sacamos genreId aparte
    const { listId, ...restDto } = updateLinkDto;

    // Cargamos un parcial de disc con preload
    const link = await this.linkRepository.preload({
      id,
      ...restDto,
    });

    if (!link) throw new NotFoundException(`Link with id ${id} not found`);

    try {
      // Asignamos la relación manualmente
      if (listId) {
        // Opción A: si no te interesa cargar la info del género,
        // basta con crear un objeto con su id.
        link.list = { id: listId } as List;

        // Opción B: si quieres verificar que el género existe:
        // const genre = await this.genreRepository.findOneBy({ id: genreId });
        // if (!genre) throw new NotFoundException(`Genre with id ${genreId} not found`);
        // disc.genre = genre;
      }

      await this.linkRepository.save(link);
      return link;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const result = await this.linkRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Link with id ${id} not found`);
    }
    return { message: `Link with id ${id} has been removed` };
  }

  private handleDbExceptions(error: any) {
    // Ej. error.code === '23505' en postgres para entradas duplicadas
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }

  async findByListId(listId: string, paginationDto: PaginationDto) {
    const { limit = 100, offset = 0 } = paginationDto;

    try {
      const [links, totalItems] = await this.linkRepository.findAndCount({
        where: { list: { id: listId } }, // Filtra por listId en la relación
        take: limit, // Límite de resultados
        skip: offset, // Desplazamiento
      });

      const totalPages = Math.ceil(totalItems / limit);
      const currentPage = Math.floor(offset / limit) + 1;

      return {
        totalItems,
        totalPages,
        currentPage,
        limit,
        data: links,
      };
    } catch (error) {
      this.logger.error(
        `Error finding links for listId ${listId}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve links by listId',
      );
    }
  }
}
