import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwitterApi } from 'twitter-api-v2';
import { PublishPostDto } from './dto/publish-post.dto';

export interface PlatformResult {
  platform: string;
  success: boolean;
  dryRun?: boolean;
  postId?: string;
  url?: string;
  error?: string;
  payload?: any;
}

@Injectable()
export class SocialService {
  private readonly logger = new Logger('SocialService');

  constructor(private readonly config: ConfigService) {}

  async publishAll(dto: PublishPostDto): Promise<PlatformResult[]> {
    const results = await Promise.allSettled([
      this.publishToTwitter(dto),
      this.publishToFacebook(dto),
      this.publishToInstagram(dto),
      this.publishToThreads(dto),
      this.publishToBluesky(dto),
      this.publishToTelegram(dto),
    ]);

    return results.map((r) =>
      r.status === 'fulfilled' ? r.value : { platform: 'unknown', success: false, error: r.reason?.message },
    );
  }

  private async publishToTwitter(dto: PublishPostDto): Promise<PlatformResult> {
    const platform = 'twitter';
    const apiKey = this.config.get<string>('TWITTER_API_KEY');
    const apiSecret = this.config.get<string>('TWITTER_API_SECRET');
    const accessToken = this.config.get<string>('TWITTER_ACCESS_TOKEN');
    const accessSecret = this.config.get<string>('TWITTER_ACCESS_TOKEN_SECRET');

    const payload = { text: dto.text };

    if (dto.dryRun) return { platform, success: true, dryRun: true, payload };

    try {
      const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
      const tweet = await client.v2.tweet(dto.text);
      return { platform, success: true, postId: tweet.data.id, url: `https://twitter.com/i/web/status/${tweet.data.id}` };
    } catch (error) {
      this.logger.error(`Twitter error: ${error.message}`);
      return { platform, success: false, error: error.message };
    }
  }

  private async publishToFacebook(dto: PublishPostDto): Promise<PlatformResult> {
    const platform = 'facebook';
    const pageId = this.config.get<string>('FACEBOOK_PAGE_ID');
    const pageToken = this.config.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN');

    const payload: any = { message: dto.text, access_token: pageToken };
    if (dto.imageUrl) payload.link = dto.imageUrl;

    if (dto.dryRun) return { platform, success: true, dryRun: true, payload: { message: dto.text, imageUrl: dto.imageUrl } };

    try {
      const endpoint = dto.imageUrl
        ? `https://graph.facebook.com/v21.0/${pageId}/photos`
        : `https://graph.facebook.com/v21.0/${pageId}/feed`;

      const body: any = { message: dto.text, access_token: pageToken };
      if (dto.imageUrl) body.url = dto.imageUrl;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error?.message || 'Facebook API error');

      const postId = data.id || data.post_id;
      return { platform, success: true, postId, url: `https://www.facebook.com/${postId}` };
    } catch (error) {
      this.logger.error(`Facebook error: ${error.message}`);
      return { platform, success: false, error: error.message };
    }
  }

  private async publishToInstagram(dto: PublishPostDto): Promise<PlatformResult> {
    const platform = 'instagram';
    const accountId = this.config.get<string>('INSTAGRAM_BUSINESS_ACCOUNT_ID');
    const token = this.config.get<string>('INSTAGRAM_ACCESS_TOKEN');

    if (dto.dryRun) return { platform, success: true, dryRun: true, payload: { caption: dto.text, imageUrl: dto.imageUrl } };

    try {
      // Instagram requiere imagen para publicar en el feed; sin imagen se publica como Reel caption o se salta
      if (!dto.imageUrl) {
        return { platform, success: false, error: 'Instagram requires an image to publish a feed post' };
      }

      // Step 1: crear el media container
      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: dto.imageUrl, caption: dto.text, access_token: token }),
      });
      const container = await containerRes.json() as any;
      if (!containerRes.ok || container.error) throw new Error(container.error?.message || 'Instagram container error');

      // Step 2: publicar el container
      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      });
      const published = await publishRes.json() as any;
      if (!publishRes.ok || published.error) throw new Error(published.error?.message || 'Instagram publish error');

      return { platform, success: true, postId: published.id };
    } catch (error) {
      this.logger.error(`Instagram error: ${error.message}`);
      return { platform, success: false, error: error.message };
    }
  }

  private async publishToThreads(dto: PublishPostDto): Promise<PlatformResult> {
    const platform = 'threads';
    const userId = this.config.get<string>('THREADS_USER_ID');
    const token = this.config.get<string>('THREADS_ACCESS_TOKEN');

    if (dto.dryRun) return { platform, success: true, dryRun: true, payload: { text: dto.text, imageUrl: dto.imageUrl } };

    try {
      const containerBody: any = {
        media_type: dto.imageUrl ? 'IMAGE' : 'TEXT',
        text: dto.text,
        access_token: token,
      };
      if (dto.imageUrl) containerBody.image_url = dto.imageUrl;

      // Step 1: crear el media container
      const containerRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
      });
      const container = await containerRes.json() as any;
      if (!containerRes.ok || container.error) throw new Error(container.error?.message || 'Threads container error');

      // Step 2: publicar
      const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      });
      const published = await publishRes.json() as any;
      if (!publishRes.ok || published.error) throw new Error(published.error?.message || 'Threads publish error');

      return { platform, success: true, postId: published.id };
    } catch (error) {
      this.logger.error(`Threads error: ${error.message}`);
      return { platform, success: false, error: error.message };
    }
  }

  private async publishToBluesky(dto: PublishPostDto): Promise<PlatformResult> {
    const platform = 'bluesky';
    const identifier = this.config.get<string>('BLUESKY_IDENTIFIER');
    const appPassword = this.config.get<string>('BLUESKY_APP_PASSWORD');
    const BSKY = 'https://bsky.social/xrpc';

    if (dto.dryRun) return { platform, success: true, dryRun: true, payload: { text: dto.text } };

    try {
      // Step 1: autenticar
      const sessionRes = await fetch(`${BSKY}/com.atproto.server.createSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password: appPassword }),
      });
      const session = await sessionRes.json() as any;
      if (!sessionRes.ok) throw new Error(session.message || 'Bluesky auth error');

      const { accessJwt, did } = session;
      const authHeader = { Authorization: `Bearer ${accessJwt}`, 'Content-Type': 'application/json' };

      const record: any = { $type: 'app.bsky.feed.post', text: dto.text, createdAt: new Date().toISOString() };

      // Step 2: si hay imagen, subirla como blob
      if (dto.imageUrl) {
        const imgRes = await fetch(dto.imageUrl);
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

        const blobRes = await fetch(`${BSKY}/com.atproto.repo.uploadBlob`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': contentType },
          body: imgBuffer,
        });
        const blobData = await blobRes.json() as any;
        if (!blobRes.ok) throw new Error(blobData.message || 'Bluesky blob upload error');

        record.embed = {
          $type: 'app.bsky.embed.images',
          images: [{ image: blobData.blob, alt: '' }],
        };
      }

      // Step 3: crear el post
      const postRes = await fetch(`${BSKY}/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
      });
      const post = await postRes.json() as any;
      if (!postRes.ok) throw new Error(post.message || 'Bluesky post error');

      const rkey = post.uri.split('/').pop();
      const handle = identifier.replace('@', '');
      return { platform, success: true, postId: post.uri, url: `https://bsky.app/profile/${handle}/post/${rkey}` };
    } catch (error) {
      this.logger.error(`Bluesky error: ${error.message}`);
      return { platform, success: false, error: error.message };
    }
  }

  private async publishToTelegram(dto: PublishPostDto): Promise<PlatformResult> {
    const platform = 'telegram';
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const channelId = this.config.get<string>('TELEGRAM_CHANNEL_ID');

    if (dto.dryRun) return { platform, success: true, dryRun: true, payload: { text: dto.text, imageUrl: dto.imageUrl } };

    try {
      let res: Response;
      let data: any;

      if (dto.imageUrl) {
        res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: channelId, photo: dto.imageUrl, caption: dto.text }),
        });
      } else {
        res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: channelId, text: dto.text }),
        });
      }

      data = await res.json();
      if (!data.ok) throw new Error(data.description || 'Telegram API error');

      const msgId = data.result?.message_id;
      return { platform, success: true, postId: String(msgId) };
    } catch (error) {
      this.logger.error(`Telegram error: ${error.message}`);
      return { platform, success: false, error: error.message };
    }
  }
}
