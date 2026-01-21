const mockSetTitle = jest.fn().mockReturnThis();
const mockAddField = jest.fn().mockReturnThis();
const mockSetColor = jest.fn().mockReturnThis();

// Mock MessageEmbed as a class
const MockMessageEmbed = jest.fn(function() {
  this.setTitle = mockSetTitle;
  this.addField = mockAddField;
  this.setColor = mockSetColor;
});

module.exports = {
  Client: jest.fn(() => ({
    on: jest.fn(),
    channels: {
      cache: {
        get: jest.fn(() => ({
          send: jest.fn(),
        })),
      },
    },
    login: jest.fn(),
  })),
  MessageEmbed: MockMessageEmbed,
};