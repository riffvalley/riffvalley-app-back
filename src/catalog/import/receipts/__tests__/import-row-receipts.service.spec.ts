import { EntityManager } from 'typeorm';
import {
  ImportRowIdentity,
  ImportRowReceiptsService,
} from '../import-row-receipts.service';

interface StoredReceipt {
  payloadHash: string;
  status: string;
  result: { eventId: string } | null;
}

describe('ImportRowReceiptsService', () => {
  let service: ImportRowReceiptsService;
  let manager: { query: jest.Mock };
  let receipts: Map<string, StoredReceipt>;
  let transaction: jest.Mock;

  beforeEach(() => {
    receipts = new Map();
    manager = {
      query: jest.fn(async (sql: string, parameters: unknown[]) => {
        const key = parameters.slice(0, 4).join(':');
        if (sql.includes('INSERT INTO')) {
          const [editorId, batchId, rowId, operation, payloadHash] = parameters;
          if (receipts.has(key)) return [];
          receipts.set(key, {
            payloadHash: String(payloadHash),
            status: 'processing',
            result: null,
          });
          return [{ id: `${editorId}:${batchId}:${rowId}:${operation}` }];
        }
        if (sql.includes('SELECT')) {
          const receipt = receipts.get(key);
          return receipt
            ? [
                {
                  payload_hash: receipt.payloadHash,
                  status: receipt.status,
                  result: receipt.result,
                },
              ]
            : [];
        }
        if (sql.includes('UPDATE')) {
          const receipt = receipts.get(
            [...parameters.slice(0, 3), parameters[4]].join(':'),
          );
          if (receipt) {
            receipt.status = 'completed';
            receipt.result = JSON.parse(String(parameters[3])) as {
              eventId: string;
            };
          }
          return [];
        }
        throw new Error('Unexpected receipt SQL');
      }),
    };
    transaction = jest.fn(
      async (callback: (entityManager: EntityManager) => Promise<unknown>) => {
        const before = new Map(receipts);
        try {
          return await callback(manager as never);
        } catch (error) {
          receipts = before;
          throw error;
        }
      },
    );
    service = new ImportRowReceiptsService({ transaction } as never);
  });

  const identity: ImportRowIdentity = {
    editorId: 'editor-1',
    batchId: 'batch-1',
    rowId: 'row-1',
  };

  it('returns the completed result for an identical retry without rerunning work', async () => {
    const operation = jest.fn(async () => ({ eventId: 'event-1' }));
    await expect(
      service.execute(
        identity,
        { name: 'Tour', startDate: '2027-01-01' },
        operation,
      ),
    ).resolves.toEqual({ replayed: false, result: { eventId: 'event-1' } });
    await expect(
      service.execute(
        identity,
        { startDate: '2027-01-01', name: 'Tour' },
        operation,
      ),
    ).resolves.toEqual({ replayed: true, result: { eventId: 'event-1' } });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('conflicts when an identity is reused with changed content', async () => {
    await service.execute(identity, { name: 'First' }, async () => ({
      eventId: 'event-1',
    }));
    await expect(
      service.execute(identity, { name: 'Edited' }, async () => ({
        eventId: 'event-2',
      })),
    ).rejects.toMatchObject({
      response: { code: 'IMPORT_OPERATION_ID_REUSED' },
    });
    expect(receipts.size).toBe(1);
  });

  it('isolates receipts by editor even when batch and row identifiers match', async () => {
    const otherEditor = { ...identity, editorId: 'editor-2' };
    await service.execute(identity, { name: 'Same row' }, async () => ({
      eventId: 'event-1',
    }));
    await expect(
      service.execute(otherEditor, { name: 'Same row' }, async () => ({
        eventId: 'event-2',
      })),
    ).resolves.toEqual({ replayed: false, result: { eventId: 'event-2' } });
    expect(receipts.size).toBe(2);
  });

  it('passes one transaction manager to both receipt persistence and the operation', async () => {
    const operation = jest.fn(async (entityManager: EntityManager) => {
      await entityManager.query('INSERT INTO imported_events VALUES ($1)', [
        'event-1',
      ]);
      return { eventId: 'event-1' };
    });
    await service.execute(identity, { name: 'Tour' }, operation);
    expect(operation).toHaveBeenCalledWith(manager);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "catalog_import_row_receipts"'),
      expect.arrayContaining(['editor-1', 'batch-1', 'row-1']),
    );
  });

  it('separates create and lineup operations under the same row identity', async () => {
    await service.execute(identity, { name: 'Original row' }, async () => ({
      eventId: 'event-1',
    }));
    await expect(
      service.execute(
        { ...identity, operation: 'expand-lineup' },
        { eventId: 'event-1', artists: ['Artist B'] },
        async () => ({ eventId: 'event-1', status: 'updated' }),
      ),
    ).resolves.toMatchObject({ replayed: false });
    expect(receipts.size).toBe(2);
  });

  it('rolls the receipt reservation back when lineup persistence fails', async () => {
    await expect(
      service.execute(
        { ...identity, operation: 'expand-lineup' },
        { eventId: 'event-1', artists: ['New Artist'] },
        async () => {
          throw new Error('EventArtist insert failed');
        },
      ),
    ).rejects.toThrow('EventArtist insert failed');
    expect(receipts.size).toBe(0);
  });
});
