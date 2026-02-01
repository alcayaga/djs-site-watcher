const mockChannel = {
  send: jest.fn(),
  sendTyping: jest.fn(),
};

const mockSetTitle = jest.fn().mockReturnThis();
const mockAddFields = jest.fn().mockReturnThis();
const mockSetColor = jest.fn().mockReturnThis();

const MockEmbedBuilder = jest.fn(function() {
  this.setTitle = mockSetTitle;
  this.addFields = mockAddFields;
  this.setColor = mockSetColor;
});

const mockSlashCommandBuilder = jest.fn(function() {
    this.setName = jest.fn().mockReturnThis();
    this.setDescription = jest.fn().mockReturnThis();
    this.addStringOption = jest.fn().mockReturnThis();
    this.addIntegerOption = jest.fn().mockReturnThis();
    this.addSubcommand = jest.fn().mockReturnThis();
    this.toJSON = jest.fn().mockReturnValue({});
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
      user: {
          tag: 'TestBot#0000'
      },
      application: {
          commands: {
              set: jest.fn().mockResolvedValue([])
          }
      }
    };
  }),
  EmbedBuilder: MockEmbedBuilder,
  SlashCommandBuilder: mockSlashCommandBuilder,
  AttachmentBuilder: jest.fn(),
  GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 512,
      MessageContent: 32768
  },
  Partials: {
      Channel: 1
  },
  Events: {
      ClientReady: 'ready',
      InteractionCreate: 'interactionCreate',
      MessageCreate: 'messageCreate',
  },
  Collection: Map,
};