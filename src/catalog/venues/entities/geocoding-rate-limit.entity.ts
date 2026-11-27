import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('locality_geocoding_rate_limit')
@Check('CHK_locality_geocoding_rate_limit_singleton', '"id" = 1')
export class GeocodingRateLimit {
  @PrimaryColumn('smallint')
  id: number;

  @Column({ name: 'last_request_at', type: 'timestamptz', nullable: true })
  lastRequestAt: Date | null;
}
