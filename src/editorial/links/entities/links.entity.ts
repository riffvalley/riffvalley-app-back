import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { List } from 'src/editorial/lists/entities/list.entity';

@Entity()
export class Link {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => List, (list) => list.links, { onDelete: 'CASCADE' })
  list: List;

  @Column('varchar')
  link: string;

  @Column('varchar')
  name: string;
}
