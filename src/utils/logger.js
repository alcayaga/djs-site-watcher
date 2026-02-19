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
    /M[A-Za-z0-9._-]{23}\.[A-Za-z0-9._-]{6}\.[A-Za-z0-9._-]{27}/g, // Discord User Tokens
    /[A-Za-z0-9._-]{59,95}/g // Discord Bot Tokens (heuristic)
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
                /**
                 * Custom printf formatter for development logging.
                 * @param {Object} info - Winston log information object.
                 * @returns {string} The formatted log string.
                 */
                winston.format.printf((info) => {
                    const { timestamp, level, message, stack } = info;
                    const splat = info[Symbol.for('splat')] || [];

                    if (stack) {
                        // The error was the primary argument, stack is already there.
                        // We can format any other splat args into it.
                        const formatted = util.format(stack, ...splat.filter(arg => !(arg instanceof Error)));
                        return `${timestamp} [${level}]: ${maskSensitive(formatted)}`;
                    }

                    // The error might be in the splat, or there's no error.
                    const errorInSplat = splat.find(arg => arg instanceof Error);
                    const otherSplatArgs = splat.filter(arg => !(arg instanceof Error));
                    let logMessage = util.format(message, ...otherSplatArgs);

                    if (errorInSplat) {
                        logMessage += `\n${errorInSplat.stack}`;
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
