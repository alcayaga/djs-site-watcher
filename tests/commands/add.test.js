const addCommand = require('../../src/commands/add');

describe('add command', () => {
    let mockInteraction, mockState, mockClient, mockMonitorManager, mockSiteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockInteraction = {
            options: {
                getString: jest.fn()
            },
            reply: jest.fn(),
            deferReply: jest.fn(),
            editReply: jest.fn(),
            followUp: jest.fn(),
            deferred: false,
            replied: false
        };

        mockState = {
            sitesToMonitor: []
        };
        mockClient = {};
        
        mockSiteMonitor = {
            addSite: jest.fn().mockResolvedValue({
                site: {
                    id: 'example.com',
                    url: 'https://example.com',
                    css: '#test',
                    lastChecked: 'now',
                    lastUpdated: 'now',
                    hash: 'hash',
                    lastContent: 'content'
                },
                warning: false
            })
        };

        mockMonitorManager = {
            getMonitor: jest.fn().mockReturnValue(mockSiteMonitor)
        };
    });

    it('should add a site to sitesToMonitor array by delegating to SiteMonitor', async () => {
        mockInteraction.options.getString.mockImplementation((name) => {
            if (name === 'url') return 'https://example.com';
            if (name === 'selector') return '#test';
            return null;
        });

        await addCommand.execute(mockInteraction, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('Site');
        expect(mockSiteMonitor.addSite).toHaveBeenCalledWith('https://example.com', '#test');
        expect(mockState.sitesToMonitor).toHaveLength(1);
        expect(mockState.sitesToMonitor[0].url).toBe('https://example.com');
        
        expect(mockInteraction.deferReply).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.any(Array)
        }));
    });

    it('should handle missing SiteMonitor', async () => {
        mockMonitorManager.getMonitor.mockReturnValue(null);
        mockInteraction.options.getString.mockReturnValue('https://example.com');
        
        await addCommand.execute(mockInteraction, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Site monitor is not available.' }));
    });
});