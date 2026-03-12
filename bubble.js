// bubble.js — Inline frosted-glass response bubble (Shadow DOM)
//
// Dependencies (shared global scope via manifest.json content_scripts):
// - requestChat(messages, onToken, onDone, onError) from api.js
// - saveConversation(entry) from history.js
// - getHistory(), clearHistory() from history.js
// - buildFollowUp(existingMessages, newQuestion) from prompt.js

let bubbleHost = null;
let currentMessages = [];
let responseText = '';
let currentRequest = null;
let renderTimer = null;

function detectTheme() {
  const bg = getComputedStyle(document.body).backgroundColor;
  if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return 'light';
  const match = bg.match(/\d+/g);
  if (!match) return 'light';
  const [r, g, b] = match.map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? 'dark' : 'light';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
  // Escape HTML first to prevent XSS
  let escaped = escapeHtml(text);
  // Extract code blocks before other transforms (preserve newlines inside)
  const codeBlocks = [];
  escaped = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });
  // Inline transforms
  escaped = escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  // Re-insert code blocks with preserved formatting
  escaped = escaped.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => {
    return '<pre><code>' + codeBlocks[parseInt(i)] + '</code></pre>';
  });
  return escaped;
}

function getStyles(theme) {
  const isDark = theme === 'dark';
  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .bubble {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      width: 380px;
      max-height: 300px;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: ${isDark ? 'rgba(30, 30, 40, 0.85)' : 'rgba(255, 255, 255, 0.85)'};
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'};
      box-shadow: 0 8px 32px ${isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'};
      color: ${isDark ? '#e4e4e7' : '#18181b'};
      font-size: 14px;
      line-height: 1.5;
    }
    @supports not (backdrop-filter: blur(16px)) {
      .bubble { background: ${isDark ? 'rgba(30, 30, 40, 0.98)' : 'rgba(255, 255, 255, 0.98)'}; }
    }
    .bubble-header {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      gap: 8px;
    }
    .bubble-logo {
      font-weight: 700;
      font-size: 14px;
      color: ${isDark ? '#a78bfa' : '#7c3aed'};
    }
    .bubble-status {
      font-size: 12px;
      color: ${isDark ? '#a1a1aa' : '#71717a'};
      flex: 1;
    }
    .close-btn {
      background: none;
      border: none;
      color: ${isDark ? '#a1a1aa' : '#71717a'};
      cursor: pointer;
      font-size: 16px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .close-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}; }
    .bubble-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      max-height: 260px;
    }
    .response-text {
      word-break: break-word;
    }
    .response-text code {
      background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'};
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 13px;
    }
    .response-text pre {
      background: ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)'};
      padding: 10px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .response-text pre code { background: none; padding: 0; }
    .response-text strong { font-weight: 600; }
    .cursor {
      display: inline-block;
      width: 2px;
      height: 14px;
      background: ${isDark ? '#a78bfa' : '#7c3aed'};
      margin-left: 2px;
      vertical-align: text-bottom;
    }
    .cursor.blink { animation: blink 1s step-end infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    .cursor.hidden { display: none; }
    .bubble-footer {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      gap: 6px;
      border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
    }
    .follow-up-input {
      flex: 1;
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'};
      background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'};
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 13px;
      color: inherit;
      outline: none;
      font-family: inherit;
    }
    .follow-up-input:focus {
      border-color: ${isDark ? '#a78bfa' : '#7c3aed'};
    }
    .follow-up-input::placeholder {
      color: ${isDark ? '#71717a' : '#a1a1aa'};
    }
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 6px;
      border-radius: 6px;
      color: ${isDark ? '#a1a1aa' : '#71717a'};
    }
    .action-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}; }
    .error-msg {
      color: #ef4444;
      padding: 8px 0;
    }
    .retry-btn {
      background: ${isDark ? '#a78bfa' : '#7c3aed'};
      color: white;
      border: none;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      margin-left: 8px;
    }
    .rate-limit-msg {
      text-align: center;
      padding: 12px 0;
    }
    .rate-limit-msg .cta {
      display: inline-block;
      margin-top: 8px;
      color: ${isDark ? '#a78bfa' : '#7c3aed'};
      cursor: pointer;
      text-decoration: underline;
    }
    .api-key-form {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .api-key-form input {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'};
      border-radius: 6px;
      font-size: 12px;
      background: transparent;
      color: inherit;
    }
    .api-key-form button {
      background: ${isDark ? '#a78bfa' : '#7c3aed'};
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    .history-panel { padding: 4px 0; }
    .history-entry {
      padding: 8px 0;
      border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
      cursor: pointer;
    }
    .history-entry:hover { background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'}; }
    .history-instruction { font-weight: 500; font-size: 13px; }
    .history-meta { font-size: 11px; color: ${isDark ? '#71717a' : '#a1a1aa'}; margin-top: 2px; }
    .clear-link {
      display: block;
      text-align: center;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      padding: 8px;
    }
  `;
}

function showBubble(selectionRect, messages) {
  hideBubble();

  const theme = detectTheme();
  currentMessages = messages;
  responseText = '';

  bubbleHost = document.createElement('div');
  bubbleHost.id = 'dobby-ai-bubble';
  Object.assign(bubbleHost.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: `${Math.max(8, (selectionRect.left + selectionRect.right) / 2 - 190)}px`,
    top: `${selectionRect.bottom + 8}px`,
  });

  const shadow = bubbleHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getStyles(theme);
  shadow.appendChild(style);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = `
    <div class="bubble-header">
      <span class="bubble-logo">\u2726 Dobby AI</span>
      <span class="bubble-status">thinking...</span>
      <button class="close-btn" title="Close">\u2715</button>
    </div>
    <div class="bubble-body">
      <div class="response-text"></div>
      <span class="cursor blink"></span>
    </div>
    <div class="bubble-footer">
      <input class="follow-up-input" placeholder="Ask a follow-up..." disabled />
      <button class="action-btn copy-btn" title="Copy">\ud83d\udccb</button>
      <button class="action-btn history-btn" title="History">\ud83d\udd50</button>
    </div>
  `;
  shadow.appendChild(bubble);

  // Wire events
  shadow.querySelector('.close-btn').addEventListener('click', hideBubble);

  shadow.querySelector('.copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(responseText).catch(() => {});
  });

  shadow.querySelector('.history-btn').addEventListener('click', () => {
    showHistoryPanel(shadow);
  });

  shadow.querySelector('.follow-up-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const question = e.target.value.trim();
      e.target.value = '';
      handleFollowUp(shadow, question);
    }
  });

  // Escape key to close bubble
  bubbleHost._escHandler = (e) => { if (e.key === 'Escape') hideBubble(); };
  document.addEventListener('keydown', bubbleHost._escHandler);

  document.body.appendChild(bubbleHost);

  // Start streaming
  startStreaming(shadow, messages);
}

function startStreaming(shadow, messages) {
  const responseEl = shadow.querySelector('.response-text');
  const cursorEl = shadow.querySelector('.cursor');
  const statusEl = shadow.querySelector('.bubble-status');
  const followUpInput = shadow.querySelector('.follow-up-input');

  statusEl.textContent = 'thinking...';
  cursorEl.classList.remove('hidden');
  cursorEl.classList.add('blink');
  followUpInput.disabled = true;

  let firstToken = true;

  currentRequest = requestChat(
    messages,
    (token) => {
      if (firstToken) {
        statusEl.textContent = 'typing...';
        firstToken = false;
      }
      responseText += token;
      // Debounce rendering to ~50ms for performance
      if (!renderTimer) {
        renderTimer = setTimeout(() => {
          renderTimer = null;
          responseEl.innerHTML = renderMarkdown(responseText);
          const body = shadow.querySelector('.bubble-body');
          body.scrollTop = body.scrollHeight;
        }, 50);
      }
    },
    () => {
      // Flush any pending render
      if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
      responseEl.innerHTML = renderMarkdown(responseText);
      statusEl.textContent = '';
      cursorEl.classList.add('hidden');
      followUpInput.disabled = false;
      followUpInput.focus();
      currentMessages.push({ role: 'assistant', content: responseText });

      // Save to history
      const firstUser = messages.find((m) => m.role === 'user');
      const instruction = messages.find((m) => m.role === 'system');
      saveConversation({
        text: firstUser?.content || '',
        instruction: instruction?.content || '',
        response: responseText,
        pageUrl: window.location.href,
        pageTitle: document.title,
      });
    },
    (code, message, data) => {
      cursorEl.classList.add('hidden');

      if (code === 'RATE_LIMITED') {
        showRateLimitUI(shadow);
      } else {
        statusEl.textContent = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-msg';
        errorDiv.textContent = message || 'Something went wrong.';
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => {
          errorDiv.remove();
          responseText = '';
          responseEl.innerHTML = '';
          startStreaming(shadow, messages);
        });
        errorDiv.appendChild(retryBtn);
        responseEl.appendChild(errorDiv);
      }
    }
  );
}

function handleFollowUp(shadow, question) {
  const responseEl = shadow.querySelector('.response-text');
  // Show separator
  responseEl.innerHTML += '<br><br><strong>You:</strong> ' + escapeHtml(question) + '<br><br>';
  responseText = '';

  currentMessages = buildFollowUp(currentMessages, question);
  startStreaming(shadow, currentMessages);
}

function showRateLimitUI(shadow) {
  const body = shadow.querySelector('.bubble-body');
  body.innerHTML = `
    <div class="rate-limit-msg">
      <p>You've used your 30 free questions today.</p>
      <span class="cta">Add your own API key for unlimited access \u2192</span>
      <div class="api-key-form" style="display:none">
        <input type="password" placeholder="sk-..." />
        <button>Save</button>
      </div>
      <p class="api-key-status" style="margin-top:8px;font-size:12px"></p>
    </div>
  `;

  const cta = body.querySelector('.cta');
  const form = body.querySelector('.api-key-form');
  cta.addEventListener('click', () => {
    form.style.display = 'flex';
    cta.style.display = 'none';
  });

  form.querySelector('button').addEventListener('click', () => {
    const key = form.querySelector('input').value.trim();
    if (!key) return;
    const status = body.querySelector('.api-key-status');
    status.textContent = 'Validating...';
    chrome.runtime.sendMessage({ type: 'VALIDATE_API_KEY', apiKey: key }, (res) => {
      if (res && res.valid) {
        status.textContent = 'Key saved! You now have unlimited access.';
        status.style.color = '#22c55e';
      } else {
        status.textContent = res?.error || 'Invalid API key \u2014 please check and try again';
        status.style.color = '#ef4444';
      }
    });
  });
}

async function showHistoryPanel(shadow) {
  const body = shadow.querySelector('.bubble-body');
  const entries = await getHistory();

  if (entries.length === 0) {
    body.innerHTML = '<div class="history-panel"><p style="text-align:center;color:#71717a">No history yet</p></div>';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'history-panel';

  entries.forEach((entry) => {
    const el = document.createElement('div');
    el.className = 'history-entry';
    const timeAgo = getTimeAgo(entry.timestamp);
    const instrDiv = document.createElement('div');
    instrDiv.className = 'history-instruction';
    instrDiv.textContent = entry.instruction || entry.text.substring(0, 60);
    const metaDiv = document.createElement('div');
    metaDiv.className = 'history-meta';
    metaDiv.textContent = `${entry.pageTitle || 'Unknown page'} \u00b7 ${timeAgo}`;
    el.appendChild(instrDiv);
    el.appendChild(metaDiv);
    el.addEventListener('click', () => {
      body.innerHTML = '';
      const responseEl = document.createElement('div');
      responseEl.className = 'response-text';
      responseEl.innerHTML = renderMarkdown(entry.response);
      body.appendChild(responseEl);
    });
    panel.appendChild(el);
  });

  const clearLink = document.createElement('span');
  clearLink.className = 'clear-link';
  clearLink.textContent = 'Clear all history';
  clearLink.addEventListener('click', async () => {
    await clearHistory();
    body.innerHTML = '<div class="history-panel"><p style="text-align:center;color:#71717a">History cleared</p></div>';
  });
  panel.appendChild(clearLink);

  body.innerHTML = '';
  body.appendChild(panel);
}

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function appendToken(text) {
  if (!bubbleHost) return;
  const shadow = bubbleHost.shadowRoot;
  const responseEl = shadow.querySelector('.response-text');
  responseText += text;
  responseEl.innerHTML = renderMarkdown(responseText);
}

function setBubbleStatus(status) {
  if (!bubbleHost) return;
  const el = bubbleHost.shadowRoot.querySelector('.bubble-status');
  if (el) el.textContent = status;
}

function hideBubble() {
  if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
  if (currentRequest) {
    currentRequest.cancel();
    currentRequest = null;
  }
  if (bubbleHost) {
    if (bubbleHost._escHandler) document.removeEventListener('keydown', bubbleHost._escHandler);
    if (bubbleHost.parentNode) bubbleHost.parentNode.removeChild(bubbleHost);
  }
  bubbleHost = null;
  currentMessages = [];
  responseText = '';
}

function _getBubbleContainer() {
  return bubbleHost;
}

if (typeof module !== 'undefined') {
  module.exports = {
    showBubble, hideBubble, appendToken, setBubbleStatus,
    renderMarkdown, detectTheme, _getBubbleContainer,
  };
}
