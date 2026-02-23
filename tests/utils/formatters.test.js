const { sanitizeMarkdown, sanitizeLinkText } = require('../../src/utils/formatters');

describe('Formatters Utils', () => {
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
        it('should escape square brackets', () => {
            const input = 'Click [here]';
            const expected = 'Click \\[here\\]';
            expect(sanitizeLinkText(input)).toBe(expected);
        });

        it('should defang @everyone and @here case-insensitively', () => {
            const input = 'Click @EVERYONE and @hErE';
            const expected = 'Click @\u200beveryone and @\u200bhere';
            expect(sanitizeLinkText(input)).toBe(expected);
        });

        it('should escape angle brackets to prevent mention injection', () => {
            const input = 'User <@123456>';
            const expected = 'User \\<@123456\\>';
            expect(sanitizeLinkText(input)).toBe(expected);
        });
    });
});