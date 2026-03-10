import { utilities as nestWinstonUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

export const winstonConfig = {
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.ms(),
                nestWinstonUtilities.format.nestLike('SpamMusic', {
                    prettyPrint: true,
                    colors: true,
                }),
            ),
        }),
        new winston.transports.DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
            ),
        }),
        new winston.transports.DailyRotateFile({
            filename: 'logs/combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
            ),
        }),
        (() => {
            const httpTransport = new winston.transports.Http({
                host: 'logs.collector.eu-01.cloud.solarwinds.com',
                path: '/v1/logs',
                ssl: true,
                headers: {
                    Authorization: `Bearer fDK3DNFpJspyevqaNj8qev2rBzAML9Ha6eHt8G5tKbOZ8IQ5TM6RKNk4H_gy36q3lHXSct0`,
                },
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format((info) => {
                        if (info && typeof info.level === 'string') {
                            info['severity'] = info.level.toUpperCase();
                        } else {
                            info['severity'] = 'INFO';
                        }
                        return info;
                    })(),
                    winston.format.json(),
                ),
            });
            httpTransport.on('error', () => { /* swallow SolarWinds errors to prevent crash */ });
            return httpTransport;
        })(),
    ],
};