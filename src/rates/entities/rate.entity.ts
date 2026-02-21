import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Disc } from '../../discs/entities/disc.entity';

@Entity()
export class Rate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 4, scale: 2, nullable: true })
  rate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  editedAt: Date;

  @Column('decimal', { precision: 4, scale: 2, nullable: true })
  cover: number;

  @ManyToOne(() => User, (user) => user.rate, { eager: true })
  user: User;

  @ManyToOne(() => Disc, (disc) => disc.rates, {
    onDelete: 'CASCADE',
    eager: true,
  })
  disc: Disc;
}
