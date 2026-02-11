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

        it('should enable pagination for > 5 sites and handle button clicks', async () => {
            // Create 6 sites to trigger pagination
            const manySites = Array(6).fill(null).map((_, i) => ({
                id: `site${i}`, url: `http://site${i}.com`, css: 'body', lastUpdated: 'now'
            }));
            mockSiteMonitor.state = manySites;

            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalled();
            
            const mockMessage = await mockInteraction.editReply.mock.results[0].value;
            const mockCollector = mockMessage.createMessageComponentCollector.mock.results[0].value;
            
            // Get the 'collect' callback
            const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];
            
            // Simulate 'next' button click
            const mockButtonInteraction = {
                user: { id: 'test-user' },
                customId: 'next',
                update: jest.fn().mockResolvedValue(true)
            };
            
            await collectCallback(mockButtonInteraction);
            
            expect(mockButtonInteraction.update).toHaveBeenCalledWith(expect.objectContaining({
                embeds: [expect.objectContaining({
                    data: expect.objectContaining({
                        description: expect.stringContaining('Mostrando 6-6')
                    })
                })]
            }));

            // Simulate collector end
            const endCall = mockCollector.on.mock.calls.find(call => call[0] === 'end');
            const endCallback = endCall[1];
            expect(endCallback).toBeDefined();
            await endCallback();
            
            // Verify buttons are disabled in the last editReply call
            const lastEditCall = mockInteraction.editReply.mock.calls[mockInteraction.editReply.mock.calls.length - 1][0];
            const actionRow = lastEditCall.components[0];
            expect(actionRow.components[0].data.disabled).toBe(true);
            expect(actionRow.components[1].data.disabled).toBe(true);
        });

        it('should handle sites without CSS selectors and truncate long sanitized fields', async () => {
            const longId = 'a'.repeat(300);
            const longUrl = 'h'.repeat(600);
            const longCss = 'c'.repeat(300);
            
            mockSiteMonitor.state = [
                { id: longId, url: longUrl, css: longCss, lastUpdated: 'now' },
                { id: 'site2', url: 'http://site2.com', lastUpdated: 'now' } // No CSS
            ];

            await listCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalled();
            const lastCall = mockInteraction.editReply.mock.calls[0][0];
            const fields = lastCall.embeds[0].data.fields;
            
            // Verify truncation of name (256 limit)
            expect(fields[0].name.length).toBeLessThanOrEqual(256);
            
            // Verify truncation of value (1024 limit)
            expect(fields[0].value.length).toBeLessThanOrEqual(1024);
            
            // Verify second site (no CSS) works
            expect(fields[1].value).toContain('🔍 **CSS:** ``');
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