const state = require('./state');
const storage = require('./storage');

jest.mock('./storage', () => ({
    loadSites: jest.fn(),
    loadSettings: jest.fn(),
    loadResponses: jest.fn(),
}));

describe('state', () => {
    beforeEach(() => {
        storage.loadSites.mockClear();
        storage.loadSettings.mockClear();
        storage.loadResponses.mockClear();
    });

    it('should load sites, settings, and responses from storage', () => {
        const mockSites = [{ id: 'test' }];
        const mockSettings = { interval: 10 };
        const mockResponses = [{ trigger: 'test' }];

        storage.loadSites.mockReturnValue(mockSites);
        storage.loadSettings.mockReturnValue(mockSettings);
        storage.loadResponses.mockReturnValue(mockResponses);

        state.load();

        expect(state.sitesToMonitor).toEqual(mockSites);
        expect(state.settings).toEqual(mockSettings);
        expect(state.responses).toEqual(mockResponses);
    });
});
