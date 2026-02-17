const DealMonitor = require('../../src/monitors/DealMonitor');
const got = require('got');
const solotodo = require('../../src/utils/solotodo');
const Discord = require('discord.js');

jest.mock('got');
jest.mock('discord.js', () => {
    const mockChannelInstance = {
        send: jest.fn().mockResolvedValue({ startThread: jest.fn().mockResolvedValue({}) })
    };
    const mockClientInstance = {
        channels: {
            cache: {
                get: jest.fn(() => mockChannelInstance)
            }
        }
    };
    return {
        Client: jest.fn(() => mockClientInstance),
        EmbedBuilder: jest.fn().mockImplementation(() => {
            const embed = {
                data: {},
                setTitle: jest.fn((t) => { embed.data.title = t; return embed; }),
                setDescription: jest.fn((d) => { embed.data.description = d; return embed; }),
                addFields: jest.fn((f) => { embed.data.fields = f; return embed; }),
                setColor: jest.fn((c) => { embed.data.color = c; return embed; }),
                setTimestamp: jest.fn(() => { embed.data.timestamp = new Date(); return embed; }),
                setFooter: jest.fn((f) => { embed.data.footer = f; return embed; }),
                setThumbnail: jest.fn((u) => { embed.data.thumbnail = { url: u }; return embed; })
            };
            return embed;
        }),
        AttachmentBuilder: jest.fn(),
        ThreadAutoArchiveDuration: { OneWeek: 10080 }
    };
});
jest.mock('../../src/storage');
jest.mock('../../src/config');
jest.mock('../../src/utils/solotodo', () => ({
    ...jest.requireActual('../../src/utils/solotodo'),
    getProductHistory: jest.fn().mockResolvedValue([]),
    getBestPictureUrl: jest.fn().mockImplementation(p => Promise.resolve(p.pictureUrl || p.picture_url)),
    getAvailableEntities: jest.fn().mockResolvedValue([]),
    getStores: jest.fn().mockResolvedValue(new Map())
}));
jest.mock('../../src/utils/helpers', () => ({
    sleep: jest.fn().mockResolvedValue()
}));

describe('DealMonitor Price Tolerance', () => {
    let monitor;
    let mockChannel;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get('mockDealsChannelId');
        
        const monitorConfig = {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json',
            priceTolerance: 500 // 500 CLP tolerance
        };

        monitor = new DealMonitor('Deal', monitorConfig);
        monitor.client = mockClient;
    });

    const setupNotificationMocks = (offerPrice = 100000, normalPrice = 100000) => {
        jest.spyOn(solotodo, 'getAvailableEntities').mockResolvedValue([
            {
                active_registry: {
                    offer_price: String(offerPrice),
                    normal_price: String(normalPrice),
                    cell_monthly_payment: null
                },
                store: 'https://api.com/stores/1/',
                external_url: 'https://store.com'
            }
        ]);
        jest.spyOn(solotodo, 'getStores').mockResolvedValue(new Map([['https://api.com/stores/1/', 'Store 1']]));
    };

    const mockApiResponse = (products) => {
        const results = products.map(p => ({
            product_entries: [{
                product: {
                    id: p.id,
                    name: p.name,
                    slug: p.slug || 'slug',
                    picture_url: p.picture_url || 'pic.jpg',
                    specs: { brand_brand_unicode: 'Apple' }
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

    it('should ignore small price increases within tolerance and not set Pending Exit', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 100000,
                minNormalPrice: 100000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 100000
            }
        };

        // Increase by 10 CLP (within 500 tolerance)
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100010, normalPrice: 100000 }])
        });

        await monitor.check();

        // Verify NO Pending Exit is set
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
        expect(monitor.state['1'].lastOfferPrice).toBe(100010);
        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should NOT trigger BACK_TO_LOW if the previous price was within tolerance of the minimum', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 100010, // Slightly above min, but within tolerance
                minNormalPrice: 100000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 100000
            }
        };

        // Price returns to exactly the minimum
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100000, normalPrice: 100000 }])
        });

        await monitor.check();

        // Should NOT alert because the "exit" was not significant
        expect(mockChannel.send).not.toHaveBeenCalled();
        expect(monitor.state['1'].lastOfferPrice).toBe(100000);
    });

    it('should still trigger BACK_TO_LOW if the previous price was ABOVE tolerance', async () => {
        setupNotificationMocks(100000);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 101000, // Significantly above min (> 500 tolerance)
                minNormalPrice: 100000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 100000
            }
        };

        // Price returns to exactly the minimum
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100000, normalPrice: 100000 }])
        });

        await monitor.check();

        // SHOULD alert
        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        expect(sendCall.embeds[0].data.description).toContain('Volvió al mínimo histórico');
    });

    it('should trigger BACK_TO_LOW if returning to a price within tolerance of the minimum (not exact minimum)', async () => {
        setupNotificationMocks(100100, 100100);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 110000, // Significantly above min
                minNormalPrice: 100000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 110000
            }
        };

        // Price returns to 100100 (within 500 tolerance of 100000)
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100100, normalPrice: 100100 }])
        });

        await monitor.check();

        // SHOULD alert
        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        expect(sendCall.embeds[0].data.description).toContain('Volvió a precios históricos');
        expect(monitor.state['1'].lastOfferPrice).toBe(100100);
    });

    it('should handle Pending Exit confirmation with tolerance', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const exitDate = '2024-02-01T00:00:00.000Z';

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: oldDate,
                lastOfferPrice: 110000,
                pendingExitOffer: { date: exitDate },
                minNormalPrice: 100000, minNormalDate: oldDate,
                lastNormalPrice: 100000
            }
        };

        // Price in next cycle is still above tolerance -> Confirm exit
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 110000, normalPrice: 100000 }])
        });

        await monitor.check();

        expect(monitor.state['1'].minOfferDate).toBe(exitDate);
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
    });

    it('should treat returns to within tolerance as phantom spikes during Pending Exit check', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const exitDate = '2024-02-01T00:00:00.000Z';

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: oldDate,
                lastOfferPrice: 110000,
                pendingExitOffer: { date: exitDate },
                minNormalPrice: 100000, minNormalDate: oldDate,
                lastNormalPrice: 100000
            }
        };

        // Price returns to slightly above min but within tolerance (100400 < 100000 + 500)
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100400, normalPrice: 100000 }])
        });

        await monitor.check();

        // Should NOT confirm exit, should keep old date
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
        expect(monitor.state['1'].lastOfferPrice).toBe(100400);
    });

    it('should use DEFAULT_PRICE_TOLERANCE if not specified in config', async () => {
        // Re-initialize monitor without priceTolerance
        monitor = new DealMonitor('Deal', {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json'
        });
        monitor.client = mockClient;

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 100000,
                minNormalPrice: 100000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 100000
            }
        };

        // Increase by 100 CLP (within DEFAULT_PRICE_TOLERANCE = 500)
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100100, normalPrice: 100000 }])
        });

        await monitor.check();

        // Verify NO Pending Exit is set
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
    });
});
