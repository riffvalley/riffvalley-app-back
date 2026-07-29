import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum InstagramMediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  CAROUSEL_ALBUM = 'CAROUSEL_ALBUM',
}

export interface InstagramCarouselChild {
  id: string;
  mediaUrl: string;
  mediaType: string;
}

@Entity('instagram_post')
export class InstagramPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('varchar', { length: 100 })
  igMediaId: string;

  @Column('text', { nullable: true })
  caption: string | null;

  @Column({ type: 'enum', enum: InstagramMediaType })
  mediaType: InstagramMediaType;

  // FEED, REELS, STORY o AD. Es lo que distingue un Reel (VIDEO + REELS)
  // de un vídeo normal de feed (VIDEO + FEED).
  @Column('text', { nullable: true })
  mediaProductType: string | null;

  @Column('text')
  mediaUrl: string;

  @Column('text', { nullable: true })
  thumbnailUrl: string | null;

  // Solo presente cuando mediaType es CAROUSEL_ALBUM: el resto de fotos/
  // vídeos del álbum, que la Graph API no incluye en media_url del post.
  @Column('jsonb', { nullable: true })
  children: InstagramCarouselChild[] | null;

  @Column('text')
  permalink: string;

  @Column({ type: 'timestamp' })
  igTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
