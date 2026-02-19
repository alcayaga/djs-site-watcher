const winston = require('winston');
const util = require('util');

const useJsonFormat = process.env.LOG_FORMAT_JSON === 'true';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.splat(),
    useJsonFormat ? winston.format.json() : winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const splat = meta[Symbol.for('splat')] || [];
        const metaString = splat.length > 0 ? ' ' + splat.map(val => util.inspect(val, { colors: true, depth: null })).join(' ') : '';
        return `${timestamp} [${level}]: ${message}${metaString}${stack ? `\n${stack}` : ''}`;
      })
    )
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
