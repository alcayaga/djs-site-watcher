const { sanitizeMarkdown, sanitizeLinkText, formatDiscordTimestamp } = require('../../src/utils/formatters');

describe('Formatters Utils', () => {
    describe('formatDiscordTimestamp', () => {
        it('should format valid date string with default style (R)', () => {
            const date = new Date('2023-01-01T00:00:00Z');
            const unix = Math.floor(date.getTime() / 1000);
            expect(formatDiscordTimestamp(date.toISOString())).toBe(`<t:${unix}:R>`);
        });

        it('should format valid date string with custom style', () => {
            const date = new Date('2023-01-01T00:00:00Z');
            const unix = Math.floor(date.getTime() / 1000);
            expect(formatDiscordTimestamp(date.toISOString(), 'd')).toBe(`<t:${unix}:d>`);
            expect(formatDiscordTimestamp(date.toISOString(), 'F')).toBe(`<t:${unix}:F>`);
        });

        it('should return "Nunca" for empty input', () => {
            expect(formatDiscordTimestamp(null)).toBe('Nunca');
            expect(formatDiscordTimestamp('')).toBe('Nunca');
        });

        it('should return code block with input string if date is invalid', () => {
            // Note: sanitizeMarkdown does not escape hyphens, so 'invalid-date' remains as is
            expect(formatDiscordTimestamp('invalid-date')).toBe('`invalid-date`');
        });

        it('should sanitize invalid date strings to prevent markdown injection', () => {
            const maliciousInput = '` @everyone';
            // Expect backticks to be escaped and mentions to be defanged
            // sanitizeMarkdown('` @everyone') -> '\` @\u200beveryone'
            // formatDiscordTimestamp wraps it in backticks -> `\` @\u200beveryone`
            expect(formatDiscordTimestamp(maliciousInput)).toBe('`\\` @\u200beveryone`');
        });
    });

    describe('sanitizeMarkdown', () => {
        it('should escape backticks', () => {
            const input = 'Code with `backticks`';
            // We expect the output to have a backslash before each backtick
            // In JS code, that string is written as: 'Code with \\`backticks\\`'
            const expected = 'Code with \\`backticks\\`';
            expect(sanitizeMarkdown(input)).toBe(expected);
        });

        it('should escape square brackets', () => {
            const input = 'Link [text]';
            const expected = 'Link \\[text\\]';
            expect(sanitizeMarkdown(input)).toBe(expected);
        });

        it('should defang @everyone and @here', () => {
            const input = 'Hello @everyone and @here';
            const expected = 'Hello @\u200beveryone and @\u200bhere';
            expect(sanitizeMarkdown(input)).toBe(expected);
        });

        it('should escape angle brackets to prevent mention injection', () => {
            const input = 'Hello <@123456789> and <@&987654321>';
            // We expect the angle brackets to be escaped
            const expected = 'Hello \\<@123456789\\> and \\<@&987654321\\>';
            expect(sanitizeMarkdown(input)).toBe(expected);
        });
    });

    describe('sanitizeLinkText', () => {
        it('should escape closing square bracket', () => {
            const input = 'Click [here]';
            const expected = 'Click [here\\]'; // Only closing bracket needs escaping in link text to prevent breaking format
            expect(sanitizeLinkText(input)).toBe(expected);
        });

        it('should defang @everyone and @here', () => {
            const input = 'Click @everyone';
            const expected = 'Click @\u200beveryone';
            expect(sanitizeLinkText(input)).toBe(expected);
        });

        it('should escape angle brackets to prevent mention injection', () => {
            const input = 'User <@123456>';
            const expected = 'User \\<@123456\\>';
            expect(sanitizeLinkText(input)).toBe(expected);
        });
    });
});