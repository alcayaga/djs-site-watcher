const { extractQuery, searchSolotodo, searchByUrl, getAvailableEntities, getStores } = require('../../src/utils/solotodo');
const got = require('got');

jest.mock('got');

describe('Solotodo Utils - extractQuery', () => {
    it('should extract known Apple products from messy text', () => {
        expect(extractQuery('Vendo iPhone 13 Pro usado en buen estado')).toBe('iPhone 13 Pro');
        expect(extractQuery('Oportunidad MacBook Air M1 sellado')).toBe('MacBook Air');
        expect(extractQuery('Busco iPad Pro 12.9 barato')).toBe('iPad Pro 12.9');
    });

    it('should extract from URL if no known product is found', () => {
        expect(extractQuery('https://www.falabella.com/falabella-cl/product/123/Samsung-Galaxy-S21')).toBe('Samsung Galaxy S21');
    });

    it('should prioritize URL extraction for known products even if text contains generic terms', () => {
        // Regression test for "200 Lucas > URL" case where "AirPods" might be found in URL but "AirPods Pro" is better
        const input = '200 Lucas > https://www.paris.cl/apple-airpods-pro-2da-generacion-con-estuche-de-carga-magsafe-usb-c-556043999.html';
        expect(extractQuery(input)).toBe('AirPods Pro');
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

describe('Solotodo Utils - API functions', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('searchSolotodo should return the first Apple product match', async () => {
        got.mockResolvedValueOnce({
            body: {
                results: [
                    { name: 'Some random accessory', id: 1 },
                    { name: 'Apple iPhone 15', id: 2 }
                ]
            }
        });

        const result = await searchSolotodo('iPhone 15');
        expect(result.id).toBe(2);
        expect(got).toHaveBeenCalledWith(expect.stringContaining('search=iPhone%2015'), expect.any(Object));
    });

    it('searchByUrl should return product if found', async () => {
        got.mockResolvedValueOnce({
            body: {
                product: { id: 123, name: 'Test Product' }
            }
        });

        const result = await searchByUrl('https://store.com/p123');
        expect(result.id).toBe(123);
    });

    it('getAvailableEntities should return entities from the first result', async () => {
        got.mockResolvedValueOnce({
            body: {
                results: [
                    {
                        entities: [{ id: 1, active_registry: { is_available: true } }]
                    }
                ]
            }
        });

        const entities = await getAvailableEntities(355711);
        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe(1);
    });

    it('getStores should return a map of stores and cache them', async () => {
        got.mockResolvedValueOnce({
            body: [
                { url: 'https://api.com/stores/1/', name: 'Store 1' },
                { url: 'https://api.com/stores/2/', name: 'Store 2' }
            ]
        });

        const storeMap1 = await getStores();
        expect(storeMap1.get('https://api.com/stores/1/')).toBe('Store 1');
        expect(got).toHaveBeenCalledTimes(1);

        // Second call should use cache
        const storeMap2 = await getStores();
        expect(storeMap2).toBe(storeMap1);
        expect(got).toHaveBeenCalledTimes(1);
    });
});