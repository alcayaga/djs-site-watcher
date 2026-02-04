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

const MockModalBuilder = jest.fn(function() {
    this.setCustomId = jest.fn().mockReturnThis();
    this.setTitle = jest.fn().mockReturnThis();
    this.addComponents = jest.fn().mockReturnThis();
});

const MockTextInputBuilder = jest.fn(function() {
    this.setCustomId = jest.fn().mockReturnThis();
    this.setLabel = jest.fn().mockReturnThis();
    this.setStyle = jest.fn().mockReturnThis();
    this.setRequired = jest.fn().mockReturnThis();
    this.setValue = jest.fn().mockReturnThis();
});

const MockActionRowBuilder = jest.fn(function() {
    this.addComponents = jest.fn().mockReturnThis();
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
  ModalBuilder: MockModalBuilder,
  TextInputBuilder: MockTextInputBuilder,
  ActionRowBuilder: MockActionRowBuilder,
  TextInputStyle: { Short: 1, Paragraph: 2 },
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