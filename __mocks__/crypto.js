const mockUpdate = jest.fn().mockReturnThis();
const mockDigest = jest.fn().mockReturnValue('mock-hash');

module.exports = {
    createHash: jest.fn(() => ({
        update: mockUpdate,
        digest: mockDigest,
    })),
    // Expose spies for assertion
    _mockUpdate: mockUpdate,
    _mockDigest: mockDigest
};
