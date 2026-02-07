module.exports = {
    read: jest.fn(),
    write: jest.fn(),
    loadSettings: jest.fn().mockReturnValue({
        interval: 5,
        debug: false,
    }),
    loadSites: jest.fn(),
    loadResponses: jest.fn(),
    migrateLegacyData: jest.fn(),
    saveSettings: jest.fn(),
    SENSITIVE_SETTINGS_KEYS: [],
};
