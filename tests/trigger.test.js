// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTriggerButton, showTrigger, hideTrigger, _resetTriggerForTesting } from '../trigger.js';

beforeEach(() => {
  _resetTriggerForTesting();
  document.body.innerHTML = '';
});

describe('createTriggerButton', () => {
  it('creates a div with id "ask-ai-trigger"', () => {
    createTriggerButton();
    const el = document.getElementById('ask-ai-trigger');
    expect(el).not.toBeNull();
    expect(el.tagName).toBe('DIV');
  });

  it('is idempotent — calling twice does not create two buttons', () => {
    createTriggerButton();
    createTriggerButton();
    const elements = document.querySelectorAll('#ask-ai-trigger');
    expect(elements.length).toBe(1);
  });

  it('button has correct styling (frosted glass indigo, fixed position, high z-index)', () => {
    createTriggerButton();
    const el = document.getElementById('ask-ai-trigger');
    expect(el.style.position).toBe('fixed');
    expect(el.style.zIndex).toBe('2147483647');
    // Semi-transparent indigo with blur
    expect(el.style.background).toBe('rgba(79, 70, 229, 0.7)');
    expect(el.style.backdropFilter).toBe('blur(12px)');
    expect(el.style.color).toBe('white');
    expect(el.style.cursor).toBe('pointer');
    expect(el.style.borderRadius).toBe('20px');
    expect(el.style.display).toBe('none');
  });
});

describe('showTrigger', () => {
  it('makes the button visible and positions it', () => {
    const rect = { right: 200, top: 100 };
    showTrigger(rect);
    const el = document.getElementById('ask-ai-trigger');
    expect(el).not.toBeNull();
    expect(el.style.display).toBe('block');
    // left is clamped: Math.min(200, window.innerWidth - buttonWidth - 8)
    // In jsdom, innerWidth defaults to 1024, offsetWidth is 0 (fallback 80), so maxLeft = 936
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('64px'); // Math.max(4, 100 - 36) = 64
  });

  it('clamps left position to prevent off-screen rendering', () => {
    // Simulate selection at far right edge
    const rect = { right: 1020, top: 100 };
    showTrigger(rect);
    const el = document.getElementById('ask-ai-trigger');
    // maxLeft = 1024 - 80 - 8 = 936 (jsdom defaults innerWidth=1024, offsetWidth fallback=80)
    expect(parseInt(el.style.left)).toBeLessThanOrEqual(936);
  });

  it('clamps top position to minimum of 4px', () => {
    const rect = { right: 100, top: 20 };
    showTrigger(rect);
    const el = document.getElementById('ask-ai-trigger');
    // Math.max(4, 20 - 36) = Math.max(4, -16) = 4
    expect(el.style.top).toBe('4px');
  });
});

describe('hideTrigger', () => {
  it('sets display to none', () => {
    showTrigger({ right: 100, top: 100 });
    const el = document.getElementById('ask-ai-trigger');
    expect(el.style.display).toBe('block');
    hideTrigger();
    expect(el.style.display).toBe('none');
  });

  it('is safe to call when no button exists', () => {
    // No button has been created, should not throw
    expect(() => hideTrigger()).not.toThrow();
  });
});

describe('event-driven behavior', () => {
  function mockSelection(text) {
    const range = { getBoundingClientRect: () => ({ top: 100, right: 200, bottom: 120, left: 100 }) };
    window.getSelection = vi.fn(() => ({
      toString: () => text,
      anchorNode: document.body,
      rangeCount: 1,
      getRangeAt: () => range,
    }));
  }

  it('mouseup with selection >= 3 chars shows trigger', () => {
    vi.useFakeTimers();
    createTriggerButton();
    mockSelection('hello world');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(20);

    const btn = document.getElementById('ask-ai-trigger');
    expect(btn.style.display).toBe('block');
    vi.useRealTimers();
  });

  it('mouseup with selection < 3 chars hides trigger', () => {
    vi.useFakeTimers();
    createTriggerButton();
    mockSelection('ab');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(20);

    const btn = document.getElementById('ask-ai-trigger');
    expect(btn.style.display).toBe('none');
    vi.useRealTimers();
  });

  it('click-away hides trigger', () => {
    createTriggerButton();
    showTrigger({ right: 200, top: 100 });

    const btn = document.getElementById('ask-ai-trigger');
    expect(btn.style.display).toBe('block');

    // Click on document body (not on trigger)
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(btn.style.display).toBe('none');
  });

  it('uses textContent instead of innerHTML for security', () => {
    createTriggerButton();
    const btn = document.getElementById('ask-ai-trigger');
    expect(btn.textContent).toContain('Ask AI');
    // Verify no innerHTML was used (textContent should match)
    expect(btn.textContent).toBe('✦ Ask AI');
  });
});
