const mockChannel = {
  send: jest.fn(),
  sendTyping: jest.fn(),
};

const MockEmbedBuilder = jest.fn(function() {
  this.data = {};
  this.setTitle = jest.fn().mockImplementation((title) => {
    this.data.title = title;
    return this;
  });
  this.setDescription = jest.fn().mockImplementation((desc) => {
    this.data.description = desc;
    return this;
  });
  this.addFields = jest.fn().mockImplementation((fields) => {
    this.data.fields = (this.data.fields || []).concat(fields);
    return this;
  });
  this.setColor = jest.fn().mockImplementation((color) => {
    this.data.color = color;
    return this;
  });
  this.setFooter = jest.fn().mockImplementation((footer) => {
    this.data.footer = footer;
    return this;
  });
  this.setURL = jest.fn().mockImplementation((url) => {
    this.data.url = url;
    return this;
  });
  this.setTimestamp = jest.fn().mockImplementation((ts) => {
    this.data.timestamp = ts || new Date();
    return this;
  });
  this.setThumbnail = jest.fn().mockImplementation((url) => {
    this.data.thumbnail = { url };
    return this;
  });
  this.setImage = jest.fn().mockImplementation((url) => {
    this.data.image = { url };
    return this;
  });
  this.setAuthor = jest.fn().mockImplementation((author) => {
    this.data.author = author;
    return this;
  });
});

const mockSlashCommandBuilder = jest.fn(function() {
    this.setName = jest.fn().mockReturnThis();
    this.setDescription = jest.fn().mockReturnThis();
    this.setDefaultMemberPermissions = jest.fn().mockReturnThis();
    this.addStringOption = jest.fn().mockReturnThis();
    this.addIntegerOption = jest.fn().mockReturnThis();
    this.addBooleanOption = jest.fn().mockReturnThis();
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
    this.setPlaceholder = jest.fn().mockReturnThis();
});

const MockActionRowBuilder = jest.fn(function() {
    this.addComponents = jest.fn().mockReturnThis();
});

const MockButtonBuilder = jest.fn(function() {
    this.setCustomId = jest.fn().mockReturnThis();
    this.setLabel = jest.fn().mockReturnThis();
    this.setStyle = jest.fn().mockReturnThis();
    this.setEmoji = jest.fn().mockReturnThis();
    this.setDisabled = jest.fn().mockReturnThis();
});

const MockStringSelectMenuBuilder = jest.fn(function() {
    this.setCustomId = jest.fn().mockReturnThis();
    this.setPlaceholder = jest.fn().mockReturnThis();
    this.addOptions = jest.fn().mockReturnThis();
    this.setMinValues = jest.fn().mockReturnThis();
    this.setMaxValues = jest.fn().mockReturnThis();
    this.setDisabled = jest.fn().mockReturnThis();
});

const MockStringSelectMenuOptionBuilder = jest.fn(function() {
    this.setLabel = jest.fn().mockReturnThis();
    this.setValue = jest.fn().mockReturnThis();
    this.setDescription = jest.fn().mockReturnThis();
    this.setDefault = jest.fn().mockReturnThis();
    this.setEmoji = jest.fn().mockReturnThis();
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
  ButtonBuilder: MockButtonBuilder,
  StringSelectMenuBuilder: MockStringSelectMenuBuilder,
  StringSelectMenuOptionBuilder: MockStringSelectMenuOptionBuilder,
  TextInputStyle: { Short: 1, Paragraph: 2 },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  ComponentType: {
      ActionRow: 1,
      Button: 2,
      StringSelect: 3,
      TextInput: 4,
      UserSelect: 5,
      RoleSelect: 6,
      MentionableSelect: 7,
      ChannelSelect: 8
  },
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
  RESTJSONErrorCodes: {
      MissingPermissions: 50013,
  },
  PermissionFlagsBits: {
      ManageWebhooks: 1n << 29n,
      ManageGuild: 1n << 5n,
      Administrator: 1n << 3n,
  },
  MessageFlags: {
      Ephemeral: 1n << 6n,
  },
  ThreadAutoArchiveDuration: {
      OneHour: 60,
      OneDay: 1440,
      ThreeDays: 4320,
      OneWeek: 10080
  },
  Collection: Map,
};