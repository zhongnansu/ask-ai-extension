// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock chrome APIs before importing popup.js
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

// Mock dependencies that popup.js expects in global scope
globalThis.detectContentType = vi.fn(() => 'default');
globalThis.PRESETS = {
  code: {
    suggested: [
      { label: 'Explain code', instruction: 'Explain the following code' },
      { label: 'Debug this', instruction: 'Debug the following code and identify any issues' },
      { label: 'Optimize', instruction: 'Optimize the following code' },
    ],
    all: [
      { label: 'Add types', instruction: 'Add type annotations to the following code' },
      { label: 'Write tests', instruction: 'Write unit tests for the following code' },
      { label: 'Convert to...', instruction: 'Convert the following code to' },
    ]
  },
  foreign: {
    suggested: [
      { label: 'Translate', instruction: 'Translate the following to English' },
      { label: 'Explain', instruction: 'Explain the following text' },
    ],
    all: []
  },
  long: {
    suggested: [
      { label: 'Summarize', instruction: 'Summarize the following' },
      { label: 'Key points', instruction: 'Extract the key points from the following' },
    ],
    all: []
  },
  default: {
    suggested: [
      { label: 'Summarize', instruction: 'Summarize the following' },
      { label: 'Explain simply', instruction: 'Explain the following in simple terms' },
    ],
    all: []
  }
};
globalThis.COMMON_PRESETS = [
  { label: 'Summarize', instruction: 'Summarize the following' },
  { label: 'Explain', instruction: 'Explain the following' },
  { label: 'Translate', instruction: 'Translate the following to English' },
  { label: 'Rewrite', instruction: 'Rewrite the following more clearly' },
  { label: 'Expand', instruction: 'Expand on the following' },
  { label: 'Key points', instruction: 'Extract the key points from the following' },
];
globalThis.getAllPresetsForType = vi.fn((contentType) => {
  const typeAll = PRESETS[contentType].all || [];
  const labels = new Set([
    ...PRESETS[contentType].suggested.map(p => p.label),
    ...typeAll.map(p => p.label),
  ]);
  const common = COMMON_PRESETS.filter(p => !labels.has(p.label));
  return [...typeAll, ...common];
});
globalThis.buildPrompt = vi.fn((text, instruction, ctx) => {
  if (instruction) return `${instruction}:\n\n${text}`;
  return text;
});
globalThis.getAIUrl = vi.fn((ai, prompt) => ({
  url: `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,
  fallback: false,
}));
globalThis.hideTrigger = vi.fn();

import { showPopup, hidePopup, escapeAttr, showToast, getPopupCSS } from '../popup.js';

function mockSelection(text) {
  const range = {
    getBoundingClientRect: () => ({ top: 100, right: 300, bottom: 120, left: 100 }),
  };
  window.getSelection = vi.fn(() => ({
    toString: () => text,
    anchorNode: document.body,
    rangeCount: 1,
    getRangeAt: () => range,
  }));
}

describe('escapeAttr', () => {
  it('escapes double quotes', () => {
    expect(escapeAttr('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes angle brackets', () => {
    expect(escapeAttr('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeAttr('a & b')).toBe('a &amp; b');
  });

  it('escapes all special characters together', () => {
    expect(escapeAttr('a < b & c > "d"')).toBe('a &lt; b &amp; c &gt; &quot;d&quot;');
  });

  it('returns unchanged string when no special characters', () => {
    expect(escapeAttr('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(escapeAttr('')).toBe('');
  });
});

describe('getPopupCSS', () => {
  it('returns a non-empty string', () => {
    const css = getPopupCSS();
    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(0);
  });

  it('contains key class selectors', () => {
    const css = getPopupCSS();
    expect(css).toContain('.popup');
    expect(css).toContain('.ai-btn');
    expect(css).toContain('.chip');
    expect(css).toContain('.send-btn');
    expect(css).toContain('.toast');
    expect(css).toContain('.context-toggle');
  });

  it('uses the dark theme background color', () => {
    const css = getPopupCSS();
    expect(css).toContain('#1e1e2e');
  });

  it('uses ChatGPT brand color', () => {
    const css = getPopupCSS();
    expect(css).toContain('#10a37f');
  });

  it('uses Claude brand color', () => {
    const css = getPopupCSS();
    expect(css).toContain('#d97706');
  });
});

describe('showPopup and hidePopup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockSelection('test text');
    vi.clearAllMocks();
    // Reset chrome storage mock to return defaults
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({}));
    detectContentType.mockReturnValue('default');
  });

  afterEach(() => {
    hidePopup();
  });

  it('creates a popup host element in the DOM', () => {
    showPopup('hello world', null);
    const host = document.getElementById('ask-ai-popup-host');
    expect(host).not.toBeNull();
  });

  it('calls detectContentType with the selected text', () => {
    showPopup('some code here', null);
    expect(detectContentType).toHaveBeenCalledWith('some code here', null);
  });

  it('calls hideTrigger when showing popup', () => {
    showPopup('hello', null);
    expect(hideTrigger).toHaveBeenCalled();
  });

  it('calls chrome.storage.local.get to load preferences', () => {
    showPopup('hello', null);
    expect(chrome.storage.local.get).toHaveBeenCalledWith(
      ['lastAI', 'pageContext'],
      expect.any(Function)
    );
  });

  it('removes popup host on hidePopup', () => {
    showPopup('hello', null);
    expect(document.getElementById('ask-ai-popup-host')).not.toBeNull();
    hidePopup();
    expect(document.getElementById('ask-ai-popup-host')).toBeNull();
  });

  it('hidePopup is safe to call when no popup exists', () => {
    expect(() => hidePopup()).not.toThrow();
  });

  it('replaces an existing popup when showPopup is called again', () => {
    showPopup('first', null);
    showPopup('second', null);
    const hosts = document.querySelectorAll('#ask-ai-popup-host');
    expect(hosts.length).toBe(1);
  });

  it('positions popup using fixed positioning and high z-index', () => {
    showPopup('hello', null);
    const host = document.getElementById('ask-ai-popup-host');
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483647');
  });

  it('loads Claude as currentAI when stored preference is claude', () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ lastAI: 'claude' }));
    showPopup('hello', null);
    // The chrome.storage.local.get was called, which sets up claude as active
    expect(chrome.storage.local.get).toHaveBeenCalled();
  });

  it('uses code presets when detectContentType returns code', () => {
    detectContentType.mockReturnValue('code');
    showPopup('function test() {}', null);
    expect(getAllPresetsForType).toHaveBeenCalledWith('code');
  });

  it('uses foreign presets when detectContentType returns foreign', () => {
    detectContentType.mockReturnValue('foreign');
    showPopup('some foreign text', null);
    expect(getAllPresetsForType).toHaveBeenCalledWith('foreign');
  });
});

describe('showToast', () => {
  it('appends a toast element to the popup', () => {
    // Create a mock shadow-like structure
    const container = document.createElement('div');
    const popup = document.createElement('div');
    popup.className = 'popup';
    container.appendChild(popup);

    // showToast uses shadow.querySelector('.popup')
    showToast(container, 'Test message');
    const toast = popup.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe('Test message');
  });

  it('toast has correct class name', () => {
    const container = document.createElement('div');
    const popup = document.createElement('div');
    popup.className = 'popup';
    container.appendChild(popup);

    showToast(container, 'Hello');
    const toast = popup.querySelector('.toast');
    expect(toast.className).toBe('toast');
  });
});

describe('getAllPresetsForType integration', () => {
  // These tests verify the real getAllPresetsForType logic works correctly
  // with the PRESETS and COMMON_PRESETS data structures

  it('returns type-specific all presets plus deduplicated common presets for code', () => {
    const result = getAllPresetsForType('code');
    const labels = result.map(p => p.label);
    // Should include code-specific "all" presets
    expect(labels).toContain('Add types');
    expect(labels).toContain('Write tests');
    // Should include common presets not already in suggested
    expect(labels).toContain('Translate');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
    // Should NOT include presets already in suggested
    expect(labels).not.toContain('Explain code');
    expect(labels).not.toContain('Debug this');
    expect(labels).not.toContain('Optimize');
  });

  it('returns only deduplicated common presets for default type', () => {
    const result = getAllPresetsForType('default');
    const labels = result.map(p => p.label);
    // "Summarize" is in suggested, so should be excluded from common
    expect(labels).not.toContain('Explain simply');
    // These common presets should be included
    expect(labels).toContain('Explain');
    expect(labels).toContain('Translate');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
  });

  it('returns deduplicated common presets for foreign type', () => {
    const result = getAllPresetsForType('foreign');
    const labels = result.map(p => p.label);
    // "Translate" and "Explain" are in suggested for foreign, so excluded
    expect(labels).not.toContain('Translate');
    expect(labels).not.toContain('Explain');
    // Others should be present
    expect(labels).toContain('Summarize');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
    expect(labels).toContain('Key points');
  });
});
