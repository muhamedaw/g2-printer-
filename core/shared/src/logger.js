import pino from 'pino';
const isDev = process.env['NODE_ENV'] !== 'production';
export const logger = isDev
    ? pino({ level: process.env['LOG_LEVEL'] ?? 'info', transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } })
    : pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
export function createLogger(name) {
    return logger.child({ service: name });
}
