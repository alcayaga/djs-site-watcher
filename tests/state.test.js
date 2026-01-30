const state = require('../src/state');
const storage = require('../src/storage');

jest.mock('../src/storage', () => ({
    loadSites: jest.fn(),
    loadSettings: jest.fn(),
    loadResponses: jest.fn(),
    migrateLegacyData: jest.fn(),
}));

/**
 * Test suite for the state module.
 */
describe('state', () => {
    /**
     * Before each test, clear the mock storage functions.
     */
    beforeEach(() => {
        storage.loadSites.mockClear();
        storage.loadSettings.mockClear();
        storage.loadResponses.mockClear();
    });

    /**
     * Test case for loading sites, settings, and responses from storage.
     */
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
