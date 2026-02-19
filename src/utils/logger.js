const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.splat(),
    isProduction ? winston.format.json() : winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const splat = meta[Symbol.for('splat')] || [];
        const metaString = splat.length > 0 ? ' ' + splat.map(val => require('util').inspect(val, { colors: true, depth: null })).join(' ') : '';
        return `${timestamp} [${level}]: ${message}${metaString}${stack ? `\n${stack}` : ''}`;
      })
    )
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
