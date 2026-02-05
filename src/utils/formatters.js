/**
 * Formats a date string to a Discord relative timestamp.
 * @param {string} dateStr The date string to format.
 * @returns {string} The formatted Discord timestamp, or "Nunca" if the date is invalid or missing.
 */
function formatDiscordTimestamp(dateStr) {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return `\`${dateStr}\``;
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:R>`;
}

/**
 * Sanitizes a string for use in Discord Markdown.
 * Escapes backticks to prevent breaking out of code blocks and removes mentions to prevent spam.
 * @param {string} text The text to sanitize.
 * @returns {string} The sanitized text.
 */
function sanitizeMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/`/g, '\\`') // Escape backticks
        .replace(/\[/g, '\\[') // Escape square brackets
        .replace(/\]/g, '\\]')
        .replace(/@everyone/g, '@\u200beveryone') // Add zero-width space
        .replace(/@here/g, '@\u200bhere');
}

/**
 * Sanitizes text for use inside Discord masked links [text](url).
 * Only escapes ']' to prevent breaking the link structure and defangs mentions.
 * @param {string} text The text to sanitize.
 * @returns {string} The sanitized link text.
 */
function sanitizeLinkText(text) {
    if (!text) return '';
    return text
        .replace(/\]/g, '\\]')
        .replace(/@everyone/g, '@\u200beveryone')
        .replace(/@here/g, '@\u200bhere');
}

/**
 * Formats a number as Chilean Pesos (CLP).
 * @param {number|string} amount The amount to format.
 * @returns {string} The formatted amount.
 */
function formatCLP(amount) {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(value)) return '$0';
    return '$' + Math.floor(value).toLocaleString('es-CL');
}

module.exports = {
    formatDiscordTimestamp,
    sanitizeMarkdown,
    sanitizeLinkText,
    formatCLP
};