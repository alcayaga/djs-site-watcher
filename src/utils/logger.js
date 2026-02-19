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
 * Patterns that should be masked in logs.
 * @type {RegExp[]}
 */
const SENSITIVE_PATTERNS = [
    /\d{17,19}/g, // Discord IDs
    /M[A-Za-z0-9._-]{23}\.[A-Za-z0-9._-]{6}\.[A-Za-z0-9._-]{27}/g // Discord Bot Tokens (basic)
];

/**
 * Masks sensitive information in a string.
 * @param {string} str - The string to mask.
 * @returns {string} The masked string.
 */
function maskSensitive(str) {
    if (typeof str !== 'string') return str;
    let masked = str;
    SENSITIVE_PATTERNS.forEach(pattern => {
        masked = masked.replace(pattern, (match) => '*'.repeat(match.length));
    });
    return masked;
}

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
                winston.format.splat(), // Universal splat for JSON to ensure interpolation in message field
                winston.format.json({
                    replacer: (key, value) => {
                        if (value instanceof Error) {
                            return { message: value.message, stack: value.stack };
                        }
                        if (typeof value === 'string') {
                            return maskSensitive(value);
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
                    // We use util.format here to handle both printf-style placeholders and extra arguments
                    // (metadata, errors) without duplication or data loss.
                    const base = stack || message;
                    const formatted = util.format(base, ...splat);
                    return `${timestamp} [${level}]: ${maskSensitive(formatted)}`;
                })
            )
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
