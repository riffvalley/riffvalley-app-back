import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content, ContentType } from './entities/content.entity';
import { User } from 'src/auth/entities/user.entity';
import { Reunion } from 'src/reunions/entities/reunion.entity';
import { Point } from 'src/points/entities/point.entity';
import {
  Spotify,
  SpotifyStatus,
  SpotifyType,
} from 'src/spotify/entities/spotify.entity';
import {
  Article,
  ArticleStatus,
  ArticleType,
} from 'src/articles/entities/article.entity';
import {
  Video,
  VideoStatus,
  VideoType,
} from 'src/videos/entities/video.entity';
import { ListsService } from 'src/lists/list.service';
import { List } from 'src/lists/entities/list.entity';

@Injectable()
export class ContentsService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Reunion)
    private readonly reunionRepo: Repository<Reunion>,
    @InjectRepository(Point)
    private readonly pointRepo: Repository<Point>,
    @InjectRepository(Spotify)
    private readonly spotifyRepo: Repository<Spotify>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
    @InjectRepository(List)
    private readonly listRepo: Repository<List>,
    @Inject(forwardRef(() => ListsService))
    private readonly listsService: ListsService,
  ) {}

  async create(createContentDto: CreateContentDto): Promise<Content> {
    const {
      authorId,
      publicationDate,
      closeDate,
      listDate,
      reunionId,
      ...rest
    } = createContentDto;

    // RADAR and REUNION always require publicationDate
    if (
      (createContentDto.type === ContentType.RADAR ||
        createContentDto.type === ContentType.REUNION) &&
      !publicationDate
    ) {
      throw new BadRequestException(
        `El tipo ${createContentDto.type} requiere una fecha de publicación.`,
      );
    }

    // Verify user exists
    const author = await this.userRepo.findOne({ where: { id: authorId } });
    if (!author) {
      throw new NotFoundException(`User with id ${authorId} not found`);
    }

    // Verify reunion exists if provided
    if (reunionId) {
      const reunion = await this.reunionRepo.findOne({
        where: { id: reunionId },
      });
      if (!reunion) {
        throw new NotFoundException(`Reunion with id ${reunionId} not found`);
      }
    }

    // If spotifyId is provided, fetch the entity to sync initial state (Import state from Entity to Content)
    if ((rest as any).spotifyId) {
      const existingSpotify = await this.spotifyRepo.findOne({
        where: { id: (rest as any).spotifyId },
      });
      if (existingSpotify) {
        // If already PUBLISHED, sync content date from it
        if (
          existingSpotify.status === SpotifyStatus.PUBLISHED &&
          existingSpotify.updateDate
        ) {
          // Only override if content date wasn't explicitly provided?
          // Or force sync? Usually if linking, we want consistency.
          if (!publicationDate) {
            (rest as any).publicationDate = existingSpotify.updateDate;
            createContentDto.publicationDate =
              existingSpotify.updateDate.toISOString(); // Update DTO for consistency
          }
        }
      }
    }

    // If articleId is provided, fetch the entity to sync initial state
    if ((rest as any).articleId) {
      const existingArticle = await this.articleRepo.findOne({
        where: { id: (rest as any).articleId },
      });
      if (existingArticle) {
        if (
          existingArticle.status === ArticleStatus.PUBLISHED &&
          existingArticle.updateDate
        ) {
          if (!publicationDate) {
            (rest as any).publicationDate = existingArticle.updateDate;
            createContentDto.publicationDate =
              existingArticle.updateDate.toISOString();
          }
        }
      }
    }

    // If videoId is provided, fetch the entity to sync initial state
    if ((rest as any).videoId) {
      const existingVideo = await this.videoRepo.findOne({
        where: { id: (rest as any).videoId },
      });
      if (existingVideo) {
        if (
          existingVideo.status === VideoStatus.PUBLISHED &&
          existingVideo.updateDate
        ) {
          if (!publicationDate) {
            (rest as any).publicationDate = existingVideo.updateDate;
            createContentDto.publicationDate =
              existingVideo.updateDate.toISOString();
          }
        }
      }
    }

    const content = this.contentRepo.create({
      ...rest,
      publicationDate: createContentDto.publicationDate
        ? new Date(createContentDto.publicationDate)
        : undefined,
      closeDate: closeDate ? new Date(closeDate) : undefined,
      listDate: listDate ? new Date(listDate) : undefined,
      author,
      reunionId,
      spotify: (rest as any).spotifyId
        ? { id: (rest as any).spotifyId }
        : undefined,
      article: (rest as any).articleId
        ? { id: (rest as any).articleId }
        : undefined,
      video: (rest as any).videoId ? { id: (rest as any).videoId } : undefined,
      ready: createContentDto.publicationDate ? false : rest.ready,
    });

    // Auto-create Spotify entity if type is SPOTIFY and no spotifyId provided
    if (
      createContentDto.type === ContentType.SPOTIFY &&
      !(rest as any).spotifyId
    ) {
      if (!author) {
        throw new BadRequestException(
          'Cannot auto-create Spotify entity without an assigned author.',
        );
      }

      const spotifyEntity = this.spotifyRepo.create({
        name: rest.name,
        status: SpotifyStatus.EDITING,
        type: SpotifyType.GENERO, // Default type, user can change later
        link: '', // Default empty link
        updateDate: new Date(),
        user: author,
      });
      const savedSpotify = await this.spotifyRepo.save(spotifyEntity);

      content.spotify = savedSpotify;
      // content.spotifyId = savedSpotify.id; // If field existed directly
    }

    // Auto-create Article entity if type is ARTICLE and no articleId provided
    if (
      createContentDto.type === ContentType.ARTICLE &&
      !(rest as any).articleId
    ) {
      if (!author) {
        throw new BadRequestException(
          'Cannot auto-create Article entity without an assigned author.',
        );
      }

      const articleEntity = this.articleRepo.create({
        name: rest.name,
        status: ArticleStatus.EDITING,
        type: ArticleType.ARTICULO, // Default type
        updateDate: new Date(),
        user: author,
      });
      const savedArticle = await this.articleRepo.save(articleEntity);

      content.article = savedArticle;
    }

    // Auto-create Video entity if type is VIDEO and no videoId provided
    if (createContentDto.type === ContentType.VIDEO && !(rest as any).videoId) {
      if (!author) {
        throw new BadRequestException(
          'Cannot auto-create Video entity without an assigned author.',
        );
      }

      const videoEntity = this.videoRepo.create({
        name: rest.name,
        status: VideoStatus.EDITING,
        type: VideoType.CUSTOM,
        updateDate: new Date(),
        user: author,
      });
      const savedVideo = await this.videoRepo.save(videoEntity);

      content.video = savedVideo;
    }

    // Auto-create Reunion if type is REUNION
    if (createContentDto.type === ContentType.REUNION) {
      const reunionDate = content.publicationDate || new Date();
      const reunionTitle = content.name;

      const reunion = this.reunionRepo.create({
        title: reunionTitle,
        date: reunionDate,
      });
      const savedReunion = await this.reunionRepo.save(reunion);

      content.reunion = savedReunion;
      content.reunionId = savedReunion.id;

      // Create default points
      const points = [
        {
          titulo: 'Asignar Radar semanal',
          content: '',
          done: false,
          reunion: savedReunion,
        },
        {
          titulo: 'Crónicas y artículos pendientes',
          content: '',
          done: false,
          reunion: savedReunion,
        },
      ];
      await this.pointRepo.save(points);
    }

    const savedContent = await this.contentRepo.save(content);

    // Auto-create Weekly List if type is RADAR or BEST
    if (savedContent.type === ContentType.RADAR) {
      const list = await this.listsService.createWeeklyList(
        savedContent.publicationDate,
        savedContent.listDate,
        savedContent.closeDate,
      );
      savedContent.list = list;
      await this.contentRepo.save(savedContent);
    } else if (savedContent.type === ContentType.BEST) {
      const list = await this.listsService.createMonthlyList(
        savedContent.publicationDate,
        savedContent.listDate,
        savedContent.closeDate,
      );
      savedContent.list = list;
      await this.contentRepo.save(savedContent);
    }

    return savedContent;
  }

  async findAll(ready?: boolean): Promise<Content[]> {
    const where: any = {};
    if (ready !== undefined) {
      where.ready = ready;
    }
    return this.contentRepo.find({
      where,
      relations: [
        'author',
        'list',
        'list.asignations',
        'spotify',
        'spotify.user',
        'article',
        'article.user',
        'article.editor',
        'video',
        'video.user',
        'video.editor',
      ],
      order: { publicationDate: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Content> {
    const content = await this.contentRepo.findOne({
      where: { id },
      relations: [
        'author',
        'list',
        'spotify',
        'spotify.user',
        'article',
        'article.user',
        'article.editor',
        'video',
        'video.user',
        'video.editor',
      ],
    });

    if (!content) {
      throw new NotFoundException(`Content with id ${id} not found`);
    }

    return content;
  }

  async update(
    id: string,
    updateContentDto: UpdateContentDto,
  ): Promise<Content> {
    const content = await this.findOne(id);

    const {
      authorId,
      publicationDate,
      closeDate,
      listDate,
      reunionId,
      ...rest
    } = updateContentDto;

    // Update author if provided
    if (authorId !== undefined) {
      const author = await this.userRepo.findOne({ where: { id: authorId } });
      if (!author) {
        throw new NotFoundException(`User with id ${authorId} not found`);
      }
      content.author = author;
    }

    // Update reunion if provided
    if (reunionId !== undefined) {
      if (reunionId === null) {
        content.reunionId = null;
      } else {
        const reunion = await this.reunionRepo.findOne({
          where: { id: reunionId },
        });
        if (!reunion) {
          throw new NotFoundException(`Reunion with id ${reunionId} not found`);
        }
        content.reunionId = reunionId;
      }
    }

    // Update other fields
    Object.assign(content, rest);

    if (publicationDate !== undefined) {
      // RADAR and REUNION cannot have publicationDate removed
      const isNullDate =
        publicationDate === null ||
        publicationDate === '' ||
        (typeof publicationDate === 'string' && publicationDate.trim() === '');
      if (
        isNullDate &&
        (content.type === ContentType.RADAR ||
          content.type === ContentType.REUNION)
      ) {
        throw new BadRequestException(
          `El tipo ${content.type} requiere una fecha de publicación.`,
        );
      }

      if ((publicationDate as unknown) instanceof Date) {
        content.publicationDate = publicationDate as unknown as Date;
        content.ready = false;
      } else {
        const newDate =
          publicationDate &&
          typeof publicationDate === 'string' &&
          publicationDate.trim() !== ''
            ? new Date(publicationDate)
            : null;
        content.publicationDate = newDate;
        if (newDate) {
          content.ready = false;
        }
      }
    }

    if (closeDate !== undefined) {
      if ((closeDate as unknown) instanceof Date) {
        content.closeDate = closeDate as unknown as Date;
      } else {
        content.closeDate =
          closeDate && typeof closeDate === 'string' && closeDate.trim() !== ''
            ? new Date(closeDate)
            : null;
      }
    }

    if (listDate !== undefined) {
      if ((listDate as unknown) instanceof Date) {
        content.listDate = listDate as unknown as Date;
      } else {
        content.listDate =
          listDate && typeof listDate === 'string' && listDate.trim() !== ''
            ? new Date(listDate)
            : null;
      }
    }

    const savedContent = await this.contentRepo.save(content);

    // Sync with List (RADAR, BEST, VIDEO)
    if (
      savedContent.type === ContentType.RADAR ||
      savedContent.type === ContentType.BEST ||
      savedContent.type === ContentType.VIDEO
    ) {
      const contentWithList = await this.contentRepo.findOne({
        where: { id: savedContent.id },
        relations: ['list'],
      });

      if (contentWithList && contentWithList.list) {
        let listChanged = false;

        // Sync publicationDate -> releaseDate (NOT listDate - listDate is independent)
        if (contentWithList.publicationDate) {
          const contentDate = new Date(contentWithList.publicationDate);
          const releaseDate = contentWithList.list.releaseDate
            ? new Date(contentWithList.list.releaseDate)
            : null;

          if (!releaseDate || releaseDate.getTime() !== contentDate.getTime()) {
            contentWithList.list.releaseDate = contentDate;
            listChanged = true;
          }
        }

        // Sync content.listDate -> list.listDate (for RADAR, BEST, and VIDEO)
        if (
          savedContent.type === ContentType.RADAR ||
          savedContent.type === ContentType.BEST ||
          savedContent.type === ContentType.VIDEO
        ) {
          if (contentWithList.listDate) {
            const contentListDate = new Date(contentWithList.listDate);
            const listListDate = contentWithList.list.listDate
              ? new Date(contentWithList.list.listDate)
              : null;

            if (
              !listListDate ||
              listListDate.getTime() !== contentListDate.getTime()
            ) {
              contentWithList.list.listDate = contentListDate;
              listChanged = true;
            }
          }
        }

        // Sync closeDate -> closeDate
        if (contentWithList.closeDate) {
          const contentCloseDate = new Date(contentWithList.closeDate);
          const listCloseDate = contentWithList.list.closeDate
            ? new Date(contentWithList.list.closeDate)
            : null;

          if (
            !listCloseDate ||
            listCloseDate.getTime() !== contentCloseDate.getTime()
          ) {
            contentWithList.list.closeDate = contentCloseDate;
            listChanged = true;
          }
        }

        if (listChanged) {
          // Use update on ListsService.
          // Note: ListsService.update triggers Content sync back. ListsService uses updated content values so it should be fine.
          // But to be safe and avoid loops just save repo if possible, but ListsService.update is safer for abstraction.
          // The loop is broken because values will match.
          // Cast list to any to satisfy UpdateListDto
          await this.listsService.update(
            contentWithList.list.id,
            contentWithList.list as any,
          );
        }
      }
    }

    // Sync with Spotify
    if (savedContent.type === ContentType.SPOTIFY) {
      // Ensure we have the relation
      const contentWithSpotify = savedContent.spotify
        ? savedContent
        : await this.contentRepo.findOne({
            where: { id: savedContent.id },
            relations: ['spotify'],
          });

      if (contentWithSpotify && contentWithSpotify.spotify) {
        const spotifyEntity = await this.spotifyRepo.findOne({
          where: { id: contentWithSpotify.spotify.id },
        });

        if (spotifyEntity) {
          let spotifyChanged = false;

          if (savedContent.publicationDate) {
            // Content Published -> Spotify PUBLISHED + Date Sync
            const contentDate = new Date(savedContent.publicationDate);
            const spotifyDate = spotifyEntity.updateDate
              ? new Date(spotifyEntity.updateDate)
              : null;

            // Sync Date (ignoring time component discrepancies if we want to be strict, but updating to latest content date usually implies intention)
            // If the dates are completely different days, definitely update.
            // If spotifyDate is timestamp, contentDate is YYYY-MM-DD 00:00:00.
            if (
              !spotifyDate ||
              spotifyDate.getTime() !== contentDate.getTime()
            ) {
              spotifyEntity.updateDate = contentDate;
              spotifyChanged = true;
            }

            if (spotifyEntity.status !== SpotifyStatus.PUBLISHED) {
              spotifyEntity.status = SpotifyStatus.PUBLISHED;
              spotifyChanged = true;
            }
          } else {
            // Content Backlog (null date) -> Spotify READY
            if (spotifyEntity.status !== SpotifyStatus.READY) {
              // If it was PUBLISHED, and we remove date, it goes to READY.
              // Assuming it has user assigned (which strictly it should if it was PUBLISHED or READY before).
              spotifyEntity.status = SpotifyStatus.READY;
              spotifyChanged = true;
            }
          }

          if (spotifyChanged) {
            await this.spotifyRepo.save(spotifyEntity);
          }
        }
      }
    }

    // Sync with Article
    if (savedContent.type === ContentType.ARTICLE) {
      const contentWithArticle = savedContent.article
        ? savedContent
        : await this.contentRepo.findOne({
            where: { id: savedContent.id },
            relations: ['article'],
          });

      if (contentWithArticle && contentWithArticle.article) {
        const articleEntity = await this.articleRepo.findOne({
          where: { id: contentWithArticle.article.id },
        });

        if (articleEntity) {
          let articleChanged = false;

          if (savedContent.publicationDate) {
            // Content Published -> Article PUBLISHED + Date Sync
            const contentDate = new Date(savedContent.publicationDate);
            const articleDate = articleEntity.updateDate
              ? new Date(articleEntity.updateDate)
              : null;

            if (
              !articleDate ||
              articleDate.getTime() !== contentDate.getTime()
            ) {
              articleEntity.updateDate = contentDate;
              articleChanged = true;
            }

            if (articleEntity.status !== ArticleStatus.PUBLISHED) {
              articleEntity.status = ArticleStatus.PUBLISHED;
              articleChanged = true;
            }
          }

          if (articleChanged) {
            await this.articleRepo.save(articleEntity);
          }
        }
      }
    }

    // Sync with Video
    if (savedContent.type === ContentType.VIDEO) {
      const contentWithVideo = savedContent.video
        ? savedContent
        : await this.contentRepo.findOne({
            where: { id: savedContent.id },
            relations: ['video'],
          });

      if (contentWithVideo && contentWithVideo.video) {
        const videoEntity = await this.videoRepo.findOne({
          where: { id: contentWithVideo.video.id },
        });

        if (videoEntity) {
          let videoChanged = false;

          if (savedContent.publicationDate) {
            const contentDate = new Date(savedContent.publicationDate);
            const videoDate = videoEntity.updateDate
              ? new Date(videoEntity.updateDate)
              : null;

            if (!videoDate || videoDate.getTime() !== contentDate.getTime()) {
              videoEntity.updateDate = contentDate;
              videoChanged = true;
            }

            if (videoEntity.status !== VideoStatus.PUBLISHED) {
              videoEntity.status = VideoStatus.PUBLISHED;
              videoChanged = true;
            }
          }

          if (videoChanged) {
            await this.videoRepo.save(videoEntity);
          }
        }
      }
    }

    // Sync with Reunion (Content.publicationDate -> Reunion.date)
    if (savedContent.type === ContentType.REUNION || savedContent.reunionId) {
      // Ensure we have the relation loaded or use reunionId
      let reunionIdToUpdate = savedContent.reunionId;

      if (!reunionIdToUpdate && savedContent.reunion) {
        reunionIdToUpdate = savedContent.reunion.id;
      }

      // If we don't have id but know it should exist (rare case if relations not loaded), fetch it
      if (!reunionIdToUpdate && savedContent.type === ContentType.REUNION) {
        const contentWithReunion = await this.contentRepo.findOne({
          where: { id: savedContent.id },
          relations: ['reunion'],
        });
        if (contentWithReunion && contentWithReunion.reunion) {
          reunionIdToUpdate = contentWithReunion.reunion.id;
        }
      }

      if (
        reunionIdToUpdate &&
        (savedContent.publicationDate || savedContent.name)
      ) {
        const reunionEntity = await this.reunionRepo.findOne({
          where: { id: reunionIdToUpdate },
        });

        if (reunionEntity) {
          let reunionChanged = false;

          if (savedContent.publicationDate) {
            const contentDate = new Date(savedContent.publicationDate);
            const reunionDate = reunionEntity.date
              ? new Date(reunionEntity.date)
              : null;

            if (
              !reunionDate ||
              reunionDate.getTime() !== contentDate.getTime()
            ) {
              reunionEntity.date = contentDate;
              reunionChanged = true;
            }
          }

          if (savedContent.name && reunionEntity.title !== savedContent.name) {
            reunionEntity.title = savedContent.name;
            reunionChanged = true;
          }

          if (reunionChanged) {
            await this.reunionRepo.save(reunionEntity);
          }
        }
      }
    }

    return savedContent;
  }

  async remove(id: string): Promise<void> {
    const content = await this.contentRepo.findOne({
      where: { id },
      relations: ['list', 'reunion', 'spotify', 'article', 'video'],
    });

    if (!content) {
      throw new NotFoundException(`Content with id ${id} not found`);
    }

    // Save references before removing content
    const spotifyId = content.spotify?.id;
    const articleId = content.article?.id;
    const videoId = content.video?.id;
    const listId = content.list?.id;

    await this.contentRepo.remove(content);

    if (content.reunion) {
      await this.reunionRepo.delete(content.reunion.id);
    }

    // Delete associated List (like Reunion)
    if (listId) {
      await this.listsService.removeList(listId);
    }

    // Unlinked entities go back to IN_PROGRESS
    if (spotifyId) {
      await this.spotifyRepo.update(spotifyId, {
        status: SpotifyStatus.IN_PROGRESS,
      });
    }
    if (articleId) {
      await this.articleRepo.update(articleId, {
        status: ArticleStatus.IN_PROGRESS,
      });
    }
    if (videoId) {
      await this.videoRepo.update(videoId, {
        status: VideoStatus.IN_PROGRESS,
      });
    }
  }

  async findByMonth(year: number, month: number): Promise<Content[]> {
    // Get the first day of the month
    const firstDayOfMonth = new Date(year, month - 1, 1);
    // Get the last day of the month
    const lastDayOfMonth = new Date(year, month, 0);

    // Extend to include the week before (7 days before first day)
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - 7);

    // Extend to include the week after (7 days after last day)
    const endDate = new Date(lastDayOfMonth);
    endDate.setDate(endDate.getDate() + 7);

    return this.contentRepo
      .createQueryBuilder('content')
      .leftJoinAndSelect('content.author', 'author')
      .leftJoinAndSelect('content.list', 'list')
      .leftJoinAndSelect('list.asignations', 'asignations')
      .leftJoinAndSelect('content.spotify', 'spotify')
      .leftJoinAndSelect('spotify.user', 'spotifyUser')
      .leftJoinAndSelect('content.article', 'article')
      .leftJoinAndSelect('article.user', 'articleUser')
      .leftJoinAndSelect('article.editor', 'articleEditor')
      .leftJoinAndSelect('content.video', 'video')
      .leftJoinAndSelect('video.user', 'videoUser')
      .leftJoinAndSelect('video.editor', 'videoEditor')
      .where('content.publicationDate >= :startDate', { startDate })
      .andWhere('content.publicationDate <= :endDate', { endDate })
      .orderBy('content.publicationDate', 'DESC')
      .getMany();
  }

  async findOneBySpotifyId(spotifyId: string): Promise<Content | null> {
    return this.contentRepo.findOne({
      where: { spotify: { id: spotifyId } },
    });
  }

  async findOneByArticleId(articleId: string): Promise<Content | null> {
    return this.contentRepo.findOne({
      where: { article: { id: articleId } },
    });
  }

  async findOneByVideoId(videoId: string): Promise<Content | null> {
    return this.contentRepo.findOne({
      where: { video: { id: videoId } },
    });
  }

  async getDefaultAuthorId(): Promise<string> {
    const author = await this.userRepo.findOne({
      select: ['id'],
      where: {},
      order: { id: 'ASC' },
    });
    if (!author) {
      throw new NotFoundException('No default user found');
    }
    return author.id;
  }
}
