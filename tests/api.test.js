// tests/api.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPort = {
  postMessage: vi.fn(),
  onMessage: { addListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  disconnect: vi.fn(),
};

global.chrome = {
  runtime: {
    connect: vi.fn(() => mockPort),
    lastError: null,
  },
};

const { requestChat } = await import('../api.js');

describe('requestChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  it('connects to background with chat-stream port name', () => {
    requestChat([], vi.fn(), vi.fn(), vi.fn());
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'chat-stream' });
  });

  it('sends CHAT_REQUEST with messages', () => {
    const messages = [{ role: 'user', content: 'hi' }];
    requestChat(messages, vi.fn(), vi.fn(), vi.fn());
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: 'CHAT_REQUEST',
      messages,
    });
  });

  it('calls onToken for token messages', () => {
    const onToken = vi.fn();
    requestChat([], onToken, vi.fn(), vi.fn());

    const messageHandler = mockPort.onMessage.addListener.mock.calls[0][0];
    messageHandler({ type: 'token', text: 'Hello' });
    expect(onToken).toHaveBeenCalledWith('Hello');
  });

  it('calls onDone and disconnects for done messages', () => {
    const onDone = vi.fn();
    requestChat([], vi.fn(), onDone, vi.fn());

    const messageHandler = mockPort.onMessage.addListener.mock.calls[0][0];
    messageHandler({ type: 'done' });
    expect(onDone).toHaveBeenCalled();
    expect(mockPort.disconnect).toHaveBeenCalled();
  });

  it('calls onError for error messages', () => {
    const onError = vi.fn();
    requestChat([], vi.fn(), vi.fn(), onError);

    const messageHandler = mockPort.onMessage.addListener.mock.calls[0][0];
    messageHandler({ type: 'error', code: 500, message: 'Server error' });
    expect(onError).toHaveBeenCalledWith(500, 'Server error');
  });

  it('calls onError with rate limit data', () => {
    const onError = vi.fn();
    requestChat([], vi.fn(), vi.fn(), onError);

    const messageHandler = mockPort.onMessage.addListener.mock.calls[0][0];
    messageHandler({ type: 'rate_limited', remaining: 0 });
    expect(onError).toHaveBeenCalledWith('RATE_LIMITED', expect.any(String), expect.objectContaining({ remaining: 0 }));
  });

  it('returns cancel function that disconnects port', () => {
    const handle = requestChat([], vi.fn(), vi.fn(), vi.fn());
    handle.cancel();
    expect(mockPort.disconnect).toHaveBeenCalled();
  });

  // Errata item 7: disconnect test
  it('calls onError on disconnect with lastError', () => {
    const onError = vi.fn();
    requestChat([], vi.fn(), vi.fn(), onError);
    chrome.runtime.lastError = { message: 'disconnected' };
    const disconnectHandler = mockPort.onDisconnect.addListener.mock.calls[0][0];
    disconnectHandler();
    expect(onError).toHaveBeenCalledWith('DISCONNECTED', 'Connection lost');
    chrome.runtime.lastError = null;
  });
});
