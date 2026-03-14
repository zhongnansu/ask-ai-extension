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
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isValidImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderMarkdown(text) {
  // Extract code blocks first so their contents are not processed
  const codeBlocks = [];
  let processed = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  // Extract images before escaping (they need real <img> tags)
  const images = [];
  processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    if (isValidImageUrl(url)) {
      images.push({ alt: escapeHtml(alt), url: escapeHtml(url) });
      return `%%IMAGE_${images.length - 1}%%`;
    }
    return `![${alt}](${url})`;
  });

  // Escape HTML to prevent XSS
  let escaped = escapeHtml(processed);
  // Inline transforms
  escaped = escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  // Re-insert code blocks with preserved formatting
  escaped = escaped.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => {
    const block = codeBlocks[parseInt(i)];
    return block != null ? '<pre><code>' + escapeHtml(block) + '</code></pre>' : '';
  });
  // Re-insert images
  escaped = escaped.replace(/%%IMAGE_(\d+)%%/g, (_, i) => {
    const img = images[parseInt(i)];
    if (!img) return '';
    return `<img class="response-img" src="${img.url}" alt="${img.alt}" loading="lazy" onerror="this.style.display='none'">`;
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
      max-height: 420px;
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
    .selected-text-preview {
      padding: 8px 14px;
      border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      font-size: 12px;
      color: ${isDark ? '#a1a1aa' : '#71717a'};
      max-height: 80px;
      overflow-y: auto;
      line-height: 1.4;
    }
    .selected-text-preview .label {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: ${isDark ? '#a78bfa' : '#7c3aed'};
      margin-bottom: 2px;
    }
    .selected-text-preview .text {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
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
    .response-text .response-img {
      max-width: 100%;
      border-radius: 8px;
      margin: 8px 0;
      cursor: pointer;
      display: block;
      transition: opacity 0.15s;
    }
    .response-text .response-img:hover { opacity: 0.85; }
    .img-lightbox {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .img-lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      border-radius: 8px;
      object-fit: contain;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
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
    .presets-section {
      padding: 8px 10px;
      border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
    }
    .presets-section.collapsed { display: none; }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 6px;
    }
    .preset-chip {
      padding: 4px 10px;
      cursor: pointer;
      border-radius: 10px;
      font-size: 12px;
      color: ${isDark ? '#e4e4e7' : '#18181b'};
      background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'};
      white-space: nowrap;
      transition: background 0.15s;
    }
    .preset-chip:hover { background: ${isDark ? 'rgba(167,139,250,0.2)' : 'rgba(124,58,237,0.1)'}; }
    .preset-input {
      width: 100%;
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'};
      background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'};
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
      color: ${isDark ? '#e4e4e7' : '#18181b'};
      font-family: inherit;
    }
    .preset-input:focus { border-color: ${isDark ? '#a78bfa' : '#7c3aed'}; }
    .preset-input::placeholder { color: ${isDark ? '#71717a' : '#a1a1aa'}; }
    .detection-badge {
      font-size: 10px;
      color: ${isDark ? '#a78bfa' : '#7c3aed'};
      font-weight: 500;
      padding: 0 0 4px;
    }
    .response-section { display: none; }
    .response-section.active { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
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

function createBubbleHost(selectionRect) {
  bubbleHost = document.createElement('div');
  bubbleHost.id = 'dobby-ai-bubble';
  const bubbleHeight = 420;
  const gap = 8;
  const preferredTop = selectionRect.bottom + gap;
  const wouldOverflow = preferredTop + bubbleHeight > window.innerHeight;
  const top = wouldOverflow
    ? Math.max(gap, (selectionRect.top || selectionRect.bottom) - bubbleHeight - gap)
    : preferredTop;
  Object.assign(bubbleHost.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: `${Math.max(8, (selectionRect.left + selectionRect.right) / 2 - 190)}px`,
    top: `${top}px`,
  });
  bubbleHost._escHandler = (e) => { if (e.key === 'Escape') hideBubble(); };
  document.addEventListener('keydown', bubbleHost._escHandler);
  return bubbleHost;
}

function buildBubbleHTML(previewText, previewLabel, showPresets) {
  return `
    <div class="bubble-header">
      <span class="bubble-logo">\u2726 Dobby AI</span>
      <span class="bubble-status"></span>
      <button class="close-btn" title="Close">\u2715</button>
    </div>
    ${previewText ? `<div class="selected-text-preview">
      <div class="label">${escapeHtml(previewLabel)}</div>
      <div class="text">${escapeHtml(previewText)}</div>
    </div>` : ''}
    ${showPresets ? '<div class="presets-section"></div>' : ''}
    <div class="response-section">
      <div class="bubble-body">
        <div class="response-text"></div>
        <span class="cursor blink"></span>
      </div>
      <div class="bubble-footer">
        <input class="follow-up-input" placeholder="Ask a follow-up..." disabled />
        <button class="action-btn copy-btn" title="Copy">\ud83d\udccb</button>
        <button class="action-btn history-btn" title="History">\ud83d\udd50</button>
      </div>
    </div>
  `;
}

function wireCommonEvents(shadow) {
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
  // Image lightbox via event delegation
  shadow.querySelector('.bubble-body').addEventListener('click', (e) => {
    if (e.target.classList.contains('response-img')) {
      const overlay = document.createElement('div');
      overlay.className = 'img-lightbox';
      overlay.tabIndex = 0;
      const img = document.createElement('img');
      img.src = e.target.src;
      img.alt = e.target.alt;
      overlay.appendChild(img);
      const dismiss = () => overlay.remove();
      overlay.addEventListener('click', dismiss);
      overlay.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.stopPropagation(); dismiss(); }
      });
      shadow.appendChild(overlay);
      overlay.focus();
    }
  });
}

function activateResponseSection(shadow, messages) {
  const presetsSection = shadow.querySelector('.presets-section');
  if (presetsSection) presetsSection.classList.add('collapsed');
  const responseSection = shadow.querySelector('.response-section');
  responseSection.classList.add('active');
  shadow.querySelector('.bubble-status').textContent = 'thinking...';
  startStreaming(shadow, messages);
}

function truncatePreview(text, maxLen = 120) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

function initBubble(selectionRect, selectedText, previewLabel, showPresets) {
  hideBubble();
  responseText = '';

  createBubbleHost(selectionRect);
  const shadow = bubbleHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getStyles(detectTheme());
  shadow.appendChild(style);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = buildBubbleHTML(truncatePreview(selectedText), previewLabel, showPresets);
  shadow.appendChild(bubble);

  wireCommonEvents(shadow);
  document.body.appendChild(bubbleHost);
  return shadow;
}

// Show bubble with preset selection first, then expand to show response
function showBubbleWithPresets(selectionRect, selectedText, anchorNode) {
  const shadow = initBubble(selectionRect, selectedText, 'Selected text', true);

  // Detect content type and populate presets
  const detected = typeof detectContentType === 'function'
    ? detectContentType(selectedText, anchorNode)
    : (typeof detectContent === 'function'
      ? detectContent(selectedText)
      : { type: 'default', subType: null, confidence: 'medium' });

  const presets = typeof getSuggestedPresetsForType === 'function'
    ? getSuggestedPresetsForType(detected.type, detected.subType)
    : [];

  const presetsSection = shadow.querySelector('.presets-section');

  // Detection badge
  if (detected.type !== 'default') {
    const badge = document.createElement('div');
    badge.className = 'detection-badge';
    badge.textContent = `${detected.subType || detected.type} detected`;
    presetsSection.appendChild(badge);
  }

  // Preset chips
  const chipsRow = document.createElement('div');
  chipsRow.className = 'preset-chips';
  presets.slice(0, 4).forEach((preset) => {
    const chip = document.createElement('div');
    chip.className = 'preset-chip';
    chip.textContent = preset.label;
    chip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      launchFromPreset(shadow, selectedText, preset.instruction);
    });
    chipsRow.appendChild(chip);
  });
  presetsSection.appendChild(chipsRow);

  // Custom input
  const customInput = document.createElement('input');
  customInput.className = 'preset-input';
  customInput.placeholder = 'Or type a custom prompt...';
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && customInput.value.trim()) {
      launchFromPreset(shadow, selectedText, customInput.value.trim());
    }
    if (e.key === 'Escape') hideBubble();
  });
  presetsSection.appendChild(customInput);
}

function launchFromPreset(shadow, selectedText, instruction) {
  const messages = typeof buildChatMessages === 'function'
    ? buildChatMessages(selectedText, instruction, true)
    : [{ role: 'user', content: `${instruction}:\n\n${selectedText}` }];
  currentMessages = messages;

  // Update preview label to show chosen instruction
  const label = shadow.querySelector('.selected-text-preview .label');
  if (label) label.textContent = instruction;

  activateResponseSection(shadow, messages);
}

// Direct bubble (used by context menu — no preset selection needed)
function showBubble(selectionRect, messages, selectedText, instruction) {
  currentMessages = messages;
  const shadow = initBubble(selectionRect, selectedText, instruction || 'Selected text', false);
  activateResponseSection(shadow, messages);
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
    (usageInfo) => {
      // Flush any pending render
      if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
      responseEl.innerHTML = renderMarkdown(responseText);
      if (usageInfo && usageInfo.usingOwnKey) {
        statusEl.textContent = 'your API key';
      } else if (usageInfo && usageInfo.remaining != null) {
        statusEl.textContent = `${usageInfo.remaining}/30 free`;
      } else {
        statusEl.textContent = '';
      }
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
      <p style="margin-top:8px">Add your own API key in Settings for unlimited access.</p>
      <span class="cta">Open Settings \u2192</span>
    </div>
  `;

  shadow.querySelector('.cta').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
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
    showBubble, showBubbleWithPresets, hideBubble, appendToken, setBubbleStatus,
    renderMarkdown, detectTheme, _getBubbleContainer,
  };
}
