// Popup UI rendered via Shadow DOM
// v1.1: Frosted glass redesign with detection UX
//
// Dependencies (loaded via manifest.json content_scripts, shared global scope):
// - detectContentType(text, anchorNode) from detection.js
// - PRESETS, getAllPresetsForType(contentType, subType),
//   getSuggestedPresetsForType(contentType, subType) from presets.js
// - buildPrompt(selectedText, instruction, includePageContext) from prompt.js
// - getAIUrl(ai, prompt) from prompt.js
// - hideTrigger() from trigger.js

// Global reference so trigger.js can check popupContainer.contains(e.target)
let popupContainer = null;

// ─── Badge configuration for each content type ──────────────────────────────

const BADGE_CONFIG = {
  code:    { icon: '\u27E8/\u27E9', color: '#3B82F6', label: 'Code' },
  foreign: { icon: '\uD83C\uDF10', color: '#8B5CF6', label: 'Foreign language' },
  error:   { icon: '\u26A0',       color: '#EF4444', label: 'Stack trace' },
  email:   { icon: '\u2709',       color: '#F59E0B', label: 'Email' },
  data:    { icon: '\u2630',       color: '#14B8A6', label: 'Structured data' },
  math:    { icon: '\u2211',       color: '#6366F1', label: 'Formula' },
  long:    { icon: '\uD83D\uDCC4', color: '#6B7280', label: 'Long text' },
  default: { icon: '\u2726',       color: '#6B7280', label: 'Text selected' },
};

function getBadgeConfig(type, subType) {
  const base = BADGE_CONFIG[type] || BADGE_CONFIG.default;
  if (subType) {
    const capitalized = subType.charAt(0).toUpperCase() + subType.slice(1);
    return { ...base, label: capitalized + (type === 'code' ? '' : '') + ' detected' };
  }
  return { ...base, label: base.label + ' detected' };
}

function getTypeLabel(type, subType) {
  if (subType) return subType.charAt(0).toUpperCase() + subType.slice(1);
  const labels = {
    code: 'Code', foreign: 'Foreign text', error: 'Error',
    email: 'Email', data: 'Data', math: 'Math', long: 'Long text', default: 'Text',
  };
  return labels[type] || 'Text';
}

// ─── Utility functions ──────────────────────────────────────────────────────

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(shadow, message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  const popup = shadow.querySelector('.popup');
  if (popup) popup.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function detectPageTheme() {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.matches) return 'dark';
    // Sample page background luminance as fallback
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/\d+/g);
    if (match && match.length >= 3) {
      const [r, g, b] = match.map(Number);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5 ? 'dark' : 'light';
    }
  } catch (_) { /* ignore */ }
  return 'dark';
}

// ─── CSS ────────────────────────────────────────────────────────────────────

function getPopupCSS() {
  return `
    /* ── Theme custom properties ── */
    .popup {
      --bg: rgba(15, 15, 25, 0.72);
      --bg-solid: #1e1e2e;
      --text: #e0e0e0;
      --text-primary: #fff;
      --text-secondary: #888;
      --text-muted: #666;
      --surface: rgba(255,255,255,0.06);
      --surface-hover: rgba(255,255,255,0.1);
      --border: rgba(255,255,255,0.12);
      --border-subtle: rgba(255,255,255,0.06);
      --input-bg: rgba(255,255,255,0.06);
      --input-border: rgba(255,255,255,0.12);
      --chip-bg: rgba(255,255,255,0.06);
      --chip-hover: rgba(255,255,255,0.1);
      --chip-text: #ccc;
      --preview-bg: rgba(255,255,255,0.04);
    }
    .popup.light-theme {
      --bg: rgba(255, 255, 255, 0.68);
      --bg-solid: #ffffff;
      --text: #1a1a2e;
      --text-primary: #111827;
      --text-secondary: #6B7280;
      --text-muted: #9CA3AF;
      --surface: rgba(0,0,0,0.04);
      --surface-hover: rgba(0,0,0,0.08);
      --border: rgba(0,0,0,0.08);
      --border-subtle: rgba(0,0,0,0.04);
      --input-bg: rgba(0,0,0,0.04);
      --input-border: rgba(0,0,0,0.12);
      --chip-bg: rgba(0,0,0,0.04);
      --chip-hover: rgba(0,0,0,0.08);
      --chip-text: #374151;
      --preview-bg: rgba(0,0,0,0.03);
    }

    /* ── Frosted glass popup ── */
    .popup {
      position: fixed;
      background: var(--bg);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      width: 360px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.35), inset 0 0 0 1px var(--border-subtle);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--text);
      box-sizing: border-box;
      animation: popupScaleIn 0.15s ease-out;
    }
    .popup * { box-sizing: border-box; }

    @supports not (backdrop-filter: blur(1px)) {
      .popup { background: var(--bg-solid); }
    }

    @keyframes popupScaleIn {
      from { opacity: 0; transform: scale(0.95) translateY(4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .popup { animation: none; }
      .chip, .send-btn, .ai-btn, .toast { transition: none !important; }
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }
    .close-btn:hover { color: var(--text-primary); }
    .close-btn:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
      border-radius: 4px;
    }

    /* ── Text preview + detection badge ── */
    .text-preview {
      background: var(--preview-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      line-height: 1.45;
    }
    .preview-text {
      color: var(--text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
      font-style: italic;
      opacity: 0.85;
    }
    .preview-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-secondary);
    }
    .char-count { opacity: 0.7; }
    .detection-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      opacity: 0.9;
    }
    .badge-dismiss {
      background: none;
      border: none;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
      padding: 0 0 0 2px;
      line-height: 1;
      opacity: 0.6;
    }
    .badge-dismiss:hover { opacity: 1; }

    /* ── Override dropdown ── */
    .override-dropdown {
      display: none;
      position: absolute;
      right: 12px;
      background: var(--bg-solid);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10;
      min-width: 160px;
    }
    .override-dropdown.open { display: block; }
    .override-option {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 10px;
      background: none;
      border: none;
      border-radius: 6px;
      color: var(--text);
      font-size: 12px;
      cursor: pointer;
      text-align: left;
    }
    .override-option:hover {
      background: var(--surface-hover);
    }

    /* ── AI selector ── */
    .ai-selector {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .ai-btn {
      flex: 1;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ai-btn:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
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
      background: var(--surface-hover);
      color: var(--text);
    }

    /* ── Preset sections ── */
    .preset-section { margin-bottom: 10px; }
    .preset-label {
      font-size: 10px;
      color: var(--text-secondary);
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
      background: var(--chip-bg);
      color: var(--chip-text);
      padding: 5px 11px;
      border-radius: 14px;
      font-size: 12px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chip:hover {
      background: var(--chip-hover);
      color: var(--text-primary);
    }
    .chip:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
    }
    .chip.selected {
      background: #4f46e5;
      color: white;
      border-color: #4f46e5;
      animation: chipBounce 0.2s ease-out;
    }
    @keyframes chipBounce {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.06); }
      100% { transform: scale(1); }
    }
    .suggested-chip {
      background: rgba(79,70,229,0.15);
      color: #a5b4fc;
      border: 1px solid rgba(79,70,229,0.3);
    }
    .popup.light-theme .suggested-chip {
      background: rgba(79,70,229,0.1);
      color: #4338CA;
      border-color: rgba(79,70,229,0.2);
    }
    .suggested-chip:hover {
      background: rgba(79,70,229,0.25);
    }

    /* ── Collapsible more presets ── */
    .more-presets-toggle {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 11px;
      cursor: pointer;
      padding: 4px 0;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .more-presets-toggle:hover { color: var(--text-primary); }
    .more-presets-toggle .arrow {
      display: inline-block;
      transition: transform 0.15s;
      font-size: 10px;
    }
    .more-presets-toggle.expanded .arrow {
      transform: rotate(180deg);
    }
    .more-presets-content {
      display: none;
    }
    .more-presets-content.expanded {
      display: block;
    }

    /* ── Custom input ── */
    .custom-input-wrap { margin-bottom: 12px; }
    .custom-input {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      padding: 9px 12px;
      color: var(--text);
      font-size: 12px;
      outline: none;
      font-family: inherit;
    }
    .custom-input:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 2px rgba(79,70,229,0.2);
    }
    .custom-input::placeholder { color: var(--text-muted); }

    /* ── Context toggle with tooltip ── */
    .context-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding: 0 2px;
    }
    .context-label-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .context-label { font-size: 12px; color: var(--text-secondary); }
    .info-tooltip-trigger {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 9px;
      font-weight: 700;
      cursor: help;
      border: none;
      line-height: 1;
    }
    .info-tooltip {
      display: none;
      position: absolute;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-solid);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
      line-height: 1.4;
      width: 200px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      white-space: normal;
      font-weight: 400;
      z-index: 20;
    }
    .info-tooltip-trigger:hover .info-tooltip,
    .info-tooltip-trigger:focus .info-tooltip {
      display: block;
    }
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
      background: var(--surface-hover);
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
    .switch input:focus-visible + .slider {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
    }

    /* ── Send button (fully opaque CTA) ── */
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
      position: relative;
    }
    .send-btn:hover { opacity: 0.9; }
    .send-btn:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
    }
    .send-btn.chatgpt { background: #10a37f; }
    .send-btn.claude { background: #d97706; }
    .send-btn.loading {
      opacity: 0.7;
      cursor: wait;
    }
    .send-btn.sent {
      background: #059669;
    }

    /* ── Toast ── */
    .toast {
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-solid);
      color: var(--text-primary);
      border: 1px solid var(--border);
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

// ─── Event wiring ───────────────────────────────────────────────────────────

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

  // Preset chips (both suggested and more)
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

  // More presets toggle
  const moreToggle = shadow.querySelector('.more-presets-toggle');
  const moreContent = shadow.querySelector('.more-presets-content');
  if (moreToggle && moreContent) {
    moreToggle.addEventListener('click', () => {
      const expanded = moreContent.classList.toggle('expanded');
      moreToggle.classList.toggle('expanded', expanded);
      moreToggle.querySelector('.toggle-text').textContent = expanded ? 'Fewer presets' : 'More presets';
    });
  }

  // Detection override dropdown
  const badgeDismiss = shadow.querySelector('.badge-dismiss');
  const overrideDropdown = shadow.querySelector('.override-dropdown');
  if (badgeDismiss && overrideDropdown) {
    badgeDismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      overrideDropdown.classList.toggle('open');
    });
    // Close dropdown on outside click
    shadow.querySelector('.popup').addEventListener('click', (e) => {
      if (!overrideDropdown.contains(e.target) && e.target !== badgeDismiss) {
        overrideDropdown.classList.remove('open');
      }
    });
    // Override options
    shadow.querySelectorAll('.override-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const newType = opt.dataset.type;
        overrideDropdown.classList.remove('open');
        // Update badge
        const badge = shadow.querySelector('.detection-badge');
        const config = BADGE_CONFIG[newType] || BADGE_CONFIG.default;
        badge.querySelector('.badge-icon').textContent = config.icon;
        badge.querySelector('.badge-label').textContent = config.label + ' detected';
        badge.style.background = config.color + '22';
        badge.style.color = config.color;
        // Update suggested label
        const suggestedLabel = shadow.querySelector('.suggested-label');
        if (suggestedLabel) {
          suggestedLabel.textContent = `Suggested for ${getTypeLabel(newType, null)}`;
        }
        // Re-render presets
        const suggested = (typeof getSuggestedPresetsForType === 'function')
          ? getSuggestedPresetsForType(newType, null)
          : PRESETS[newType].suggested;
        const suggestedChips = shadow.querySelector('.preset-chips.suggested');
        suggestedChips.innerHTML = suggested.map(p =>
          `<button class="chip suggested-chip" data-instruction="${escapeAttr(p.instruction)}">${escapeAttr(p.label)}</button>`
        ).join('');
        // Re-wire new chips
        suggestedChips.querySelectorAll('.chip').forEach(chip => {
          chip.addEventListener('click', () => {
            shadow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedInstruction = chip.dataset.instruction;
            customInput.value = '';
          });
        });
        const allP = getAllPresetsForType(newType, null);
        const moreChips = shadow.querySelector('.more-presets-chips');
        if (moreChips) {
          moreChips.innerHTML = allP.map(p =>
            `<button class="chip" data-instruction="${escapeAttr(p.instruction)}">${escapeAttr(p.label)}</button>`
          ).join('');
          moreChips.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
              shadow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
              chip.classList.add('selected');
              selectedInstruction = chip.dataset.instruction;
              customInput.value = '';
            });
          });
        }
      });
    });
  }

  // Close button
  shadow.querySelector('.close-btn').addEventListener('click', hidePopup);

  // Send button with loading state
  shadow.querySelector('.send-btn').addEventListener('click', () => {
    const instruction = customInput.value.trim() || selectedInstruction;
    const includeContext = contextCheckbox.checked;
    const prompt = buildPrompt(selectedText, instruction, includeContext);
    const result = getAIUrl(currentAI, prompt);
    const sendBtn = shadow.querySelector('.send-btn');

    if (result.fallback) {
      sendBtn.classList.add('loading');
      sendBtn.textContent = 'Sending...';
      navigator.clipboard.writeText(result.prompt).then(() => {
        showToast(shadow, 'Prompt copied to clipboard \u2014 paste it in the chat');
        chrome.runtime.sendMessage({ type: 'COPY_AND_OPEN', url: result.url });
        sendBtn.classList.remove('loading');
        sendBtn.classList.add('sent');
        sendBtn.textContent = 'Sent \u2713';
        setTimeout(hidePopup, 1500);
      }).catch(() => {
        showToast(shadow, 'Could not copy \u2014 open AI chat manually');
        chrome.runtime.sendMessage({ type: 'COPY_AND_OPEN', url: result.url });
        sendBtn.classList.remove('loading');
        setTimeout(hidePopup, 1500);
      });
    } else {
      sendBtn.classList.add('loading');
      sendBtn.textContent = 'Sending...';
      chrome.runtime.sendMessage({ type: 'OPEN_AI_TAB', url: result.url });
      sendBtn.classList.remove('loading');
      sendBtn.classList.add('sent');
      sendBtn.textContent = 'Sent \u2713';
      setTimeout(hidePopup, 600);
    }
  });

  // Close on Escape key
  function escHandler(e) {
    if (e.key === 'Escape') hidePopup();
  }
  document.addEventListener('keydown', escHandler);
  if (popupContainer) popupContainer._escHandler = escHandler;
}

// ─── Show popup ─────────────────────────────────────────────────────────────

function showPopup(selectedText, anchorNode) {
  hidePopup();
  hideTrigger();

  const detection = detectContentType(selectedText, anchorNode);
  const contentType = detection.type;
  const subType = detection.subType;
  const badge = getBadgeConfig(contentType, subType);
  const typeLabel = getTypeLabel(contentType, subType);

  const presetConfig = {
    suggested: (typeof getSuggestedPresetsForType === 'function')
      ? getSuggestedPresetsForType(contentType, subType)
      : PRESETS[contentType].suggested,
  };

  // Create container + shadow root
  popupContainer = document.createElement('div');
  popupContainer.id = 'ask-ai-popup-host';
  Object.assign(popupContainer.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: '0', left: '0', width: '0', height: '0',
  });

  const shadow = popupContainer.attachShadow({ mode: 'closed' });
  const theme = detectPageTheme();

  // Position near selection
  const selection = window.getSelection();
  let popupTop = 100, popupLeft = 100;
  if (selection && selection.rangeCount > 0) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    popupLeft = Math.min(rect.left, window.innerWidth - 380);
    popupTop = rect.bottom + 8;
    if (popupTop + 450 > window.innerHeight) {
      popupTop = Math.max(8, rect.top - 458);
    }
  }

  // Build preset chip HTML
  const allPresets = getAllPresetsForType(contentType, subType);

  // Truncate preview text
  const previewText = selectedText.length > 120
    ? selectedText.substring(0, 120) + '...'
    : selectedText;

  // Override dropdown options
  const overrideTypes = ['code', 'foreign', 'error', 'email', 'data', 'math', 'long', 'default'];
  const overrideHTML = overrideTypes
    .filter(t => t !== contentType)
    .map(t => {
      const c = BADGE_CONFIG[t];
      return `<button class="override-option" data-type="${t}"><span>${c.icon}</span> ${c.label}</button>`;
    }).join('');

  // Load saved preferences then render
  chrome.storage.local.get(['lastAI', 'pageContext'], (stored) => {
    const currentAI = stored.lastAI || 'chatgpt';
    const pageContextOn = stored.pageContext !== undefined ? stored.pageContext : true;

    shadow.innerHTML = `
      <style>${getPopupCSS()}</style>
      <div class="popup ${theme === 'light' ? 'light-theme' : ''}" style="left:${popupLeft}px;top:${popupTop}px;">
        <div class="header">
          <span class="title">Ask AI</span>
          <button class="close-btn" aria-label="Close">&times;</button>
        </div>

        <div class="text-preview">
          <div class="preview-text">\u201C${escapeAttr(previewText)}\u201D</div>
          <div class="preview-meta">
            <span class="char-count">${detection.charCount.toLocaleString()} chars</span>
            <span class="detection-badge" style="background:${badge.color}22;color:${badge.color}">
              <span class="badge-icon">${badge.icon}</span>
              <span class="badge-label">${escapeAttr(badge.label)}</span>
              <button class="badge-dismiss" aria-label="Change detected type">\u2715</button>
            </span>
          </div>
          <div class="override-dropdown">
            ${overrideHTML}
          </div>
        </div>

        <div class="ai-selector">
          <button class="ai-btn chatgpt ${currentAI === 'chatgpt' ? 'active' : ''}" data-ai="chatgpt">ChatGPT</button>
          <button class="ai-btn claude ${currentAI === 'claude' ? 'active' : ''}" data-ai="claude">Claude</button>
        </div>

        <div class="preset-section">
          <div class="preset-label suggested-label">Suggested for ${escapeAttr(typeLabel)}</div>
          <div class="preset-chips suggested">
            ${presetConfig.suggested.map(p => `<button class="chip suggested-chip" data-instruction="${escapeAttr(p.instruction)}">${escapeAttr(p.label)}</button>`).join('')}
          </div>
        </div>

        ${allPresets.length > 0 ? `
        <div class="preset-section">
          <button class="more-presets-toggle">
            <span class="toggle-text">More presets</span>
            <span class="arrow">\u25BE</span>
          </button>
          <div class="more-presets-content">
            <div class="preset-chips more-presets-chips">
              ${allPresets.map(p => `<button class="chip" data-instruction="${escapeAttr(p.instruction)}">${escapeAttr(p.label)}</button>`).join('')}
            </div>
          </div>
        </div>
        ` : ''}

        <div class="custom-input-wrap">
          <input type="text" class="custom-input" placeholder="Or type a custom instruction..." aria-label="Custom instruction" />
        </div>

        <div class="context-toggle">
          <div class="context-label-wrap">
            <span class="context-label">Include page context</span>
            <span class="info-tooltip-trigger" tabindex="0" aria-label="Info">i
              <span class="info-tooltip">Sends the page title and URL along with your selected text to give the AI more context about where this text came from.</span>
            </span>
          </div>
          <label class="switch">
            <input type="checkbox" class="context-checkbox" ${pageContextOn ? 'checked' : ''} aria-label="Include page context" />
            <span class="slider"></span>
          </label>
        </div>

        <button class="send-btn ${currentAI}">Send to ${currentAI === 'chatgpt' ? 'ChatGPT' : 'Claude'} \u2192</button>
      </div>
    `;

    wirePopupEvents(shadow, selectedText);
    document.body.appendChild(popupContainer);
  });
}

function hidePopup() {
  if (popupContainer) {
    if (popupContainer._escHandler) {
      document.removeEventListener('keydown', popupContainer._escHandler);
    }
    popupContainer.remove();
    popupContainer = null;
  }
}

// Export for testing (no-op in browser)
if (typeof module !== 'undefined') module.exports = {
  showPopup, hidePopup, escapeAttr, showToast, getPopupCSS, wirePopupEvents,
  getBadgeConfig, getTypeLabel, detectPageTheme, BADGE_CONFIG,
};
