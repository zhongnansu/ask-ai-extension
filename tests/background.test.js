// tests/background.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCreate = vi.fn();
const mockSendMessage = vi.fn();
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const connectListeners = [];
const messageListeners = [];

global.chrome = {
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn((fn) => messageListeners.push(fn)) },
    onConnect: { addListener: vi.fn((fn) => connectListeners.push(fn)) },
    lastError: null,
  },
  contextMenus: {
    create: mockCreate,
    onClicked: { addListener: vi.fn() },
  },
  tabs: {
    sendMessage: mockSendMessage,
  },
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  notifications: {
    create: vi.fn(),
  },
};

global.fetch = vi.fn();
global.AbortController = AbortController;

const mod = await import('../background.js');
const { parseSSEStream, generateSignature } = mod;

const clickHandler = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

describe('context menu registration', () => {
  it('registers onInstalled listener', () => {
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledOnce();
  });

  it('creates context menu with Dobby AI branding on install', () => {
    const installCallback = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
    installCallback();
    expect(mockCreate).toHaveBeenCalledWith({
      id: 'dobby-ai',
      title: 'Dobby AI',
      contexts: ['selection'],
    });
  });
});

describe('context menu click handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  it('sends SHOW_BUBBLE message to content script', () => {
    mockSendMessage.mockResolvedValue(undefined);
    clickHandler({ menuItemId: 'dobby-ai', selectionText: 'hello' }, { id: 1 });
    expect(mockSendMessage).toHaveBeenCalledWith(1, {
      type: 'SHOW_BUBBLE',
      text: 'hello',
    });
  });

  it('ignores non-dobby-ai menu items', () => {
    clickHandler({ menuItemId: 'other', selectionText: 'text' }, { id: 1 });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('ignores empty selectionText', () => {
    clickHandler({ menuItemId: 'dobby-ai', selectionText: '' }, { id: 1 });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('ignores whitespace-only selectionText', () => {
    clickHandler({ menuItemId: 'dobby-ai', selectionText: '   ' }, { id: 1 });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('parseSSEStream', () => {
  function makeReader(chunks) {
    let i = 0;
    const encoder = new TextEncoder();
    return {
      read: () => {
        if (i >= chunks.length) return Promise.resolve({ done: true });
        return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
      },
    };
  }

  it('extracts tokens from SSE data lines', async () => {
    const reader = makeReader([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const tokens = [];
    for await (const token of parseSSEStream(reader)) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('handles chunks split across SSE boundaries', async () => {
    const reader = makeReader([
      'data: {"choices":[{"delta":{"conte',
      'nt":"Hi"}}]}\n\ndata: [DONE]\n\n',
    ]);

    const tokens = [];
    for await (const token of parseSSEStream(reader)) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['Hi']);
  });

  it('skips lines without content delta', async () => {
    const reader = makeReader([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const tokens = [];
    for await (const token of parseSSEStream(reader)) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['ok']);
  });

  it('skips malformed JSON', async () => {
    const reader = makeReader([
      'data: {bad json}\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const tokens = [];
    for await (const token of parseSSEStream(reader)) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['ok']);
  });
});

describe('generateSignature', () => {
  it('returns a 64-char hex string', async () => {
    const sig = await generateSignature([{ role: 'user', content: 'hi' }], 123, 'secret');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await generateSignature([{ role: 'user', content: 'hi' }], 123, 'secret');
    const b = await generateSignature([{ role: 'user', content: 'hi' }], 123, 'secret');
    expect(a).toBe(b);
  });

  it('changes with different timestamps', async () => {
    const a = await generateSignature([{ role: 'user', content: 'hi' }], 100, 'secret');
    const b = await generateSignature([{ role: 'user', content: 'hi' }], 200, 'secret');
    expect(a).not.toBe(b);
  });
});

describe('chat-stream port handler', () => {
  let portMessageHandler;

  function createMockPort() {
    const port = {
      name: 'chat-stream',
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn((fn) => { portMessageHandler = fn; }) },
      onDisconnect: { addListener: vi.fn() },
    };
    return port;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
    portMessageHandler = null;
  });

  it('registers onConnect listener', () => {
    expect(connectListeners.length).toBeGreaterThan(0);
  });

  it('ignores ports with wrong name', () => {
    const connectHandler = connectListeners[0];
    const port = { name: 'other', onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } };
    connectHandler(port);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
  });

  it('listens for messages on chat-stream ports', () => {
    const connectHandler = connectListeners[0];
    const port = createMockPort();
    connectHandler(port);
    expect(port.onMessage.addListener).toHaveBeenCalled();
  });
});

describe('API key validation message handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves valid API key and responds with valid: true', async () => {
    const handler = messageListeners[0];
    const sendResponse = vi.fn();
    fetch.mockResolvedValue({ ok: true });

    const result = handler({ type: 'VALIDATE_API_KEY', apiKey: 'sk-test' }, {}, sendResponse);
    expect(result).toBe(true); // async sendResponse

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ valid: true });
      expect(mockStorageSet).toHaveBeenCalledWith({ userApiKey: 'sk-test' });
    });

    // Should use /v1/models (GET, free) not /v1/chat/completions
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/v1/models');
    expect(fetch.mock.calls[0][1].method).toBeUndefined(); // GET (default)
  });

  it('responds with valid: false for invalid key', async () => {
    const handler = messageListeners[0];
    const sendResponse = vi.fn();
    fetch.mockResolvedValue({ ok: false });

    handler({ type: 'VALIDATE_API_KEY', apiKey: 'bad-key' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ valid: false, error: 'Invalid API key' });
    });
  });

  it('responds with error on network failure', async () => {
    const handler = messageListeners[0];
    const sendResponse = vi.fn();
    fetch.mockRejectedValue(new Error('network'));

    handler({ type: 'VALIDATE_API_KEY', apiKey: 'sk-test' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ valid: false, error: 'Network error' });
    });
  });

  it('ignores non-VALIDATE_API_KEY messages', () => {
    const handler = messageListeners[0];
    const result = handler({ type: 'OTHER' }, {}, vi.fn());
    expect(result).toBeUndefined();
  });
});

describe('chat-stream integration', () => {
  function createStreamPort() {
    let messageHandler;
    const port = {
      name: 'chat-stream',
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn((fn) => { messageHandler = fn; }) },
      onDisconnect: { addListener: vi.fn() },
    };
    return { port, getHandler: () => messageHandler };
  }

  function makeSSEResponse(chunks) {
    const encoder = new TextEncoder();
    let i = 0;
    const body = { getReader: () => ({
      read: () => {
        if (i >= chunks.length) return Promise.resolve({ done: true });
        return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
      }
    })};
    const headers = new Map([['X-RateLimit-Remaining', '25']]);
    return { ok: true, status: 200, body, headers: { get: (k) => headers.get(k) } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGet.mockImplementation((key) => Promise.resolve({}));
  });

  it('streams tokens via proxy when no user API key', async () => {
    const { port, getHandler } = createStreamPort();
    const connectHandler = connectListeners[0];
    connectHandler(port);

    fetch.mockResolvedValue(makeSSEResponse([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: [DONE]\n\n',
    ]));

    const handler = getHandler();
    await handler({ type: 'CHAT_REQUEST', messages: [{ role: 'user', content: 'test' }] });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({ type: 'token', text: 'Hi' });
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'done', remaining: 25, usingOwnKey: false }));
    });

    // Verify it called proxy URL (not OpenAI directly)
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain('workers.dev');
  });

  it('calls OpenAI directly when user has API key', async () => {
    const { port, getHandler } = createStreamPort();
    const connectHandler = connectListeners[0];
    connectHandler(port);

    mockStorageGet.mockImplementation((key) => Promise.resolve({ userApiKey: 'sk-user' }));
    fetch.mockResolvedValue(makeSSEResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: [DONE]\n\n',
    ]));

    const handler = getHandler();
    await handler({ type: 'CHAT_REQUEST', messages: [{ role: 'user', content: 'test' }] });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'done', remaining: null, usingOwnKey: true }));
    });

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain('openai.com');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-user');
  });

  it('forwards 429 rate limit as rate_limited message', async () => {
    const { port, getHandler } = createStreamPort();
    const connectHandler = connectListeners[0];
    connectHandler(port);

    fetch.mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ remaining: 0 }) });

    const handler = getHandler();
    await handler({ type: 'CHAT_REQUEST', messages: [{ role: 'user', content: 'test' }] });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'rate_limited', remaining: 0 }));
    });
  });
});
