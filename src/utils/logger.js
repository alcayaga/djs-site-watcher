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
        // If a stack is present, it includes the message and is the most complete representation.
        const logMessage = stack || message;

        // Also inspect any additional metadata that isn't the error itself.
        const splat = meta[Symbol.for('splat')] || [];
        const metaString = splat
          .filter(item => !(item instanceof Error))
          .map(item => util.inspect(item, { depth: 5 }))
          .join(' ');

        return `${timestamp} [${level}]: ${logMessage}${metaString ? ` ${metaString}` : ''}`;
      })
    )
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
