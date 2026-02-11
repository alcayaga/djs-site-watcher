const { handleInteraction, commands } = require('../../src/handlers/interactionHandler');
const { MessageFlags } = require('discord.js');

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
    handleComponent: jest.fn(),
    autocomplete: jest.fn()
}));

describe('Interaction Handler', () => {
    let mockInteraction, mockConfig, mockClient, mockState, mockMonitorManager;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Ensure add.js mock methods are present (in case they were deleted by a test)
        const addCommand = commands.get('add');
        if (!addCommand.handleModal) {
            addCommand.handleModal = jest.fn();
        }

        mockConfig = {};

        mockInteraction = {
            isChatInputCommand: jest.fn(),
            isAutocomplete: jest.fn(),
            isModalSubmit: jest.fn(),
            isMessageComponent: jest.fn(),
            commandName: 'add',
            channelId: 'admin-channel',
            member: {
                roles: {
                    cache: {
                        has: jest.fn().mockReturnValue(true)
                    }
                }
            },
            memberPermissions: {
                has: jest.fn().mockReturnValue(true)
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

    it('should execute command with correct arguments', async () => {
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

    describe('Interaction Routing (Modals & Components)', () => {
        beforeEach(() => {
            mockInteraction.commandName = undefined;
            mockInteraction.isMessageComponent = jest.fn().mockReturnValue(false);
        });

        it('should handle add:submit modal submission', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add:submit';

            const addCommand = require('../../src/commands/add.js');
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(addCommand.handleModal).toHaveBeenCalledWith(
                mockInteraction,
                mockClient,
                mockState,
                mockConfig,
                mockMonitorManager,
                'submit'
            );
        });

        it('should route message component interactions to the correct handler', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(false);
            mockInteraction.isMessageComponent.mockReturnValue(true);
            mockInteraction.customId = 'add:delete'; // Using 'add' as it's already mocked

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleComponent = jest.fn();
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(addCommand.handleComponent).toHaveBeenCalledWith(
                mockInteraction,
                mockClient,
                mockState,
                mockConfig,
                mockMonitorManager,
                'delete'
            );
        });

        it('should ignore unknown command IDs', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'unknown:action';

            const addCommand = require('../../src/commands/add.js');
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(addCommand.handleModal).not.toHaveBeenCalled();
        });

        it('should handle missing handler method on command', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add:submit';

            const addCommand = require('../../src/commands/add.js');
            // Mock handleModal to be undefined
            const originalHandleModal = addCommand.handleModal;
            addCommand.handleModal = undefined;
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error al procesar'),
                flags: [MessageFlags.Ephemeral]
            }));

            // Restore handleModal
            addCommand.handleModal = originalHandleModal;
        });

        it('should handle errors in modal processing (not deferred/replied)', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add:submit';
            mockInteraction.deferred = false;
            mockInteraction.replied = false;

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleModal.mockRejectedValue(new Error('Modal Error'));
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error al procesar'),
                flags: [MessageFlags.Ephemeral]
            }));
        });

        it('should use editReply for errors if deferred', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add:submit';
            mockInteraction.deferred = true;
            mockInteraction.replied = false;

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleModal.mockRejectedValue(new Error('Modal Error'));
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error al procesar'),
                flags: [MessageFlags.Ephemeral]
            }));
        });

        it('should use followUp for errors if replied', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(false);
            mockInteraction.isModalSubmit.mockReturnValue(true);
            mockInteraction.customId = 'add:submit';
            mockInteraction.deferred = false;
            mockInteraction.replied = true;

            const addCommand = require('../../src/commands/add.js');
            addCommand.handleModal.mockRejectedValue(new Error('Modal Error'));
            
            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.followUp).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error al procesar'),
                flags: [MessageFlags.Ephemeral]
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
                content: expect.stringContaining('error al procesar')
            }));
        });

        it('should use editReply if deferred', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(true);
            mockInteraction.deferred = true;
            const addCommand = require('../../src/commands/add.js');
            addCommand.execute.mockRejectedValue(new Error('Test Fail'));

            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error al procesar')
            }));
        });

        it('should use followUp if replied', async () => {
            mockInteraction.isChatInputCommand.mockReturnValue(true);
            mockInteraction.replied = true;
            const addCommand = require('../../src/commands/add.js');
            addCommand.execute.mockRejectedValue(new Error('Test Fail'));

            await handleInteraction(mockInteraction, mockClient, mockState, mockConfig, mockMonitorManager);

            expect(mockInteraction.followUp).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('error al procesar')
            }));
        });
    });
});