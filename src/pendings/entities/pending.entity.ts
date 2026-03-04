import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';

@Entity()
export class Pending {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  editedAt: Date;

  @ManyToOne(() => User, (user) => user.rate, { eager: true, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Disc, (disc) => disc.pendings, {
    onDelete: 'CASCADE',
  })
  disc: Disc;
}
