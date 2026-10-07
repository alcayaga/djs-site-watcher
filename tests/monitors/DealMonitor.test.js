const DealMonitor = require('../../src/monitors/DealMonitor');
const storage = require('../../src/storage');
const got = require('got');
const solotodo = require('../../src/utils/solotodo');
const Discord = require('discord.js');
const logger = require('../../src/utils/logger');

jest.mock('got');
jest.mock('discord.js');
jest.mock('../../src/storage');
jest.mock('../../src/config');
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));
jest.mock('../../src/utils/solotodo', () => ({
    ...jest.requireActual('../../src/utils/solotodo'),
    getProductHistory: jest.fn().mockResolvedValue([
        {
            entity: { currency: 'https://api.solotodo.com/currencies/1/', condition: 'https://schema.org/NewCondition', store: 'https://api.com/stores/1/' },
            pricing_history: [{ is_available: true, offer_price: "10000", normal_price: "10000", timestamp: "2025-01-01T00:00:00.000Z" }]
        }
    ]),
    getBestPictureUrl: jest.fn().mockImplementation(p => Promise.resolve(p.pictureUrl || p.picture_url)),
    getAvailableEntities: jest.fn().mockResolvedValue([
        // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
        { active_registry: { offer_price: "10000", normal_price: "10000", cell_monthly_payment: null }, store: "https://api.com/stores/1/", external_url: "https://store.com" }
    ]),
    getStores: jest.fn().mockResolvedValue(new Map([["https://api.com/stores/1/", { name: "Store 1" }]]))
}));

jest.mock('../../src/utils/helpers', () => ({
    sleep: jest.fn().mockResolvedValue()
}));

// Mock fileTypeWrapper using manual mock in __mocks__
jest.mock('../../src/utils/fileTypeWrapper');

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

    afterEach(() => {
        jest.restoreAllMocks();
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
                        currency: solotodo.SOLOTODO_CLP_CURRENCY_URL,
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
        expect(embed.data.title).toBe('iPhone');
        expect(embed.data.description).toBe('💳 Nuevo mínimo histórico en Oferta');
        expect(embed.data.footer.text).toBe('powered by Solotodo');
        
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
        expect(embed.data.title).toBe('iPhone');
        expect(embed.data.description).toBe('💰 Nuevo mínimo histórico con todo medio de pago');
        expect(embed.data.footer.text).toBe('powered by Solotodo');
        
        expect(monitor.state['1'].minNormalPrice).toBe(550000);
        expect(monitor.state['1'].minNormalDate).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('should backfill history using the LATEST date for minimum prices', async () => {
        monitor.state = {};
        solotodo.getProductHistory.mockResolvedValue([
            {
                entity: { currency: solotodo.SOLOTODO_CLP_CURRENCY_URL },
                pricing_history: [
                    { is_available: true, offer_price: "400000", normal_price: "410000", timestamp: "2024-12-01T10:00:00Z" }, // First hit of low
                    { is_available: true, offer_price: "400000", normal_price: "410000", timestamp: "2024-12-05T10:00:00Z" }, // Latest hit of low (Should be this one)
                    { is_available: true, offer_price: "450000", normal_price: "460000", timestamp: "2024-12-06T10:00:00Z" }  // Went up
                ]
            }
        ]);

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 500000, normalPrice: 510000 }])
        });

        await monitor.check();

        expect(solotodo.getProductHistory).toHaveBeenCalledWith('1');
        expect(monitor.state['1'].minOfferPrice).toBe(400000);
        expect(monitor.state['1'].minOfferDate).toBe("2024-12-05T10:00:00Z"); // Expecting the latest one
        expect(monitor.state['1'].minNormalPrice).toBe(410000);
        expect(monitor.state['1'].minNormalDate).toBe("2024-12-05T10:00:00Z");
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
        expect(embed.data.title).toBe('iPhone');
        // Unix for 2024-12-01T10:00:00Z is 1733047200
        expect(embed.data.description).toBe('💳 Volvió al mínimo histórico en Oferta de <t:1733047200:R>');
        expect(embed.data.footer.text).toBe('powered by Solotodo');
        
        const dateField = embed.data.fields.find(f => f.name === '🕒 Precio visto por última vez');
        expect(dateField).toBeUndefined();

        expect(monitor.state['1'].lastOfferPrice).toBe(10000);
    });

    it('should set Pending Exit when price INCREASES from historic low, then confirm on next cycle', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const newDate = new Date('2024-02-01T00:00:00.000Z');
        
        jest.useFakeTimers().setSystemTime(newDate);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 10000, minOfferDate: oldDate,
                lastOfferPrice: 10000, // Was at low
                minNormalPrice: 20000, minNormalDate: oldDate,
                lastNormalPrice: 20000 // Was at low
            }
        };

        // 1. First Increase (Deal Ends) -> Should enter PENDING state
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 15000, normalPrice: 25000 }])
        });

        await monitor.check();

        // Verify NO date update yet (Debounce)
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);
        expect(monitor.state['1'].minNormalDate).toBe(oldDate);
        
        // Verify Pending State is set explicitly
        expect(monitor.state['1'].pendingExitOffer).toEqual({ date: newDate.toISOString() });
        expect(monitor.state['1'].pendingExitNormal).toEqual({ date: newDate.toISOString() });
        
        // Advance time by 13 hours for the next check (Default grace period is 12h)
        jest.advanceTimersByTime(13 * 1000 * 60 * 60);

        // 2. Second Check (Confirmation) -> Should CONFIRM exit and update date
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 15000, normalPrice: 25000 }])
        });

        await monitor.check();

        // Now the date SHOULD be updated to the time of the FIRST increase (newDate)
        expect(monitor.state['1'].minOfferDate).toBe(newDate.toISOString());
        expect(monitor.state['1'].minNormalDate).toBe(newDate.toISOString());
        
        // Verify Pending State is cleared
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
        expect(monitor.state['1'].pendingExitNormal).toBeUndefined();

        // Verify No Notification (Just a state update)
        expect(mockChannel.send).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    it('should ignore phantom spikes where price increases and then returns to minimum', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const spikeDate = new Date('2024-02-01T00:00:00.000Z');
        
        jest.useFakeTimers().setSystemTime(spikeDate);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 10000, minOfferDate: oldDate,
                lastOfferPrice: 10000, // Was at low
                minNormalPrice: 20000, minNormalDate: oldDate,
                lastNormalPrice: 20000 // Was at low
            }
        };

        // 1. Price increases -> Should enter PENDING state
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 15000, normalPrice: 25000 }])
        });
        await monitor.check();

        // Verify minDate is not updated yet and pending state is set
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);
        expect(monitor.state['1'].minNormalDate).toBe(oldDate);
        expect(monitor.state['1'].pendingExitOffer).toEqual({ date: spikeDate.toISOString() });
        expect(monitor.state['1'].pendingExitNormal).toEqual({ date: spikeDate.toISOString() });

        // Advance time by 1 hour for the next check
        jest.advanceTimersByTime(1000 * 60 * 60);

        // 2. Price returns to low -> Should be treated as a phantom spike
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 10000, normalPrice: 20000 }])
        });
        await monitor.check();

        // Verify minDate is STILL not updated, pending state is cleared, and lastPrice is back to the minimum
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);
        expect(monitor.state['1'].minNormalDate).toBe(oldDate);
        expect(monitor.state['1'].lastOfferPrice).toBe(10000);
        expect(monitor.state['1'].lastNormalPrice).toBe(20000);
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
        expect(monitor.state['1'].pendingExitNormal).toBeUndefined();
        
        // No notification should have been sent throughout this process
        expect(mockChannel.send).not.toHaveBeenCalled();

        jest.useRealTimers();
    });
    
    it('should use the exit date when returning to historic low', async () => {
        const exitDate = '2025-02-09T10:00:00.000Z'; // The date it went up
        // Unix timestamp for exitDate is 1739095200
        const exitUnix = Math.floor(new Date(exitDate).getTime() / 1000);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 10000, minOfferDate: exitDate, // Already updated on exit
                lastOfferPrice: 15000, // Currently high
                minNormalPrice: 20000, minNormalDate: exitDate,
                lastNormalPrice: 25000 
            }
        };

        // Price returns to low
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 10000, normalPrice: 20000 }])
        });

        await monitor.check();

        // 1. Verify Notification uses the Exit Date
        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        
        expect(embed.data.description).toBe(`♻️ Volvió a precios históricos de <t:${exitUnix}:R>`);
        
        // 2. Verify Date did NOT update again (it keeps the exit date)
        expect(monitor.state['1'].minOfferDate).toBe(exitDate);
    });

    it('should not mutate the original state objects during check (immutability)', async () => {
        const originalProductState = { 
            id: 1, name: 'iPhone', 
            minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
            lastOfferPrice: 500000, 
            minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
            lastNormalPrice: 600000 
        };
        monitor.state = { '1': originalProductState };

        // New low price detected
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 400000, normalPrice: 500000 }])
        });

        await monitor.check();

        // The monitor.state should be updated to a NEW object
        expect(monitor.state['1']).not.toBe(originalProductState);
        expect(monitor.state['1'].minOfferPrice).toBe(400000);
        
        // The original object should remain UNCHANGED
        expect(originalProductState.minOfferPrice).toBe(500000);
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
                            currency: solotodo.SOLOTODO_CLP_CURRENCY_URL,
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
        const product = { id: 1, name: 'iPhone', offerPrice: 100000, normalPrice: 110000 };
        const stored = { minOfferPrice: 120000, minNormalPrice: 130000 };
        await monitor.notify({ product, triggers: ['NEW_LOW_OFFER', 'NEW_LOW_NORMAL'], date: new Date().toISOString(), stored });

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toBe('iPhone');
        expect(embed.data.description).toBe('🔥 Nuevos mínimos históricos');
        expect(embed.data.footer.text).toBe('powered by Solotodo');
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
                                currency: solotodo.SOLOTODO_USD_CURRENCY_URL, // USD
                                offer_price: "799.00", normal_price: "799.00"
                            },
                            {
                                currency: solotodo.SOLOTODO_CLP_CURRENCY_URL, // CLP
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
                entity: { currency: solotodo.SOLOTODO_USD_CURRENCY_URL }, // USD
                pricing_history: [{ is_available: true, offer_price: "799", normal_price: "799", timestamp: "2024-12-01T10:00:00Z" }]
            },
            {
                entity: { currency: solotodo.SOLOTODO_CLP_CURRENCY_URL }, // CLP
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

    it('should ignore refurbished entities and suppress notification if no new entity exists', async () => {
        const product = { id: 1, name: 'iPhone Refurb', offerPrice: 499000, normalPrice: 499000 };
        
        // Mock entities where one is refurbished
        jest.spyOn(solotodo, 'getAvailableEntities').mockResolvedValue([
            {
                active_registry: { offer_price: "499000", normal_price: "499000", cell_monthly_payment: null },
                external_url: "https://reuse.com",
                condition: "https://schema.org/RefurbishedCondition",
                store: "https://api.com/stores/1/"
            }
        ]);

        await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should prefer new entities over refurbished ones even if refurbished is cheaper', async () => {
        const product = { id: 1, name: 'iPhone Mixed', offerPrice: 499000, normalPrice: 599000 };
        
        // Mock entities: Refurbished is cheaper ($499k), New is $599k
        jest.spyOn(solotodo, 'getAvailableEntities').mockResolvedValue([
            {
                active_registry: { offer_price: "499000", normal_price: "499000", cell_monthly_payment: null },
                external_url: "https://reuse.com",
                condition: "https://schema.org/RefurbishedCondition",
                store: "https://api.com/stores/2/"
            },
            {
                active_registry: { offer_price: "599000", normal_price: "599000", cell_monthly_payment: null },
                external_url: "https://abc.cl",
                condition: solotodo.NEW_CONDITION_URL,
                store: "https://api.com/stores/3/"
            }
        ]);
        solotodo.getStores.mockResolvedValue(new Map([
            ["https://api.com/stores/2/", { name: "Reuse" }],
            ["https://api.com/stores/3/", { name: "ABC.cl" }]
        ]));

        await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        // Should link to ABC.cl, not Reuse
        expect(embed.data.fields.find(f => f.name === 'Dónde comprar' && f.value.includes('ABC.cl'))).toBeDefined();
        expect(embed.data.fields.find(f => f.name === 'Dónde comprar' && f.value.includes('Reuse'))).toBeUndefined();
    });

    describe('image handling', () => {
        beforeEach(() => {
            // Mock getAvailableEntities to ensure bestEntity is found (requires active_registry)
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            solotodo.getAvailableEntities.mockResolvedValue([
                { active_registry: { offer_price: "10000", normal_price: "20000", cell_monthly_payment: null }, store: "https://api.com/stores/1/", external_url: "https://store.com" }
            ]);
        });

        afterEach(() => {
            // jest.clearAllMocks() is handled by beforeEach's jest.clearAllMocks()
        });

        // Increase timeout for all tests in this block to avoid CI flakiness
        jest.setTimeout(10000);

        const mockGotStream = (chunks = ['fake-image-data'], headers = { 'content-type': 'image/jpeg' }) => {
            const stream = new (require('events').EventEmitter)();
            let destroyed = false;
            stream.destroy = jest.fn((err) => {
                destroyed = true;
                if (err) process.nextTick(() => stream.emit('error', err));
            });
            process.nextTick(() => {
                if (destroyed) return;
                stream.emit('response', { headers });
                if (destroyed) return;
                chunks.forEach(chunk => {
                    if (!destroyed) stream.emit('data', Buffer.from(chunk));
                });
                if (!destroyed) stream.emit('end');
            });
            return stream;
        };

        const mockGotStreamError = (error) => {
            const stream = new (require('events').EventEmitter)();
            stream.destroy = jest.fn();
            process.nextTick(() => {
                stream.emit('error', error);
            });
            return stream;
        };

        it('should download and attach image when no valid external picture URL is found', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/pic.jpg', offerPrice: 10000, normalPrice: 20000 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['fake-image-data'], { 'content-type': 'image/png' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(got.stream).toHaveBeenCalledWith('http://banned.com/pic.jpg', expect.any(Object));
            expect(Discord.AttachmentBuilder).toHaveBeenCalled();
            
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.files).toBeDefined();
            // Expect .png because content-type was image/png
            expect(sendCall.embeds[0].data.thumbnail.url).toBe('attachment://product_1.png');
        });

        it('should try entity pictures if product picture fails to download', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/pic.jpg', offerPrice: 10000, normalPrice: 20000 };
            const entities = [
                { 
                    picture_urls: ['http://entity.com/pic.png'],
                    active_registry: { offer_price: "10000", normal_price: "20000", cell_monthly_payment: null },
                    store: "https://api.com/stores/1/", 
                    external_url: "https://store.com"
                }
            ];
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            solotodo.getAvailableEntities.mockResolvedValueOnce(entities);
            
            // First call fails, second succeeds
            got.stream = jest.fn()
                .mockImplementationOnce(() => mockGotStreamError(new Error('Download failed')))
                .mockImplementationOnce(() => mockGotStream(['fake-image-data'], { 'content-type': 'image/png' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(got.stream).toHaveBeenCalledWith('http://banned.com/pic.jpg', expect.any(Object));
            expect(got.stream).toHaveBeenCalledWith('http://entity.com/pic.png', expect.any(Object));
            expect(Discord.AttachmentBuilder).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ name: 'product_1.png' }));
        });
        
        it('should abort download if image is too large', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/big.jpg', offerPrice: 10000, normalPrice: 20000 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            // Simulate a stream that emits more than 5MB
            const largeData = Buffer.alloc(5 * 1024 * 1024 + 100); 
            
            got.stream = jest.fn().mockImplementation(() => {
                const stream = new (require('events').EventEmitter)();
                let destroyed = false;
                stream.destroy = jest.fn((err) => {
                    destroyed = true;
                    if (err) process.nextTick(() => stream.emit('error', err));
                });
                process.nextTick(() => {
                    if (destroyed) return;
                    stream.emit('response', { headers: { 'content-type': 'image/jpeg' } });
                    if (destroyed) return;
                    stream.emit('data', largeData);
                    // Do NOT emit end manually, it should be destroyed during 'data'
                });
                return stream;
            });

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), 1, 'http://banned.com/big.jpg', expect.any(Error));
        });

        it('should download and attach image when content-type is octet-stream by sniffing buffer', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://ambiguous.com/image', offerPrice: 10000, normalPrice: 20000 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            // JPEG Magic Number: FF D8 FF
            const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            got.stream = jest.fn().mockImplementation(() => mockGotStream([jpegBuffer], { 'content-type': 'application/octet-stream' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.thumbnail.url).toBe('attachment://product_1.jpg');
        });

        it('should reject non-image resources even if potentially allowed by header', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/malicious.sh', offerPrice: 10000, normalPrice: 20000 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            // Generic header but malicious content
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['#!/bin/bash\nrm -rf /'], { 'content-type': 'application/octet-stream' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), 1, 'http://banned.com/malicious.sh', expect.any(Error));
            expect(Discord.AttachmentBuilder).not.toHaveBeenCalled();
        });

        it('should reject if Content-Type is explicitly not an image', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/page.html', offerPrice: 10000, normalPrice: 20000 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['<html></html>'], { 'content-type': 'text/html' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), 1, 'http://banned.com/page.html', expect.any(Error));
        });

        it('should reject if Content-Type is missing but content is not an image', async () => {
            // Using realistic prices (>= 1000) to satisfy DealMonitor.MIN_SANITY_PRICE
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/pic', offerPrice: 10000, normalPrice: 20000 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['not an image at all'], {}));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), 1, 'http://banned.com/pic', expect.any(Error));
        });
    });

    describe('price drop logging', () => {
        beforeEach(() => {
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
            // jest.clearAllMocks() is handled by beforeEach's jest.clearAllMocks()
        });

        it('should log to console when offer price drops but is not a historic low', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 120000, normalPrice: 150000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for %s%s: %s -> %s'), 'iPhone', '', '$150.000', '$120.000', '$100.000');
            
            // Ensure exactly one price drop was logged
            const priceDropLogCalls = logger.info.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(1);
        });

        it('should log to console when normal price drops but is not a historic low', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 150000, normalPrice: 120000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for %s%s: %s -> %s'), 'iPhone', ' (Normal)', '$150.000', '$120.000', '$100.000');
            
            // Ensure exactly one price drop was logged
            const priceDropLogCalls = logger.info.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(1);
        });

        it('should not log price drops when prices increase', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 160000, normalPrice: 150000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            const priceDropLogCalls = logger.info.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(0);
        });

        it('should log for both prices if they both drop', async () => {
            const apiResponse = { id: 1, name: 'iPhone', offerPrice: 120000, normalPrice: 130000 };
            got.mockResolvedValue({ body: mockApiResponse([apiResponse]) });
        
            await monitor.check();
        
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for %s%s: %s -> %s'), 'iPhone', '', '$150.000', '$120.000', '$100.000');
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for %s%s: %s -> %s'), 'iPhone', ' (Normal)', '$150.000', '$130.000', '$100.000');
            
            // Ensure both price drops were logged
            const priceDropLogCalls = logger.info.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(2);
        });
    });

    describe('multiple stores handling', () => {
        beforeEach(() => {
             solotodo.getStores.mockResolvedValue(new Map([
                ["https://api.com/stores/1/", { name: "Store A" }],
                ["https://api.com/stores/2/", { name: "Store B" }],
                ["https://api.com/stores/3/", { name: "Store C" }]
            ]));
        });

        it('should list all stores selling at the minimum price', async () => {
            const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
            const stored = { minOfferPrice: 100000, minNormalPrice: 110000 };
            
            // Provide a mix of matching and non-matching store prices to verify that the embed correctly filters out stores whose current effective price exceeds the product's recorded minimum offer price.
            const solotodo = require('../../src/utils/solotodo');
            solotodo.getAvailableEntities.mockResolvedValueOnce([
                { active_registry: { offer_price: 80000 }, store: "https://api.com/stores/1/", external_url: 'http://store-a.com' },
                { active_registry: { offer_price: 80000 }, store: "https://api.com/stores/2/", external_url: 'http://store-b.com' },
                { active_registry: { offer_price: 85000 }, store: "https://api.com/stores/3/", external_url: 'http://store-c.com' }
            ]);

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], stored, previousOfferPrice: 100000, previousNormalPrice: 110000 });

            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            
            const vendorField = embed.data.fields.find(f => f.name === 'Dónde comprar');
            expect(vendorField).toBeDefined();
            expect(vendorField.value).toContain('Store A');
            expect(vendorField.value).toContain('Store B');
            expect(vendorField.value).not.toContain('Store C');
        });

        it('should fallback to single store format or handle single store correctly', async () => {
            const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
            const stored = { minOfferPrice: 100000, minNormalPrice: 110000 };
            
            const solotodo = require('../../src/utils/solotodo');
            solotodo.getAvailableEntities.mockResolvedValueOnce([
                { active_registry: { offer_price: 80000 }, store: 1, external_url: 'http://store-a.com' }
            ]);

            solotodo.getStores.mockResolvedValueOnce(new Map([[1, { name: 'Store A' }]]));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], stored, previousOfferPrice: 100000, previousNormalPrice: 110000 });

            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            
            const vendorField = embed.data.fields.find(f => f.name === 'Dónde comprar');
            expect(vendorField).toBeDefined();
            const content = vendorField.value;
            expect(content).toContain('Store A');
        });

        it('should truncate list of stores if it exceeds limit', async () => {
            const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
            const stored = { minOfferPrice: 100000, minNormalPrice: 110000 };
            
            const solotodo = require('../../src/utils/solotodo');
            
            // Mock an excessively large number of store entities with long URLs to intentionally exceed Discord's 1024-character field limit, forcing the embed builder to trigger its truncation logic.
            const entities = Array.from({ length: 20 }, (_, i) => ({
                active_registry: { offer_price: 80000 }, 
                store: i + 1, 
                external_url: `http://store-very-long-url-name-to-take-space-${i}.com`
            }));
            
            const storeMap = new Map(Array.from({ length: 20 }, (_, i) => [i + 1, `Store Very Long Name ${i}`]));

            solotodo.getAvailableEntities.mockResolvedValueOnce(entities);
            solotodo.getStores.mockResolvedValueOnce(storeMap);

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], stored, previousOfferPrice: 100000, previousNormalPrice: 110000 });

            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            
            const vendorField = embed.data.fields.find(f => f.name === 'Dónde comprar');
            expect(vendorField).toBeDefined();
            
            // Discord enforces a strict 1024-character limit per embed field; exceeding it causes a rejection.
            expect(vendorField.value.length).toBeLessThanOrEqual(1024);
            
            // Verify the user is informed that additional stores exist but were omitted for space.
            expect(vendorField.value).toContain('... y');
        });
    });

    describe('price formatting in embeds', () => {
        it('should show previous price with strikethrough and arrow when price drops', async () => {
            const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
            
            await monitor.notify({ 
                product, 
                triggers: ['NEW_LOW_OFFER'], 
                date: new Date().toISOString(),
                previousOfferPrice: 100000,
                previousNormalPrice: 110000 
            });

            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            
            const offerField = embed.data.fields.find(f => f.name === 'Precio efectivo');
            const normalField = embed.data.fields.find(f => f.name === 'Precio Normal');
            
            expect(offerField.value).toBe('~~$100.000~~ → **$80.000**');
            expect(normalField.value).toBe('~~$110.000~~ → **$90.000**');
        });

        it('should only show current price when price stays the same or there is no previous price', async () => {
            const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
            
            // Previous offer price is same, previous normal price is null
            await monitor.notify({ 
                product, 
                triggers: ['NEW_LOW_OFFER'], 
                date: new Date().toISOString(),
                previousOfferPrice: 80000,
                previousNormalPrice: null
            });

            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            
            const offerField = embed.data.fields.find(f => f.name === 'Precio efectivo');
            const normalField = embed.data.fields.find(f => f.name === 'Precio Normal');
            
            expect(offerField.value).toBe('**$80.000**');
            expect(normalField.value).toBe('**$90.000**');
        });

        describe('dynamic store labels and urls', () => {
            const solotodo = require('../../src/utils/solotodo');
            
            it('should use preferred_payment_method when exactly 1 store matches', async () => {
                solotodo.getStores.mockResolvedValueOnce(new Map([
                    [1, { name: 'Falabella', preferred_payment_method: 'Tarjeta CMR' }]
                ]));
                solotodo.getAvailableEntities.mockResolvedValueOnce([
                    { active_registry: { offer_price: 80000, normal_price: 90000 }, store: 1, external_url: 'http://store-a.com' }
                ]);
                const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
                const stored = { minOfferPrice: 100000, minNormalPrice: 110000 };
                await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], stored, previousOfferPrice: 100000, previousNormalPrice: 110000 });
                const sendCall = mockChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                const offerField = embed.data.fields.find(f => f.name === 'Tarjeta CMR');
                expect(offerField).toBeDefined();
                expect(embed.data.url).toBe('http://store-a.com/');
            });

            it('should use Precio Oferta when multiple stores match', async () => {
                solotodo.getStores.mockResolvedValueOnce(new Map([
                    [1, { name: 'Store A', preferred_payment_method: 'Card A' }],
                    [2, { name: 'Store B', preferred_payment_method: 'Card B' }]
                ]));
                solotodo.getAvailableEntities.mockResolvedValueOnce([
                    { active_registry: { offer_price: 80000, normal_price: 90000 }, store: 1, external_url: 'http://store-a.com' },
                    { active_registry: { offer_price: 80000, normal_price: 95000 }, store: 2, external_url: 'http://store-b.com' }
                ]);
                const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 90000 };
                const stored = { minOfferPrice: 100000, minNormalPrice: 110000 };
                await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], stored, previousOfferPrice: 100000, previousNormalPrice: 110000 });
                const sendCall = mockChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                const offerField = embed.data.fields.find(f => f.name === 'Precio Oferta');
                expect(offerField).toBeDefined();
                
                // Should pick Store A because lowest normal_price
                expect(embed.data.url).toBe('http://store-a.com/');
            });

            it('should prefer store with offer == normal price for URL tie-breaker', async () => {
                solotodo.getStores.mockResolvedValueOnce(new Map([
                    [1, { name: 'Store A' }],
                    [2, { name: 'Store B' }]
                ]));
                solotodo.getAvailableEntities.mockResolvedValueOnce([
                    { active_registry: { offer_price: 80000, normal_price: 90000 }, store: 1, external_url: 'http://store-a.com' },
                    { active_registry: { offer_price: 80000, normal_price: 80000 }, store: 2, external_url: 'http://store-b.com' }
                ]);
                const product = { id: 1, name: 'iPhone', offerPrice: 80000, normalPrice: 80000 };
                const stored = { minOfferPrice: 100000, minNormalPrice: 110000 };
                await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], stored, previousOfferPrice: 100000, previousNormalPrice: 110000 });
                const sendCall = mockChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                // Store B has offer == normal so it should be prioritized
                expect(embed.data.url).toBe('http://store-b.com/');
            });
        });
    });

    describe('refurbished and non-new deal filtering', () => {
        it('should ignore false-positive deals caused by refurbished stores and not corrupt minPrice', async () => {
            // Initial state: iPhone historic min is 600.000, last price 700.000
            monitor.state = {
                '1': {
                    id: 1, name: 'iPhone',
                    minOfferPrice: 600000, minOfferDate: '2026-01-01T00:00:00.000Z',
                    notifiedMinOfferPrice: 600000,
                    minNormalPrice: 600000, minNormalDate: '2026-01-01T00:00:00.000Z',
                    notifiedMinNormalPrice: 600000,
                    lastOfferPrice: 700000, lastNormalPrice: 700000
                }
            };

            // Browse API returns tainted price 399.990 from BackOnline
            const apiResponse = mockApiResponse([{
                id: 1, name: 'iPhone', offerPrice: 399990, normalPrice: 399990
            }]);
            got.mockResolvedValueOnce({ body: apiResponse });

            // Available entities returns BackOnline (store 6101) and valid store (store 260 at 700.000)
            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [260, { id: 260, name: 'Mercado Libre' }]
            ]));
            solotodo.getAvailableEntities.mockResolvedValueOnce([
                {
                    store: 6101,
                    external_url: 'https://backonline.cl/products/iphone',
                    condition: 'https://schema.org/NewCondition',
                    active_registry: { offer_price: "399990", normal_price: "399990", cell_monthly_payment: null }
                },
                {
                    store: 260,
                    external_url: 'https://mercadolibre.cl/products/iphone',
                    condition: 'https://schema.org/NewCondition',
                    active_registry: { offer_price: "700000", normal_price: "700000", cell_monthly_payment: null }
                }
            ]);

            await monitor.check();

            // No Discord notification should be sent
            expect(mockChannel.send).not.toHaveBeenCalled();

            // Stored minOfferPrice should NOT be corrupted to 399.990
            expect(monitor.state['1'].minOfferPrice).toBe(600000);
            expect(monitor.state['1'].notifiedMinOfferPrice).toBe(600000);
        });

        it('should skip refurbished entities during history backfilling for new products', async () => {
            monitor.state = {};

            const apiResponse = mockApiResponse([{
                id: 1, name: 'iPad Mini', offerPrice: 700000, normalPrice: 700000
            }]);
            got.mockResolvedValueOnce({ body: apiResponse });

            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [7652, { id: 7652, name: 'Digitek' }],
                [260, { id: 260, name: 'Mercado Libre' }]
            ]));

            // History contains BackOnline (banned store 6101), Digitek (UsedCondition), and Mercado Libre
            solotodo.getProductHistory.mockResolvedValueOnce([
                {
                    entity: {
                        store: 6101,
                        condition: 'https://schema.org/NewCondition',
                        currency: solotodo.SOLOTODO_CLP_CURRENCY_URL
                    },
                    pricing_history: [
                        { is_available: true, offer_price: '399990', normal_price: '399990', timestamp: '2026-09-01T00:00:00Z' }
                    ]
                },
                {
                    entity: {
                        store: 7652,
                        condition: 'https://schema.org/UsedCondition',
                        currency: solotodo.SOLOTODO_CLP_CURRENCY_URL
                    },
                    pricing_history: [
                        { is_available: true, offer_price: '429990', normal_price: '429990', timestamp: '2026-08-01T00:00:00Z' }
                    ]
                },
                {
                    entity: {
                        store: 260,
                        condition: 'https://schema.org/NewCondition',
                        currency: solotodo.SOLOTODO_CLP_CURRENCY_URL
                    },
                    pricing_history: [
                        { is_available: true, offer_price: '649990', normal_price: '649990', timestamp: '2026-06-01T00:00:00Z' }
                    ]
                }
            ]);

            await monitor.check();

            // The backfilled minimum should be 649.990 from Mercado Libre, NOT 399.990 or 429.990
            expect(monitor.state['1'].minOfferPrice).toBe(649990);
            expect(monitor.state['1'].minNormalPrice).toBe(649990);
        });

        it('should revert state and suppress alert if entity verification fails with a network error', async () => {
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 399990, normalPrice: 399990 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 649990,
                    minNormalPrice: 649990,
                    lastOfferPrice: 777293,
                    lastNormalPrice: 777293
                }
            };

            solotodo.getStores.mockResolvedValue(new Map([[1, { id: 1, name: 'Store 1' }]]));
            solotodo.getAvailableEntities.mockRejectedValue(new Error('Solotodo API timeout'));

            await monitor.check();

            expect(solotodo.getAvailableEntities).toHaveBeenCalledWith(1);
            // Notification should not be sent
            expect(mockChannel.send).not.toHaveBeenCalled();
            // Stored state should retain the safe previous minimums
            expect(monitor.state['1'].minOfferPrice).toBe(649990);
            expect(monitor.state['1'].minNormalPrice).toBe(649990);
        });

        it('should persist new market price to state when deal trigger is suppressed', async () => {
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 399990, normalPrice: 399990 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 649990,
                    minNormalPrice: 649990,
                    lastOfferPrice: 850000,
                    lastNormalPrice: 850000
                }
            };

            // BackOnline at 399.990 (banned), Mercado Libre at 777.293 (valid)
            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [260, { id: 260, name: 'Mercado Libre' }]
            ]));

            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 6101,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://backonline.cl/products/ipad',
                    active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
                },
                {
                    store: 260,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://mercadolibre.cl/p/123',
                    active_registry: { offer_price: '777293', normal_price: '777293', cell_monthly_payment: null }
                }
            ]);

            const saveStateSpy = jest.spyOn(monitor, 'saveState');

            await monitor.check();

            // Deal alert is suppressed
            expect(mockChannel.send).not.toHaveBeenCalled();
            // Minimum remains uncorrupted
            expect(monitor.state['1'].minOfferPrice).toBe(649990);
            // State is persisted because market price updated from 850.000 to 777.293
            expect(saveStateSpy).toHaveBeenCalled();
            expect(monitor.state['1'].lastOfferPrice).toBe(777293);
            expect(monitor.state['1'].suppressedOfferPrice).toBe(399990);
        });

        it('should cache suppressed browse price and skip re-verification while browse price remains unchanged and not expired', async () => {
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 399990, normalPrice: 399990 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 649990,
                    minNormalPrice: 649990,
                    lastOfferPrice: 777293,
                    lastNormalPrice: 777293,
                    suppressedOfferPrice: 399990, // Already cached from previous run
                    suppressedNormalPrice: 399990,
                    suppressedOfferTime: new Date().toISOString(),
                    suppressedNormalTime: new Date().toISOString()
                }
            };

            await monitor.check();

            // getAvailableEntities should NOT be called because suppressedOfferPrice matches currentOffer and is unexpired
            expect(solotodo.getAvailableEntities).not.toHaveBeenCalled();
            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(monitor.state['1'].minOfferPrice).toBe(649990);
            expect(monitor.state['1'].lastOfferPrice).toBe(777293);
        });

        it('should re-verify when suppressed price cache expires', async () => {
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 399990, normalPrice: 399990 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 649990,
                    minNormalPrice: 649990,
                    lastOfferPrice: 777293,
                    lastNormalPrice: 777293,
                    suppressedOfferPrice: 399990,
                    suppressedNormalPrice: 399990,
                    suppressedOfferTime: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
                    suppressedNormalTime: new Date(Date.now() - 7 * 3600 * 1000).toISOString()
                }
            };

            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }]
            ]));
            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 6101,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://backonline.cl/products/ipad',
                    active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
                }
            ]);

            await monitor.check();

            // getAvailableEntities should be called because the cache has expired
            expect(solotodo.getAvailableEntities).toHaveBeenCalledWith(1);
            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(monitor.state['1'].minOfferPrice).toBe(649990);
        });

        it('should return configured tolerance or default via _getTolerance', () => {
            monitor.config.priceTolerance = '500';
            expect(monitor._getTolerance()).toBe(500);

            monitor.config.priceTolerance = 'invalid';
            expect(monitor._getTolerance()).toBe(1000);

            delete monitor.config.priceTolerance;
            expect(monitor._getTolerance()).toBe(1000);
        });

        it('should skip creating entry when storeMap is unavailable', async () => {
            const product = { id: 99, name: 'New iPad', offerPrice: 500000, normalPrice: 500000 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {};
            solotodo.getStores.mockRejectedValueOnce(new Error('Network failure'));

            await monitor.check();

            expect(solotodo.getProductHistory).not.toHaveBeenCalled();
            expect(monitor.state['99']).toBeUndefined();
        });

        it('should skip creating entry when history backfill throws an error', async () => {
            const product = { id: 99, name: 'New iPad', offerPrice: 500000, normalPrice: 500000 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {};
            solotodo.getProductHistory.mockRejectedValueOnce(new Error('History API failure'));

            await monitor.check();

            expect(monitor.state['99']).toBeUndefined();
        });

        it('should cache negative result and skip initialized price state when no valid history records are found', async () => {
            const product = { id: 99, name: 'New iPad', offerPrice: 500000, normalPrice: 500000 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {};
            solotodo.getProductHistory.mockResolvedValueOnce([]);

            await monitor.check();

            expect(monitor.state['99'].minOfferPrice).toBeUndefined();
            expect(monitor.state['99'].uninitialized).toBe(true);
            expect(monitor.state['99'].noHistoryUntil).toBeDefined();
        });

        it('should skip history lookup while negative cache is unexpired and retry after expiry', async () => {
            const product = { id: 99, name: 'New iPad', offerPrice: 500000, normalPrice: 500000 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '99': {
                    uninitialized: true,
                    noHistoryUntil: new Date(Date.now() + 3600 * 1000).toISOString(),
                    name: 'New iPad'
                }
            };

            await monitor.check();

            expect(solotodo.getProductHistory).not.toHaveBeenCalled();

            // Expire the negative cache
            monitor.state['99'].noHistoryUntil = new Date(Date.now() - 3600 * 1000).toISOString();
            solotodo.getProductHistory.mockResolvedValueOnce([
                {
                    entity: { currency: solotodo.SOLOTODO_CLP_CURRENCY_URL, condition: 'https://schema.org/NewCondition', store: 'https://api.com/stores/1/' },
                    pricing_history: [{ is_available: true, offer_price: "450000", normal_price: "450000", timestamp: "2025-01-01T00:00:00.000Z" }]
                }
            ]);

            await monitor.check();

            expect(solotodo.getProductHistory).toHaveBeenCalledWith('99');
            expect(monitor.state['99'].uninitialized).toBeUndefined();
            expect(monitor.state['99'].minOfferPrice).toBe(450000);
        });

        it('should leave uninitialized price type when only one price is found in history', async () => {
            const product = { id: 99, name: 'New iPad', offerPrice: 300000, normalPrice: 350000 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {};
            solotodo.getProductHistory.mockResolvedValueOnce([
                {
                    entity: { currency: solotodo.SOLOTODO_CLP_CURRENCY_URL, condition: 'https://schema.org/NewCondition', store: 'https://api.com/stores/1/' },
                    pricing_history: [{ is_available: true, offer_price: "450000", normal_price: "NaN", timestamp: "2025-01-01T00:00:00.000Z" }]
                }
            ]);

            await monitor.check();

            expect(monitor.state['99'].minOfferPrice).toBe(450000);
            expect(monitor.state['99'].notifiedMinOfferPrice).toBe(450000);
            expect(monitor.state['99'].minNormalPrice).toBeUndefined();
            expect(monitor.state['99'].notifiedMinNormalPrice).toBeUndefined();

            // On next run, if normal price is observed and supported by valid merchant, it should be initialized cleanly without alerting
            const product2 = { id: 99, name: 'New iPad', offerPrice: 450000, normalPrice: 460000 };
            monitor.fetch = jest.fn().mockResolvedValue([product2]);
            solotodo.getStores.mockResolvedValue(new Map([[100, { id: 100, name: 'Falabella' }]]));
            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 100,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://falabella.com/products/ipad',
                    active_registry: { offer_price: '450000', normal_price: '460000', cell_monthly_payment: null }
                }
            ]);
            await monitor.check();

            expect(monitor.state['99'].minNormalPrice).toBe(460000);
            expect(monitor.state['99'].notifiedMinNormalPrice).toBe(460000);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should verify uninitialized normal price and reset to valid merchant price when browse price is BackOnline-only', async () => {
            const product = { id: 99, name: 'New iPad', offerPrice: 450000, normalPrice: 300000 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '99': {
                    name: 'New iPad',
                    minOfferPrice: 450000,
                    notifiedMinOfferPrice: 450000,
                    lastOfferPrice: 450000,
                    lastNormalPrice: 500000
                    // minNormalPrice is undefined (offer-only history)
                }
            };

            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [100, { id: 100, name: 'Falabella' }]
            ]));

            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 6101,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://backonline.cl/products/ipad',
                    active_registry: { offer_price: '450000', normal_price: '300000', cell_monthly_payment: null }
                },
                {
                    store: 100,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://falabella.com/products/ipad',
                    active_registry: { offer_price: '450000', normal_price: '480000', cell_monthly_payment: null }
                }
            ]);

            await monitor.check();

            expect(solotodo.getAvailableEntities).toHaveBeenCalledWith(99);
            expect(monitor.state['99'].minNormalPrice).toBe(480000);
            expect(monitor.state['99'].notifiedMinNormalPrice).toBe(480000);
            expect(monitor.state['99'].suppressedNormalPrice).toBe(300000);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should revert candidate deals when storeMap is unavailable', async () => {
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 399990, normalPrice: 399990 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 649990,
                    minNormalPrice: 649990,
                    lastOfferPrice: 777293,
                    lastNormalPrice: 777293
                }
            };
            solotodo.getStores.mockRejectedValueOnce(new Error('Network failure'));

            await monitor.check();

            expect(solotodo.getAvailableEntities).not.toHaveBeenCalled();
            expect(mockChannel.send).not.toHaveBeenCalled();
            // Minimum prices remain intact
            expect(monitor.state['1'].minOfferPrice).toBe(649990);
            expect(monitor.state['1'].minNormalPrice).toBe(649990);
        });

        it('should verify and revert min price when insignificant drop from refurbished merchant returns CHANGED', async () => {
            // Drop from 650.000 to 640.000 (< 5% minDropPercentage, so _checkPriceUpdate returns 'CHANGED')
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 640000, normalPrice: 777293 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 650000,
                    minNormalPrice: 650000,
                    notifiedMinOfferPrice: 650000,
                    notifiedMinNormalPrice: 650000,
                    lastOfferPrice: 650000,
                    lastNormalPrice: 777293
                }
            };

            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }]
            ]));
            // Only refurbished BackOnline has 640.000; best valid is 650.000
            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 6101,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://backonline.cl/products/ipad',
                    active_registry: { offer_price: '640000', normal_price: '777293', cell_monthly_payment: null }
                }
            ]);

            await monitor.check();

            expect(solotodo.getAvailableEntities).toHaveBeenCalledWith(1);
            expect(mockChannel.send).not.toHaveBeenCalled();
            // minOfferPrice is reverted to previous safe minimum 650.000, not corrupted to 640.000
            expect(monitor.state['1'].minOfferPrice).toBe(650000);
            expect(monitor.state['1'].suppressedOfferPrice).toBe(640000);
        });

        it('should re-evaluate valid minimum drop if refurbished offer is suppressed but a genuine valid drop exists', async () => {
            // Refurbished store offers 399.990 (browse price 399.990)
            // But a genuine valid store offers 599.990, which is lower than previous minOfferPrice 650.000
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 399990, normalPrice: 777293 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 650000,
                    minNormalPrice: 650000,
                    notifiedMinOfferPrice: 650000,
                    notifiedMinNormalPrice: 650000,
                    lastOfferPrice: 777293,
                    lastNormalPrice: 777293
                }
            };

            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [1, { id: 1, name: 'MacOnline' }]
            ]));
            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 6101,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://backonline.cl/products/ipad',
                    active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
                },
                {
                    store: 1,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://maconline.com/products/ipad',
                    active_registry: { offer_price: '599990', normal_price: '777293', cell_monthly_payment: null }
                }
            ]);

            await monitor.check();

            expect(solotodo.getAvailableEntities).toHaveBeenCalledWith(1);
            // Notification should be sent for the genuine deal
            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const offerField = embed.data.fields.find(f => f.name.includes('Oferta') || f.name.includes('Precio'));
            expect(offerField.value).toContain('$599.990');
            expect(offerField.value).not.toContain('$399.990');

            // Stored minOfferPrice should be updated to genuine drop (599990), not refurbished (399990) nor reverted (650000)
            expect(monitor.state['1'].minOfferPrice).toBe(599990);
            expect(monitor.state['1'].lastOfferPrice).toBe(599990);
            expect(monitor.state['1'].suppressedOfferPrice).toBe(399990);
        });

        it('should re-evaluate valid normal minimum drop if refurbished normal is suppressed but a genuine valid normal drop exists', async () => {
            const product = { id: 1, name: 'iPad mini 6', offerPrice: 777293, normalPrice: 399990 };
            monitor.fetch = jest.fn().mockResolvedValue([product]);
            monitor.state = {
                '1': {
                    name: 'iPad mini 6',
                    minOfferPrice: 650000,
                    minNormalPrice: 650000,
                    notifiedMinOfferPrice: 650000,
                    notifiedMinNormalPrice: 650000,
                    lastOfferPrice: 777293,
                    lastNormalPrice: 777293
                }
            };

            solotodo.getStores.mockResolvedValue(new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [1, { id: 1, name: 'MacOnline' }]
            ]));
            solotodo.getAvailableEntities.mockResolvedValue([
                {
                    store: 6101,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://backonline.cl/products/ipad',
                    active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
                },
                {
                    store: 1,
                    condition: 'https://schema.org/NewCondition',
                    external_url: 'https://maconline.com/products/ipad',
                    active_registry: { offer_price: '777293', normal_price: '599990', cell_monthly_payment: null }
                }
            ]);

            await monitor.check();

            expect(solotodo.getAvailableEntities).toHaveBeenCalledWith(1);
            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const normalField = embed.data.fields.find(f => f.name === 'Precio Normal');
            expect(normalField).toBeDefined();
            expect(normalField.value).toContain('$599.990');
            expect(normalField.value).not.toContain('$399.990');

            expect(monitor.state['1'].minNormalPrice).toBe(599990);
            expect(monitor.state['1'].lastNormalPrice).toBe(599990);
            expect(monitor.state['1'].suppressedNormalPrice).toBe(399990);
        });
    });
});
