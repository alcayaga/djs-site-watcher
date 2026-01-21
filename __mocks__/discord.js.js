const mockChannel = {
  send: jest.fn(),
};

const mockSetTitle = jest.fn().mockReturnThis();
const mockAddField = jest.fn().mockReturnThis();
const mockSetColor = jest.fn().mockReturnThis();

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
        get: jest.fn(() => mockChannel), // Always return the same mockChannel
      },
    },
    login: jest.fn(),
  })),
  MessageEmbed: MockMessageEmbed,
};