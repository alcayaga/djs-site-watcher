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

module.exports = {
    formatDiscordTimestamp
};