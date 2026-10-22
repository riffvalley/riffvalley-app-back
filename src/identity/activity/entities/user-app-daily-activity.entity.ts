import { User } from '../../auth/entities/user.entity';
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

@Entity('user_app_daily_activity')
export class UserAppDailyActivity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @PrimaryColumn('date', { name: 'activity_date' })
  activityDate: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_user_app_daily_activity_user',
  })
  user: User;
}
