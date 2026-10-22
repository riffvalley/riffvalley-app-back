import { utilities as nestWinstonUtilities } from 'nest-winston';
import * as winston from 'winston';

const suppressProductionRouteLogs = winston.format((info) => {
  const isRouteMappingLog =
    info.level === 'info' &&
    (info.context === 'RoutesResolver' || info.context === 'RouterExplorer');

  return process.env.STAGE === 'prod' && isRouteMappingLog ? false : info;
});

export const winstonConfig = {
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        suppressProductionRouteLogs(),
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonUtilities.format.nestLike('Riff Valley App', {
          prettyPrint: true,
          colors: true,
        }),
      ),
    }),
  ],
};
