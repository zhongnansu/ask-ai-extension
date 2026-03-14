// tests/image-capture.test.js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

// Mock chrome.runtime.sendMessage for captureScreenshot
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
  },
};

// Mock window.devicePixelRatio
Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });

// Patch HTMLImageElement.prototype.src so load/error events actually fire.
// jsdom doesn't fire these for network URLs, causing timeouts.
const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
beforeAll(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(url) {
      originalSrcDescriptor.set.call(this, url);
      if (url && url.startsWith('data:')) {
        // Simulate successful load for data: URLs
        Object.defineProperty(this, 'naturalWidth', { value: 100, configurable: true });
        Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
      } else {
        // Simulate error for network URLs
        setTimeout(() => { if (this.onerror) this.onerror(); }, 0);
      }
    },
    get() {
      return originalSrcDescriptor.get.call(this);
    },
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'src', originalSrcDescriptor);
});

const { captureImage, captureScreenshot, _downsizeBase64, _corsRefetch } = await import('../image-capture.js');

describe('captureImage', () => {
  it('returns null for empty string', async () => {
    expect(await captureImage('')).toBeNull();
  });

  it('returns null for null input', async () => {
    expect(await captureImage(null)).toBeNull();
  });

  it('returns null for undefined input', async () => {
    expect(await captureImage(undefined)).toBeNull();
  });

  it('returns image_url object for https URL', async () => {
    // Cross-origin in jsdom → _corsRefetch fails → falls back to URL directly
    const result = await captureImage('https://example.com/photo.jpg');
    expect(result).not.toBeNull();
    expect(result.type).toBe('image_url');
    expect(result.image_url.url).toBe('https://example.com/photo.jpg');
  });

  it('returns null for blob: URL', async () => {
    const result = await captureImage('blob:https://example.com/abc-123');
    expect(result).toBeNull();
  });

  it('returns null for http: URL (non-https)', async () => {
    const result = await captureImage('http://example.com/photo.jpg');
    expect(result).toBeNull();
  });

  it('handles data:image/ URL input', async () => {
    const small = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    const result = await captureImage(small);
    expect(result).not.toBeNull();
    expect(result.type).toBe('image_url');
    expect(result.image_url.url).toBe(small);
  });

  it('accepts an img element with src', async () => {
    const img = document.createElement('img');
    img.src = 'https://example.com/test.png';
    const result = await captureImage(img);
    expect(result).not.toBeNull();
    expect(result.type).toBe('image_url');
  });

  it('returns null for img element without src', async () => {
    const img = document.createElement('img');
    const result = await captureImage(img);
    expect(result).toBeNull();
  });
});

describe('captureScreenshot', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage.mockReset();
  });

  it('returns null when sendMessage returns no dataUrl', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ error: 'failed' });
    const result = await captureScreenshot({ x: 0, y: 0, width: 100, height: 100 });
    expect(result).toBeNull();
  });

  it('returns null when sendMessage throws', async () => {
    chrome.runtime.sendMessage.mockRejectedValue(new Error('no handler'));
    const result = await captureScreenshot({ x: 0, y: 0, width: 100, height: 100 });
    expect(result).toBeNull();
  });

  it('sends CAPTURE_SCREENSHOT message', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ error: 'failed' });
    await captureScreenshot({ x: 0, y: 0, width: 100, height: 100 });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_SCREENSHOT' });
  });
});

describe('_downsizeBase64', () => {
  it('returns input unchanged when under 1MB', async () => {
    const small = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    const result = await _downsizeBase64(small);
    expect(result).toBe(small);
  });
});

describe('_corsRefetch', () => {
  it('returns null when image fails to load', async () => {
    const result = await _corsRefetch('https://nonexistent.example.com/img.png');
    expect(result).toBeNull();
  });
});
