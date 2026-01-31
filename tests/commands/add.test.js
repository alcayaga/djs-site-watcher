const add = require('../../src/commands/add');
const Discord = require('discord.js');

describe('add command', () => {
    let mockMessage, mockState, mockClient, mockMonitorManager, mockSiteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMessage = {
            channel: {
                send: jest.fn()
            },
            reply: jest.fn()
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
        
        // Mock Discord MessageEmbed
        jest.spyOn(Discord, 'MessageEmbed').mockImplementation(() => ({
            addField: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
        }));
    });

    it('should add a site to sitesToMonitor array by delegating to SiteMonitor', async () => {
        const args = ['https://example.com', '#test'];
        await add.execute(mockMessage, args, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('Site');
        expect(mockSiteMonitor.addSite).toHaveBeenCalledWith('https://example.com', '#test');
        expect(mockState.sitesToMonitor).toHaveLength(1);
        expect(mockState.sitesToMonitor[0].url).toBe('https://example.com');
        expect(mockMessage.channel.send).toHaveBeenCalled();
    });

    it('should handle warning from SiteMonitor', async () => {
        mockSiteMonitor.addSite.mockResolvedValue({
            site: {
                id: 'example.com',
                url: 'https://example.com',
                css: '#test'
            },
            warning: true
        });

        const args = ['https://example.com', '#test'];
        await add.execute(mockMessage, args, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockMessage.channel.send).toHaveBeenCalled();
        // Check if embed contains warning text (indirectly via args passed to mocks or message structure)
        // Since we mocked MessageEmbed, we can't check the serialized content easily without inspecting the mock calls more deeply
        // But verifying execution completes without error is a good start.
    });

    it('should reply with error if SiteMonitor is missing', async () => {
        mockMonitorManager.getMonitor.mockReturnValue(null);
        
        const args = ['https://example.com'];
        await add.execute(mockMessage, args, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockMessage.reply).toHaveBeenCalledWith('Site monitor is not available.');
    });

    it('should handle errors from addSite gracefully', async () => {
        mockSiteMonitor.addSite.mockRejectedValue(new Error('Fetch failed'));
        
        const args = ['https://example.com'];
        await add.execute(mockMessage, args, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockMessage.reply).toHaveBeenCalledWith('there was an error trying to execute that command!');
    });

    it('should fail gracefully if state.sitesToMonitor is not an array', async () => {
        mockState.sitesToMonitor = null; 
        const args = ['https://example.com', '#test'];
        
        await add.execute(mockMessage, args, mockClient, mockState, {}, {}, mockMonitorManager);

        expect(mockMessage.reply).toHaveBeenCalledWith('there was an error trying to execute that command!');
    });
});
