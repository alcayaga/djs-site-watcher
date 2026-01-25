
const { update } = require('./monitor'); // Import update directly

// Tell Jest to use the manual mock for discord.js
jest.mock('discord.js');

// Mock external modules
jest.mock('fs-extra', () => ({
  readJSONSync: jest.fn(),
  outputJSON: jest.fn(),
}));

jest.mock('got', () => jest.fn());

jest.mock('jsdom', () => ({
  JSDOM: jest.fn(),
}));

jest.mock('cron', () => ({
  CronJob: jest.fn(() => ({
    start: jest.fn(),
    setTime: jest.fn(),
  })),
  CronTime: jest.fn(),
}));

// Mock crypto to return a predictable hash based on content
jest.mock('crypto', () => {
  const mockUpdate = jest.fn(content => {
    return {
      digest: jest.fn(() => {
        if (content === 'initial content') return 'hash-initial';
        if (content === 'updated content') return 'hash-updated';
        return 'mockedHash-default'; // Fallback
      }),
    };
  });

  return {
    createHash: jest.fn(() => ({
      update: mockUpdate,
    })),
  };
});

describe('Monitor Diff Functionality', () => {
  let mockClient;
  let mockChannel;
  let mockSitesToMonitor;
  const mockFile = './src/sites.json'; // Define the mock file path

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    const Discord = require('discord.js'); // This will now load from __mocks__/discord.js.js
    mockClient = new Discord.Client();
    mockChannel = mockClient.channels.cache.get();
    
    // Mock initial sites data
    mockSitesToMonitor = [
      {
        id: 'test-site.com',
        url: 'http://test-site.com',
        css: 'body',
        lastChecked: 0,
        lastUpdated: 0,
        hash: 'hash-initial', // Match the mocked hash for initial content
        lastContent: 'initial content',
      },
    ];

    require('fs-extra').readJSONSync.mockReturnValueOnce(mockSitesToMonitor); // For initial load
    require('fs-extra').readJSONSync.mockReturnValueOnce({ interval: 5, debug: false }); // For settings
    require('fs-extra').readJSONSync.mockReturnValueOnce([]); // For responses

    // Mock JSDOM to return a controllable DOM
    require('jsdom').JSDOM.mockImplementation((html) => ({
      window: {
        document: {
          querySelector: jest.fn(() => ({ textContent: html })),
          title: 'Test Site',
        },
      },
    }));

    // Mock got to return a controllable response body
    require('got').mockResolvedValue({ body: 'initial content' });
  });

  test('should detect a change and send a diff to Discord', async () => {
    // Mock got to return updated content for the `update` call
    require('got').mockResolvedValueOnce({ body: 'updated content' });

    await update(mockClient, mockSitesToMonitor, mockChannel, mockFile);

    // Expect channel.send to have been called with the diff
    expect(mockChannel.send).toHaveBeenCalledWith("Detecté cambios");

    // Expect an embed to have been sent
    // Instead of expect.any(MessageEmbed), we check for a specific structure
    const Discord = require('discord.js');
    const sentEmbed = mockChannel.send.mock.calls[1][0]; // Get the second call to send

    expect(sentEmbed).toBeInstanceOf(Discord.MessageEmbed);
    expect(sentEmbed.setTitle).toHaveBeenCalledWith(expect.stringContaining('🔎 ¡Cambio en Test Site!  🐸'));
    expect(sentEmbed.addField).toHaveBeenCalledWith('URL', 'http://test-site.com');
    expect(sentEmbed.setColor).toHaveBeenCalledWith('0x6058f3');
    expect(sentEmbed.addField).not.toHaveBeenCalledWith('Cambios', expect.anything());

    // The third call should be the diff in a code block
    expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('```diff\n'));
    expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('🔴initial'));
    expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('🟢updated'));
  });

  test('should not send a diff if no change is detected', async () => {
    // Mock got to return initial content for the `update` call
    require('got').mockResolvedValueOnce({ body: 'initial content' });

    await update(mockClient, mockSitesToMonitor, mockChannel, mockFile);

    // Expect channel.send not to have been called with "Detecté cambios" or diff
    expect(mockChannel.send).not.toHaveBeenCalledWith("Detecté cambios");
    expect(mockChannel.send).not.toHaveBeenCalledWith(expect.stringContaining('```diff\n'));
  });

  test('should format multiline diffs correctly', async () => {
    const initialContent = 'line 1\nline 2\nline 3';
    const updatedContent = 'line 1\nline two\nline 3';

    // Override mock for this test
    const crypto = require('crypto');
    const mockUpdate = jest.fn(content => {
      let hash;
      if (content === initialContent) hash = 'hash-initial-multiline';
      else if (content === updatedContent) hash = 'hash-updated-multiline';
      else hash = 'mockedHash-default';
      return { digest: () => hash };
    });
    crypto.createHash.mockReturnValue({ update: mockUpdate });

    mockSitesToMonitor[0].lastContent = initialContent;
    mockSitesToMonitor[0].hash = 'hash-initial-multiline';

    require('got').mockResolvedValueOnce({ body: updatedContent });

    await update(mockClient, mockSitesToMonitor, mockChannel, mockFile);

    const expectedDiff = '```diff\n' +
      '⚪line 1\n' +
      '🔴line 2\n' +
      '🟢line two\n' +
      '⚪line 3\n```';
      
    // call[0] = "Detecté cambios"
    // call[1] = embed
    // call[2] = "Cambios"
    // call[3] = diff
    expect(mockChannel.send.mock.calls[2][0]).toBe(expectedDiff);
  });
});