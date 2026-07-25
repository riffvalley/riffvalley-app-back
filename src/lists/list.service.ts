import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import {
  List,
  ListType,
  ListStatus,
  PublishedDiscRecord,
  PublishedWeeklyPostRecord,
} from './entities/list.entity';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { Content } from 'src/contents/entities/content.entity';
import { WordpressService } from 'src/wordpress/wordpress.service';
import { SpotifyApiService } from 'src/wordpress/spotify-api.service';

@Injectable()
export class ListsService {
  private readonly logger = new Logger('ListsService');

  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly wordpressService: WordpressService,
    private readonly spotifyApiService: SpotifyApiService,
  ) {}

  async create(createListDto: CreateListDto) {
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
      order: {
        name: 'ASC',
      },
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

  async findUpcoming() {
    const today = new Date();
    const twoWeeksFromToday = new Date();
    twoWeeksFromToday.setDate(today.getDate() + 14);

    const lists = await this.listRepository.find({
      where: {
        releaseDate: Between(today, twoWeeksFromToday),
      },
      order: {
        releaseDate: 'ASC',
      },
    });
    return lists;
  }

  async findNext() {
    const today = new Date();
    const twoWeeksFromToday = new Date();
    twoWeeksFromToday.setDate(today.getDate() + 14);

    const lists = await this.listRepository.find({
      where: {
        releaseDate: MoreThan(twoWeeksFromToday),
      },
      order: {
        releaseDate: 'ASC',
      },
    });
    return lists;
  }

  async findOne(id: string): Promise<List> {
    try {
      const list = await this.listRepository.findOneByOrFail({ id });
      return list;
    } catch (error) {
      throw new NotFoundException(`List with id ${id} not found`);
    }
  }

  async update(id: string, updateListDto: UpdateListDto) {
    const list = await this.listRepository.preload({
      id: id,
      ...updateListDto,
    });

    if (!list) throw new NotFoundException(`List with id ${id} not found`);

    try {
      await this.listRepository.save(list);

      // Update associated Content if sync required
      if (
        updateListDto.closeDate ||
        updateListDto.releaseDate ||
        updateListDto.listDate
      ) {
        const content = await this.contentRepository.findOne({
          where: { list: { id: list.id } },
        });

        if (content) {
          let changed = false;

          // Sync closeDate
          if (list.closeDate) {
            const listCloseDate = new Date(list.closeDate);
            const contentCloseDate = content.closeDate
              ? new Date(content.closeDate)
              : null;
            if (
              !contentCloseDate ||
              contentCloseDate.getTime() !== listCloseDate.getTime()
            ) {
              content.closeDate = listCloseDate;
              changed = true;
            }
          }

          // Sync publicationDate with releaseDate (NOT listDate)
          if (list.releaseDate) {
            const releaseDate = new Date(list.releaseDate);
            const contentDate = content.publicationDate
              ? new Date(content.publicationDate)
              : null;
            if (
              !contentDate ||
              contentDate.getTime() !== releaseDate.getTime()
            ) {
              content.publicationDate = releaseDate;
              changed = true;
            }
          }

          // Sync list.listDate -> content.listDate (for RADAR, BEST, and VIDEO)
          if (
            list.type === 'week' ||
            list.type === 'month' ||
            list.type === 'video'
          ) {
            // week = RADAR, month = BEST, video = VIDEO
            if (list.listDate) {
              const listListDate = new Date(list.listDate);
              const contentListDate = content.listDate
                ? new Date(content.listDate)
                : null;
              if (
                !contentListDate ||
                contentListDate.getTime() !== listListDate.getTime()
              ) {
                content.listDate = listListDate;
                changed = true;
              }
            }
          }

          if (changed) {
            await this.contentRepository.save(content);
            this.logger.log(`Updated content ${content.id} from list sync`);
          }
        }
      }

      return list;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async removeList(id: string) {
    const list = await this.listRepository.findOne({ where: { id } });

    if (!list) {
      throw new NotFoundException(`List with id ${id} not found`);
    }

    // Delete associated content if exists
    const content = await this.contentRepository.findOne({
      where: { list: { id: list.id } },
    });
    if (content) {
      await this.contentRepository.remove(content);
    }

    return this.listRepository.remove(list);
  }

  // Obtener todas las listas especiales
  async findAllSpecialLists() {
    const lists = await this.listRepository.find({
      where: {
        type: ListType.SPECIAL,
      },
      order: {
        name: 'ASC',
      },
    });
    return lists;
  }

  // Obtener todas las listas de video
  async findAllVideoLists() {
    const lists = await this.listRepository.find({
      where: {
        type: ListType.VIDEO,
      },
      order: {
        name: 'ASC',
      },
    });
    return lists;
  }

  // Obtener listas mensuales actuales y futuras
  async findCurrentMonthLists() {
    const today = new Date();
    today.setDate(1); // Set to first day of current month
    today.setHours(0, 0, 0, 0);

    const lists = await this.listRepository.find({
      where: {
        type: ListType.MONTH,
        listDate: MoreThanOrEqual(today),
      },
      order: {
        listDate: 'ASC',
      },
    });
    return lists;
  }

  // Obtener listas mensuales pasadas por año
  async findPastMonthListsByYear(year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    endDate.setHours(23, 59, 59, 999);

    const lists = await this.listRepository.find({
      where: {
        type: ListType.MONTH,
        listDate: Between(startDate, endDate),
      },
      order: {
        listDate: 'DESC',
      },
    });
    return lists;
  }

  // Obtener listas semanales actuales y futuras
  async findCurrentWeeklyLists() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lists = await this.listRepository.find({
      where: {
        type: ListType.WEEK,
        releaseDate: MoreThanOrEqual(today),
      },
      order: {
        listDate: 'ASC',
      },
    });
    return lists;
  }

  // Obtener listas semanales pasadas por año y mes
  async findPastWeeklyListsByMonth(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lists = await this.listRepository.find({
      where: {
        type: ListType.WEEK,
        listDate: Between(startDate, endDate),
        releaseDate: LessThan(today),
      },
      order: {
        listDate: 'DESC',
      },
    });
    return lists;
  }

  // Obtener listas de video actuales y futuras (Mismá lógica que mensuales)
  async findCurrentVideoLists() {
    const today = new Date();
    today.setDate(1);
    today.setHours(0, 0, 0, 0);

    return this.listRepository.find({
      where: {
        type: ListType.VIDEO,
        listDate: MoreThanOrEqual(today),
      },
      order: {
        listDate: 'ASC',
      },
    });
  }

  // Obtener listas de video pasadas por año
  async findPastVideoListsByYear(year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    endDate.setHours(23, 59, 59, 999);

    return this.listRepository.find({
      where: {
        type: ListType.VIDEO,
        listDate: Between(startDate, endDate),
      },
      order: {
        listDate: 'DESC',
      },
    });
  }

  async createVideoList(
    releaseDate?: Date,
    listDate?: Date,
    listName?: string,
    closeDate?: Date,
  ) {
    let targetReleaseDate: Date;

    if (releaseDate) {
      targetReleaseDate = new Date(releaseDate);
      // If releaseDate provided, we trust it (including time)
      // Normalizing to 1st of month ONLY if not provided?
      // User request implies respecting exact time. If we force 1st of month we change date.
      // Assuming Video lists act like monthly buckets but if specific date given, maybe we should keep it?
      // Logic below uses targetListDate for naming.

      // If we seek to maintain "Video List is usually 1st of month" logic but allow time:
      // But "las fechas en el content se tienen que enviar con la hora" implies preserving what was sent.
      // So I will NOT force setDate(1) if releaseDate is provided, and NOT force setHours(0).
    } else {
      targetReleaseDate = new Date(); // Use current date if none provided
      // Default behavior: 1st of month, 00:00
      targetReleaseDate.setDate(1);
      targetReleaseDate.setHours(0, 0, 0, 0);
    }

    // Determine targetListDate
    let targetListDate: Date;
    if (listDate) {
      targetListDate = new Date(listDate);
      // Trust provided listDate
    } else {
      targetListDate = new Date(targetReleaseDate);
      // If derived from default targetReleaseDate, it's already normalized.
      // If derived from provided releaseDate, we might want to normalize it for naming?
      // The naming logic uses targetListDate.getMonth().
      // Let's ensure strict consistency with provided values.
    }

    // Naming logic
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
      const list = this.listRepository.create({
        name,
        type: ListType.VIDEO,
        status: ListStatus.NEW,
        listDate: targetListDate,
        releaseDate: targetReleaseDate,
        closeDate: closeDate,
      });

      await this.listRepository.save(list);
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
  ) {
    let targetReleaseDate: Date;

    if (releaseDate) {
      targetReleaseDate = new Date(releaseDate);
      // Trust provided releaseDate
    } else {
      const now = new Date();
      // Calcular el próximo lunes
      const currentDay = now.getDay();
      const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay) % 7 || 7;

      targetReleaseDate = new Date(now);
      targetReleaseDate.setDate(now.getDate() + daysUntilMonday);
      targetReleaseDate.setHours(0, 0, 0, 0); // Default logic keeps 00:00
    }

    // Determine targetListDate
    let targetListDate: Date;
    if (listDate) {
      targetListDate = new Date(listDate);
      // Trust provided listDate
    } else {
      targetListDate = new Date(targetReleaseDate);
      targetListDate.setHours(0, 0, 0, 0); // Default logic
    }

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

    // Use targetListDate for naming
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
        closeDate: closeDate,
      });

      await this.listRepository.save(list);
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
  ) {
    let targetReleaseDate: Date;

    if (releaseDate) {
      targetReleaseDate = new Date(releaseDate);
      // Trust provided releaseDate
    } else {
      const now = new Date();
      // Default to the first day of the next month
      targetReleaseDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      targetReleaseDate.setHours(0, 0, 0, 0); // Default logic
    }

    // Determine targetListDate
    let targetListDate: Date;
    if (listDate) {
      targetListDate = new Date(listDate);
      // Trust provided listDate
    } else {
      targetListDate = new Date(targetReleaseDate);
      targetListDate.setHours(0, 0, 0, 0); // Default logic
    }

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

    // Use targetListDate for naming
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
        closeDate: closeDate,
      });

      await this.listRepository.save(list);
      this.logger.log(`Monthly list created: ${name}`);
      return list;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async generateWordPressPosts(listId: string) {
    const list = await this.findOne(listId);

    // Group asignations by position (skip null)
    const byPosition = new Map<number, typeof list.asignations>();
    for (const asignation of list.asignations) {
      if (asignation.position === null || asignation.position === undefined) {
        continue;
      }
      if (!byPosition.has(asignation.position)) {
        byPosition.set(asignation.position, []);
      }
      byPosition.get(asignation.position).push(asignation);
    }

    const sortedPositions = Array.from(byPosition.keys()).sort((a, b) => a - b);

    const rawReleaseDate = list.releaseDate
      ? new Date(list.releaseDate)
      : new Date();
    // Music releases happen on Fridays — always use the Friday of the release week
    const releaseDate = new Date(rawReleaseDate);
    const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
    releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const monthNames = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    const monthName = monthNames[releaseDate.getMonth()];

    const romanNumerals = [
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
      'X',
    ];

    const CATEGORIES = [2049, 184]; // Novedades, Radar de Novedades
    const FIXED_TAGS = [189, 2088, 188]; // novedades, nuevos discos semanales, radar

    const [yearTagId, monthTagId] = await Promise.all([
      this.wordpressService.getOrCreateTag(String(year)),
      this.wordpressService.getOrCreateTag(monthName),
    ]);
    const tags = [...FIXED_TAGS, yearTagId, monthTagId];

    const createdPosts = [];

    for (const position of sortedPositions) {
      const discs = byPosition.get(position);
      const roman = romanNumerals[position - 1] ?? `${position}`;

      const title = `Nuevos discos - ${dateStr} (${roman})`;
      const seoTitle = `Nuevos discos ${day} de ${monthName} de ${year} (${roman}) • Riff Valley`;
      const seoDescription = `Nuevos discos de ${monthName} de ${year}: os recopilamos los lanzamientos de la semana del ${dateStr} que no te puedes perder.`;
      const slug = `nuevos-discos${day}${month}${String(year).slice(-2)}${roman.toLowerCase()}`;

      const meta = {
        rank_math_title: seoTitle,
        rank_math_description: seoDescription,
        rank_math_focus_keyword: `nuevos discos,${monthName},${year},${roman.toLowerCase()}`,
      };

      const entry = (list.wpWeeklyPosts ?? []).find(
        (e) => e.position === position,
      );

      if (entry) {
        const existingPost = await this.wordpressService.getPost(
          entry.wpPostId,
        );

        // El post enlazado ya no existe o está en la papelera: soltamos el
        // tracking y caemos al flujo de "no hay entry" de abajo, que busca
        // por slug o crea uno nuevo (mismo patrón que generateBestDiscsWordPressPost).
        if (!existingPost || existingPost.status === 'trash') {
          this.logger.warn(
            `Linked WP post #${entry.wpPostId} for list ${listId} position ${position} is missing or trashed, creating a new one`,
          );
          list.wpWeeklyPosts = (list.wpWeeklyPosts ?? []).filter(
            (e) => e.position !== position,
          );
        } else {
          const result = await this.syncDiscsIntoPost(
            entry.wpPostId,
            existingPost.content,
            discs,
            entry.publishedDiscs ?? [],
            (d, trackIds) => this.buildWeeklyDiscSections(d, trackIds, title),
            false,
          );

          list.wpWeeklyPosts = [
            ...(list.wpWeeklyPosts ?? []).filter(
              (e) => e.position !== position,
            ),
            { ...entry, publishedDiscs: result.publishedDiscs },
          ];

          const postResult: any = {
            position,
            wpPostId: entry.wpPostId,
            link: entry.wpPostUrl,
            title,
            added: result.newCount,
            updated: result.existingCount - result.notFoundForUpdate,
          };

          if (result.removedDiscs.length) {
            const names = result.removedDiscs
              .map((d) => `${d.artist} – ${d.name}`)
              .join(', ');
            postResult.removed = result.removedDiscs.length;
            postResult.warning = `${result.removedDiscs.length} disco(s) eliminado(s) de la lista seguían publicados en WordPress y no se han quitado del post automáticamente: ${names}. Revisa y edita el post manualmente si corresponde.`;
          }

          if (result.notFoundForUpdate > 0) {
            const extra = `${result.notFoundForUpdate} disco(s) editado(s) no se encontraron en el post (¿se borró su marcador manualmente en el editor de WordPress?) y no se pudieron actualizar automáticamente.`;
            postResult.warning = postResult.warning
              ? `${postResult.warning} ${extra}`
              : extra;
          }

          createdPosts.push(postResult);
          continue;
        }
      }

      // No hay tracking para esta posición: puede que el post ya existiera
      // de antes de este sistema (lo buscamos por slug y lo "adoptamos") o
      // que no exista todavía (lo creamos desde cero).
      const existingBySlug = await this.wordpressService.findPostBySlug(slug);
      if (existingBySlug) {
        this.logger.log(
          `WP post already exists for slug ${slug} (#${existingBySlug.id}), adopting it for position ${position}`,
        );

        const existingContent = await this.wordpressService.getPost(
          existingBySlug.id,
        );
        const result = await this.syncDiscsIntoPost(
          existingBySlug.id,
          existingContent?.content ?? '',
          discs,
          [],
          (d, trackIds) => this.buildWeeklyDiscSections(d, trackIds, title),
          false,
        );

        const newEntry: PublishedWeeklyPostRecord = {
          position,
          wpPostId: existingBySlug.id,
          wpPostUrl: existingBySlug.link,
          publishedDiscs: result.publishedDiscs,
        };
        list.wpWeeklyPosts = [
          ...(list.wpWeeklyPosts ?? []).filter((e) => e.position !== position),
          newEntry,
        ];

        createdPosts.push({
          position,
          wpPostId: existingBySlug.id,
          link: existingBySlug.link,
          title,
          adopted: true,
          added: result.newCount,
        });
        continue;
      }

      const spotifyTrackIds = await Promise.all(
        discs.map((a) => this.resolveSpotifyTrackId(a)),
      );

      const content = this.buildPostContent(
        discs,
        position,
        list,
        title,
        spotifyTrackIds,
      );

      const post = await this.wordpressService.createPost(
        title,
        content,
        'draft',
        meta,
        CATEGORIES,
        tags,
        slug,
      );

      const newEntry: PublishedWeeklyPostRecord = {
        position,
        wpPostId: post.id,
        wpPostUrl: post.link,
        publishedDiscs: discs.map((a) => this.toPublishedDiscRecord(a)),
      };
      list.wpWeeklyPosts = [
        ...(list.wpWeeklyPosts ?? []).filter((e) => e.position !== position),
        newEntry,
      ];

      createdPosts.push({
        position,
        wpPostId: post.id,
        link: post.link,
        title,
      });
    }

    await this.listRepository.save(list);

    return { created: createdPosts.length, posts: createdPosts };
  }

  private buildPostContent(
    discs: any[],
    position: number,
    list: any,
    title = '',
    spotifyTrackIds: (string | null)[] = [],
  ): string {
    const ordinals = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta'];
    const ordinal = ordinals[position - 1] ?? `${position}ª`;

    const rawReleaseDate = list.releaseDate
      ? new Date(list.releaseDate)
      : new Date();
    // Music releases happen on Fridays — always use the Friday of the release week
    const releaseDate = new Date(rawReleaseDate);
    const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
    releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const artistNames = discs.map((a) => a.disc?.artist?.name ?? '');
    const artistNamesBold = artistNames.map(
      (name) => `<strong>${name}</strong>`,
    );
    const artistNamesHtml =
      artistNamesBold.length > 1
        ? `${artistNamesBold.slice(0, -1).join(', ')} y ${artistNamesBold[artistNamesBold.length - 1]}`
        : (artistNamesBold[0] ?? '');

    const intro = `<!-- wp:spacer {"height":"7px"} -->
<div style="height:7px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Nuevos discos del ${dateStr}: ${ordinal} entrega de novedades de esta semana. Hoy os hablamos de ${discs.length} lanzamientos: ${artistNamesHtml}.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">No olvides contarnos en nuestras <a href="https://www.instagram.com/riffvalleyes/" target="_blank" rel="noreferrer noopener">redes sociales</a> qué os han parecido estas bandas.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Si quieres saber qué otros discos han sido lanzados esta semana, no dudes en echarle un ojo a nuestra <a href="https://www.riffvalley.es/novedades/discos-metal-rock-hardcore-2025">guía de lanzamientos de 2026</a>. Y, si además quieres votarlos y poder filtrarlos por género, país o tus propios gustos, te recomendamos usar <a href="http://app.riffvalley.es/login" target="_blank" rel="noreferrer noopener">nuestra app</a> de forma gratuita.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading {"level":2,"className":"wp-block-heading"} -->
<h2 class="wp-block-heading" id="los-mejores-discos-lanzados-esta-semana-son"><strong>Los nuevos discos lanzados esta semana:</strong></h2>
<!-- /wp:heading -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->`;

    const discSections = this.buildWeeklyDiscSections(
      discs,
      spotifyTrackIds,
      title,
    );

    return `${intro}\n\n${discSections}\n\n${this.buildSocialFooter()}`;
  }

  // Igual que buildDiscSections, pero para el post semanal de "nuevos
  // discos": conserva el estilo visual propio de ese post (imagen 300px vía
  // wp:html, sin línea "Recomendado por") y solo añade el mismo envoltorio
  // rv-disc-<discId> para poder localizar y sustituir el bloque de un disco
  // suelto (ver replaceDiscSection / syncDiscToWordPress).
  private buildWeeklyDiscSections(
    discs: any[],
    spotifyTrackIds: (string | null)[],
    title: string,
  ): string {
    const FALLBACK_TRACK_ID = '75EVwxItVYmK59hhfSsBoD';

    return discs
      .map((a, i) => {
        const artist = a.disc?.artist?.name ?? '';
        const discName = a.disc?.name ?? '';
        const genre = a.disc?.genre?.name ?? 'xx';
        const image = a.disc?.image ?? '';
        const debut = a.disc?.debut ? ' <em>(Debut)</em>' : '';
        const description = a.disc?.description ?? '';

        let imageBlock = '';
        if (image) {
          const altText = `${artist} - ${discName} | ${title}`;
          imageBlock = `\n\n<!-- wp:html -->
<div class="wp-block-image is-style-zoooom">
<figure class="alignright size-large is-resized"><img decoding="async" src="${image}" alt="${altText}" style="aspect-ratio:1;object-fit:cover;width:300px"/></figure>
</div>
<!-- /wp:html -->`;
        }

        const trackId = spotifyTrackIds[i] ?? FALLBACK_TRACK_ID;
        const spotifyEmbed = `\n\n<!-- wp:html -->
<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
<!-- /wp:html -->`;

        const descriptionText = description ? ` ${description}` : '';
        const username = a.user?.username ?? '';

        const richParagraphs = this.extractParagraphs(a.description);
        const firstParagraph = richParagraphs.length
          ? richParagraphs[0]
          : `${username}${descriptionText}`;
        const extraParagraphBlocks = this.buildExtraParagraphBlocks(
          richParagraphs.slice(1),
        );

        return `<!-- wp:group {"className":"rv-disc-${a.disc.id}"} -->
<div class="wp-block-group rv-disc-${a.disc.id}">${imageBlock}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>${artist} &#8211; <em>${discName}</em>${debut}:</strong> ${firstParagraph}</p>
<!-- /wp:paragraph -->${extraParagraphBlocks}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Género: </strong>${genre}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Bandas similares:</strong> ${a.similarBands || 'xx, xx, xx'}</p>
<!-- /wp:paragraph -->${spotifyEmbed}

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
</div>
<!-- /wp:group -->`;
      })
      .join('\n\n');
  }

  // Empuja el disco de una sola asignación al post real de WordPress al
  // momento (usado cuando se guarda el texto desde el modal de edición),
  // sin esperar a que alguien pulse "generar/actualizar" para toda la
  // lista. Reutiliza exactamente la misma lógica de "pisar" el bloque del
  // disco que ya usa el flujo de actualización por lotes.
  async syncDiscToWordPress(listId: string, asignationId: string) {
    const list = await this.findOne(listId);

    const asignation = list.asignations.find(
      (a) => a.id === asignationId && a.disc,
    );
    if (!asignation) {
      return { synced: false };
    }

    if (list.type === ListType.MONTH) {
      return this.syncDiscToMonthlyPost(list, asignation);
    }

    if (list.type === ListType.WEEK) {
      return this.syncDiscToWeeklyPost(list, asignation);
    }

    return { synced: false };
  }

  private async syncDiscToMonthlyPost(list: List, asignation: any) {
    if (!list.wpPostId) {
      // Todavía no hay post que actualizar: se recogerá con el próximo
      // "generar/actualizar" manual.
      return { synced: false };
    }

    const existingPost = await this.wordpressService.getPost(list.wpPostId);
    if (!existingPost || existingPost.status === 'trash') {
      // El post enlazado ya no existe o está en la papelera: no forzamos
      // nada aquí, que se resuelva con el flujo normal de
      // "generar/actualizar" (que ya sabe recrear el post si hace falta).
      return { synced: false };
    }

    const [spotifyTrackId, authors] = await Promise.all([
      this.resolveSpotifyTrackId(asignation),
      this.resolveAuthors([asignation]),
    ]);

    const block = this.buildDiscSections(
      [asignation],
      [spotifyTrackId],
      authors,
    );

    const publishedDiscs = list.wpPublishedDiscs ?? [];
    const alreadyPublished = publishedDiscs.some(
      (d) => d.discId === asignation.disc.id,
    );

    const replaced = alreadyPublished
      ? this.replaceDiscSection(existingPost.content, asignation.disc.id, block)
      : null;
    const updatedContent =
      replaced ?? this.insertBeforeFooter(existingPost.content, block);

    await this.wordpressService.updatePostContent(
      list.wpPostId,
      updatedContent,
    );

    if (!alreadyPublished) {
      list.wpPublishedDiscs = [
        ...publishedDiscs,
        this.toPublishedDiscRecord(asignation),
      ];
      await this.listRepository.save(list);
    }

    return { synced: true };
  }

  // Igual que syncDiscToMonthlyPost pero para el post semanal de "nuevos
  // discos" correspondiente a la posición del disco. Cada posición tiene su
  // propio post (ver wpWeeklyPosts / generateWordPressPosts), así que
  // primero hay que localizar la entrada trackeada de esa posición.
  private async syncDiscToWeeklyPost(list: List, asignation: any) {
    const position = asignation.position;
    if (position === null || position === undefined) {
      return { synced: false };
    }

    const entry = (list.wpWeeklyPosts ?? []).find(
      (e) => e.position === position,
    );
    if (!entry) {
      // Todavía no se ha generado el post de esa posición: se recogerá con
      // el próximo "generar/actualizar" manual.
      return { synced: false };
    }

    const existingPost = await this.wordpressService.getPost(entry.wpPostId);
    if (!existingPost || existingPost.status === 'trash') {
      return { synced: false };
    }

    const spotifyTrackId = await this.resolveSpotifyTrackId(asignation);
    const title = this.buildWeeklyPostTitle(list, position);
    const block = this.buildWeeklyDiscSections(
      [asignation],
      [spotifyTrackId],
      title,
    );

    const publishedDiscs = entry.publishedDiscs ?? [];
    const alreadyPublished = publishedDiscs.some(
      (d) => d.discId === asignation.disc.id,
    );

    const replaced = alreadyPublished
      ? this.replaceDiscSection(existingPost.content, asignation.disc.id, block)
      : null;
    const updatedContent =
      replaced ?? this.insertBeforeFooter(existingPost.content, block);

    await this.wordpressService.updatePostContent(
      entry.wpPostId,
      updatedContent,
    );

    if (!alreadyPublished) {
      list.wpWeeklyPosts = [
        ...(list.wpWeeklyPosts ?? []).filter((e) => e.position !== position),
        {
          ...entry,
          publishedDiscs: [
            ...publishedDiscs,
            this.toPublishedDiscRecord(asignation),
          ],
        },
      ];
      await this.listRepository.save(list);
    }

    return { synced: true };
  }

  private static readonly ROMAN_NUMERALS = [
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
    'X',
  ];

  // Los lanzamientos musicales son los viernes: usamos siempre el viernes
  // de la semana de lanzamiento para nombrar el post, igual que
  // generateWordPressPosts.
  private getWeeklyReleaseFriday(list: List): Date {
    const rawReleaseDate = list.releaseDate
      ? new Date(list.releaseDate)
      : new Date();
    const releaseDate = new Date(rawReleaseDate);
    const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
    releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
    return releaseDate;
  }

  private buildWeeklyPostTitle(list: List, position: number): string {
    const releaseDate = this.getWeeklyReleaseFriday(list);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const roman = ListsService.ROMAN_NUMERALS[position - 1] ?? `${position}`;
    return `Nuevos discos - ${day}/${month}/${year} (${roman})`;
  }

  async generateBestDiscsWordPressPost(listId: string) {
    const list = await this.findOne(listId);

    if (list.type !== ListType.MONTH) {
      throw new BadRequestException(
        'Only monthly lists can generate a "Mejores discos" post',
      );
    }

    const allDiscs = list.asignations
      .filter((a) => a.disc)
      .sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) -
          (b.position ?? Number.MAX_SAFE_INTEGER),
      );

    if (!allDiscs.length) {
      throw new BadRequestException('List has no assigned discs');
    }

    const listDate = list.listDate ? new Date(list.listDate) : new Date();
    const year = listDate.getFullYear();

    const monthNames = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    const monthName = monthNames[listDate.getMonth()];
    const title = `Mejores discos de ${monthName} ${year}`;

    if (list.wpPostId) {
      const existingPost = await this.wordpressService.getPost(list.wpPostId);

      // El post enlazado ya no existe (404) o lo movieron a la papelera
      // (WordPress lo sigue sirviendo con status "trash", no da 404): la
      // referencia guardada está muerta, así que la soltamos y generamos
      // un post nuevo desde cero en vez de reventar o escribir a ciegas
      // sobre un post que nadie va a ver.
      if (!existingPost || existingPost.status === 'trash') {
        this.logger.warn(
          `Linked WP post #${list.wpPostId} for list ${listId} is missing or trashed, creating a new one`,
        );
        list.wpPostId = null;
        list.wpPostUrl = null;
        list.wpPublishedDiscs = null;

        const created = await this.createBestDiscsPost(
          list,
          allDiscs,
          title,
          monthName,
          year,
        );
        return { ...created, recreated: true };
      }

      return this.appendNewDiscsToBestPost(
        list,
        allDiscs,
        title,
        existingPost.content,
      );
    }

    return this.createBestDiscsPost(list, allDiscs, title, monthName, year);
  }

  private async createBestDiscsPost(
    list: List,
    allDiscs: any[],
    title: string,
    monthName: string,
    year: number,
  ) {
    const seoTitle = `Mejores discos de ${monthName} de ${year} • Riff Valley`;
    const seoDescription = `Os dejamos un listado con una selección de los mejores discos del mes de ${monthName} de ${year}. ¡No te los pierdas!`;
    const slug = `mejores-discos-de-${monthName}-${year}`;

    const CATEGORIES = [72, 597]; // Artículos, Mejores discos del mes
    const FIXED_TAGS = [219, 235, 2030, 2031]; // Discos, Mejores, Bandas mainstream, Bandas underground

    const meta = {
      rank_math_title: seoTitle,
      rank_math_description: seoDescription,
      rank_math_focus_keyword: `mejores discos,${monthName},${year}`,
    };

    const existing = await this.wordpressService.findPostBySlug(slug);
    if (existing) {
      this.logger.log(
        `WP post already exists for slug ${slug} (#${existing.id}), linking list to it`,
      );
      await this.linkListToWpPost(list, allDiscs, existing.id, existing.link);
      return {
        wpPostId: existing.id,
        link: existing.link,
        title,
        skipped: true,
      };
    }

    const [yearTagId, monthTagId, spotifyTrackIds, authors] = await Promise.all(
      [
        this.wordpressService.getOrCreateTag(String(year)),
        this.wordpressService.getOrCreateTag(monthName),
        Promise.all(allDiscs.map((a) => this.resolveSpotifyTrackId(a))),
        this.resolveAuthors(allDiscs),
      ],
    );
    const tags = [...FIXED_TAGS, yearTagId, monthTagId];

    const content = this.buildBestDiscsPostContent(
      allDiscs,
      monthName,
      year,
      spotifyTrackIds,
      authors,
    );

    const post = await this.wordpressService.createPost(
      title,
      content,
      'draft',
      meta,
      CATEGORIES,
      tags,
      slug,
    );

    await this.linkListToWpPost(list, allDiscs, post.id, post.link);

    return { wpPostId: post.id, link: post.link, title };
  }

  private toPublishedDiscRecord(a: any): PublishedDiscRecord {
    return {
      discId: a.disc.id,
      artist: a.disc?.artist?.name ?? '',
      name: a.disc?.name ?? '',
    };
  }

  private async linkListToWpPost(
    list: List,
    publishedDiscs: any[],
    wpPostId: number,
    wpPostUrl: string,
  ) {
    list.wpPostId = wpPostId;
    list.wpPostUrl = wpPostUrl;
    list.wpPublishedDiscs = publishedDiscs.map((a) =>
      this.toPublishedDiscRecord(a),
    );
    await this.listRepository.save(list);
  }

  private async appendNewDiscsToBestPost(
    list: List,
    allDiscs: any[],
    title: string,
    currentContent: string,
  ) {
    const publishedDiscs = list.wpPublishedDiscs ?? [];

    const syncResult = await this.syncDiscsIntoPost(
      list.wpPostId,
      currentContent,
      allDiscs,
      publishedDiscs,
      (discs, spotifyTrackIds, authors) =>
        this.buildDiscSections(discs, spotifyTrackIds, authors),
      true,
    );

    if (syncResult.newCount || syncResult.removedDiscs.length) {
      list.wpPublishedDiscs = syncResult.publishedDiscs;
      await this.listRepository.save(list);
    }

    const result: {
      wpPostId: number;
      link: string;
      title: string;
      added: number;
      updated: number;
      message?: string;
      removed?: number;
      warning?: string;
    } = {
      wpPostId: list.wpPostId,
      link: list.wpPostUrl,
      title,
      added: syncResult.newCount,
      updated: syncResult.existingCount - syncResult.notFoundForUpdate,
    };

    if (
      !syncResult.newCount &&
      !syncResult.existingCount &&
      !syncResult.removedDiscs.length
    ) {
      result.message = 'No new discs to add';
    }

    if (syncResult.removedDiscs.length) {
      const names = syncResult.removedDiscs
        .map((d) => `${d.artist} – ${d.name}`)
        .join(', ');
      result.removed = syncResult.removedDiscs.length;
      result.warning = `${syncResult.removedDiscs.length} disco(s) eliminado(s) de la lista seguían publicados en WordPress y no se han quitado del post automáticamente: ${names}. Revisa y edita el post manualmente si corresponde.`;
    }

    if (syncResult.notFoundForUpdate > 0) {
      const extra = `${syncResult.notFoundForUpdate} disco(s) editado(s) no se encontraron en el post (¿se borró su marcador manualmente en el editor de WordPress?) y no se pudieron actualizar automáticamente.`;
      result.warning = result.warning ? `${result.warning} ${extra}` : extra;
    }

    return result;
  }

  // Núcleo compartido de "añadir discos nuevos + refrescar los ya
  // publicados" que usan tanto el post único de "Mejores discos" (mensual)
  // como cada post por posición de "Nuevos discos" (semanal). Recibe el
  // constructor de bloques como parámetro porque cada flujo tiene su propio
  // estilo visual (buildDiscSections vs buildWeeklyDiscSections).
  private async syncDiscsIntoPost(
    wpPostId: number,
    currentContent: string,
    allDiscs: any[],
    publishedDiscs: PublishedDiscRecord[],
    buildSections: (
      discs: any[],
      spotifyTrackIds: (string | null)[],
      authors: ({ name: string; link: string } | null)[],
    ) => string,
    useAuthors: boolean,
  ): Promise<{
    publishedDiscs: PublishedDiscRecord[];
    updatedContent: string;
    contentChanged: boolean;
    newCount: number;
    existingCount: number;
    removedDiscs: PublishedDiscRecord[];
    notFoundForUpdate: number;
  }> {
    const publishedIds = new Set(publishedDiscs.map((d) => d.discId));
    const currentIds = new Set(allDiscs.map((a) => a.disc.id));

    const newDiscs = allDiscs.filter((a) => !publishedIds.has(a.disc.id));
    // Discos que ya estaban en el post: se regeneran y se pisan siempre,
    // sin comparar nada, para que cualquier edición del texto se refleje.
    const existingDiscs = allDiscs.filter((a) => publishedIds.has(a.disc.id));
    const removedDiscs = publishedDiscs.filter(
      (d) => !currentIds.has(d.discId),
    );

    let updatedContent = currentContent;
    let notFoundForUpdate = 0;

    const discsNeedingRender = [...newDiscs, ...existingDiscs];
    if (discsNeedingRender.length) {
      const [spotifyTrackIds, authors] = await Promise.all([
        Promise.all(
          discsNeedingRender.map((a) => this.resolveSpotifyTrackId(a)),
        ),
        useAuthors
          ? this.resolveAuthors(discsNeedingRender)
          : Promise.resolve(discsNeedingRender.map(() => null)),
      ]);

      if (newDiscs.length) {
        const newSections = buildSections(
          newDiscs,
          spotifyTrackIds.slice(0, newDiscs.length),
          authors.slice(0, newDiscs.length),
        );
        updatedContent = this.insertBeforeFooter(updatedContent, newSections);
      }

      existingDiscs.forEach((a, i) => {
        const offset = newDiscs.length + i;
        const block = buildSections(
          [a],
          [spotifyTrackIds[offset]],
          [authors[offset]],
        );
        const replaced = this.replaceDiscSection(
          updatedContent,
          a.disc.id,
          block,
        );
        if (replaced === null) {
          notFoundForUpdate++;
        } else {
          updatedContent = replaced;
        }
      });

      if (updatedContent !== currentContent) {
        await this.wordpressService.updatePostContent(wpPostId, updatedContent);
      }
    }

    let newPublishedDiscs = publishedDiscs;
    if (newDiscs.length || removedDiscs.length) {
      const stillTracked = publishedDiscs.filter((d) =>
        currentIds.has(d.discId),
      );
      const newlyPublished = newDiscs.map((a) => this.toPublishedDiscRecord(a));
      newPublishedDiscs = [...stillTracked, ...newlyPublished];
    }

    return {
      publishedDiscs: newPublishedDiscs,
      updatedContent,
      contentChanged: updatedContent !== currentContent,
      newCount: newDiscs.length,
      existingCount: existingDiscs.length,
      removedDiscs,
      notFoundForUpdate,
    };
  }

  private insertBeforeFooter(content: string, addition: string): string {
    const markerIndex = this.findFooterMarkerIndex(content);

    if (markerIndex === -1) {
      return `${content}\n\n${addition}`;
    }

    return `${content.slice(0, markerIndex)}${addition}\n\n${content.slice(markerIndex)}`;
  }

  private findFooterMarkerIndex(content: string): number {
    // Localizamos el bloque wp:separator que lleve nuestra clase marcadora
    // (ver FOOTER_MARKER_CLASS), no el primer wp:separator a secas: así no
    // confundimos nuestro footer con un separador que alguien haya metido a
    // mano en el post, y seguimos encontrándolo aunque Gutenberg reordene los
    // atributos del comentario JSON al guardar desde el editor de bloques.
    const separatorBlockRegex = /<!--\s*wp:separator[\s\S]*?-->/g;
    let match: RegExpExecArray | null;

    while ((match = separatorBlockRegex.exec(content)) !== null) {
      if (match[0].includes(ListsService.FOOTER_MARKER_CLASS)) {
        return match.index;
      }
    }

    return -1;
  }

  // Cada disco viene envuelto en un wp:group con la clase rv-disc-<discId>
  // (ver buildDiscSections), así que el bloque entero tiene un inicio y un
  // final inequívocos: no hace falta adivinar dónde termina mirando el
  // siguiente disco.
  private findDiscSectionBoundaries(
    content: string,
  ): { discId: string; start: number; end: number }[] {
    const groupOpenRegex = /<!--\s*wp:group[\s\S]*?-->/g;
    const boundaries: { discId: string; start: number; end: number }[] = [];
    let openMatch: RegExpExecArray | null;

    while ((openMatch = groupOpenRegex.exec(content)) !== null) {
      const discIdMatch = openMatch[0].match(/rv-disc-([0-9a-f-]+)/i);
      if (!discIdMatch) continue;

      const closeRegex = /<!--\s*\/wp:group\s*-->/g;
      closeRegex.lastIndex = openMatch.index + openMatch[0].length;
      const closeMatch = closeRegex.exec(content);
      if (!closeMatch) continue;

      boundaries.push({
        discId: discIdMatch[1],
        start: openMatch.index,
        end: closeMatch.index + closeMatch[0].length,
      });
    }

    return boundaries;
  }

  // Sustituye el bloque wp:group completo de un disco por una versión
  // recién generada. Se usa para que, si editas el texto de un disco ya
  // publicado, el post real de WordPress se pise con lo que haya ahora
  // mismo en la app.
  private replaceDiscSection(
    content: string,
    discId: string,
    newBlock: string,
  ): string | null {
    const boundary = this.findDiscSectionBoundaries(content).find(
      (b) => b.discId === discId,
    );
    if (!boundary) return null;

    return `${content.slice(0, boundary.start)}${newBlock}${content.slice(boundary.end)}`;
  }

  // Si el disco tiene una canción elegida a mano (spotifyTrackId), se usa
  // tal cual sin gastar llamadas a la API de Spotify; si no, cae en la
  // selección automática de siempre.
  private resolveSpotifyTrackId(a: any): Promise<string | null> {
    if (a.spotifyTrackId) return Promise.resolve(a.spotifyTrackId);

    return this.spotifyApiService.findTrackForAlbum(
      a.disc?.artist?.name ?? '',
      a.disc?.name ?? '',
    );
  }

  private async resolveAuthors(
    discs: any[],
  ): Promise<({ name: string; link: string } | null)[]> {
    const cache = new Map<string, { name: string; link: string } | null>();

    return Promise.all(
      discs.map(async (a) => {
        const username = a.user?.username;
        if (!username) return null;
        if (cache.has(username)) return cache.get(username);

        const slug = username.toLowerCase().replace(/_/g, '-');
        const author = await this.wordpressService.findAuthorBySlug(slug);
        cache.set(username, author);
        return author;
      }),
    );
  }

  // El HTML del editor WYSIWYG del front llega ya saneado (ver
  // AsignationsService) con un <p> por párrafo. Lo partimos para poder
  // fundir el primero con la línea en negrita del título y meter el resto
  // como bloques wp:paragraph independientes y consecutivos.
  private extractParagraphs(html?: string | null): string[] {
    if (!html) return [];
    const matches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
    const paragraphs = matches?.length
      ? matches.map((p) =>
          p
            .replace(/^<p[^>]*>/i, '')
            .replace(/<\/p>$/i, '')
            .trim(),
        )
      : [html.trim()];
    return paragraphs.filter((p) => p.length > 0);
  }

  private buildExtraParagraphBlocks(paragraphs: string[]): string {
    if (!paragraphs.length) return '';
    const blocks = paragraphs
      .map(
        (p) => `<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">${p}</p>
<!-- /wp:paragraph -->`,
      )
      .join('\n\n');
    return `\n\n${blocks}`;
  }

  private buildBestDiscsPostContent(
    discs: any[],
    monthName: string,
    year: number,
    spotifyTrackIds: (string | null)[],
    authors: ({ name: string; link: string } | null)[],
  ): string {
    const artistNames = discs.map((a) => a.disc?.artist?.name ?? '');
    const artistNamesBold = artistNames.map(
      (name) => `<strong>${name}</strong>`,
    );
    const artistNamesHtml =
      artistNamesBold.length > 1
        ? `${artistNamesBold.slice(0, -1).join(', ')} y ${artistNamesBold[artistNamesBold.length - 1]}`
        : (artistNamesBold[0] ?? '');

    const intro = `<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Aquí os traemos los mejores discos que se han publicado en el <strong>mes de ${monthName} de ${year}</strong>. Os hablaremos de los nuevos trabajos de ${artistNamesHtml}.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>📱 <strong>Descubre todos estos discos (y muchos más) en la <a href="https://app.riffvalley.es/login" target="_blank" rel="noreferrer noopener">app de <em>Riff Valley</em></a></strong>: filtra por género o país, escucha novedades al momento, vota tus favoritos (incluyendo su portada) y sigue en directo cómo evolucionan los rankings, con acceso directo a <em>Spotify </em>y otras plataformas.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Los mejores discos del mes de <strong>${monthName}</strong> de ${year} son:</h3>
<!-- /wp:heading -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->`;

    const discSections = this.buildDiscSections(
      discs,
      spotifyTrackIds,
      authors,
    );

    return `${intro}\n\n${discSections}\n\n${this.buildSocialFooter()}`;
  }

  private buildDiscSections(
    discs: any[],
    spotifyTrackIds: (string | null)[],
    authors: ({ name: string; link: string } | null)[],
  ): string {
    const FALLBACK_TRACK_ID = '75EVwxItVYmK59hhfSsBoD';

    return discs
      .map((a, i) => {
        const artist = a.disc?.artist?.name ?? '';
        const discName = a.disc?.name ?? '';
        const genre = a.disc?.genre?.name ?? 'xx';
        const image = a.disc?.image ?? '';
        const debut = a.disc?.debut ? ' <em>(Debut)</em>' : '';
        const description = a.disc?.description ?? '';

        let imageBlock = '';
        if (image) {
          const altText = `${artist} - ${discName}`;
          imageBlock = `\n\n<!-- wp:image {"width":"250px","aspectRatio":"1","scale":"cover","sizeSlug":"large","linkDestination":"none","align":"right","className":"is-style-zoooom"} -->
<figure class="wp-block-image alignright size-large is-resized is-style-zoooom"><img src="${image}" alt="${altText}" style="aspect-ratio:1;object-fit:cover;width:250px"/></figure>
<!-- /wp:image -->`;
        }

        const trackId = spotifyTrackIds[i] ?? FALLBACK_TRACK_ID;
        const spotifyEmbed = `\n\n<!-- wp:html -->
<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
<!-- /wp:html -->`;

        const author = authors[i];
        const recommendedBy = author
          ? `<a href="${author.link}" target="_blank" rel="noreferrer noopener">${author.name}</a>`
          : (a.user?.username ?? '');

        const richParagraphs = this.extractParagraphs(a.description);
        const firstParagraph = richParagraphs.length
          ? richParagraphs[0]
          : description;
        const extraParagraphBlocks = this.buildExtraParagraphBlocks(
          richParagraphs.slice(1),
        );

        // Envolvemos todo el disco en un wp:group con la clase
        // rv-disc-<discId>: así el bloque tiene un inicio y un final
        // inequívocos que nos permiten localizarlo y sustituirlo entero
        // más adelante si el texto se edita, sin tocar el resto del post.
        return `<!-- wp:group {"className":"rv-disc-${a.disc.id}"} -->
<div class="wp-block-group rv-disc-${a.disc.id}">${imageBlock}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>${artist} &#8211; <em>${discName}</em>${debut}:</strong> ${firstParagraph}</p>
<!-- /wp:paragraph -->${extraParagraphBlocks}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Género: </strong>${genre}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Bandas similares:</strong> ${a.similarBands || 'xx, xx, xx'}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Recomendado por</strong> ${recommendedBy}</p>
<!-- /wp:paragraph -->${spotifyEmbed}

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
</div>
<!-- /wp:group -->`;
      })
      .join('\n\n');
  }

  private static readonly FOOTER_MARKER_CLASS = 'rv-generated-footer';

  private buildSocialFooter(): string {
    return `<!-- wp:separator {"className":"is-style-wide ${ListsService.FOOTER_MARKER_CLASS}","opacity":"css"} -->
<hr class="wp-block-separator has-css-opacity is-style-wide ${ListsService.FOOTER_MARKER_CLASS}"/>
<!-- /wp:separator -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">¡Muchas gracias por leer este artículo! ¿Qué os han parecido estos nuevos discos? ¿Nos hemos dejado <strong>algún disco imprescindible</strong>? No dudéis comentar y en seguirnos en <a href="https://www.riffvalley.es/quienes-somos/quienes-somos" target="_blank" rel="noreferrer noopener">nuestras redes sociales</a>:</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Riff Valley App: </strong><a href="http://app.riffvalley.es/login" target="_blank" rel="noreferrer noopener">app.riffvalley.es/login</a><br><strong>Comunidad de Telegram:</strong>&nbsp;<a href="https://t.me/RiffValleyES" target="_blank" rel="noreferrer noopener">t.me/RiffValleyES</a><br><strong>Facebook:</strong>&nbsp;<a href="https://www.facebook.com/RiffValleyEs/" target="_blank" rel="noreferrer noopener">facebook.com/RiffValleyEs</a><br><strong>Instagram:</strong>&nbsp;<a href="https://www.instagram.com/riffvalleyes/" target="_blank" rel="noreferrer noopener">instagram.com/riffvalleyes</a><br><strong>Threads</strong>: <a href="https://www.threads.net/@riffvalleyes" target="_blank" rel="noreferrer noopener">https://www.threads.net/@riffvalleyes</a><br><strong>Twitter &#8211; X:&nbsp;</strong><a href="https://twitter.com/Riffvalleyes" target="_blank" rel="noreferrer noopener">twitter.com/Riffvalleyes</a><br><strong>Bluesky</strong>: <a href="https://bsky.app/profile/riffvalleyes.bsky.social" target="_blank" rel="noreferrer noopener">bsky.app/profile/riffvalleyes.bsky.social</a></p>
<!-- /wp:paragraph -->`;
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException(
      'An unexpected error occurred',
      error,
    );
  }
}
