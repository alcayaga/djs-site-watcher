const listCommand = require('../../src/commands/list');
const removeCommand = require('../../src/commands/remove');
const helpCommand = require('../../src/commands/help');
const storage = require('../../src/storage');

jest.mock('../../src/storage', () => ({
    saveSites: jest.fn(),
}));

describe('List, Remove, Help Commands', () => {
    let mockInteraction, mockState, mockClient;

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
    });

    describe('/list', () => {
        it('should show list of sites', async () => {
            await listCommand.execute(mockInteraction, mockClient, mockState);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array)
            }));
            // Verify embed content - accessing internal data properties of the built embed
            // EmbedBuilder instances in tests are mocks, so we check how they were called or their properties if they are real objects
            // In our mock, EmbedBuilder returns an object with methods.
            // But we can check the calls to addFields.
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

            await removeCommand.execute(mockInteraction, mockClient, mockState);

            expect(mockState.sitesToMonitor).toHaveLength(1);
            expect(mockState.sitesToMonitor[0].id).toBe('site2');
            expect(storage.saveSites).toHaveBeenCalledWith(mockState.sitesToMonitor);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('Removed **site1**'));
        });

        it('should handle invalid index', async () => {
            mockInteraction.options.getInteger.mockReturnValue(99);

            await removeCommand.execute(mockInteraction, mockClient, mockState);

            expect(mockState.sitesToMonitor).toHaveLength(2); // No change
            expect(storage.saveSites).not.toHaveBeenCalled();
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
