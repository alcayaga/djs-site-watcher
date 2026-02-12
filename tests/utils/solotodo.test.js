const { extractQuery, searchSolotodo, searchByUrl, getAvailableEntities, getStores, getProductHistory, getBestPictureUrl } = require('../../src/utils/solotodo');
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

    it('should correctly extract from URL when the product name is not in the last segment', () => {
        const url = 'https://www.abc.cl/iphone-17-pro-256gb-azul-profundo-63/28825293.html';
        expect(extractQuery(url)).toBe('iPhone 17 Pro');
    });

    it('should correctly extract non-Apple products from previous segment if last is numeric', () => {
        const url = 'https://www.abc.cl/samsung-galaxy-s24-ultra-512gb-63/98765432.html';
        expect(extractQuery(url)).toBe('samsung galaxy s24 ultra 512gb 63');
    });

    it('should handle various URL formats from feedback', () => {
        // Vision Pro
        expect(extractQuery('https://www.apple.com/shop/buy-vision/apple-vision-pro')).toBe('Apple Vision Pro');

        // New iPad sizes
        expect(extractQuery('https://www.falabella.com/falabella-cl/product/123/iPad-Pro-13-M4')).toBe('iPad Pro 13');
        expect(extractQuery('https://www.paris.cl/ipad-air-11-p.html')).toBe('iPad Air 11');

        // Apple Pencil Pro
        expect(extractQuery('https://aufbau.cl/p/apple-pencil-pro')).toBe('Apple Pencil Pro');

        // Falabella numeric end
        expect(extractQuery('https://www.falabella.com/falabella-cl/product/7183779/AirPods-2ª-Generacion-Con-Estuche-De-Carga-Apple/7183779')).toBe('AirPods');
        
        // Paris with .html and numeric suffix in slug
        expect(extractQuery('200 Lucas > https://www.paris.cl/apple-airpods-pro-2da-generacion-con-estuche-de-carga-magsafe-usb-c-556043999.html')).toBe('AirPods Pro');
        
        // ScotiaMarketplace
        expect(extractQuery('https://scotiamarketplace.cl/apple/1448009-airpods-pro-3-con-cancelacion-de-ruido-usb-c-3-gen.html')).toBe('AirPods Pro');
        expect(extractQuery('https://scotiamarketplace.cl/apple/1439191-iphone-17-256gb-azul-neblina.html')).toBe('iPhone 17');
        
        // MacOnline
        expect(extractQuery('LAST DAY MACONLINE https://www.maconline.com/products/ipad-pro-m4')).toBe('iPad Pro');
        
        // Lider with very long numeric end
        expect(extractQuery('Iphone Air $999.990 https://www.lider.cl/ip/marcas-destacadas/iphone-air-5g-256gb-negro-espacial/00019595062249?from=/search')).toBe('iphone air 5g 256gb negro espacial');
    });

    it('should extract known product from URL path regardless of other segments', () => {
        const url = 'https://aufbau.cl/c/Parlante-inalámbrico-Beats-Pill-con-Bluetooth/Negro/p/MW443BE--A';
        expect(extractQuery(url)).toBe('Beats Pill');
    });

    it('should skip SKU-like segments and extract from a previous segment', () => {
        const url = 'https://aufbau.cl/c/parlante-inalambrico/p/MW443BE--A';
        expect(extractQuery(url)).toBe('parlante inalambrico');
    });

    it('should prioritize URL slug over message text for non-Apple products', () => {
        const message = 'Mira este celu https://www.abc.cl/samsung-galaxy-s24-ultra-512gb-63/98765432.html';
        // "celu" is generic, URL has the full name
        expect(extractQuery(message)).toBe('samsung galaxy s24 ultra 512gb 63');
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

    it('searchByUrl should return product and augment it with picture and slug if missing', async () => {
        got.mockResolvedValueOnce({
            body: {
                product: { id: 123, name: 'Test Product', url: 'https://api.com/products/123/' },
                picture_urls: ['https://store.com/pic.jpg']
            }
        });

        const result = await searchByUrl('https://store.com/p123');
        expect(result.id).toBe(123);
        expect(result.picture_url).toBe('https://store.com/pic.jpg');
        expect(result.slug).toBe('123');
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
        expect(got).toHaveBeenCalledWith(expect.stringContaining('exclude_refurbished=true'), expect.any(Object));
    });

    it('getAvailableEntities should allow including refurbished if explicitly requested', async () => {
        got.mockResolvedValueOnce({
            body: {
                results: [{ entities: [] }]
            }
        });

        await getAvailableEntities(355711, false);
        expect(got).not.toHaveBeenCalledWith(expect.stringContaining('exclude_refurbished=true'), expect.any(Object));
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

    it('getProductHistory should fetch history for a specific product', async () => {
        got.mockResolvedValueOnce({
            body: [{ entity: {}, pricing_history: [] }]
        });

        const result = await getProductHistory(123);
        expect(result).toHaveLength(1);
        expect(got).toHaveBeenCalledWith(expect.stringContaining('products/123/pricing_history/'), expect.any(Object));
        expect(got).toHaveBeenCalledWith(expect.stringContaining('exclude_refurbished=true'), expect.any(Object));
    });

    describe('getBestPictureUrl', () => {
        it('should return current URL if it is valid', async () => {
            const product = { pictureUrl: 'https://media.solotodo.com/pic.png' };
            const result = await getBestPictureUrl(product);
            expect(result).toBe('https://media.solotodo.com/pic.png');
        });

        it('should exclude tienda.travel.cl and banned cloudfront images and look into entities', async () => {
            const product = { id: 1, pictureUrl: 'https://tienda.travel.cl/pic.jpg' };
            const entities = [
                { picture_urls: ['https://dojiw2m9tvv09.cloudfront.net/bad.png'] },
                { picture_urls: ['https://subdomain.tienda.travel.cl/pic.jpg'] },
                { picture_urls: ['https://ripley.cl/good.png'] }
            ];
            
            const result = await getBestPictureUrl(product, entities);
            expect(result).toBe('https://ripley.cl/good.png');
        });

        it('should fetch entities if not provided and current URL is invalid', async () => {
            const product = { id: 1, pictureUrl: 'invalid-url' };
            got.mockResolvedValueOnce({
                body: {
                    results: [{
                        entities: [{ picture_urls: ['https://ripley.cl/good.png'] }]
                    }]
                }
            });
            
            const result = await getBestPictureUrl(product);
            expect(result).toBe('https://ripley.cl/good.png');
            expect(got).toHaveBeenCalledWith(expect.stringContaining('available_entities'), expect.any(Object));
        });

        it('should return null if no valid image is found anywhere', async () => {
            const product = { id: 1, pictureUrl: 'https://tienda.travel.cl/pic.jpg' };
            const entities = [
                { picture_urls: ['https://tienda.travel.cl/another.jpg'] }
            ];
            
            const result = await getBestPictureUrl(product, entities);
            expect(result).toBeNull();
        });
    });
});