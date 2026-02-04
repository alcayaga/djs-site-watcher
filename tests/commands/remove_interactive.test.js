const removeCommand = require('../../src/commands/remove');
const { ComponentType } = require('discord.js');

describe('Remove Command Interactive Features', () => {
    let mockInteraction, mockState, mockClient, mockMonitorManager, mockSiteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSiteMonitor = {
            state: [
                { id: 'site1', url: 'http://site1.com' },
                { id: 'site2', url: 'http://site2.com' }
            ],
            removeSiteByIndex: jest.fn()
        };
        mockMonitorManager = {
            getMonitor: jest.fn().mockReturnValue(mockSiteMonitor)
        };
        mockInteraction = {
            options: {
                getInteger: jest.fn(),
            },
            reply: jest.fn(),
            update: jest.fn(),
            followUp: jest.fn(),
            values: [],
            componentType: null,
            customId: ''
        };
        mockState = {
            sitesToMonitor: [...mockSiteMonitor.state]
        };
        mockClient = {};
    });

    describe('execute (Dropdown Trigger)', () => {
        it('should show dropdown when no index is provided', async () => {
            mockInteraction.options.getInteger.mockReturnValue(null);

            await removeCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Selecciona el sitio'),
                components: expect.any(Array),
                ephemeral: true
            }));
        });
    });

    describe('handleComponent', () => {
        it('should show dropdown on "prompt" action', async () => {
            await removeCommand.handleComponent(mockInteraction, mockClient, mockState, {}, mockMonitorManager, 'prompt');

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                components: expect.any(Array),
                ephemeral: true
            }));
        });

        it('should remove site on "select" action', async () => {
            mockInteraction.componentType = ComponentType.StringSelect;
            mockInteraction.values = ['0'];
            mockSiteMonitor.removeSiteByIndex.mockResolvedValue({ id: 'site1' });
            
            // Simulate monitor state update after removal
            mockSiteMonitor.state = [{ id: 'site2', url: 'http://site2.com' }];

            await removeCommand.handleComponent(mockInteraction, mockClient, mockState, {}, mockMonitorManager, 'select');

            expect(mockSiteMonitor.removeSiteByIndex).toHaveBeenCalledWith(0);
            expect(mockState.sitesToMonitor).toEqual([{ id: 'site2', url: 'http://site2.com' }]);
            expect(mockInteraction.update).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Eliminando **site1**'),
                components: []
            }));
            expect(mockInteraction.followUp).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Se ha eliminado **site1**'),
                ephemeral: false,
                allowedMentions: { parse: [] }
            }));
        });

        it('should handle invalid selection', async () => {
            mockInteraction.componentType = ComponentType.StringSelect;
            mockInteraction.values = ['99']; // Out of bounds

            await removeCommand.handleComponent(mockInteraction, mockClient, mockState, {}, mockMonitorManager, 'select');

            expect(mockSiteMonitor.removeSiteByIndex).not.toHaveBeenCalled();
            expect(mockInteraction.update).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Selección inválida'),
                components: []
            }));
        });
    });
});
