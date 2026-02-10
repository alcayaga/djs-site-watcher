const listCommand = require('../../src/commands/list');
const removeCommand = require('../../src/commands/remove');
const helpCommand = require('../../src/commands/help');
const { MessageFlags } = require('discord.js');

describe('List, Remove, Help Commands', () => {
    let mockInteraction, mockState, mockClient, mockMonitorManager, mockSiteMonitor;
    let mockCollector, mockMessage;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockCollector = {
            on: jest.fn(),
            stop: jest.fn()
        };

        mockMessage = {
            createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector)
        };

        mockInteraction = {
            user: { id: 'user123' },
            options: {
                getInteger: jest.fn(),
            },
            reply: jest.fn(),
            deferReply: jest.fn(),
            editReply: jest.fn().mockResolvedValue(mockMessage),
            followUp: jest.fn(),
            update: jest.fn(),
            deferred: false,
            replied: false
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
                { id: 'site2', url: 'http://site2.com', css: 'div', lastChecked: 'yesterday', lastUpdated: 'yesterday' },
                { id: 'site3', url: 'http://site3.com', css: 'body', lastChecked: 'now', lastUpdated: 'now' },
                { id: 'site4', url: 'http://site4.com', css: 'div', lastChecked: 'yesterday', lastUpdated: 'yesterday' },
                { id: 'site5', url: 'http://site5.com', css: 'body', lastChecked: 'now', lastUpdated: 'now' },
                { id: 'site6', url: 'http://site6.com', css: 'div', lastChecked: 'yesterday', lastUpdated: 'yesterday' }
            ],
            removeSiteByIndex: jest.fn()
        };
        mockMonitorManager = {
            getMonitor: jest.fn().mockReturnValue(mockSiteMonitor)
        };
    });

    describe('/list', () => {
        it('should show list of sites with pagination', async () => {
            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                components: expect.any(Array)
            }));
            
            // Verify collector creation
            expect(mockMessage.createMessageComponentCollector).toHaveBeenCalledWith(expect.objectContaining({
                time: 300000
            }));
        });

        it('should handle pagination buttons', async () => {
            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);
            
            // Get the collector 'collect' callback
            const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];
            expect(collectCallback).toBeDefined();

            // Mock button interaction
            const mockButtonInteraction = {
                customId: 'next',
                user: { id: 'user123' },
                update: jest.fn()
            };

            // Click Next
            await collectCallback(mockButtonInteraction);
            expect(mockButtonInteraction.update).toHaveBeenCalled();

            // Click Prev
            mockButtonInteraction.customId = 'prev';
            await collectCallback(mockButtonInteraction);
            expect(mockButtonInteraction.update).toHaveBeenCalledTimes(2);
        });

        it('should message if no sites', async () => {
            mockSiteMonitor.state = [];
            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('No hay sitios'));
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