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

  // Null cuando la Graph API de Meta no devuelve media_url para este post.
  // Ocurre de forma intermitente con algunos Reels, sin relación aparente
  // con su antigüedad; es una limitación de la API de Meta, no del sync.
  @Column('text', { nullable: true })
  mediaUrl: string | null;

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
