// Popup UI rendered via Shadow DOM
// Implemented in Phase 2 (integration)
//
// Dependencies (loaded via manifest.json content_scripts, shared global scope):
// - detectContentType(text, anchorNode) from detection.js
// - PRESETS, COMMON_PRESETS, getAllPresetsForType(contentType) from presets.js
// - buildPrompt(selectedText, instruction, includePageContext) from prompt.js
// - getAIUrl(ai, prompt) from prompt.js
// - hideTrigger() from trigger.js

/**
 * Shows the Ask AI popup near the text selection.
 * Uses detectContentType(), PRESETS, buildPrompt(), getAIUrl() from other modules.
 *
 * Exported functions (global scope):
 * - showPopup(selectedText, anchorNode) -- render and display the popup
 * - hidePopup() -- remove the popup
 */

// Global reference so trigger.js can check popupContainer.contains(e.target)
let popupContainer = null;

/**
 * Escape special characters for use in HTML data attributes.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Show a brief toast notification inside the popup shadow DOM.
 * @param {ShadowRoot} shadow
 * @param {string} message
 */
function showToast(shadow, message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  const popup = shadow.querySelector('.popup');
  if (popup) popup.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Returns all CSS for the popup (injected into the Shadow DOM <style> tag).
 * @returns {string}
 */
function getPopupCSS() {
  return `
    .popup {
      position: fixed;
      background: #1e1e2e;
      border-radius: 14px;
      padding: 16px;
      width: 340px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e0e0e0;
      box-sizing: border-box;
    }
    .popup * { box-sizing: border-box; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }
    .close-btn {
      background: none;
      border: none;
      color: #888;
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }
    .close-btn:hover { color: #fff; }

    .ai-selector {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }
    .ai-btn {
      flex: 1;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #555;
      background: #2a2a3e;
      color: #aaa;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ai-btn.chatgpt.active {
      background: #10a37f;
      color: white;
      border-color: #10a37f;
    }
    .ai-btn.claude.active {
      background: #d97706;
      color: white;
      border-color: #d97706;
    }
    .ai-btn:hover:not(.active) {
      border-color: #888;
      color: #ccc;
    }

    .preset-section { margin-bottom: 10px; }
    .preset-label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      background: #2a2a3e;
      color: #ccc;
      padding: 5px 11px;
      border-radius: 14px;
      font-size: 12px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chip:hover {
      background: #3a3a5e;
      color: #fff;
    }
    .chip.selected {
      background: #4f46e5;
      color: white;
      border-color: #4f46e5;
    }
    .suggested-chip {
      background: rgba(79,70,229,0.15);
      color: #a5b4fc;
      border: 1px solid rgba(79,70,229,0.3);
    }
    .suggested-chip:hover {
      background: rgba(79,70,229,0.25);
    }

    .custom-input-wrap { margin-bottom: 12px; }
    .custom-input {
      width: 100%;
      background: #2a2a3e;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 9px 12px;
      color: #e0e0e0;
      font-size: 12px;
      outline: none;
      font-family: inherit;
    }
    .custom-input:focus {
      border-color: #4f46e5;
    }
    .custom-input::placeholder { color: #666; }

    .context-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding: 0 2px;
    }
    .context-label { font-size: 12px; color: #999; }
    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #555;
      border-radius: 10px;
      transition: 0.2s;
    }
    .slider::before {
      content: "";
      position: absolute;
      width: 16px;
      height: 16px;
      left: 2px;
      bottom: 2px;
      background: white;
      border-radius: 50%;
      transition: 0.2s;
    }
    .switch input:checked + .slider { background: #4f46e5; }
    .switch input:checked + .slider::before { transform: translateX(16px); }

    .send-btn {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .send-btn:hover { opacity: 0.9; }
    .send-btn.chatgpt { background: #10a37f; }
    .send-btn.claude { background: #d97706; }

    .toast {
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      white-space: nowrap;
      animation: fadeIn 0.2s;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateX(-50%) translateY(4px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
}

/**
 * Wire up all interactive event handlers inside the popup shadow root.
 * @param {ShadowRoot} shadow
 * @param {string} selectedText
 */
function wirePopupEvents(shadow, selectedText) {
  let currentAI = shadow.querySelector('.ai-btn.active')?.dataset.ai || 'chatgpt';
  let selectedInstruction = '';

  // AI selector toggle
  shadow.querySelectorAll('.ai-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      shadow.querySelectorAll('.ai-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAI = btn.dataset.ai;
      chrome.storage.local.set({ lastAI: currentAI });
      const sendBtn = shadow.querySelector('.send-btn');
      sendBtn.textContent = `Send to ${currentAI === 'chatgpt' ? 'ChatGPT' : 'Claude'} \u2192`;
      sendBtn.className = `send-btn ${currentAI}`;
    });
  });

  // Preset chips
  shadow.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      shadow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedInstruction = chip.dataset.instruction;
      shadow.querySelector('.custom-input').value = '';
    });
  });

  // Custom input clears preset selection
  const customInput = shadow.querySelector('.custom-input');
  customInput.addEventListener('input', () => {
    if (customInput.value.trim()) {
      shadow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      selectedInstruction = '';
    }
  });

  // Context toggle — save preference
  const contextCheckbox = shadow.querySelector('.context-checkbox');
  contextCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ pageContext: contextCheckbox.checked });
  });

  // Close button
  shadow.querySelector('.close-btn').addEventListener('click', hidePopup);

  // Send button
  shadow.querySelector('.send-btn').addEventListener('click', () => {
    const instruction = customInput.value.trim() || selectedInstruction;
    const includeContext = contextCheckbox.checked;
    const prompt = buildPrompt(selectedText, instruction, includeContext);
    const result = getAIUrl(currentAI, prompt);

    if (result.fallback) {
      navigator.clipboard.writeText(result.prompt).then(() => {
        showToast(shadow, 'Prompt copied to clipboard \u2014 paste it in the chat');
        chrome.runtime.sendMessage({ type: 'COPY_AND_OPEN', url: result.url });
        setTimeout(hidePopup, 1500);
      });
    } else {
      chrome.runtime.sendMessage({ type: 'OPEN_AI_TAB', url: result.url });
      hidePopup();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      hidePopup();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

/**
 * Show the Ask AI popup near the current text selection.
 * @param {string} selectedText - The selected text
 * @param {Node|null} anchorNode - The DOM node where selection starts
 */
function showPopup(selectedText, anchorNode) {
  hidePopup();
  hideTrigger();

  const contentType = detectContentType(selectedText, anchorNode);
  const presetConfig = PRESETS[contentType];

  // Create container + shadow root
  popupContainer = document.createElement('div');
  popupContainer.id = 'ask-ai-popup-host';
  Object.assign(popupContainer.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: '0', left: '0', width: '0', height: '0',
  });

  const shadow = popupContainer.attachShadow({ mode: 'closed' });

  // Position near selection
  const selection = window.getSelection();
  let popupTop = 100, popupLeft = 100;
  if (selection && selection.rangeCount > 0) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    popupLeft = Math.min(rect.left, window.innerWidth - 360);
    popupTop = rect.bottom + 8;
    if (popupTop + 400 > window.innerHeight) {
      popupTop = Math.max(8, rect.top - 408);
    }
  }

  // Build preset chip HTML
  const allPresets = getAllPresetsForType(contentType);

  // Load saved preferences then render
  chrome.storage.local.get(['lastAI', 'pageContext'], (stored) => {
    const currentAI = stored.lastAI || 'chatgpt';
    const pageContextOn = stored.pageContext !== undefined ? stored.pageContext : true;

    shadow.innerHTML = `
      <style>${getPopupCSS()}</style>
      <div class="popup" style="left:${popupLeft}px;top:${popupTop}px;">
        <div class="header">
          <span class="title">Ask AI</span>
          <button class="close-btn">&times;</button>
        </div>

        <div class="ai-selector">
          <button class="ai-btn chatgpt ${currentAI === 'chatgpt' ? 'active' : ''}" data-ai="chatgpt">ChatGPT</button>
          <button class="ai-btn claude ${currentAI === 'claude' ? 'active' : ''}" data-ai="claude">Claude</button>
        </div>

        <div class="preset-section">
          <div class="preset-label">Suggested</div>
          <div class="preset-chips suggested">
            ${presetConfig.suggested.map(p => `<button class="chip suggested-chip" data-instruction="${escapeAttr(p.instruction)}">${escapeAttr(p.label)}</button>`).join('')}
          </div>
        </div>

        ${allPresets.length > 0 ? `
        <div class="preset-section">
          <div class="preset-label">All presets</div>
          <div class="preset-chips">
            ${allPresets.map(p => `<button class="chip" data-instruction="${escapeAttr(p.instruction)}">${escapeAttr(p.label)}</button>`).join('')}
          </div>
        </div>
        ` : ''}

        <div class="custom-input-wrap">
          <input type="text" class="custom-input" placeholder="Or type a custom instruction..." />
        </div>

        <div class="context-toggle">
          <span class="context-label">Include page context</span>
          <label class="switch">
            <input type="checkbox" class="context-checkbox" ${pageContextOn ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>

        <button class="send-btn ${currentAI}">Send to ${currentAI === 'chatgpt' ? 'ChatGPT' : 'Claude'} \u2192</button>
      </div>
    `;

    wirePopupEvents(shadow, selectedText);
  });

  document.body.appendChild(popupContainer);
}

/**
 * Remove the popup from the DOM.
 */
function hidePopup() {
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
  }
}

// Export for testing (no-op in browser)
if (typeof module !== 'undefined') module.exports = { showPopup, hidePopup, escapeAttr, showToast, getPopupCSS };
