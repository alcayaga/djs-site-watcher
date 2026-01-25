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
  Client: jest.fn(() => {
    const listeners = {};
    return {
      on: jest.fn((event, callback) => {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(callback);
      }),
      emit: jest.fn((event, ...args) => {
        if (listeners[event]) {
          listeners[event].forEach(callback => callback(...args));
        }
      }),
      listeners: jest.fn((event) => listeners[event] || []),
      channels: {
        cache: {
          get: jest.fn(() => mockChannel), // Always return the same mockChannel
        },
      },
      login: jest.fn(),
    };
  }),
  MessageEmbed: MockMessageEmbed,
};