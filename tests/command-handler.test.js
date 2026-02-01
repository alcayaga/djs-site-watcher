const { handleInteraction } = require('../src/command-handler');

// Mock fs and path to control command loading
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue(['add.js'])
}));
jest.mock('path', () => ({
    join: jest.fn().mockReturnValue('/mock/path')
}));

// Mock commands
jest.mock('../src/commands/add.js', () => ({
    data: { name: 'add' },
    execute: jest.fn(),
    autocomplete: jest.fn()
}), { virtual: true });

describe('Command Handler', () => {
    let mockInteraction, mockConfig, mockClient, mockState, mockMonitorManager;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockConfig = {
            DISCORDJS_ADMINCHANNEL_ID: 'admin-channel',
            DISCORDJS_ROLE_ID: 'admin-role'
        };

        mockInteraction = {
            isChatInputCommand: jest.fn(),
            isAutocomplete: jest.fn(),
            commandName: 'add',
            channelId: 'admin-channel',
            member: {
                roles: {
                    cache: {
                        has: jest.fn().mockReturnValue(true)
                    }
                }
            },
            reply: jest.fn(),
            followUp: jest.fn(),
            respond: jest.fn()
        };

        mockClient = {};
        mockState = {};
        mockMonitorManager = {};
    });

    it('should execute command if authorized', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(true);
        // We need to re-require command-handler because it loads commands on top-level execution
        // But Jest caches modules. We need to isolate modules or move command loading inside a function if possible.
        // Or we rely on the fact that when `require('../src/command-handler')` runs at start of test file, 
        // it uses the mocks we defined *above* it (jest hoists mocks).
        
        // However, 'commands' collection is populated at top level. 
        // Let's verify if the mocks work as expected.
        const addCommand = require('../src/commands/add.js');
        
        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, null, mockMonitorManager);

        expect(addCommand.execute).toHaveBeenCalled();
    });

    it('should block execution if unauthorized (wrong channel)', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(true);
        mockInteraction.channelId = 'wrong-channel';
        const addCommand = require('../src/commands/add.js');

        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, null, mockMonitorManager);

        expect(addCommand.execute).not.toHaveBeenCalled();
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('not authorized'),
            ephemeral: true
        }));
    });

    it('should block execution if unauthorized (wrong role)', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(true);
        mockInteraction.member.roles.cache.has.mockReturnValue(false);
        const addCommand = require('../src/commands/add.js');

        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, null, mockMonitorManager);

        expect(addCommand.execute).not.toHaveBeenCalled();
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('not authorized'),
            ephemeral: true
        }));
    });

    it('should block autocomplete if unauthorized', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(false);
        mockInteraction.isAutocomplete.mockReturnValue(true);
        mockInteraction.channelId = 'wrong-channel';
        const addCommand = require('../src/commands/add.js');

        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, null, mockMonitorManager);

        expect(addCommand.autocomplete).not.toHaveBeenCalled();
        // Autocomplete should just return without reply
        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });
});