import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateAsignationDto } from './dto/create-asignations.dto';
import { UpdateAsignationDto } from './dto/update-asignations.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asignation } from './entities/asignations.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { List } from 'src/lists/entities/list.entity';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { ListsService } from 'src/lists/list.service';
import sanitizeHtml = require('sanitize-html');

// El campo "description" ahora puede llevar el HTML del editor WYSIWYG del
// front (negrita, cursiva, enlaces, párrafos). Se sanea aquí, al entrar,
// porque ese texto termina publicado tal cual en los posts de WordPress.
const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'strong', 'em', 'b', 'i', 'a', 'br'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
};

// "Bandas similares" es texto plano (un listado de nombres separados por
// comas): no admite ninguna etiqueta, se limpia cualquier HTML.
const PLAIN_TEXT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

@Injectable()
export class AsignationsService {
  private readonly logger = new Logger('AsignationsService');

  constructor(
    @InjectRepository(Asignation)
    private readonly asignationRepository: Repository<Asignation>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,

    @InjectRepository(List)
    private readonly listRepository: Repository<List>,

    private readonly listsService: ListsService,

    // private readonly discRespository: Repository<Disc>,
  ) {}

  async create(createAsignationDto: CreateAsignationDto) {
    const {
      userId,
      discId,
      listId,
      description,
      similarBands,
      genre,
      spotifyTrackId,
      ...rest
    } = createAsignationDto;

    try {
      const list = await this.listRepository.findOneBy({ id: listId });
      if (!list) throw new Error('List not found');

      let user: User | undefined = undefined;
      if (userId) {
        user = await this.userRepository.findOneBy({ id: userId });
        if (!user) throw new Error('User not found');
      }

      let disc: Disc | undefined = undefined;
      if (discId) {
        disc = await this.discRepository.findOneBy({ id: discId });
        if (!disc) throw new Error('Disc not found');
      }

      const asignation = this.asignationRepository.create({
        ...rest,
        description:
          description !== undefined
            ? sanitizeHtml(description, DESCRIPTION_SANITIZE_OPTIONS)
            : undefined,
        similarBands:
          similarBands !== undefined
            ? sanitizeHtml(similarBands, PLAIN_TEXT_SANITIZE_OPTIONS)
            : undefined,
        genre:
          genre !== undefined
            ? sanitizeHtml(genre, PLAIN_TEXT_SANITIZE_OPTIONS)
            : undefined,
        spotifyTrackId: spotifyTrackId || null,
        user: user || null,
        disc: disc || null,
        list,
      });

      await this.asignationRepository.save(asignation);

      return asignation;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [asignations, totalItems] =
      await this.asignationRepository.findAndCount({
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
      data: asignations,
    };
  }

  async findOne(id: string): Promise<Asignation> {
    try {
      const asignation = await this.asignationRepository.findOneByOrFail({
        id,
      });
      return asignation;
    } catch (error) {
      throw new NotFoundException(`Asignation with id ${id} not found`);
    }
  }

  async update(id: string, updateAsignationDto: UpdateAsignationDto) {
    // Sacamos genreId aparte
    const {
      userId,
      description,
      similarBands,
      genre,
      spotifyTrackId,
      ...restDto
    } = updateAsignationDto;

    // Cargamos un parcial de disc con preload
    const asignation = await this.asignationRepository.preload({
      id,
      ...restDto,
      ...(description !== undefined
        ? {
            description: sanitizeHtml(
              description,
              DESCRIPTION_SANITIZE_OPTIONS,
            ),
          }
        : {}),
      ...(similarBands !== undefined
        ? {
            similarBands: sanitizeHtml(
              similarBands,
              PLAIN_TEXT_SANITIZE_OPTIONS,
            ),
          }
        : {}),
      ...(genre !== undefined
        ? { genre: sanitizeHtml(genre, PLAIN_TEXT_SANITIZE_OPTIONS) }
        : {}),
      ...(spotifyTrackId !== undefined
        ? { spotifyTrackId: spotifyTrackId || null }
        : {}),
    });

    if (!asignation)
      throw new NotFoundException(`Asignation with id ${id} not found`);

    try {
      // Asignamos la relación manualmente
      if (userId) {
        // Opción A: si no te interesa cargar la info del género,
        // basta con crear un objeto con su id.
        asignation.user = { id: userId } as User;

        // Opción B: si quieres verificar que el género existe:
        // const genre = await this.genreRepository.findOneBy({ id: genreId });
        // if (!genre) throw new NotFoundException(`Genre with id ${genreId} not found`);
        // disc.genre = genre;
      }

      await this.asignationRepository.save(asignation);

      // Si se ha tocado el texto, las bandas similares o la canción, y
      // esta asignación pertenece a una lista mensual que ya tiene post en
      // WordPress, empujamos el cambio al momento en vez de esperar a que
      // alguien pulse "generar/actualizar" para toda la lista.
      if (
        description !== undefined ||
        similarBands !== undefined ||
        genre !== undefined ||
        spotifyTrackId !== undefined
      ) {
        const withList = await this.asignationRepository.findOne({
          where: { id },
          relations: ['list'],
        });

        if (withList?.list) {
          await this.listsService.syncDiscToWordPress(withList.list.id, id);
        }
      }

      return asignation;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const result = await this.asignationRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Asignation with id ${id} not found`);
    }
    return { message: `Asignation with id ${id} has been removed` };
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
      const [asignations, totalItems] =
        await this.asignationRepository.findAndCount({
          where: { list: { id: listId } }, // Filtra por listId en la relación
          order: {
            user: { username: 'ASC' }, // Ajustar columna de tu User
          },
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
        data: asignations,
      };
    } catch (error) {
      this.logger.error(
        `Error finding asignations for listId ${listId}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve asignations by listId',
      );
    }
  }
}
