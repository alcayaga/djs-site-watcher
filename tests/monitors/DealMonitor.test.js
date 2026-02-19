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
        expect(embed.data.description).toBe('Nuevo mínimo histórico con Tarjeta');
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
        expect(embed.data.description).toBe('Nuevo mínimo histórico con todo medio de pago');
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
        expect(embed.data.description).toBe('Volvió al mínimo histórico con Tarjeta de <t:1733047200:R>');
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
        
        expect(embed.data.description).toBe(`Volvió a precios históricos de <t:${exitUnix}:R>`);
        
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
        expect(embed.data.title).toBe('iPhone');
        expect(embed.data.description).toBe('Nuevos mínimos históricos');
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
            ["https://api.com/stores/2/", "Reuse"],
            ["https://api.com/stores/3/", "ABC.cl"]
        ]));

        await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        // Should link to ABC.cl, not Reuse
        expect(embed.data.fields.find(f => f.name.includes('Vendido por ABC.cl'))).toBeDefined();
        expect(embed.data.fields.find(f => f.name.includes('Vendido por Reuse'))).toBeUndefined();
    });

    describe('image handling', () => {
        beforeEach(() => {
            // Mock getAvailableEntities to ensure bestEntity is found (requires active_registry)
            solotodo.getAvailableEntities.mockResolvedValue([
                { active_registry: { offer_price: "100", normal_price: "200", cell_monthly_payment: null }, store: "https://api.com/stores/1/", external_url: "https://store.com" }
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
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/pic.jpg', offerPrice: 100, normalPrice: 200 };
            
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
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/pic.jpg', offerPrice: 100, normalPrice: 200 };
            const entities = [
                { 
                    picture_urls: ['http://entity.com/pic.png'],
                    active_registry: { offer_price: "100", normal_price: "200", cell_monthly_payment: null },
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
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/big.jpg', offerPrice: 100, normalPrice: 200 };
            
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

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), expect.stringContaining('Image too large'));
        });

        it('should download and attach image when content-type is octet-stream by sniffing buffer', async () => {
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://ambiguous.com/image', offerPrice: 100, normalPrice: 200 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            // JPEG Magic Number: FF D8 FF
            const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            got.stream = jest.fn().mockImplementation(() => mockGotStream([jpegBuffer], { 'content-type': 'application/octet-stream' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.thumbnail.url).toBe('attachment://product_1.jpg');
        });

        it('should reject non-image resources even if potentially allowed by header', async () => {
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/malicious.sh', offerPrice: 100, normalPrice: 200 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            // Generic header but malicious content
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['#!/bin/bash\nrm -rf /'], { 'content-type': 'application/octet-stream' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), expect.stringContaining('Resource content is not a supported image type'));
            expect(Discord.AttachmentBuilder).not.toHaveBeenCalled();
        });

        it('should reject if Content-Type is explicitly not an image', async () => {
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/page.html', offerPrice: 100, normalPrice: 200 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['<html></html>'], { 'content-type': 'text/html' }));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), expect.stringContaining('Resource is definitely not an image'));
        });

        it('should reject if Content-Type is missing but content is not an image', async () => {
            const product = { id: 1, name: 'iPhone', pictureUrl: 'http://banned.com/pic', offerPrice: 100, normalPrice: 200 };
            
            solotodo.getBestPictureUrl.mockResolvedValueOnce(null);
            
            got.stream = jest.fn().mockImplementation(() => mockGotStream(['not an image at all'], {}));

            await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download fallback image'), expect.stringContaining('Resource content is not a supported image type'));
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
        
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone: $150.000 -> $120.000 (Historic Low: $100.000)'));
            
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
        
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone (Normal): $150.000 -> $120.000 (Historic Low: $100.000)'));
            
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
        
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone: $150.000 -> $120.000 (Historic Low: $100.000)'));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DealMonitor] Price drop for iPhone (Normal): $150.000 -> $130.000 (Historic Low: $100.000)'));
            
            // Ensure both price drops were logged
            const priceDropLogCalls = logger.info.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].startsWith('[DealMonitor] Price drop for')
            );
            expect(priceDropLogCalls).toHaveLength(2);
        });
    });
});
