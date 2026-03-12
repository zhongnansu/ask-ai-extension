// api.js — Content script communication with background service worker
// All API calls go through background.js (MV3 cross-origin restriction)

/**
 * Request a chat completion via background service worker.
 * @param {Array} messages - OpenAI chat format messages
 * @param {Function} onToken - Called with each streamed token
 * @param {Function} onDone - Called when streaming completes
 * @param {Function} onError - Called with (code, message, data?) on error
 * @returns {{ cancel: Function }}
 */
function requestChat(messages, onToken, onDone, onError) {
  const port = chrome.runtime.connect({ name: 'chat-stream' });

  port.postMessage({ type: 'CHAT_REQUEST', messages });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'token':
        onToken(msg.text);
        break;
      case 'done':
        onDone({ remaining: msg.remaining, usingOwnKey: msg.usingOwnKey });
        port.disconnect();
        break;
      case 'error':
        onError(msg.code, msg.message);
        port.disconnect();
        break;
      case 'rate_limited':
        onError('RATE_LIMITED', 'Daily limit reached', { remaining: msg.remaining, resetAt: msg.resetAt });
        port.disconnect();
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
      onError('DISCONNECTED', 'Connection lost');
    }
  });

  return { cancel: () => port.disconnect() };
}

if (typeof module !== 'undefined') module.exports = { requestChat };
