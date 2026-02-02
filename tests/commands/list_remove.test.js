const listCommand = require('../../src/commands/list');
const removeCommand = require('../../src/commands/remove');
const helpCommand = require('../../src/commands/help');
const storage = require('../../src/storage');

jest.mock('../../src/storage', () => ({
    saveSites: jest.fn(),
}));

describe('List, Remove, Help Commands', () => {
    let mockInteraction, mockState, mockClient, mockMonitorManager, mockSiteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        mockInteraction = {
            options: {
                getInteger: jest.fn(),
            },
            reply: jest.fn(),
            deferReply: jest.fn(),
            editReply: jest.fn(),
            followUp: jest.fn(),
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
            await listCommand.execute(mockInteraction, mockClient, mockState);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array)
            }));
        });

        it('should message if no sites', async () => {
            mockState.sitesToMonitor = [];
            await listCommand.execute(mockInteraction, mockClient, mockState);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('No sites'));
        });
    });

    describe('/remove', () => {
        it('should remove a site', async () => {
            mockInteraction.options.getInteger.mockReturnValue(1); // Remove first site (index 1)
            mockSiteMonitor.removeSiteByIndex.mockResolvedValue({ id: 'site1' });
            
            // After removal, the state on monitor would be updated in real life.
            // We simulate the result by ensuring the command updates global state from monitor state.
            // But here mockSiteMonitor.state is static unless we change it.
            // Let's assume removeSiteByIndex updates it.
            mockSiteMonitor.state = [{ id: 'site2' }]; 

            await removeCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockSiteMonitor.removeSiteByIndex).toHaveBeenCalledWith(0);
            expect(mockState.sitesToMonitor).toEqual([{ id: 'site2' }]);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('Removed **site1**'));
        });

        it('should handle invalid index', async () => {
            mockInteraction.options.getInteger.mockReturnValue(99);

            await removeCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockSiteMonitor.removeSiteByIndex).not.toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Not a valid number') }));
        });
    });

    describe('/help', () => {
        it('should show help embed', async () => {
            await helpCommand.execute(mockInteraction);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array)
            }));
        });
    });
});
