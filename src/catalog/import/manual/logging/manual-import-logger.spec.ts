import * as fs from 'fs';
import { Test } from '@nestjs/testing';
import { ManualImportLogger } from './manual-import-logger';

describe('ManualImportLogger characterization', () => {
  let stream: {
    write: jest.Mock;
    on: jest.Mock;
    end: jest.Mock;
    close: jest.Mock;
    destroy: jest.Mock;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T12:34:56.000Z'));
    stream = {
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      end: jest.fn(),
      close: jest.fn(),
      destroy: jest.fn(),
    };
    jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream as unknown as fs.WriteStream);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens one append stream when the logger is constructed and reuses it for ordered entries', () => {
    const logger = new ManualImportLogger();

    logger.log('Processing manual data for date: October 4, 2026');
    logger.log('Processed: Artist "Artist" => Disc "Album" => Date: release-date');

    expect(fs.createWriteStream).toHaveBeenCalledTimes(1);
    expect(fs.createWriteStream).toHaveBeenCalledWith('manual_data.log', { flags: 'a' });
    expect(stream.write.mock.calls).toEqual([
      ['[2026-10-04T12:34:56.000Z] Processing manual data for date: October 4, 2026\n'],
      ['[2026-10-04T12:34:56.000Z] Processed: Artist "Artist" => Disc "Album" => Date: release-date\n'],
    ]);
  });

  it('is reused by default-scoped Nest resolution and remains open after module shutdown', async () => {
    const moduleRef = await Test.createTestingModule({ providers: [ManualImportLogger] }).compile();

    expect(moduleRef.get(ManualImportLogger)).toBe(moduleRef.get(ManualImportLogger));
    expect(fs.createWriteStream).toHaveBeenCalledTimes(1);

    await moduleRef.close();

    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.close).not.toHaveBeenCalled();
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it('does not install stream error listeners or explicitly end, close, or destroy the stream', () => {
    const logger = new ManualImportLogger();
    logger.log('entry');

    expect(stream.on).not.toHaveBeenCalled();
    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.close).not.toHaveBeenCalled();
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it('catches synchronous write errors and reports them to the console', () => {
    const logger = new ManualImportLogger();
    const error = new Error('write failed');
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    stream.write.mockImplementation(() => {
      throw error;
    });

    expect(() => logger.log('entry')).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('Error writing to log file:', error);
  });

  it('propagates a synchronous error while opening the stream', () => {
    const error = new Error('open failed');
    (fs.createWriteStream as unknown as jest.Mock).mockImplementation(() => {
      throw error;
    });

    expect(() => new ManualImportLogger()).toThrow(error);
  });
});
