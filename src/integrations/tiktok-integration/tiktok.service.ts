import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TiktokVideosQueryDto } from './http/dto/tiktok-videos-query.dto';
import { TiktokConnectionService } from './oauth/tiktok-connection.service';
import { formatTiktokException } from './api/tiktok-api.service';
import { TiktokVideosService } from './videos/tiktok-videos.service';

export {
  TiktokVideoDetail,
  TiktokVideoSummary,
} from './videos/tiktok-videos.service';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(
    private readonly tiktokConnection: TiktokConnectionService,
    private readonly tiktokVideos: TiktokVideosService,
  ) {}

  startConnection() {
    return this.tiktokConnection.startConnection();
  }

  completeConnection(code: string, state: string) {
    return this.tiktokConnection.completeConnection(code, state);
  }

  getConnection() {
    return this.tiktokConnection.getConnection();
  }

  disconnect() {
    return this.tiktokConnection.disconnect();
  }

  checkAuthorizationLifetime(): Promise<void> {
    return this.tiktokConnection.checkAuthorizationLifetime();
  }

  // The facade coordinates authorization with the video sync; schedule stays here.
  @Cron(process.env.TIKTOK_SYNC_CRON || '*/10 * * * *')
  async syncVideos(): Promise<void> {
    let accessToken: string;
    try {
      accessToken = await this.tiktokConnection.getValidAccessToken([
        'video.list',
      ]);
    } catch (error) {
      this.logger.warn(`TikTok sync omitido: ${formatTiktokException(error)}`);
      return;
    }

    await this.tiktokVideos.syncVideos(accessToken);
  }

  findVideos(dto: TiktokVideosQueryDto) {
    return this.tiktokVideos.findVideos(dto);
  }

  findVideoDetail(tiktokVideoId: string) {
    return this.tiktokVideos.findVideoDetail(tiktokVideoId);
  }
}
