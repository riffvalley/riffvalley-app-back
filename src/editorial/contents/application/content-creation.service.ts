import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateContentDto } from '../dto/create-content.dto';
import { Content, ContentType } from '../entities/content.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import {
  Article,
  ArticleStatus,
  ArticleType,
} from 'src/editorial/articles/entities/article.entity';
import {
  Video,
  VideoStatus,
  VideoType,
} from 'src/editorial/videos/entities/video.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { isValidDateValue } from 'src/editorial/lists/domain/list-date-rules';

@Injectable()
export class ContentCreationService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Reunion)
    private readonly reunionRepo: Repository<Reunion>,
    @InjectRepository(RiffValleyPlaylist)
    private readonly riffValleyPlaylistRepository: Repository<RiffValleyPlaylist>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
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
      riffValleyPlaylistId,
      articleId,
      videoId,
      ...rest
    } = createContentDto;
    let resolvedPublicationDate = publicationDate;

    // RADAR and BEST publish through a dated List; REUNION keeps its existing
    // required publication date.
    if (
      (createContentDto.type === ContentType.RADAR ||
        createContentDto.type === ContentType.BEST ||
        createContentDto.type === ContentType.REUNION) &&
      !isValidDateValue(publicationDate)
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
    let existingReunion: Reunion | null = null;
    if (reunionId) {
      existingReunion = await this.reunionRepo.findOne({
        where: { id: reunionId },
      });
      if (!existingReunion) {
        throw new NotFoundException(`Reunion with id ${reunionId} not found`);
      }
    }

    // If riffValleyPlaylistId is provided, fetch the entity to sync initial state (Import state from Entity to Content)
    let existingRiffValleyPlaylist: RiffValleyPlaylist | null = null;
    if (riffValleyPlaylistId) {
      existingRiffValleyPlaylist =
        await this.riffValleyPlaylistRepository.findOne({
          where: { id: riffValleyPlaylistId },
        });
      if (!existingRiffValleyPlaylist) {
        throw new NotFoundException(
          `RiffValleyPlaylist with id ${riffValleyPlaylistId} not found`,
        );
      }

      // If already PUBLISHED, sync content date from it
      if (
        existingRiffValleyPlaylist.status ===
          RiffValleyPlaylistStatus.PUBLISHED &&
        existingRiffValleyPlaylist.updateDate
      ) {
        // Only override if content date wasn't explicitly provided?
        // Or force sync? Usually if linking, we want consistency.
        if (!resolvedPublicationDate) {
          resolvedPublicationDate =
            existingRiffValleyPlaylist.updateDate.toISOString();
          createContentDto.publicationDate = resolvedPublicationDate;
        }
      }
    }

    // If articleId is provided, fetch the entity to sync initial state
    let existingArticle: Article | null = null;
    if (articleId) {
      existingArticle = await this.articleRepo.findOne({
        where: { id: articleId },
      });
      if (!existingArticle) {
        throw new NotFoundException(`Article with id ${articleId} not found`);
      }
      if (
        existingArticle.status === ArticleStatus.PUBLISHED &&
        existingArticle.updateDate
      ) {
        if (!resolvedPublicationDate) {
          resolvedPublicationDate = existingArticle.updateDate.toISOString();
          createContentDto.publicationDate = resolvedPublicationDate;
        }
      }
    }

    // If videoId is provided, fetch the entity to sync initial state
    let existingVideo: Video | null = null;
    if (videoId) {
      existingVideo = await this.videoRepo.findOne({
        where: { id: videoId },
      });
      if (!existingVideo) {
        throw new NotFoundException(`Video with id ${videoId} not found`);
      }
      if (
        existingVideo.status === VideoStatus.PUBLISHED &&
        existingVideo.updateDate
      ) {
        if (!resolvedPublicationDate) {
          resolvedPublicationDate = existingVideo.updateDate.toISOString();
          createContentDto.publicationDate = resolvedPublicationDate;
        }
      }
    }

    const content = this.contentRepo.create({
      ...rest,
      publicationDate: resolvedPublicationDate
        ? new Date(resolvedPublicationDate)
        : undefined,
      closeDate: closeDate ? new Date(closeDate) : undefined,
      listDate: listDate ? new Date(listDate) : undefined,
      author,
      reunionId,
      riffValleyPlaylist: riffValleyPlaylistId
        ? { id: riffValleyPlaylistId }
        : undefined,
      article: articleId ? { id: articleId } : undefined,
      video: videoId ? { id: videoId } : undefined,
      ready: resolvedPublicationDate ? false : rest.ready,
    });

    return this.contentRepo.manager.transaction(async (manager) => {
      const contentRepo = manager.getRepository(Content);

      // Auto-created companions and Content share this transaction. Existing
      // associations above are read-only and remain attached without new rows.
      if (
        createContentDto.type === ContentType.RIFF_VALLEY_PLAYLIST &&
        !riffValleyPlaylistId
      ) {
        const playlistRepo = manager.getRepository(RiffValleyPlaylist);
        const playlist = playlistRepo.create({
          name: rest.name,
          status: RiffValleyPlaylistStatus.EDITING,
          type: RiffValleyPlaylistType.GENERO,
          link: '',
          updateDate: new Date(),
          user: author,
        });
        content.riffValleyPlaylist = await playlistRepo.save(playlist);
      }

      if (createContentDto.type === ContentType.ARTICLE && !articleId) {
        const articleRepo = manager.getRepository(Article);
        const article = articleRepo.create({
          name: rest.name,
          status: ArticleStatus.EDITING,
          type: ArticleType.ARTICULO,
          updateDate: new Date(),
          user: author,
        });
        content.article = await articleRepo.save(article);
      }

      if (createContentDto.type === ContentType.VIDEO && !videoId) {
        const videoRepo = manager.getRepository(Video);
        const video = videoRepo.create({
          name: rest.name,
          status: VideoStatus.EDITING,
          type: VideoType.CUSTOM,
          updateDate: new Date(),
          user: author,
        });
        content.video = await videoRepo.save(video);
      }

      if (createContentDto.type === ContentType.REUNION && existingReunion) {
        content.reunion = existingReunion;
        content.reunionId = existingReunion.id;
      }

      if (createContentDto.type === ContentType.REUNION && !existingReunion) {
        const reunionRepo = manager.getRepository(Reunion);
        const pointRepo = manager.getRepository(Point);
        const reunion = reunionRepo.create({
          titulo: content.name,
          fecha: content.publicationDate || new Date(),
        });
        const savedReunion = await reunionRepo.save(reunion);

        content.reunion = savedReunion;
        content.reunionId = savedReunion.id;
        await pointRepo.save([
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
        ]);
      }

      const saved = await contentRepo.save(content);

      // Preserve the existing RADAR/BEST Content/List transaction and ordering.
      if (saved.type === ContentType.RADAR || saved.type === ContentType.BEST) {
        const list =
          saved.type === ContentType.RADAR
            ? await this.listsService.createWeeklyList(
                saved.publicationDate,
                saved.listDate,
                saved.closeDate,
                manager,
              )
            : await this.listsService.createMonthlyList(
                saved.publicationDate,
                saved.listDate,
                saved.closeDate,
                manager,
              );
        saved.list = list;
        return contentRepo.save(saved);
      }

      return saved;
    });
  }
}
