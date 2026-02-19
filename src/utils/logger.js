/**
 * @module logger
 * @description Centralized logging utility using Winston for structured logging.
 * Supports environment-specific formatting (JSON for production, colorized text for development).
 */

const winston = require('winston');
const util = require('util');

/**
 * Flag indicating whether logs should be formatted as JSON.
 * Configured via LOG_FORMAT_JSON environment variable.
 * @type {boolean}
 */
const useJsonFormat = process.env.LOG_FORMAT_JSON === 'true';

/**
 * Winston logger instance configured with custom formats and transports.
 * In development, uses a custom printf format with util.format for robustness.
 * In production, uses standard JSON formatting.
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    useJsonFormat
      ? winston.format.combine(
          winston.format.splat(),
          winston.format.json({
            replacer: (key, value) => {
              if (value instanceof Error) {
                return { message: value.message, stack: value.stack };
              }
              return value;
            }
          })
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf((info) => {
            const { timestamp, level, message, stack, [Symbol.for('splat')]: splat = [] } = info;
            // The stack property from winston.format.errors() already contains the message.
            const base = stack || message;
            return `${timestamp} [${level}]: ${util.format(base, ...splat)}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
