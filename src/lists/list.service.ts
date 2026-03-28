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
import { List, ListType, ListStatus } from './entities/list.entity';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { Content } from 'src/contents/entities/content.entity';
import { WordpressService } from 'src/wordpress/wordpress.service';

@Injectable()
export class ListsService {
  private readonly logger = new Logger('ListsService');

  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly wordpressService: WordpressService,
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

    const rawReleaseDate = list.releaseDate ? new Date(list.releaseDate) : new Date();
    // Music releases happen on Fridays — always use the Friday of the release week
    const releaseDate = new Date(rawReleaseDate);
    const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
    releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const monthName = monthNames[releaseDate.getMonth()];

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

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
      const seoTitle = `Nuevos discos - ${dateStr} (${roman}) • Riff Valley ${year}`;
      const seoDescription = `En el artículo de hoy os recopilamos los nuevos discos que se publican la semana del ${dateStr} y que no te puedes perder.`;
      const content = this.buildPostContent(discs, position, list, title);
      const slug = `nuevos-discos${day}${month}${String(year).slice(-2)}${roman.toLowerCase()}`;

      const meta = {
        rank_math_title: seoTitle,
        rank_math_description: seoDescription,
        rank_math_focus_keyword: `nuevos discos,${monthName},${year}`,
      };

      const existing = await this.wordpressService.findPostBySlug(slug);
      if (existing) {
        this.logger.log(`WP post already exists for slug ${slug} (#${existing.id}), skipping`);
        createdPosts.push({ position, wpPostId: existing.id, link: existing.link, title, skipped: true });
        continue;
      }

      const post = await this.wordpressService.createPost(title, content, 'draft', meta, CATEGORIES, tags, slug);
      createdPosts.push({ position, wpPostId: post.id, link: post.link, title });
    }

    return { created: createdPosts.length, posts: createdPosts };
  }

  private buildPostContent(discs: any[], position: number, list: any, title = ''): string {
    const ordinals = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta'];
    const ordinal = ordinals[position - 1] ?? `${position}ª`;

    const rawReleaseDate = list.releaseDate ? new Date(list.releaseDate) : new Date();
    // Music releases happen on Fridays — always use the Friday of the release week
    const releaseDate = new Date(rawReleaseDate);
    const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
    releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const artistNames = discs.map((a) => a.disc?.artist?.name ?? '');
    const artistNamesHtml = artistNames
      .map((name, i) =>
        i === artistNames.length - 1 && artistNames.length > 1
          ? `y <strong>${name}</strong>`
          : `<strong>${name}</strong>`,
      )
      .join(', ');

    const intro = `<!-- wp:spacer {"height":"7px"} -->
<div style="height:7px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">${ordinal} entrega de novedades de esta semana. Hoy os hablamos de ${discs.length} nuevos discos que se han lanzado esta semana del ${dateStr}: ${artistNamesHtml}.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">No olvides contarnos en nuestras <a href="https://www.instagram.com/riffvalleyes/" target="_blank" rel="noreferrer noopener">redes sociales</a> qué os han parecido estas bandas.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Si quieres saber qué otros discos han sido lanzados esta semana, no dudes en echarle un ojo a nuestra <a href="https://www.riffvalley.es/novedades/discos-metal-rock-hardcore-2025">guía de lanzamientos de 2026</a>.</p>
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

    const discSections = discs
      .map((a) => {
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

        const spotifyEmbed = `\n\n<!-- wp:html -->
<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/track/75EVwxItVYmK59hhfSsBoD?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
<!-- /wp:html -->`;

        const descriptionText = description ? ` ${description}` : '';

        return `${imageBlock}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>${artist} &#8211; <em>${discName}</em>${debut}:</strong>${descriptionText}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Género: </strong>${genre}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Bandas similares:</strong> xx, xx, xx</p>
<!-- /wp:paragraph -->${spotifyEmbed}

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->`;
      })
      .join('\n\n');

    const footer = `<!-- wp:separator {"className":"is-style-wide","opacity":"css"} -->
<hr class="wp-block-separator has-css-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">¡Muchas gracias por leer este artículo! ¿Qué os han parecido estos nuevos discos? ¿Nos hemos dejado <strong>algún disco imprescindible</strong>? No dudéis comentar y en seguirnos en <a href="https://www.riffvalley.es/quienes-somos/quienes-somos" target="_blank" rel="noreferrer noopener">nuestras redes sociales</a>:</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Comunidad de Telegram:</strong>&nbsp;<a href="https://t.me/RiffValleyES" target="_blank" rel="noreferrer noopener">t.me/RiffValleyES</a><br><strong>Facebook:</strong>&nbsp;<a href="https://www.facebook.com/RiffValleyEs/" target="_blank" rel="noreferrer noopener">facebook.com/RiffValleyEs</a><br><strong>Instagram:</strong>&nbsp;<a href="https://www.instagram.com/riffvalleyes/" target="_blank" rel="noreferrer noopener">instagram.com/riffvalleyes</a><br><strong>Threads</strong>: <a href="https://www.threads.net/@riffvalleyes" target="_blank" rel="noreferrer noopener">https://www.threads.net/@riffvalleyes</a><br><strong>Twitter &#8211; X:&nbsp;</strong><a href="https://twitter.com/Riffvalleyes" target="_blank" rel="noreferrer noopener">twitter.com/Riffvalleyes</a><br><strong>Bluesky</strong>: <a href="https://bsky.app/profile/riffvalleyes.bsky.social" target="_blank" rel="noreferrer noopener">bsky.app/profile/riffvalleyes.bsky.social</a></p>
<!-- /wp:paragraph -->`;

    return `${intro}\n\n${discSections}\n\n${footer}`;
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
