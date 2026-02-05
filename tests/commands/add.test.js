const addCommand = require('../../src/commands/add');
const { ModalBuilder } = require('discord.js');

describe('add command', () => {
    let mockInteraction, mockState, mockClient, mockMonitorManager, mockSiteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockInteraction = {
            options: {
                getString: jest.fn(),
                getBoolean: jest.fn()
            },
            fields: {
                getTextInputValue: jest.fn()
            },
            reply: jest.fn(),
            deferReply: jest.fn(),
            editReply: jest.fn(),
            followUp: jest.fn(),
            showModal: jest.fn(),
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
            }),
            state: [] // Mock state
        };

        mockMonitorManager = {
            getMonitor: jest.fn().mockReturnValue(mockSiteMonitor)
        };
    });

    describe('execute', () => {
        it('should show the modal', async () => {
            await addCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('Site');
            expect(mockInteraction.showModal).toHaveBeenCalledWith(expect.any(ModalBuilder));
            
            // Verify modal content implicitly or explicitly if needed, but checking the call is mostly sufficient for unit test
            const modalArg = mockInteraction.showModal.mock.calls[0][0];
            expect(modalArg.setCustomId).toHaveBeenCalledWith('add:submit');
            expect(modalArg.setTitle).toHaveBeenCalledWith('Agregar sitio para monitorear');
        });

        it('should handle missing SiteMonitor', async () => {
            mockMonitorManager.getMonitor.mockReturnValue(null);
            
            await addCommand.execute(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'El monitor de sitios no está disponible.' }));
            expect(mockInteraction.showModal).not.toHaveBeenCalled();
        });
    });

    describe('handleModal', () => {
        it('should add a site to sitesToMonitor array by delegating to SiteMonitor', async () => {
            mockInteraction.fields.getTextInputValue.mockImplementation((name) => {
                if (name === 'urlInput') return 'https://example.com';
                if (name === 'selectorInput') return '#test';
                if (name === 'forceInput') return 'no';
                return null;
            });

            // Simulate addSite updating state
            mockSiteMonitor.addSite.mockImplementation(async () => {
                const site = { id: 'example.com', url: 'https://example.com', css: '#test' };
                mockSiteMonitor.state = [site];
                return { site: site, warning: false };
            });

            await addCommand.handleModal(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('Site');
            expect(mockSiteMonitor.addSite).toHaveBeenCalledWith('https://example.com', '#test', false);
            expect(mockState.sitesToMonitor).toHaveLength(1);
            expect(mockState.sitesToMonitor[0].url).toBe('https://example.com');
            
            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array)
            }));
        });

        it.each(['yes', 'si', 'y', 's'])('should add a site with force enabled for value "%s"', async (forceValue) => {
            mockInteraction.fields.getTextInputValue.mockImplementation((name) => {
                if (name === 'urlInput') return 'https://example.com';
                if (name === 'selectorInput') return '#test';
                if (name === 'forceInput') return forceValue;
                return null;
            });

            await addCommand.handleModal(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockSiteMonitor.addSite).toHaveBeenCalledWith('https://example.com', '#test', true);
        });

        it('should handle default selector', async () => {
            mockInteraction.fields.getTextInputValue.mockImplementation((name) => {
                if (name === 'urlInput') return 'https://example.com';
                if (name === 'selectorInput') return ''; // Empty string
                if (name === 'forceInput') return '';
                return null;
            });

            // Simulate addSite updating state
            mockSiteMonitor.addSite.mockImplementation(async () => {
                const site = { id: 'example.com', url: 'https://example.com', css: 'head' };
                mockSiteMonitor.state = [site];
                return { site: site, warning: false };
            });

            await addCommand.handleModal(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockSiteMonitor.addSite).toHaveBeenCalledWith('https://example.com', 'head', false);
        });

        it('should handle errors during addSite', async () => {
            mockInteraction.fields.getTextInputValue.mockImplementation((name) => {
                if (name === 'urlInput') return 'https://example.com';
                if (name === 'forceInput') return 'no';
                return '';
            });
            
            const errorMsg = 'Network Error';
            mockSiteMonitor.addSite.mockRejectedValue(new Error(errorMsg));

            await addCommand.handleModal(mockInteraction, mockClient, mockState, {}, mockMonitorManager);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining(errorMsg)
            }));
        });
    });
});