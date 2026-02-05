const { ThreadAutoArchiveDuration } = require('discord.js');
const DealsChannel = require('../../src/channels/deals.js');
const solotodo = require('../../src/utils/solotodo');

jest.mock('../../src/utils/solotodo');

describe('DealsChannel', () => {
    let handler;
    let mockMessage;
    let mockState;
    let mockConfig;
    let handlerConfig;

    beforeEach(() => {
        handlerConfig = {
            channelId: '456'
        };
        handler = new DealsChannel('Deals', handlerConfig);
        mockMessage = {
            author: { 
                bot: false,
                displayName: 'testuser',
                username: 'testuser',
                send: jest.fn().mockResolvedValue({})
            },
            channel: { id: '456' },
            content: 'Check this out!',
            attachments: new Map(),
            delete: jest.fn().mockResolvedValue({}),
            startThread: jest.fn().mockResolvedValue({
                send: jest.fn().mockResolvedValue({})
            }),
        };
        mockState = {};
        mockConfig = {};
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should allow message with link and create thread', async () => {
        const content = 'Great deal here: https://example.com';
        mockMessage.content = content;
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
        expect(mockMessage.delete).not.toHaveBeenCalled();
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: content.substring(0, 100),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek
        });
    });

    it.each([
        ['Check this out!', 'Check this out!'],
        ['', 'Discusión de la oferta'],
        ['   ', 'Discusión de la oferta'],
    ])('should create thread with correct name for content "%s" when an attachment is present', async (content, expectedName) => {
        mockMessage.content = content;
        mockMessage.attachments.set('1', {});
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
        expect(mockMessage.delete).not.toHaveBeenCalled();
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: expectedName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek
        });
    });

    it('should return true if thread creation fails', async () => {
        mockMessage.startThread.mockRejectedValue(new Error('Discord error'));
        mockMessage.content = 'Great deal here: https://example.com';
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(true);
    });

    it('should delete and notify for message without link or attachment in Spanish', async () => {
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(true);
        expect(mockMessage.delete).toHaveBeenCalled();
        expect(mockMessage.startThread).not.toHaveBeenCalled();
        expect(mockMessage.author.send).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.any(Object)
                ])
            })
        );
        
        // Verify the embed was configured correctly
        const embed = mockMessage.author.send.mock.calls[0][0].embeds[0];
        expect(embed.setDescription).toHaveBeenCalledWith(
            expect.stringContaining('fue eliminado porque no parece ser una oferta')
        );
    });

    it('should present Solotodo product in an embed when a product is found', async () => {
        const product = { id: 123, name: 'Apple iPhone 15', slug: 'apple-iphone-15' };
        solotodo.searchByUrl.mockResolvedValue(product);
        solotodo.getAvailableEntities.mockResolvedValue([
            { 
                store: 'https://store.com/1/', 
                external_url: 'https://store.com/p123',
                active_registry: { offer_price: '799990', normal_price: '899990', is_available: true, cell_monthly_payment: null } 
            }
        ]);
        solotodo.getStores.mockResolvedValue(new Map([['https://store.com/1/', 'Store 1']]));
        solotodo.getProductUrl.mockReturnValue('https://solotodo.cl/products/123');

        mockMessage.content = 'Oferta: https://some-store.com/iphone15';
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        
        expect(handled).toBe(false);
        const thread = await mockMessage.startThread.mock.results[0].value;
        expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.arrayContaining([
                expect.any(Object)
            ])
        }));

        const embed = thread.send.mock.calls[0][0].embeds[0];
        expect(embed.setTitle).toHaveBeenCalledWith('Apple iPhone 15');
        expect(embed.setURL).toHaveBeenCalledWith('https://solotodo.cl/products/123');
        expect(embed.addFields).toHaveBeenCalledWith(expect.objectContaining({
            name: expect.stringContaining('precios')
        }));
    });

    it('should include a thumbnail in the embed if product has a picture_url', async () => {
        const product = { 
            id: 123, 
            name: 'Apple iPhone 15', 
            slug: 'apple-iphone-15',
            picture_url: 'https://media.solotodo.com/picture.png'
        };
        solotodo.searchByUrl.mockResolvedValue(product);
        solotodo.getAvailableEntities.mockResolvedValue([]);
        solotodo.getStores.mockResolvedValue(new Map());
        solotodo.getProductUrl.mockReturnValue('https://solotodo.cl/products/123');

        mockMessage.content = 'Oferta: https://some-store.com/iphone15';
        await handler.handle(mockMessage, mockState, mockConfig);
        
        const thread = await mockMessage.startThread.mock.results[0].value;
        const embed = thread.send.mock.calls[0][0].embeds[0];
        expect(embed.setThumbnail).toHaveBeenCalledWith('https://media.solotodo.com/picture.png');
    });
});
