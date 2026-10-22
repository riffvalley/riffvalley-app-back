import * as winston from 'winston';
import { winstonConfig } from '../winston.config';

const originalStage = process.env.STAGE;

function transformLog(level: string, context: string) {
  const format = winstonConfig.transports[0].format;

  if (!format) {
    throw new Error('Expected console transport to define a format');
  }

  return format.transform(
    { level, context, message: 'Mapped route' },
    format.options,
  );
}

describe('winstonConfig', () => {
  afterEach(() => {
    if (originalStage === undefined) {
      delete process.env.STAGE;
    } else {
      process.env.STAGE = originalStage;
    }
  });

  it('uses only the console transport', () => {
    expect(winstonConfig.transports).toHaveLength(1);
    expect(winstonConfig.transports[0]).toBeInstanceOf(
      winston.transports.Console,
    );
  });

  it('filters only informational route mappings in production', () => {
    process.env.STAGE = 'prod';

    expect(transformLog('info', 'RoutesResolver')).toBe(false);
    expect(transformLog('info', 'RouterExplorer')).toBe(false);
    expect(transformLog('info', 'AppModule')).not.toBe(false);
    expect(transformLog('info', 'InstanceLoader')).not.toBe(false);
    expect(transformLog('info', 'NestApplication')).not.toBe(false);
    expect(transformLog('warn', 'RoutesResolver')).not.toBe(false);
    expect(transformLog('error', 'RouterExplorer')).not.toBe(false);
  });

  it('keeps route mapping logs in development', () => {
    process.env.STAGE = 'dev';

    expect(transformLog('info', 'RoutesResolver')).not.toBe(false);
    expect(transformLog('info', 'RouterExplorer')).not.toBe(false);
  });
});
