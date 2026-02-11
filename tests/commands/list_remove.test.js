const listCommand = require('../../src/commands/list');
const removeCommand = require('../../src/commands/remove');
const helpCommand = require('../../src/commands/help');
const { MessageFlags } = require('discord.js');

describe('List, Remove, Help Commands', () => {
    let mockInteraction, mockState, mockClient, mockMonitorManager, mockSiteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        
        const mockCollector = {
            on: jest.fn(),
            stop: jest.fn()
        };
        
        const mockMessage = {
            createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector)
        };

        mockInteraction = {
            options: {
                getInteger: jest.fn(),
            },
            reply: jest.fn(),
            deferReply: jest.fn(),
            editReply: jest.fn().mockResolvedValue(mockMessage),
            followUp: jest.fn(),
            deferred: false,
            replied: false,
            user: { id: 'test-user' },
            guildId: 'test-guild'
        };
        mockState = {
            sitesToMonitor: [
                { id: 'site1', url: 'http://site1.com', css: 'body', lastChecked: 'now', lastUpdated: 'now' },
                { id: 'site2', url: 'http://site2.com', css: 'div', lastChecked: 'yesterday', lastUpdated: 'yesterday' }
            ]
        };
        mockClient = {};
        
        mockSiteMonitor = {
            state: [
                { id: 'site1', url: 'http://site1.com', css: 'body', lastChecked: 'now', lastUpdated: 'now' },
                { id: 'site2', url: 'http://site2.com', css: 'div', lastChecked: 'yesterday', lastUpdated: 'yesterday' }
            ],
            removeSiteByIndex: jest.fn()
        };
        mockMonitorManager = {
            getMonitor: jest.fn().mockReturnValue(mockSiteMonitor)
        };
    });

    describe('/list', () => {
        it('should show list of sites', async () => {
            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: [MessageFlags.Ephemeral] });
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                components: expect.any(Array)
            }));
        });

        it('should enable pagination for > 5 sites', async () => {
            // Create 6 sites to trigger pagination
            const manySites = Array(6).fill(null).map((_, i) => ({
                id: `site${i}`, url: `http://site${i}.com`, css: 'body', lastUpdated: 'now'
            }));
            mockSiteMonitor.state = manySites;

            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalled();
            // Verify createMessageComponentCollector was called
            const mockMessage = await mockInteraction.editReply.mock.results[0].value;
            expect(mockMessage.createMessageComponentCollector).toHaveBeenCalled();
        });

        it('should message if no sites', async () => {
            mockSiteMonitor.state = [];
            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('No hay sitios'),
                flags: [MessageFlags.Ephemeral]
            }));
        });
    });

    describe('/remove', () => {
        it('should show the removal dropdown', async () => {
            await removeCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Selecciona el sitio'),
                components: expect.any(Array),
                flags: [MessageFlags.Ephemeral]
            }));
        });
    });

    describe('/help', () => {
        it('should show help embed', async () => {
            await helpCommand.execute(mockInteraction);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                flags: [MessageFlags.Ephemeral]
            }));
        });
    });
});