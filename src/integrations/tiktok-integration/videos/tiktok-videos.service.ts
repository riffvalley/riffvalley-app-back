import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TiktokVideosQueryDto } from '../http/dto/tiktok-videos-query.dto';
import { TiktokVideo } from '../entities/tiktok-video.entity';
import {
  formatTiktokException,
  formatTiktokProviderError,
  isTiktokError,
  TiktokApiService,
} from '../api/tiktok-api.service';

// Public contract of /tiktok/videos: excludes embedHtml and internal columns.
export interface TiktokVideoSummary {
  id: string;
  title: string | null;
  coverImageUrl: string | null;
  permalink: string | null;
  embedLink: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  createTime: Date;
}

// A single video detail includes embedHtml for its dedicated view.
export interface TiktokVideoDetail extends TiktokVideoSummary {
  videoDescription: string | null;
  embedHtml: string | null;
}

function toVideoSummary(video: TiktokVideo): TiktokVideoSummary {
  return {
    id: video.tiktokVideoId,
    title: video.title,
    coverImageUrl: video.coverImageUrl,
    permalink: video.permalink,
    embedLink: video.embedLink,
    duration: video.duration,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    createTime: video.tiktokCreateTime,
  };
}

function toVideoDetail(video: TiktokVideo): TiktokVideoDetail {
  return {
    ...toVideoSummary(video),
    videoDescription: video.videoDescription,
    embedHtml: video.embedHtml,
  };
}

@Injectable()
export class TiktokVideosService {
  // Preserve the cron's original log context after moving its implementation.
  private readonly logger = new Logger('TiktokService');

  constructor(
    @InjectRepository(TiktokVideo)
    private readonly videoRepository: Repository<TiktokVideo>,
    private readonly tiktokApi: TiktokApiService,
  ) {}

  async syncVideos(accessToken: string): Promise<void> {
    try {
      let cursor: number | undefined;
      let hasMore = true;
      let syncedCount = 0;
      const maxPages = 20;

      for (let page = 0; hasMore && page < maxPages; page++) {
        const { ok, status, body } = await this.tiktokApi.fetchVideoPage(
          accessToken,
          cursor,
        );

        if (!ok || isTiktokError(body.error)) {
          this.logger.error(
            `TikTok API error (HTTP ${status}): ${formatTiktokProviderError(body.error)}`,
          );
          break;
        }

        for (const node of body.data?.videos ?? []) {
          await this.videoRepository.upsert(
            {
              tiktokVideoId: node.id,
              title: node.title ?? null,
              videoDescription: node.video_description ?? null,
              coverImageUrl: node.cover_image_url ?? null,
              permalink: node.share_url ?? null,
              embedLink: node.embed_link ?? null,
              embedHtml: node.embed_html ?? null,
              duration: node.duration ?? null,
              viewCount: node.view_count ?? null,
              likeCount: node.like_count ?? null,
              commentCount: node.comment_count ?? null,
              shareCount: node.share_count ?? null,
              tiktokCreateTime: new Date((node.create_time ?? 0) * 1000),
            },
            ['tiktokVideoId'],
          );
          syncedCount++;
        }

        hasMore = body.data?.has_more ?? false;
        cursor = body.data?.cursor;
      }

      this.logger.log(`TikTok sync finished: ${syncedCount} videos upserted`);
    } catch (error) {
      this.logger.error(`TikTok sync failed: ${formatTiktokException(error)}`);
    }
  }

  async findVideos(dto: TiktokVideosQueryDto) {
    const { limit = 12, offset = 0 } = dto;

    const [rows, totalItems] = await this.videoRepository.findAndCount({
      order: { tiktokCreateTime: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      data: rows.map(toVideoSummary),
      totalItems,
      hasMore: offset + rows.length < totalItems,
    };
  }

  async findVideoDetail(tiktokVideoId: string): Promise<TiktokVideoDetail> {
    const video = await this.videoRepository.findOne({
      where: { tiktokVideoId },
    });
    if (!video) throw new NotFoundException('Vídeo de TikTok no encontrado');
    return toVideoDetail(video);
  }
}
