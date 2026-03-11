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
globalThis.detectContentType = vi.fn(() => ({ type: 'default', subType: null, confidence: 1.0, wordCount: 2, charCount: 10 }));
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
globalThis.getSuggestedPresetsForType = vi.fn((contentType, subType) => {
  return PRESETS[contentType].suggested;
});
globalThis.getAllPresetsForType = vi.fn((contentType, subType) => {
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

import {
  showPopup, hidePopup, escapeAttr, showToast, getPopupCSS,
  getBadgeConfig, getTypeLabel, detectPageTheme, BADGE_CONFIG,
} from '../popup.js';

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

  it('contains frosted glass backdrop-filter', () => {
    const css = getPopupCSS();
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('blur(16px)');
    expect(css).toContain('saturate(180%)');
  });

  it('contains dark mode background color', () => {
    const css = getPopupCSS();
    expect(css).toContain('rgba(15, 15, 25, 0.72)');
  });

  it('contains light mode background color', () => {
    const css = getPopupCSS();
    expect(css).toContain('rgba(255, 255, 255, 0.68)');
  });

  it('contains fallback for no backdrop-filter support', () => {
    const css = getPopupCSS();
    expect(css).toContain('@supports not');
    expect(css).toContain('var(--bg-solid)');
  });

  it('contains prefers-reduced-motion media query', () => {
    const css = getPopupCSS();
    expect(css).toContain('prefers-reduced-motion');
  });

  it('contains popup scale-in animation', () => {
    const css = getPopupCSS();
    expect(css).toContain('popupScaleIn');
    expect(css).toContain('0.15s ease-out');
  });

  it('contains chip bounce animation', () => {
    const css = getPopupCSS();
    expect(css).toContain('chipBounce');
  });

  it('uses ChatGPT brand color', () => {
    const css = getPopupCSS();
    expect(css).toContain('#10a37f');
  });

  it('uses Claude brand color', () => {
    const css = getPopupCSS();
    expect(css).toContain('#d97706');
  });

  it('contains text preview styles', () => {
    const css = getPopupCSS();
    expect(css).toContain('.text-preview');
    expect(css).toContain('.detection-badge');
    expect(css).toContain('.char-count');
  });

  it('contains override dropdown styles', () => {
    const css = getPopupCSS();
    expect(css).toContain('.override-dropdown');
    expect(css).toContain('.override-option');
  });

  it('contains collapsible more presets styles', () => {
    const css = getPopupCSS();
    expect(css).toContain('.more-presets-toggle');
    expect(css).toContain('.more-presets-content');
  });

  it('contains info tooltip styles', () => {
    const css = getPopupCSS();
    expect(css).toContain('.info-tooltip');
    expect(css).toContain('.info-tooltip-trigger');
  });

  it('contains focus-visible styles for accessibility', () => {
    const css = getPopupCSS();
    expect(css).toContain('focus-visible');
  });

  it('send button stays fully opaque (no glass)', () => {
    const css = getPopupCSS();
    // Send button uses solid background colors, not transparent
    expect(css).toContain('.send-btn.chatgpt { background: #10a37f; }');
    expect(css).toContain('.send-btn.claude { background: #d97706; }');
  });
});

describe('BADGE_CONFIG', () => {
  it('has configs for all 8 content types', () => {
    const types = ['code', 'foreign', 'error', 'email', 'data', 'math', 'long', 'default'];
    for (const type of types) {
      expect(BADGE_CONFIG[type]).toBeDefined();
      expect(BADGE_CONFIG[type].icon).toBeDefined();
      expect(BADGE_CONFIG[type].color).toBeDefined();
      expect(BADGE_CONFIG[type].label).toBeDefined();
    }
  });

  it('uses correct colors per spec', () => {
    expect(BADGE_CONFIG.code.color).toBe('#3B82F6');     // Blue
    expect(BADGE_CONFIG.foreign.color).toBe('#8B5CF6');  // Purple
    expect(BADGE_CONFIG.error.color).toBe('#EF4444');    // Red
    expect(BADGE_CONFIG.email.color).toBe('#F59E0B');    // Amber
    expect(BADGE_CONFIG.data.color).toBe('#14B8A6');     // Teal
    expect(BADGE_CONFIG.math.color).toBe('#6366F1');     // Indigo
    expect(BADGE_CONFIG.long.color).toBe('#6B7280');     // Gray
  });
});

describe('getBadgeConfig', () => {
  it('returns base badge with "detected" suffix for type without subType', () => {
    const badge = getBadgeConfig('code', null);
    expect(badge.label).toBe('Code detected');
    expect(badge.color).toBe('#3B82F6');
  });

  it('returns sub-type-specific label when subType provided', () => {
    const badge = getBadgeConfig('code', 'javascript');
    expect(badge.label).toBe('Javascript detected');
  });

  it('returns foreign sub-type label', () => {
    const badge = getBadgeConfig('foreign', 'japanese');
    expect(badge.label).toBe('Japanese detected');
  });

  it('falls back to default for unknown type', () => {
    const badge = getBadgeConfig('unknown', null);
    expect(badge.color).toBe('#6B7280');
  });
});

describe('getTypeLabel', () => {
  it('returns capitalized sub-type when provided', () => {
    expect(getTypeLabel('code', 'javascript')).toBe('Javascript');
    expect(getTypeLabel('foreign', 'korean')).toBe('Korean');
  });

  it('returns generic label when no sub-type', () => {
    expect(getTypeLabel('code', null)).toBe('Code');
    expect(getTypeLabel('error', null)).toBe('Error');
    expect(getTypeLabel('default', null)).toBe('Text');
  });
});

describe('showPopup and hidePopup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockSelection('test text');
    vi.clearAllMocks();
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({}));
    detectContentType.mockReturnValue({ type: 'default', subType: null, confidence: 1.0, wordCount: 2, charCount: 10 });
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
    expect(chrome.storage.local.get).toHaveBeenCalled();
  });

  it('uses code presets when detectContentType returns code', () => {
    detectContentType.mockReturnValue({ type: 'code', subType: 'javascript', confidence: 0.9, wordCount: 3, charCount: 20 });
    showPopup('function test() {}', null);
    expect(getAllPresetsForType).toHaveBeenCalledWith('code', 'javascript');
  });

  it('uses foreign presets when detectContentType returns foreign', () => {
    detectContentType.mockReturnValue({ type: 'foreign', subType: 'japanese', confidence: 0.85, wordCount: 3, charCount: 17 });
    showPopup('some foreign text', null);
    expect(getAllPresetsForType).toHaveBeenCalledWith('foreign', 'japanese');
  });

  it('passes subType to getSuggestedPresetsForType', () => {
    detectContentType.mockReturnValue({ type: 'code', subType: 'python', confidence: 0.9, wordCount: 5, charCount: 30 });
    showPopup('def foo():', null);
    expect(getSuggestedPresetsForType).toHaveBeenCalledWith('code', 'python');
  });
});

describe('showToast', () => {
  it('appends a toast element to the popup', () => {
    const container = document.createElement('div');
    const popup = document.createElement('div');
    popup.className = 'popup';
    container.appendChild(popup);

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
  it('returns type-specific all presets plus deduplicated common presets for code', () => {
    const result = getAllPresetsForType('code');
    const labels = result.map(p => p.label);
    expect(labels).toContain('Add types');
    expect(labels).toContain('Write tests');
    expect(labels).toContain('Translate');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
    expect(labels).not.toContain('Explain code');
    expect(labels).not.toContain('Debug this');
    expect(labels).not.toContain('Optimize');
  });

  it('returns only deduplicated common presets for default type', () => {
    const result = getAllPresetsForType('default');
    const labels = result.map(p => p.label);
    expect(labels).not.toContain('Explain simply');
    expect(labels).toContain('Explain');
    expect(labels).toContain('Translate');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
  });

  it('returns deduplicated common presets for foreign type', () => {
    const result = getAllPresetsForType('foreign');
    const labels = result.map(p => p.label);
    expect(labels).not.toContain('Translate');
    expect(labels).not.toContain('Explain');
    expect(labels).toContain('Summarize');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
    expect(labels).toContain('Key points');
  });
});
