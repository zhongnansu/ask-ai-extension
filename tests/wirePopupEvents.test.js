// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock chrome APIs
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => cb({})),
      set: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
  },
};

// Mock dependencies
globalThis.detectContentType = vi.fn(() => ({ type: 'default', subType: null, confidence: 1.0, wordCount: 2, charCount: 10 }));
globalThis.PRESETS = {
  default: {
    suggested: [
      { label: 'Summarize', instruction: 'Summarize the following' },
    ],
    all: []
  },
  code: {
    suggested: [
      { label: 'Explain code', instruction: 'Explain the following code' },
    ],
    all: []
  },
};
globalThis.COMMON_PRESETS = [];
globalThis.BADGE_CONFIG = {
  code: { icon: '\u27E8/\u27E9', color: '#3B82F6', label: 'Code' },
  default: { icon: '\u2726', color: '#6B7280', label: 'Text selected' },
};
globalThis.getSuggestedPresetsForType = vi.fn((contentType, subType) => {
  return PRESETS[contentType]?.suggested || [];
});
globalThis.getAllPresetsForType = vi.fn(() => []);
globalThis.buildPrompt = vi.fn((text, instruction, ctx) => {
  if (instruction) return `${instruction}:\n\n${text}`;
  return text;
});
globalThis.getAIUrl = vi.fn((ai, prompt) => ({
  url: `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,
  fallback: false,
}));
globalThis.hideTrigger = vi.fn();

import { wirePopupEvents, hidePopup, escapeAttr } from '../popup.js';

/**
 * Build a DOM structure that mimics what popup.js renders inside the shadow root.
 */
function createMockPopupDOM() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="popup">
      <div class="header">
        <span class="title">Ask AI</span>
        <button class="close-btn">&times;</button>
      </div>
      <div class="text-preview">
        <div class="preview-text">"test text"</div>
        <div class="preview-meta">
          <span class="char-count">10 chars</span>
          <span class="detection-badge" style="background:#6B728022;color:#6B7280">
            <span class="badge-icon">\u2726</span>
            <span class="badge-label">Text selected detected</span>
            <button class="badge-dismiss">\u2715</button>
          </span>
        </div>
        <div class="override-dropdown">
          <button class="override-option" data-type="code"><span>\u27E8/\u27E9</span> Code</button>
        </div>
      </div>
      <div class="ai-selector">
        <button class="ai-btn chatgpt active" data-ai="chatgpt">ChatGPT</button>
        <button class="ai-btn claude" data-ai="claude">Claude</button>
      </div>
      <div class="preset-section">
        <div class="preset-label suggested-label">Suggested for Text</div>
        <div class="preset-chips suggested">
          <button class="chip suggested-chip" data-instruction="Summarize the following">Summarize</button>
        </div>
      </div>
      <div class="preset-section">
        <button class="more-presets-toggle">
          <span class="toggle-text">More presets</span>
          <span class="arrow">\u25BE</span>
        </button>
        <div class="more-presets-content">
          <div class="preset-chips more-presets-chips">
            <button class="chip" data-instruction="Explain the following">Explain</button>
            <button class="chip" data-instruction="Translate the following">Translate</button>
          </div>
        </div>
      </div>
      <div class="custom-input-wrap">
        <input type="text" class="custom-input" placeholder="Or type a custom instruction..." />
      </div>
      <div class="context-toggle">
        <div class="context-label-wrap">
          <span class="context-label">Include page context</span>
          <span class="info-tooltip-trigger">i
            <span class="info-tooltip">Sends the page title and URL...</span>
          </span>
        </div>
        <label class="switch">
          <input type="checkbox" class="context-checkbox" checked />
          <span class="slider"></span>
        </label>
      </div>
      <button class="send-btn chatgpt">Send to ChatGPT \u2192</button>
    </div>
  `;
  return container;
}

describe('wirePopupEvents', () => {
  let shadow;
  let selectedText;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    shadow = createMockPopupDOM();
    selectedText = 'test selected text';
    wirePopupEvents(shadow, selectedText);
  });

  afterEach(() => {
    hidePopup();
  });

  describe('AI selector toggle', () => {
    it('switches to Claude when Claude button is clicked', () => {
      const claudeBtn = shadow.querySelector('.ai-btn.claude');
      claudeBtn.click();

      expect(claudeBtn.classList.contains('active')).toBe(true);
      expect(shadow.querySelector('.ai-btn.chatgpt').classList.contains('active')).toBe(false);
    });

    it('saves AI preference to chrome.storage.local', () => {
      shadow.querySelector('.ai-btn.claude').click();
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ lastAI: 'claude' });
    });

    it('updates send button text and class when switching AI', () => {
      shadow.querySelector('.ai-btn.claude').click();
      const sendBtn = shadow.querySelector('.send-btn');
      expect(sendBtn.textContent).toContain('Claude');
      expect(sendBtn.classList.contains('claude')).toBe(true);
    });

    it('switches back to ChatGPT', () => {
      shadow.querySelector('.ai-btn.claude').click();
      shadow.querySelector('.ai-btn.chatgpt').click();

      const sendBtn = shadow.querySelector('.send-btn');
      expect(sendBtn.textContent).toContain('ChatGPT');
      expect(sendBtn.classList.contains('chatgpt')).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ lastAI: 'chatgpt' });
    });
  });

  describe('preset chip selection', () => {
    it('selects a chip and adds selected class', () => {
      const chip = shadow.querySelector('.chip[data-instruction="Explain the following"]');
      chip.click();

      expect(chip.classList.contains('selected')).toBe(true);
    });

    it('deselects other chips when a new one is selected', () => {
      const explainChip = shadow.querySelector('.chip[data-instruction="Explain the following"]');
      const translateChip = shadow.querySelector('.chip[data-instruction="Translate the following"]');

      explainChip.click();
      expect(explainChip.classList.contains('selected')).toBe(true);

      translateChip.click();
      expect(translateChip.classList.contains('selected')).toBe(true);
      expect(explainChip.classList.contains('selected')).toBe(false);
    });

    it('clears custom input when a chip is selected', () => {
      const customInput = shadow.querySelector('.custom-input');
      customInput.value = 'custom instruction';

      shadow.querySelector('.chip[data-instruction="Explain the following"]').click();
      expect(customInput.value).toBe('');
    });
  });

  describe('custom input', () => {
    it('deselects all chips when custom input has text', () => {
      const chip = shadow.querySelector('.chip[data-instruction="Explain the following"]');
      chip.click();
      expect(chip.classList.contains('selected')).toBe(true);

      const customInput = shadow.querySelector('.custom-input');
      customInput.value = 'my custom prompt';
      customInput.dispatchEvent(new Event('input'));

      expect(chip.classList.contains('selected')).toBe(false);
    });

    it('does NOT deselect chips when custom input is empty/whitespace', () => {
      const chip = shadow.querySelector('.chip[data-instruction="Explain the following"]');
      chip.click();

      const customInput = shadow.querySelector('.custom-input');
      customInput.value = '   ';
      customInput.dispatchEvent(new Event('input'));

      expect(chip.classList.contains('selected')).toBe(true);
    });
  });

  describe('context toggle', () => {
    it('saves page context preference when toggled off', () => {
      const checkbox = shadow.querySelector('.context-checkbox');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ pageContext: false });
    });

    it('saves page context preference when toggled on', () => {
      const checkbox = shadow.querySelector('.context-checkbox');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ pageContext: true });
    });
  });

  describe('more presets toggle', () => {
    it('toggles more-presets-content visibility on click', () => {
      const toggle = shadow.querySelector('.more-presets-toggle');
      const content = shadow.querySelector('.more-presets-content');

      expect(content.classList.contains('expanded')).toBe(false);
      toggle.click();
      expect(content.classList.contains('expanded')).toBe(true);
      toggle.click();
      expect(content.classList.contains('expanded')).toBe(false);
    });

    it('updates toggle text when expanded', () => {
      const toggle = shadow.querySelector('.more-presets-toggle');
      const toggleText = toggle.querySelector('.toggle-text');

      toggle.click();
      expect(toggleText.textContent).toBe('Fewer presets');
      toggle.click();
      expect(toggleText.textContent).toBe('More presets');
    });
  });

  describe('detection override dropdown', () => {
    it('opens dropdown when badge dismiss is clicked', () => {
      const dismiss = shadow.querySelector('.badge-dismiss');
      const dropdown = shadow.querySelector('.override-dropdown');

      expect(dropdown.classList.contains('open')).toBe(false);
      dismiss.click();
      expect(dropdown.classList.contains('open')).toBe(true);
    });

    it('closes dropdown when clicking elsewhere in popup', () => {
      const dismiss = shadow.querySelector('.badge-dismiss');
      const dropdown = shadow.querySelector('.override-dropdown');
      const popup = shadow.querySelector('.popup');

      dismiss.click();
      expect(dropdown.classList.contains('open')).toBe(true);

      popup.click();
      expect(dropdown.classList.contains('open')).toBe(false);
    });
  });

  describe('close button', () => {
    it('has a click handler attached to close button', () => {
      const closeBtn = shadow.querySelector('.close-btn');
      expect(closeBtn).not.toBeNull();
      expect(() => closeBtn.click()).not.toThrow();
    });
  });

  describe('escape key', () => {
    it('registers a keydown listener for Escape', () => {
      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }).not.toThrow();
    });

    it('does NOT trigger for other keys', () => {
      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }).not.toThrow();
    });
  });

  describe('send button — direct open', () => {
    it('sends OPEN_AI_TAB message with no instruction selected', () => {
      shadow.querySelector('.send-btn').click();

      expect(buildPrompt).toHaveBeenCalledWith(selectedText, '', true);
      expect(getAIUrl).toHaveBeenCalledWith('chatgpt', selectedText);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'OPEN_AI_TAB',
        url: expect.stringContaining('chatgpt.com'),
      });
    });

    it('sends with preset instruction when chip is selected', () => {
      shadow.querySelector('.chip[data-instruction="Explain the following"]').click();
      shadow.querySelector('.send-btn').click();

      expect(buildPrompt).toHaveBeenCalledWith(selectedText, 'Explain the following', true);
    });

    it('sends with custom instruction when typed', () => {
      const customInput = shadow.querySelector('.custom-input');
      customInput.value = 'Fix this bug';
      customInput.dispatchEvent(new Event('input'));

      shadow.querySelector('.send-btn').click();

      expect(buildPrompt).toHaveBeenCalledWith(selectedText, 'Fix this bug', true);
    });

    it('custom input takes precedence over chip selection', () => {
      shadow.querySelector('.chip[data-instruction="Explain the following"]').click();

      const customInput = shadow.querySelector('.custom-input');
      customInput.value = 'Custom override';
      customInput.dispatchEvent(new Event('input'));

      shadow.querySelector('.send-btn').click();

      expect(buildPrompt).toHaveBeenCalledWith(selectedText, 'Custom override', true);
    });

    it('sends to Claude after switching AI', () => {
      shadow.querySelector('.ai-btn.claude').click();
      shadow.querySelector('.send-btn').click();

      expect(getAIUrl).toHaveBeenCalledWith('claude', expect.any(String));
    });

    it('respects context toggle being off', () => {
      const checkbox = shadow.querySelector('.context-checkbox');
      checkbox.checked = false;

      shadow.querySelector('.send-btn').click();

      expect(buildPrompt).toHaveBeenCalledWith(selectedText, '', false);
    });

    it('shows "Sent" state after sending', () => {
      shadow.querySelector('.send-btn').click();
      const sendBtn = shadow.querySelector('.send-btn');
      expect(sendBtn.textContent).toContain('Sent');
      expect(sendBtn.classList.contains('sent')).toBe(true);
    });
  });

  describe('send button — fallback (clipboard copy)', () => {
    beforeEach(() => {
      getAIUrl.mockReturnValue({
        url: 'https://chatgpt.com/',
        fallback: true,
        prompt: 'long prompt text',
      });
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn(() => Promise.resolve()),
        },
      });
    });

    it('copies prompt to clipboard when URL is too long', async () => {
      shadow.querySelector('.send-btn').click();

      await vi.waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('long prompt text');
      });
    });

    it('sends COPY_AND_OPEN message after clipboard copy', async () => {
      shadow.querySelector('.send-btn').click();

      await vi.waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'COPY_AND_OPEN',
          url: 'https://chatgpt.com/',
        });
      });
    });

    it('shows "Sent" state after fallback copy', async () => {
      shadow.querySelector('.send-btn').click();

      await vi.waitFor(() => {
        const sendBtn = shadow.querySelector('.send-btn');
        expect(sendBtn.classList.contains('sent')).toBe(true);
        expect(sendBtn.textContent).toContain('Sent');
      });
    });
  });
});
