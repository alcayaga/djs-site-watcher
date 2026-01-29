const add = require('../../src/commands/add');
const storage = require('../../src/storage');
const got = require('got');

jest.mock('../../src/storage');
jest.mock('got');
jest.mock('jsdom', () => {
    return {
        JSDOM: jest.fn().mockImplementation(() => {
            return {
                window: {
                    document: {
                        querySelector: jest.fn().mockReturnValue({ textContent: 'test content' }),
                        title: 'Test Title'
                    }
                }
            };
        })
    };
});

describe('add command', () => {
    let mockMessage, mockState, mockClient;

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
        got.mockResolvedValue({ body: '<html><body><div id="test">test content</div></body></html>' });
    });

    it('should add a site to sitesToMonitor array', async () => {
        const args = ['https://example.com', '#test'];
        await add.execute(mockMessage, args, mockClient, mockState);

        expect(mockState.sitesToMonitor).toHaveLength(1);
        expect(mockState.sitesToMonitor[0].url).toBe('https://example.com');
        expect(mockState.sitesToMonitor[0].css).toBe('#test');
        expect(storage.saveSites).toHaveBeenCalled();
        expect(mockMessage.channel.send).toHaveBeenCalled();
    });

    it('should fail gracefully if state.sitesToMonitor is not an array', async () => {
        mockState.sitesToMonitor = { sites: [] }; 
        const args = ['https://example.com', '#test'];
        
        await add.execute(mockMessage, args, mockClient, mockState);

        expect(mockMessage.reply).toHaveBeenCalledWith('there was an error trying to execute that command!');
    });
});
