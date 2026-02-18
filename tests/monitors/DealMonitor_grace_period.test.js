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

describe('DealMonitor Grace Period', () => {
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
            gracePeriodHours: 12,
            priceTolerance: 500
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

    it('should stay in PENDING state during the grace period', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const exitDate = new Date('2024-02-01T10:00:00.000Z');
        
        jest.useFakeTimers().setSystemTime(exitDate);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: oldDate,
                lastOfferPrice: 100000,
                minNormalPrice: 100000, minNormalDate: oldDate,
                lastNormalPrice: 100000
            }
        };

        // 1. Initial jump -> Enters PENDING
        got.mockResolvedValueOnce({ body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 130000, normalPrice: 100000 }]) });
        await monitor.check();
        expect(monitor.state['1'].pendingExitOffer).toEqual({ date: exitDate.toISOString() });
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);

        // 2. 6 hours later (still high) -> Stays PENDING
        const check2Date = new Date(exitDate.getTime() + 6 * 60 * 60 * 1000);
        jest.setSystemTime(check2Date);
        got.mockResolvedValueOnce({ body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 130000, normalPrice: 100000 }]) });
        await monitor.check();
        expect(monitor.state['1'].pendingExitOffer).toEqual({ date: exitDate.toISOString() });
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);

        jest.useRealTimers();
    });

    it('should silently cancel exit if price returns to low within grace period', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const exitDate = new Date('2024-02-01T10:00:00.000Z');
        
        jest.useFakeTimers().setSystemTime(exitDate);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: oldDate,
                lastOfferPrice: 130000,
                pendingExitOffer: { date: exitDate.toISOString() },
                minNormalPrice: 100000, minNormalDate: oldDate,
                lastNormalPrice: 100000
            }
        };

        // 4 hours later, price returns to low
        const check2Date = new Date(exitDate.getTime() + 4 * 60 * 60 * 1000);
        jest.setSystemTime(check2Date);
        got.mockResolvedValueOnce({ body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100000, normalPrice: 100000 }]) });
        
        await monitor.check();

        // Pending exit should be CLEARED
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
        // minDate should NOT be updated
        expect(monitor.state['1'].minOfferDate).toBe(oldDate);
        // NO notification should be sent
        expect(mockChannel.send).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    it('should confirm exit after grace period expires', async () => {
        const oldDate = '2024-01-01T00:00:00.000Z';
        const exitDate = new Date('2024-02-01T10:00:00.000Z');
        
        jest.useFakeTimers().setSystemTime(exitDate);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: oldDate,
                lastOfferPrice: 130000,
                pendingExitOffer: { date: exitDate.toISOString() },
                minNormalPrice: 100000, minNormalDate: oldDate,
                lastNormalPrice: 100000
            }
        };

        // 13 hours later, still high
        const check2Date = new Date(exitDate.getTime() + 13 * 60 * 60 * 1000);
        jest.setSystemTime(check2Date);
        got.mockResolvedValueOnce({ body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 130000, normalPrice: 100000 }]) });
        
        await monitor.check();

        // Pending exit should be CLEARED
        expect(monitor.state['1'].pendingExitOffer).toBeUndefined();
        // minDate SHOULD be updated to the original exit date
        expect(monitor.state['1'].minOfferDate).toBe(exitDate.toISOString());

        jest.useRealTimers();
    });

    it('should trigger BACK_TO_LOW if returning to low AFTER a confirmed exit', async () => {
        const exitDate = '2024-02-01T10:00:00.000Z';
        setupNotificationMocks(100000, 100000);

        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100000, minOfferDate: exitDate, // Already confirmed exit
                lastOfferPrice: 130000, // Currently high
                minNormalPrice: 100000, minNormalDate: exitDate,
                lastNormalPrice: 130000
            }
        };

        got.mockResolvedValueOnce({ body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100000, normalPrice: 100000 }]) });
        
        await monitor.check();

        // SHOULD trigger alert
        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        expect(sendCall.embeds[0].data.description).toContain('Volvió a precios históricos');
    });
});
