/**
 * @module logger
 * @description Centralized logging utility using Winston for structured logging.
 * Supports environment-specific formatting (JSON for production, colorized text for development).
 */

const winston = require('winston');

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
    /[MNOR][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,39}/g // Discord User Tokens
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
        masked = masked.replace(pattern, (match) => {
            if (match.includes('.')) {
                const parts = match.split('.');
                return parts.map(p => '*'.repeat(p.length)).join('.');
            }
            return '*'.repeat(match.length);
        });
    });
    return masked;
}

/**
 * Winston logger instance configured with custom formats and transports.
 * In development, uses a colorized text format.
 * In production, uses standard JSON formatting.
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.splat(), // Applied universally to ensure consistent interpolation
        useJsonFormat
            ? winston.format.json({
                /**
                 * Custom JSON replacer to correctly serialize Error objects and mask sensitive data.
                 * @param {string} key - The key being stringified.
                 * @param {*} value - The value being stringified.
                 * @returns {*} The serialized value.
                 */
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
            : winston.format.combine(
                winston.format.colorize(),
                /**
                 * Custom printf formatter for development logging.
                 * @param {Object} info - Winston log information object.
                 * @returns {string} The formatted log string.
                 */
                winston.format.printf((info) => {
                    const { timestamp, level, message, stack, ...meta } = info;
                    let logMessage = stack ? `${message}\n${stack}` : message;

                    /**
                     * Custom JSON replacer to correctly serialize Error objects.
                     * @param {string} key - The key being stringified.
                     * @param {*} value - The value being stringified.
                     * @returns {*} The serialized value.
                     */
                    const errorReplacer = (key, value) =>
                        value instanceof Error ? { message: value.message, stack: value.stack } : value;

                    // winston.format.splat() already interpolated placeholders into 'message'.
                    // We handle cases where an object was passed as the only argument or metadata was provided.
                    if (typeof logMessage !== 'string') {
                        logMessage = JSON.stringify(logMessage, errorReplacer);
                    }

                    const splat = info[Symbol.for('splat')] || [];
                    if (Object.keys(meta).length > 0 || splat.length > 0) {
                        const extra = { ...meta };
                        if (splat.length > 0) extra.splat = splat;

                        logMessage += ` ${JSON.stringify(extra, errorReplacer)}`;
                    }

                    return `${timestamp} [${level}]: ${maskSensitive(logMessage)}`;
                })
            )
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
