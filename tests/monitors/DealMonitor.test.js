const DealMonitor = require('../../src/monitors/DealMonitor');
const storage = require('../../src/storage');
const got = require('got');
const solotodo = require('../../src/utils/solotodo');
const Discord = require('discord.js');

jest.mock('got');
jest.mock('discord.js');
jest.mock('../../src/storage');
jest.mock('../../src/config');
jest.mock('../../src/utils/solotodo', () => ({
    ...jest.requireActual('../../src/utils/solotodo'),
    getProductHistory: jest.fn().mockResolvedValue([]),
    getBestPictureUrl: jest.fn().mockImplementation(p => Promise.resolve(p.pictureUrl || p.picture_url)),
    getAvailableEntities: jest.fn().mockResolvedValue([
        { active_registry: { offer_price: "10000", normal_price: "10000", cell_monthly_payment: null }, store: "https://api.com/stores/1/", external_url: "https://store.com" }
    ]),
    getStores: jest.fn().mockResolvedValue(new Map([["https://api.com/stores/1/", "Store 1"]]))
}));
jest.mock('../../src/utils/helpers', () => ({
    sleep: jest.fn().mockResolvedValue()
}));

describe('DealMonitor', () => {
    let monitor;
    let mockChannel;
    let mockClient;
    let mockMessage;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get('mockDealsChannelId');
        mockMessage = {
            startThread: jest.fn().mockResolvedValue({})
        };
        mockChannel.send.mockResolvedValue(mockMessage);
        
        const monitorConfig = {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json'
        };

        monitor = new DealMonitor('Deal', monitorConfig);
        monitor.client = mockClient;
    });

    const mockApiResponse = (products) => {
        const results = products.map(p => ({
            product_entries: [{
                product: {
                    id: p.id,
                    name: p.name,
                    slug: p.slug || 'slug',
                    picture_url: p.picture_url || 'pic.jpg',
                    specs: {
                        brand_brand_unicode: p.brand || 'Apple'
                    }
                },
                metadata: {
                    prices_per_currency: [{
                        currency: 'https://publicapi.solotodo.com/currencies/1/',
                        offer_price: p.offerPrice.toString(),
                        normal_price: p.normalPrice.toString()
                    }]
                }
            }]
        }));
        return JSON.stringify({ results });
    };

    it('should initialize and load state', async () => {
        storage.read.mockResolvedValue({ '1': { minOfferPrice: 100, lastOfferPrice: 100 } });
        await monitor.initialize(mockClient);
        expect(monitor.state['1'].minOfferPrice).toBe(100);
    });

    it('should detect a new historic low for offer price and alert', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 500000, 
                minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 600000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 450000, normalPrice: 600000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: 'iPhone',
            autoArchiveDuration: Discord.ThreadAutoArchiveDuration.OneWeek
        });
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('con nuevo mínimo histórico (con Tarjeta)');
        
        expect(monitor.state['1'].minOfferPrice).toBe(450000);
        expect(monitor.state['1'].minOfferDate).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('should truncate long product names for thread titles at word boundary', async () => {
        const longName = 'This is a very long product name that will definitely exceed the one hundred characters limit to test truncation logic correctly';
        // length is ~130
        
        const product = {
            id: 1,
            name: longName,
            offerPrice: 100,
            normalPrice: 200
        };

        await monitor.notify({ product, type: 'NEW_LOW_OFFER' });

        expect(mockMessage.startThread).toHaveBeenCalled();
        const threadCall = mockMessage.startThread.mock.calls[0][0];
        
        // "This is a very long product name that will definitely exceed the one hundred characters limit to" is 96 chars
        // The word "test" starts at index 97.
        // lastSpaceIndex before 100 is at 96.
        expect(threadCall.name).toBe('This is a very long product name that will definitely exceed the one hundred characters limit to...');
        expect(threadCall.name.length).toBeLessThanOrEqual(100);
    });

    it('should detect a new historic low for normal price and alert', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 500000, 
                minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 600000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 500000, normalPrice: 550000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('con nuevo mínimo histórico (todo medio de pago)');
        
        expect(monitor.state['1'].minNormalPrice).toBe(550000);
        expect(monitor.state['1'].minNormalDate).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('should backfill history for new products with dates', async () => {
        monitor.state = {};
        solotodo.getProductHistory.mockResolvedValue([
            {
                entity: { currency: 'https://publicapi.solotodo.com/currencies/1/' },
                pricing_history: [
                    { is_available: true, offer_price: "400000", normal_price: "410000", timestamp: "2024-12-01T10:00:00Z" },
                    { is_available: true, offer_price: "450000", normal_price: "460000", timestamp: "2024-12-02T10:00:00Z" }
                ]
            }
        ]);

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 500000, normalPrice: 510000 }])
        });

        await monitor.check();

        expect(solotodo.getProductHistory).toHaveBeenCalledWith('1');
        expect(monitor.state['1'].minOfferPrice).toBe(400000);
        expect(monitor.state['1'].minOfferDate).toBe("2024-12-01T10:00:00Z");
        expect(monitor.state['1'].minNormalPrice).toBe(410000);
        expect(monitor.state['1'].minNormalDate).toBe("2024-12-01T10:00:00Z");
    });

    it('should detect return to historic low and show previous date', async () => {
        const oldDate = '2024-12-01T10:00:00Z';
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 10000, minOfferDate: oldDate,
                lastOfferPrice: 15000, 
                minNormalPrice: 20000, minNormalDate: oldDate,
                lastNormalPrice: 25000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 10000, normalPrice: 25000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('volvió al mínimo histórico (con Tarjeta)');
        
        const dateField = embed.data.fields.find(f => f.name === '🕒 Precio visto por última vez');
        expect(dateField).toBeDefined();
        expect(dateField.value).toContain('1733047200'); // Unix for 2024-12-01T10:00:00Z

        expect(monitor.state['1'].lastOfferPrice).toBe(10000);
    });

    it('should NOT alert if price stays at historic low', async () => {
        monitor.state = {
            '1': { id: 1, name: 'iPhone', minOfferPrice: 100, lastOfferPrice: 100, minNormalPrice: 200, lastNormalPrice: 200 }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100, normalPrice: 200 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should process products regardless of brand (filtering happens at API level)', async () => {
        monitor.state = {};

        got.mockResolvedValue({
            body: mockApiResponse([
                { id: 1, name: 'iPhone', offerPrice: 10000, normalPrice: 11000, brand: 'Apple' },
                { id: 2, name: 'Galaxy', offerPrice: 10000, normalPrice: 11000, brand: 'Samsung' }
            ])
        });

        await monitor.check();

        expect(monitor.state['1']).toBeDefined();
        expect(monitor.state['2']).toBeDefined();
    });

    it('should correctly parse products with alternative brand specs (e.g. HomePod Mini)', async () => {
        monitor.state = {};
        
        const homePodData = JSON.stringify({
            results: [{
                product_entries: [{
                    product: {
                        id: 154867,
                        name: "Apple HomePod Mini",
                        slug: "apple-homepod-mini",
                        picture_url: "pic.jpg",
                        specs: {
                            brand_unicode: "Apple"
                        }
                    },
                    metadata: {
                        prices_per_currency: [{
                            currency: 'https://publicapi.solotodo.com/currencies/1/',
                            offer_price: "99990",
                            normal_price: "109990"
                        }]
                    }
                }]
            }]
        });

        got.mockResolvedValue({ body: homePodData });

        await monitor.check();

        expect(monitor.state['154867']).toBeDefined();
        expect(monitor.state['154867'].name).toBe("Apple HomePod Mini");
    });

    it('should show only one alert if both prices reach new low', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 500000, 
                minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 600000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 450000, normalPrice: 550000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalledTimes(1);
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('con nuevos mínimos históricos');
    });

    it('should correctly parse products with multiple currencies and pick CLP', async () => {
        monitor.state = {};
        
        const multiCurrencyData = JSON.stringify({
            results: [{
                product_entries: [{
                    product: {
                        id: 1, name: "iPhone Multi", slug: "iphone", picture_url: "pic.jpg",
                        specs: { brand_unicode: "Apple" }
                    },
                    metadata: {
                        prices_per_currency: [
                            {
                                currency: 'https://publicapi.solotodo.com/currencies/4/', // USD
                                offer_price: "799.00", normal_price: "799.00"
                            },
                            {
                                currency: 'https://publicapi.solotodo.com/currencies/1/', // CLP
                                offer_price: "1000000.00", normal_price: "1100000.00"
                            }
                        ]
                    }
                }]
            }]
        });

        got.mockResolvedValue({ body: multiCurrencyData });

        await monitor.check();

        expect(monitor.state['1']).toBeDefined();
        expect(monitor.state['1'].lastOfferPrice).toBe(1000000);
    });

    it('should ignore non-CLP entities during backfill', async () => {
        monitor.state = {};
        solotodo.getProductHistory.mockResolvedValue([
            {
                entity: { currency: 'https://publicapi.solotodo.com/currencies/4/' }, // USD
                pricing_history: [{ is_available: true, offer_price: "799", normal_price: "799", timestamp: "2024-12-01T10:00:00Z" }]
            },
            {
                entity: { currency: 'https://publicapi.solotodo.com/currencies/1/' }, // CLP
                pricing_history: [{ is_available: true, offer_price: "1000000", normal_price: "1100000", timestamp: "2024-12-02T10:00:00Z" }]
            }
        ]);

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 1200000, normalPrice: 1300000 }])
        });

        await monitor.check();

        expect(monitor.state['1'].minOfferPrice).toBe(1000000); // Should pick the CLP one, not the 799 USD one
    });

    it('should support multiple URLs and combine results', async () => {
        monitor.config.url = ['https://api1.com', 'https://api2.com'];
        
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone 1', offerPrice: 10000, normalPrice: 11000 }])
        }).mockResolvedValueOnce({
            body: mockApiResponse([{ id: 2, name: 'iPhone 2', offerPrice: 20000, normalPrice: 21000 }])
        });

        await monitor.check();

        expect(got).toHaveBeenCalledTimes(2);
        expect(got.mock.calls[0][0]).toContain('exclude_refurbished=true');
        expect(monitor.state['1']).toBeDefined();
        expect(monitor.state['2']).toBeDefined();
    });

    it('should filter out unrealistically low prices (MIN_SANITY_PRICE)', async () => {
        monitor.state = {};
        
        got.mockResolvedValue({
            body: mockApiResponse([
                { id: 1, name: 'iPhone Cheap', offerPrice: 799, normalPrice: 799, brand: 'Apple' },
                { id: 2, name: 'iPhone Real', offerPrice: 500000, normalPrice: 550000, brand: 'Apple' }
            ])
        });

        await monitor.check();

        expect(monitor.state['1']).toBeUndefined();
        expect(monitor.state['2']).toBeDefined();
    });

    it('should ignore mobile plan entities and suppress notification if no other entity exists', async () => {
        const product = { id: 1, name: 'iPhone Plan', offerPrice: 199000, normalPrice: 199000 };
        
        // Mock entities where one is a plan
        jest.spyOn(solotodo, 'getAvailableEntities').mockResolvedValue([
            {
                active_registry: { offer_price: "199000", normal_price: "199000", cell_monthly_payment: "41000" },
                external_url: "https://plan.com",
                store: "https://api.com/stores/1/"
            }
        ]);

        await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    describe('price drop logging', () => {
        let consoleSpy;

        beforeEach(() => {
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            monitor.state = {
                '1': { 
                    id: 1, name: 'iPhone', 
                    minOfferPrice: 100000, minOfferDate: '2025-01-01T00:00:00.000Z',
                    lastOfferPrice: 150000, 
                    minNormalPrice: 100000, minNormalDate: '2025-01-01T00:00:00.000Z',
                    lastNormalPrice: 150000 
                }
            };
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it('should log to console when offer price drops but is not a historic low', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 120000, normalPrice: 150000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone: $150.000 -> $120.000 (Historic Low: $100.000)'));
            
            // Ensure exactly one price drop was logged
            const priceDropLogCalls = consoleSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(1);
        });

        it('should log to console when normal price drops but is not a historic low', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 150000, normalPrice: 120000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone (Normal): $150.000 -> $120.000 (Historic Low: $100.000)'));
            
            // Ensure exactly one price drop was logged
            const priceDropLogCalls = consoleSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(1);
        });

        it('should not log price drops when prices increase', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 160000, normalPrice: 150000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            const priceDropLogCalls = consoleSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(0);
        });

        it('should log for both prices if they both drop', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 120000, normalPrice: 130000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone: $150.000 -> $120.000 (Historic Low: $100.000)'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone (Normal): $150.000 -> $130.000 (Historic Low: $100.000)'));
            
            // Ensure both price drops were logged
            const priceDropLogCalls = consoleSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(2);
        });
    });
});
