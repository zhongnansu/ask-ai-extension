// tests/bubble.test.js
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome APIs
global.chrome = {
  runtime: {
    connect: vi.fn(() => ({
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    })),
  },
  storage: {
    local: {
      get: vi.fn((keys, cb) => cb({})),
      set: vi.fn((data, cb) => { if (cb) cb(); }),
    },
  },
};

// Mock dependencies that share global scope
global.requestChat = vi.fn(() => ({ cancel: vi.fn() }));
global.saveConversation = vi.fn(() => Promise.resolve());
global.getHistory = vi.fn(() => Promise.resolve([]));
global.clearHistory = vi.fn(() => Promise.resolve());
global.buildFollowUp = vi.fn((msgs, q) => [...msgs, { role: 'user', content: q }]);

const {
  showBubble,
  hideBubble,
  appendToken,
  setBubbleStatus,
  renderMarkdown,
  detectTheme,
  _getBubbleContainer,
} = await import('../bubble.js');

describe('bubble.js', () => {
  beforeEach(() => {
    hideBubble();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('showBubble', () => {
    it('creates a shadow DOM container', () => {
      showBubble({ bottom: 200, left: 100, right: 300 }, [{ role: 'user', content: 'hi' }]);
      const container = _getBubbleContainer();
      expect(container).not.toBeNull();
      expect(container.shadowRoot).not.toBeNull();
    });

    it('positions below the selection rect', () => {
      showBubble({ bottom: 150, left: 50, right: 250 }, []);
      const container = _getBubbleContainer();
      expect(container.style.top).toBe('158px'); // bottom + 8px gap
    });

    it('shows thinking status initially', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      const container = _getBubbleContainer();
      const status = container.shadowRoot.querySelector('.bubble-status');
      expect(status.textContent).toBe('thinking...');
    });

    it('has Dobby AI branding in header', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      const container = _getBubbleContainer();
      const header = container.shadowRoot.querySelector('.bubble-header');
      expect(header.textContent).toContain('Dobby AI');
    });
  });

  describe('appendToken', () => {
    it('appends text to response area', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      appendToken('Hello');
      appendToken(' world');
      const container = _getBubbleContainer();
      const body = container.shadowRoot.querySelector('.response-text');
      expect(body.textContent).toContain('Hello world');
    });
  });

  describe('setBubbleStatus', () => {
    it('updates status text', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      setBubbleStatus('typing...');
      const container = _getBubbleContainer();
      const status = container.shadowRoot.querySelector('.bubble-status');
      expect(status.textContent).toBe('typing...');
    });
  });

  describe('hideBubble', () => {
    it('removes bubble from DOM', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      expect(_getBubbleContainer()).not.toBeNull();
      hideBubble();
      expect(_getBubbleContainer()).toBeNull();
    });

    it('is safe to call when no bubble exists', () => {
      expect(() => hideBubble()).not.toThrow();
    });
  });

  describe('renderMarkdown', () => {
    it('renders bold text', () => {
      expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    });

    it('renders inline code', () => {
      expect(renderMarkdown('`code`')).toContain('<code>code</code>');
    });

    it('renders code blocks', () => {
      const result = renderMarkdown('```\nconst x = 1;\n```');
      expect(result).toContain('<pre><code>');
      expect(result).toContain('const x = 1;');
    });

    it('renders newlines as <br>', () => {
      expect(renderMarkdown('line1\nline2')).toContain('<br>');
    });

    it('handles plain text without modification', () => {
      const result = renderMarkdown('just plain text');
      expect(result).toContain('just plain text');
    });
  });

  describe('detectTheme', () => {
    it('returns light for white background', () => {
      document.body.style.backgroundColor = 'rgb(255, 255, 255)';
      expect(detectTheme()).toBe('light');
    });

    it('returns dark for dark background', () => {
      document.body.style.backgroundColor = 'rgb(30, 30, 30)';
      expect(detectTheme()).toBe('dark');
    });

    it('defaults to light when no background set', () => {
      document.body.style.backgroundColor = '';
      expect(detectTheme()).toBe('light');
    });
  });

  // Errata item 8: additional tests
  describe('follow-up input', () => {
    it('calls buildFollowUp and requestChat on Enter', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, [{ role: 'user', content: 'hi' }]);
      const container = _getBubbleContainer();
      const input = container.shadowRoot.querySelector('.follow-up-input');
      input.disabled = false;
      input.value = 'tell me more';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(global.buildFollowUp).toHaveBeenCalled();
    });
  });

  describe('copy button', () => {
    it('copies response text to clipboard', () => {
      navigator.clipboard = { writeText: vi.fn(() => Promise.resolve()) };
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      const container = _getBubbleContainer();
      container.shadowRoot.querySelector('.copy-btn').click();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts', () => {
    it('closes bubble on Escape key', () => {
      showBubble({ bottom: 100, left: 50, right: 250 }, []);
      expect(_getBubbleContainer()).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(_getBubbleContainer()).toBeNull();
    });
  });

  describe('renderMarkdown XSS', () => {
    it('escapes HTML tags in input', () => {
      const result = renderMarkdown('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('renderMarkdown lists', () => {
    it('renders list items', () => {
      const result = renderMarkdown('- item one\n- item two');
      expect(result).toContain('<li>item one</li>');
    });
  });
});
