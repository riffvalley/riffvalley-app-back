import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  ImportReceiptJsonValue,
  ImportReceiptOperation,
  ImportReceiptResult,
} from './entities/import-row-receipt.entity';

interface ReceiptRow {
  row_id?: string;
  payload_hash: string;
  status: string;
  result: ImportReceiptResult | null;
}

export interface ImportRowIdentity {
  editorId: string;
  batchId: string;
  rowId: string;
  operation?: ImportReceiptOperation;
}

function canonicalize(value: ImportReceiptJsonValue): ImportReceiptJsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

@Injectable()
export class ImportRowReceiptsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async lookupMany(
    editorId: string,
    batchId: string,
    rows: Array<{ rowId: string; content: ImportReceiptJsonValue }>,
    operation: ImportReceiptOperation = 'create-event',
  ): Promise<
    Map<string, { result: ImportReceiptResult } | { conflict: true }>
  > {
    if (!rows.length) return new Map();
    const hashes = new Map(
      rows.map(({ rowId, content }) => [rowId, this.hashContent(content)]),
    );
    const receipts = await this.dataSource.query<ReceiptRow[]>(
      `SELECT "row_id", "payload_hash", "status", "result"
       FROM "catalog_import_row_receipts"
       WHERE "editor_id" = $1 AND "batch_id" = $2 AND "operation" = $3
         AND "row_id" = ANY($4::uuid[])`,
      [editorId, batchId, operation, rows.map(({ rowId }) => rowId)],
    );
    const outcomes = new Map<
      string,
      { result: ImportReceiptResult } | { conflict: true }
    >();
    for (const receipt of receipts) {
      if (!receipt.row_id) continue;
      if (
        receipt.payload_hash !== hashes.get(receipt.row_id) ||
        receipt.status !== 'completed' ||
        receipt.result === null
      ) {
        outcomes.set(receipt.row_id, { conflict: true });
      } else {
        outcomes.set(receipt.row_id, { result: receipt.result });
      }
    }
    return outcomes;
  }

  async execute(
    identity: ImportRowIdentity,
    processedContent: ImportReceiptJsonValue,
    operation: (manager: EntityManager) => Promise<ImportReceiptResult>,
  ): Promise<{ replayed: boolean; result: ImportReceiptResult }> {
    const payloadHash = this.hashContent(processedContent);
    const operationName = identity.operation ?? 'create-event';

    return this.dataSource.transaction(async (manager) => {
      const insertedRows = await manager.query<Array<{ id: string }>>(
        `INSERT INTO "catalog_import_row_receipts"
          ("editor_id", "batch_id", "row_id", "operation", "payload_hash", "status", "result")
         VALUES ($1, $2, $3, $4, $5, 'processing', NULL)
         ON CONFLICT ("editor_id", "batch_id", "row_id", "operation") DO NOTHING
         RETURNING "id"`,
        [
          identity.editorId,
          identity.batchId,
          identity.rowId,
          operationName,
          payloadHash,
        ],
      );
      const receiptRows = await manager.query<ReceiptRow[]>(
        `SELECT "payload_hash", "status", "result"
         FROM "catalog_import_row_receipts"
         WHERE "editor_id" = $1 AND "batch_id" = $2 AND "row_id" = $3 AND "operation" = $4
         FOR UPDATE`,
        [identity.editorId, identity.batchId, identity.rowId, operationName],
      );
      const receipt = receiptRows[0];
      if (!receipt)
        throw new ConflictException('Import row receipt could not be reserved');

      if (receipt.payload_hash !== payloadHash)
        throw new ConflictException({
          code: 'IMPORT_OPERATION_ID_REUSED',
          message:
            'This import row identity was already used with different content; use a new row identity',
        });

      if (insertedRows.length === 0) {
        if (receipt.status !== 'completed' || receipt.result === null)
          throw new ConflictException({
            code: 'IMPORT_OPERATION_IN_PROGRESS',
            message: 'This import row operation is already being processed',
          });
        return { replayed: true, result: receipt.result };
      }

      const result = await operation(manager);
      await manager.query(
        `UPDATE "catalog_import_row_receipts"
         SET "status" = 'completed', "result" = $4, "updated_at" = now()
         WHERE "editor_id" = $1 AND "batch_id" = $2 AND "row_id" = $3 AND "operation" = $5`,
        [
          identity.editorId,
          identity.batchId,
          identity.rowId,
          JSON.stringify(result),
          operationName,
        ],
      );
      return { replayed: false, result };
    });
  }

  private hashContent(content: ImportReceiptJsonValue): string {
    return createHash('sha256')
      .update(JSON.stringify(canonicalize(content)))
      .digest('hex');
  }
}
