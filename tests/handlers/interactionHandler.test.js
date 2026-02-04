const { handleInteraction } = require('../../src/handlers/interactionHandler');

// Mock fs and path to control command loading via commandLoader
// The handler imports commandLoader. We should mock commandLoader directly.
jest.mock('../../src/utils/commandLoader', () => {
    const { Collection } = require('discord.js');
    return {
        loadCommands: jest.fn(() => {
            const commands = new Collection();
            const addCommand = require('../../src/commands/add.js');
            commands.set('add', addCommand);
            return commands;
        })
    };
});

// Mock commands
jest.mock('../../src/commands/add.js', () => ({
    data: { name: 'add' },
    execute: jest.fn(),
    handleModal: jest.fn(),
    autocomplete: jest.fn()
}), { virtual: true });

describe('Interaction Handler', () => {
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
            isModalSubmit: jest.fn(),
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
            editReply: jest.fn(),
            followUp: jest.fn(),
            respond: jest.fn(),
            replied: false,
            deferred: false
        };

        mockClient = {};
        mockState = {};
        mockMonitorManager = {};
    });

    it('should execute command with correct arguments if authorized', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(true);
        const addCommand = require('../../src/commands/add.js');
        
        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

        expect(addCommand.execute).toHaveBeenCalledWith(
            mockInteraction,
            mockClient,
            mockState,
            mockConfig,
            mockMonitorManager
        );
    });

    describe('Modal Handling', () => {
        beforeEach(() => {
            mockInteraction.commandName = undefined;
        });

        it('should handle add_site_modal submission', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add_site_modal';

            const addCommand = require('../../src/commands/add.js');
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(addCommand.handleModal).toHaveBeenCalledWith(
                mockInteraction,
                mockClient,
                mockState,
                mockConfig,
                mockMonitorManager
            );
        });

        it('should ignore unknown modal IDs', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'unknown_modal';

            const addCommand = require('../../src/commands/add.js');
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(addCommand.handleModal).not.toHaveBeenCalled();
        });

        it('should handle errors in modal processing (not deferred/replied)', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add_site_modal';
            mockInteraction.deferred = false;
            mockInteraction.replied = false;

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleModal.mockRejectedValue(new Error('Modal Error'));
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Error processing'),
                ephemeral: true
            }));
        });

        it('should use editReply for errors if deferred', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add_site_modal';
            mockInteraction.deferred = true;
            mockInteraction.replied = false;

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleModal.mockRejectedValue(new Error('Modal Error'));
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Error processing'),
                ephemeral: true
            }));
        });

        it('should use followUp for errors if replied', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add_site_modal';
            mockInteraction.deferred = false;
            mockInteraction.replied = true;

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleModal.mockRejectedValue(new Error('Modal Error'));
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.followUp).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Error processing'),
                ephemeral: true
            }));
        });
    });

    describe('Error Handling', () => {
        it('should use reply if not deferred or replied', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(true);
            const addCommand = require('../../src/commands/add.js');
            addCommand.execute.mockRejectedValue(new Error('Test Fail'));

            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error executing')
            }));
        });

        it('should use editReply if deferred', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(true);
            mockInteraction.deferred = true;
            const addCommand = require('../../src/commands/add.js');
            addCommand.execute.mockRejectedValue(new Error('Test Fail'));

            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error executing')
            }));
        });

        it('should use followUp if replied', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(true);
            mockInteraction.replied = true;
            const addCommand = require('../../src/commands/add.js');
            addCommand.execute.mockRejectedValue(new Error('Test Fail'));

            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.followUp).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error executing')
            }));
        });
    });

    it('should block execution if unauthorized (wrong channel)', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(true);
        mockInteraction.channelId = 'wrong-channel';
        const addCommand = require('../../src/commands/add.js');

        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

        expect(addCommand.execute).not.toHaveBeenCalled();
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('not authorized'),
            ephemeral: true
        }));
    });

    it('should block execution if unauthorized (wrong role)', async () => {
        mockInteraction.isChatInputCommand.mockReturnValue(true);
        mockInteraction.member.roles.cache.has.mockReturnValue(false);
        const addCommand = require('../../src/commands/add.js');

        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

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
        const addCommand = require('../../src/commands/add.js');

        await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

        expect(addCommand.autocomplete).not.toHaveBeenCalled();
        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });
});