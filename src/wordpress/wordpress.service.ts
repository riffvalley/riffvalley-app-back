import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WpPost {
  id: number;
  link: string;
  title: { rendered: string };
  status: string;
}

@Injectable()
export class WordpressService {
  private readonly logger = new Logger('WordpressService');
  private readonly graphqlUrl: string;
  private readonly restApiUrl: string;
  private readonly credentials: string;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.get<string>('WP_USER', '');
    const password = this.configService.get<string>('WP_APP_PASSWORD', '');
    this.graphqlUrl = this.configService.get<string>(
      'WP_GRAPHQL_URL',
      'https://riffvalley.es/graphql',
    );
    this.restApiUrl = this.configService.get<string>(
      'WP_API_URL',
      'https://riffvalley.es/wp-json/wp/v2',
    );
    this.credentials = Buffer.from(`${user}:${password}`).toString('base64');
  }

  async createPost(
    title: string,
    content: string,
    status: 'draft' | 'publish' = 'draft',
    meta?: Record<string, any>,
  ): Promise<WpPost> {
    const statusEnum = status === 'publish' ? 'PUBLISH' : 'DRAFT';

    const mutation = `
      mutation CreatePost($title: String!, $content: String!, $status: PostStatusEnum!) {
        createPost(input: { title: $title, content: $content, status: $status }) {
          post {
            databaseId
            link
            title {
              rendered
            }
            status
          }
        }
      }
    `;

    const gqlResponse = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.credentials}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables: { title, content, status: statusEnum },
      }),
    });

    if (!gqlResponse.ok) {
      const error = await gqlResponse.text();
      this.logger.error(`WPGraphQL request failed: ${gqlResponse.status} - ${error}`);
      throw new Error(`WPGraphQL error: ${gqlResponse.status}`);
    }

    const gqlData = await gqlResponse.json();

    if (gqlData.errors?.length) {
      const errMsg = gqlData.errors.map((e: any) => e.message).join(', ');
      this.logger.error(`WPGraphQL mutation errors: ${errMsg}`);
      throw new Error(`WPGraphQL mutation error: ${errMsg}`);
    }

    const wpPost = gqlData.data?.createPost?.post;
    if (!wpPost) {
      throw new Error('WPGraphQL createPost returned no post');
    }

    const post: WpPost = {
      id: wpPost.databaseId,
      link: wpPost.link,
      title: wpPost.title,
      status: wpPost.status,
    };

    this.logger.log(`Created WP post #${post.id}: ${title}`);

    if (meta && Object.keys(meta).length > 0) {
      await this.updatePostMeta(post.id, meta);
    }

    return post;
  }

  private async updatePostMeta(postId: number, meta: Record<string, any>): Promise<void> {
    const response = await fetch(`${this.restApiUrl}/posts/${postId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.credentials}`,
      },
      body: JSON.stringify({ meta }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to update meta for post #${postId}: ${response.status} - ${error}`);
    }
  }
}
