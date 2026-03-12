// background.js — Dobby AI API relay + streaming hub
// All API calls from content scripts route through here (MV3 cross-origin constraint)

const PROXY_URL = 'https://dobby-ai-proxy.zhongnansu.workers.dev/chat';
// HMAC_SECRET is intentionally in extension source — it's light obfuscation per spec.
// Real defense is IP rate limiting on the proxy.
const HMAC_SECRET = 'dobby-ai-v2-hmac-key-change-in-production';
// Set to your dev token to bypass rate limits during development; leave empty for normal user behavior
const DEV_BYPASS_TOKEN = '';

// --- Context Menu ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'dobby-ai',
    title: 'Dobby AI',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'dobby-ai') return;
  const text = (info.selectionText || '').trim();
  if (!text) return;

  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_BUBBLE', text }).catch(() => {
    // Content script unavailable — copy to clipboard via offscreen or notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Dobby AI',
      message: 'Cannot run on this page. Try a regular webpage.',
    });
  });
});

// --- HMAC Signing ---

async function generateSignature(messages, timestamp, secret) {
  const payload = `${timestamp}${JSON.stringify(messages)}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- SSE Stream Parsing ---

async function* parseSSEStream(reader) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
}

// --- Chat Stream Port Handler ---

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat-stream') return;

  let abortController = null;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'CHAT_REQUEST') return;

    abortController = new AbortController();
    const { messages } = msg;

    // 30-second timeout per spec
    const timeout = setTimeout(() => abortController.abort(), 30000);

    try {
      const stored = await chrome.storage.local.get('userApiKey');
      let response;

      if (stored.userApiKey) {
        // Direct to OpenAI with user's own key
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${stored.userApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            stream: true,
            max_tokens: 1000,
          }),
          signal: abortController.signal,
        });
      } else {
        // Via proxy with HMAC signing
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = await generateSignature(messages, timestamp, HMAC_SECRET);
        const headers = { 'Content-Type': 'application/json' };
        if (DEV_BYPASS_TOKEN) headers['X-Dev-Token'] = DEV_BYPASS_TOKEN;
        response = await fetch(PROXY_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messages, signature, timestamp }),
          signal: abortController.signal,
        });
      }

      if (response.status === 429) {
        let data;
        try { data = await response.json(); } catch { data = { remaining: 0 }; }
        try { port.postMessage({ type: 'rate_limited', remaining: data.remaining ?? 0, resetAt: data.resetAt }); } catch {}
        return;
      }

      if (!response.ok) {
        try { port.postMessage({ type: 'error', code: response.status, message: 'Request failed' }); } catch {}
        return;
      }

      const usingOwnKey = !!stored.userApiKey;
      const remaining = usingOwnKey ? null : parseInt(response.headers.get('X-RateLimit-Remaining')) || 0;

      const reader = response.body.getReader();
      for await (const token of parseSSEStream(reader)) {
        try { port.postMessage({ type: 'token', text: token }); } catch { break; }
      }
      try { port.postMessage({ type: 'done', remaining, usingOwnKey }); } catch {}
    } catch (err) {
      if (err.name === 'AbortError') {
        try { port.postMessage({ type: 'error', code: 0, message: 'Request timed out' }); } catch {}
      } else {
        try { port.postMessage({ type: 'error', code: 0, message: err.message }); } catch {}
      }
    } finally {
      clearTimeout(timeout);
    }
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
  });
});

// --- API Key Validation ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg.type === 'VALIDATE_API_KEY') {
    fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${msg.apiKey}`,
      },
    })
      .then((res) => {
        if (res.ok) {
          chrome.storage.local.set({ userApiKey: msg.apiKey });
          sendResponse({ valid: true });
        } else {
          sendResponse({ valid: false, error: 'Invalid API key' });
        }
      })
      .catch(() => {
        sendResponse({ valid: false, error: 'Network error' });
      });
    return true; // async sendResponse
  }
});

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = { parseSSEStream, generateSignature };
}
