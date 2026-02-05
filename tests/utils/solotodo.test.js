const { extractQuery } = require('../../src/utils/solotodo');

describe('Solotodo Utils - extractQuery', () => {
    it('should extract known Apple products from messy text', () => {
        expect(extractQuery('Vendo iPhone 13 Pro usado en buen estado')).toBe('iPhone 13 Pro');
        expect(extractQuery('Oportunidad MacBook Air M1 sellado')).toBe('MacBook Air');
        expect(extractQuery('Busco iPad Pro 12.9 barato')).toBe('iPad Pro 12.9');
    });

    it('should extract from URL if no known product is found', () => {
        expect(extractQuery('https://www.falabella.com/falabella-cl/product/123/Samsung-Galaxy-S21')).toBe('Samsung Galaxy S21');
    });

    it('should fallback to clean text if no URL or known product', () => {
        expect(extractQuery('Teclado generico $20.000')).toBe('Teclado generico');
    });

    it('should prioritize longer matches (Pro Max over Pro)', () => {
        expect(extractQuery('Vendo iPhone 14 Pro Max nuevo')).toBe('iPhone 14 Pro Max');
    });
    
    it('should return null for empty or too short text', () => {
        expect(extractQuery('...')).toBeNull();
        expect(extractQuery('')).toBeNull();
    });
});
