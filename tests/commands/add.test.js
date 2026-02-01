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

    it('should handle errors gracefully', async () => {
        mockInteraction.options.getString.mockReturnValue('https://example.com');
        mockSiteMonitor.addSite.mockRejectedValue(new Error('Test error'));
        
        // Simulate deferred state if the error happens after deferReply
        // But here we rely on the function logic. addCommand defers early.
        // We can just call it.
        
        await addCommand.execute(mockInteraction, mockClient, mockState, {}, {}, mockMonitorManager);
        
        // Since it calls deferReply() then awaits addSite(), it should use editReply on error
        expect(mockInteraction.deferReply).toHaveBeenCalled();
        // Manually set deferred to true to simulate what happens in real execution if we want strict check,
        // but the code checks 'interaction.deferred' property.
        // We need to set it on the mock if we want that branch to be taken, OR reliance on .then() callback.
        // Wait, the code is:
        // await interaction.deferReply();
        // ... await siteMonitor.addSite ...
        // catch ... if (interaction.deferred) ...
        
        // The mock needs to have deferred = true if deferReply was called? 
        // No, the mock implementation doesn't change property automatically unless we tell it.
        // But we can simulate the "deferred" property check in the code:
        // if (interaction.deferred || interaction.replied)
        
        // Since `await interaction.deferReply()` is called, we should assume the real object would be deferred.
        // To test the catch block correctly, we can manually set it in the mock for this test case if we want to be precise,
        // or just ensure *some* reply function is called.
        
        // Let's assume the code sets interaction.deferred (it doesn't, Discord.js does).
        // So we should set it on the mock to test that path.
        mockInteraction.deferred = true;
        
        await addCommand.execute(mockInteraction, mockClient, mockState, {}, {}, mockMonitorManager);
        
        expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'There was an error trying to execute that command!' }));
    });
});