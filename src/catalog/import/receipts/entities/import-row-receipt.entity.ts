import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ImportReceiptJsonValue =
  | string
  | number
  | boolean
  | null
  | ImportReceiptJsonValue[]
  | { [key: string]: ImportReceiptJsonValue };

export type ImportReceiptResult = {
  [key: string]: ImportReceiptJsonValue;
};

export type ImportRowReceiptStatus = 'processing' | 'completed';
export type ImportReceiptOperation = 'create-event' | 'expand-lineup';

@Entity('catalog_import_row_receipts')
@Index(
  'UQ_catalog_import_row_receipts_identity',
  ['editorId', 'batchId', 'rowId', 'operation'],
  { unique: true },
)
@Check(
  'CHK_catalog_import_row_receipts_status',
  `"status" IN ('processing', 'completed')`,
)
@Check(
  'CHK_catalog_import_row_receipts_payload_hash',
  `"payload_hash" ~ '^[a-f0-9]{64}$'`,
)
@Check(
  'CHK_catalog_import_row_receipts_result',
  `("status" = 'processing' AND "result" IS NULL) OR ("status" = 'completed' AND "result" IS NOT NULL AND jsonb_typeof("result") = 'object')`,
)
export class ImportRowReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'editor_id' })
  editorId: string;

  @Column('uuid', { name: 'batch_id' })
  batchId: string;

  @Column('uuid', { name: 'row_id' })
  rowId: string;

  @Column('varchar', { length: 30, default: 'create-event' })
  operation: ImportReceiptOperation;

  @Column('varchar', { name: 'payload_hash', length: 64 })
  payloadHash: string;

  @Column('varchar', { length: 20 })
  status: ImportRowReceiptStatus;

  @Column('jsonb', { nullable: true })
  result: ImportReceiptResult | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
