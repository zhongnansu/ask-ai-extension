// tests/history.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockStorage = {};

global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => {
        const result = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
          if (mockStorage[k] !== undefined) result[k] = mockStorage[k];
        });
        cb(result);
      }),
      set: vi.fn((data, cb) => {
        Object.assign(mockStorage, data);
        if (cb) cb();
      }),
    },
  },
};

const { saveConversation, getHistory, clearHistory, MAX_HISTORY } = await import('../history.js');

describe('history.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
  });

  it('MAX_HISTORY is 100', () => {
    expect(MAX_HISTORY).toBe(100);
  });

  it('saves a conversation entry', async () => {
    await saveConversation({
      text: 'hello',
      instruction: 'Explain',
      response: 'This means...',
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
    });

    expect(chrome.storage.local.set).toHaveBeenCalled();
    const saved = chrome.storage.local.set.mock.calls[0][0];
    expect(saved.chatHistory).toHaveLength(1);
    expect(saved.chatHistory[0].text).toBe('hello');
    expect(saved.chatHistory[0].id).toBeDefined();
    expect(saved.chatHistory[0].timestamp).toBeDefined();
  });

  it('truncates response to 2000 chars', async () => {
    await saveConversation({
      text: 'hi',
      instruction: '',
      response: 'a'.repeat(3000),
      pageUrl: '',
      pageTitle: '',
    });

    const saved = chrome.storage.local.set.mock.calls[0][0];
    expect(saved.chatHistory[0].response.length).toBe(2000);
  });

  it('prepends new entries (most recent first)', async () => {
    mockStorage.chatHistory = [{ id: 'old', timestamp: 1000 }];
    await saveConversation({ text: 'new', instruction: '', response: 'resp', pageUrl: '', pageTitle: '' });

    const saved = chrome.storage.local.set.mock.calls[0][0];
    expect(saved.chatHistory[0].text).toBe('new');
    expect(saved.chatHistory[1].id).toBe('old');
  });

  it('evicts oldest entry when exceeding MAX_HISTORY', async () => {
    mockStorage.chatHistory = Array(100).fill(null).map((_, i) => ({
      id: `entry-${i}`,
      timestamp: i,
    }));

    await saveConversation({ text: 'overflow', instruction: '', response: '', pageUrl: '', pageTitle: '' });

    const saved = chrome.storage.local.set.mock.calls[0][0];
    expect(saved.chatHistory).toHaveLength(100);
    expect(saved.chatHistory[0].text).toBe('overflow');
  });

  it('getHistory returns saved entries', async () => {
    mockStorage.chatHistory = [
      { id: '1', text: 'a', timestamp: 2000 },
      { id: '2', text: 'b', timestamp: 1000 },
    ];

    const result = await getHistory();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
  });

  it('getHistory returns empty array when no history', async () => {
    const result = await getHistory();
    expect(result).toEqual([]);
  });

  it('clearHistory removes all entries', async () => {
    mockStorage.chatHistory = [{ id: '1' }];
    await clearHistory();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { chatHistory: [] },
      expect.any(Function)
    );
  });
});
