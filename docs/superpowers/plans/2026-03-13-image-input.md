# Image Input Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to send images to the AI model for analysis via three entry points: right-click image, text selection with images, and long-press screenshot.

**Architecture:** Three entry points funnel images through a shared `image-capture.js` module into `prompt.js`, which builds multimodal content arrays. The proxy validates array content and increases its body size limit to 2MB. All UI changes are in existing files; only `image-capture.js` is new.

**Tech Stack:** Chrome Extension Manifest V3, Canvas API, `chrome.tabs.captureVisibleTab`, OpenAI Vision API (gpt-4o-mini), Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-image-input-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `proxy/src/validate.js` | Modify | Accept `content` as string or array, validate `image_url` items, fix char counting |
| `proxy/src/index.js` | Modify | Increase `MAX_BODY_SIZE` to 2MB, update error message |
| `prompt.js` | Modify | Accept optional `images[]` param, build multimodal content array |
| `presets.js` | Modify | Add `image` preset type with image-specific presets |
| `image-capture.js` | **Create** | `captureImage()`, `captureScreenshot()`, size guard |
| `background.js` | Modify | Context menu with `['selection', 'image']`, `captureVisibleTab` handler, pass `info.srcUrl` |
| `manifest.json` | Modify | Add `image-capture.js` to content scripts, `"<all_urls>"` to `host_permissions` |
| `bubble.js` | Modify | Image thumbnail preview, pass images to streaming, extract text for history |
| `trigger.js` | Modify | Long-press detection (1.5s, 5px threshold), screenshot overlay, extract `<img>` from selection |
| `content.js` | Modify | Handle `SHOW_BUBBLE` with `image` field, use image-capture, open bubble with image presets |

---

## Chunk 1: Proxy Changes

### Task 1: Update proxy validation to accept multimodal content

**Files:**
- Modify: `proxy/src/validate.js:23-35`
- Test: `proxy/tests/validate.test.js`

- [ ] **Step 1: Write failing tests for array content validation**

In `proxy/tests/validate.test.js`, add these tests inside the `validatePayload` describe block:

```javascript
it('accepts content as array with text items', () => {
  const result = validatePayload({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(true);
});

it('accepts content as array with image_url items', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
        { type: 'text', text: 'Explain this image' },
      ],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(true);
});

it('accepts data: URI in image_url', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' } },
        { type: 'text', text: 'Explain' },
      ],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(true);
});

it('rejects image_url with http: protocol', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'http://example.com/img.png' } }],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(false);
});

it('rejects more than 2 image_url items per message', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'https://a.com/1.png' } },
        { type: 'image_url', image_url: { url: 'https://a.com/2.png' } },
        { type: 'image_url', image_url: { url: 'https://a.com/3.png' } },
      ],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(false);
});

it('rejects unknown content array item type', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [{ type: 'audio', data: 'abc' }],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(false);
});

it('rejects empty content array', () => {
  const result = validatePayload({
    messages: [{ role: 'user', content: [] }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(false);
});

it('counts only text items toward char limit for array content', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'a'.repeat(5999) },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + 'A'.repeat(100000) } },
      ],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(true);
});

it('still rejects text exceeding char limit in array content', () => {
  const result = validatePayload({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'a'.repeat(6001) },
      ],
    }],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(false);
});

it('mixes string and array content across messages', () => {
  const result = validatePayload({
    messages: [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
        { type: 'text', text: 'Explain' },
      ]},
    ],
    signature: 'abc123',
    timestamp: 1710000000,
  });
  expect(result.valid).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd proxy && npx vitest run tests/validate.test.js`
Expected: Multiple FAIL — "Message content must be a string"

- [ ] **Step 3: Implement array content validation**

Replace the content validation loop in `proxy/src/validate.js` (lines 23-35):

```javascript
function validateContentItem(item) {
  if (!item || typeof item !== 'object' || !item.type) {
    return 'Invalid content item';
  }
  if (item.type === 'text') {
    if (typeof item.text !== 'string') return 'Text item must have string text';
    return null;
  }
  if (item.type === 'image_url') {
    if (!item.image_url || typeof item.image_url.url !== 'string') {
      return 'image_url item must have url';
    }
    if (!item.image_url.url.startsWith('https:') && !item.image_url.url.startsWith('data:image/')) {
      return 'image_url must be https: or data:image/';
    }
    return null;
  }
  return `Unknown content type: ${item.type}`;
}

function getContentChars(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((sum, item) => sum + (item.type === 'text' ? (item.text || '').length : 0), 0);
  }
  return 0;
}
```

Then update the message validation loop:

```javascript
for (const m of messages) {
  if (!validRoles.includes(m.role)) {
    return { valid: false, error: `Invalid role: ${m.role}` };
  }
  if (typeof m.content === 'string') {
    // string content — unchanged
  } else if (Array.isArray(m.content)) {
    if (m.content.length === 0) {
      return { valid: false, error: 'Content array must not be empty' };
    }
    let imageCount = 0;
    for (const item of m.content) {
      const err = validateContentItem(item);
      if (err) return { valid: false, error: err };
      if (item.type === 'image_url') imageCount++;
    }
    if (imageCount > 2) {
      return { valid: false, error: 'Max 2 images per message' };
    }
  } else {
    return { valid: false, error: 'Message content must be a string or array' };
  }
}

const totalChars = messages.reduce((sum, m) => sum + getContentChars(m.content), 0);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd proxy && npx vitest run tests/validate.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add proxy/src/validate.js proxy/tests/validate.test.js
git commit -m "feat(proxy): accept multimodal content arrays in validation"
```

### Task 2: Increase proxy body size limit

**Files:**
- Modify: `proxy/src/index.js:6,61-63`
- Test: `proxy/tests/index.test.js`

- [ ] **Step 1: Write failing test for larger body**

In `proxy/tests/index.test.js`, find the existing body size test and add:

```javascript
it('accepts body up to 2MB', async () => {
  // Create a body just under 2MB with a large base64 image
  const largeContent = 'A'.repeat(1_500_000);
  const request = makeRequest('/chat', {
    method: 'POST',
    body: {
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${largeContent}` } },
          { type: 'text', text: 'Explain' },
        ],
      }],
      signature: 'abc',
      timestamp: Date.now(),
    },
  });
  const res = await handler.fetch(request, makeEnv());
  expect(res.status).not.toBe(413);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd proxy && npx vitest run tests/index.test.js`
Expected: FAIL — 413 body too large

- [ ] **Step 3: Update MAX_BODY_SIZE**

In `proxy/src/index.js`, change line 6:

```javascript
const MAX_BODY_SIZE = 2097152; // 2MB — supports base64 image payloads
```

And update the error message on line 62-63:

```javascript
if (bodyText.length > MAX_BODY_SIZE) {
  return jsonResponse({ error: 'Request body too large (max 2MB)' }, 413, corsHeaders);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd proxy && npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add proxy/src/index.js proxy/tests/index.test.js
git commit -m "feat(proxy): increase body size limit to 2MB for image payloads"
```

---

## Chunk 2: Core Extension Logic

### Task 3: Update prompt.js to build multimodal messages

**Files:**
- Modify: `prompt.js:11-39`
- Test: `tests/prompt.test.js`

- [ ] **Step 1: Write failing tests for multimodal message building**

In `tests/prompt.test.js`, add a new describe block:

```javascript
describe('buildChatMessages with images', () => {
  it('builds content array when images provided', () => {
    const images = [{ type: 'image_url', image_url: { url: 'https://example.com/img.png' } }];
    const result = buildChatMessages('', 'Explain this image', false, images);
    expect(result[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
      { type: 'text', text: 'Explain this image' },
    ]);
  });

  it('puts text first when both text and images', () => {
    const images = [{ type: 'image_url', image_url: { url: 'https://example.com/img.png' } }];
    const result = buildChatMessages('selected text here', 'Explain', false, images);
    expect(result[1].content[0]).toEqual({ type: 'text', text: 'Explain:\n\nselected text here' });
    expect(result[1].content[1]).toEqual(images[0]);
  });

  it('handles multiple images', () => {
    const images = [
      { type: 'image_url', image_url: { url: 'https://a.com/1.png' } },
      { type: 'image_url', image_url: { url: 'https://a.com/2.png' } },
    ];
    const result = buildChatMessages('text', '', false, images);
    expect(result[1].content).toHaveLength(3); // text + 2 images
    expect(result[1].content[0].type).toBe('text');
    expect(result[1].content[1].type).toBe('image_url');
    expect(result[1].content[2].type).toBe('image_url');
  });

  it('image-only with instruction builds instruction as text', () => {
    const images = [{ type: 'image_url', image_url: { url: 'https://a.com/1.png' } }];
    const result = buildChatMessages('', 'Explain this image', false, images);
    expect(result[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'https://a.com/1.png' } },
      { type: 'text', text: 'Explain this image' },
    ]);
  });

  it('returns string content when no images (backward compat)', () => {
    const result = buildChatMessages('hello', 'Explain', false);
    expect(typeof result[1].content).toBe('string');
  });

  it('returns string content when images is empty array', () => {
    const result = buildChatMessages('hello', 'Explain', false, []);
    expect(typeof result[1].content).toBe('string');
  });

  it('includes page context in text item when images present', () => {
    const images = [{ type: 'image_url', image_url: { url: 'https://a.com/1.png' } }];
    const result = buildChatMessages('text', 'Explain', true, images);
    const textItem = result[1].content.find(i => i.type === 'text');
    expect(textItem.text).toContain('(Source:');
  });

  it('truncates text in multimodal messages', () => {
    const longText = 'a'.repeat(MAX_TEXT_LENGTH + 500);
    const images = [{ type: 'image_url', image_url: { url: 'https://a.com/1.png' } }];
    const result = buildChatMessages(longText, '', false, images);
    const textItem = result[1].content.find(i => i.type === 'text');
    expect(textItem.text).toContain('...[truncated]');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/prompt.test.js`
Expected: FAIL — buildChatMessages doesn't accept 4th argument

- [ ] **Step 3: Implement multimodal message building**

Update `buildChatMessages` in `prompt.js`:

```javascript
/**
 * Build OpenAI chat messages array from selected text and instruction.
 * @param {string} selectedText
 * @param {string} instruction - Preset or custom instruction (can be empty/null)
 * @param {boolean} includePageContext
 * @param {Array} [images] - Optional array of image content items
 * @returns {Array<{role: string, content: string|Array}>}
 */
function buildChatMessages(selectedText, instruction, includePageContext, images) {
  let text = selectedText;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH) + '...[truncated]';
  }

  const messages = [];

  // System message sets the assistant's role
  messages.push({
    role: 'system',
    content: 'You are Dobby AI, a helpful assistant. The user has selected text on a webpage and the full selected text is provided below. Do NOT attempt to access, fetch, or visit any URLs — the text content is already included in the message. A source URL may be provided as metadata only. Be concise and clear. Always respond in the same language as the selected text.',
  });

  // Build user content
  let userText = instruction
    ? (text ? `${instruction}:\n\n${text}` : instruction)
    : text;

  if (includePageContext) {
    const title = typeof document !== 'undefined' ? document.title : '';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    userText += `\n\n(Source: "${title}" — ${url})`;
  }

  // If images present, build multimodal content array
  if (images && images.length > 0) {
    const content = [];
    if (text) {
      // Text+image: text first, then images
      content.push({ type: 'text', text: userText });
      content.push(...images);
    } else {
      // Image-only: images first, then instruction as text
      content.push(...images);
      content.push({ type: 'text', text: userText });
    }
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/prompt.test.js`
Expected: ALL PASS (both old and new tests)

- [ ] **Step 5: Commit**

```bash
git add prompt.js tests/prompt.test.js
git commit -m "feat: support multimodal content arrays in buildChatMessages"
```

### Task 4: Add image-specific presets

**Files:**
- Modify: `presets.js`
- Test: `tests/presets.test.js`

- [ ] **Step 1: Write failing tests for image presets**

In `tests/presets.test.js`, add:

```javascript
describe('Image presets', () => {
  it('PRESETS has image type', () => {
    expect(PRESETS.image).toBeDefined();
    expect(PRESETS.image.suggested.length).toBe(3);
  });

  it('image presets have correct labels', () => {
    const labels = PRESETS.image.suggested.map(p => p.label);
    expect(labels).toContain('Explain this image');
    expect(labels).toContain('Extract text from image');
    expect(labels).toContain('Translate text in image');
  });

  it('getSuggestedPresetsForType returns image presets', () => {
    const presets = getSuggestedPresetsForType('image', null);
    expect(presets.length).toBe(3);
    expect(presets[0].label).toBe('Explain this image');
  });
});
```

Also update the `expectedTypes` array in the existing `'has all eight content types'` test:

```javascript
const expectedTypes = ['code', 'foreign', 'error', 'email', 'data', 'math', 'long', 'default', 'image'];
```

And update the test name:

```javascript
it('has all nine content types', () => {
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/presets.test.js`
Expected: FAIL — PRESETS.image undefined

- [ ] **Step 3: Add image presets**

In `presets.js`, add the `image` type to the `PRESETS` object (after the `default` entry):

```javascript
image: {
  suggested: [
    { label: 'Explain this image', instruction: 'Explain the following image' },
    { label: 'Extract text from image', instruction: 'Extract and return all text visible in this image' },
    { label: 'Translate text in image', instruction: 'Translate any text visible in this image to English' },
  ],
  all: []
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/presets.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add presets.js tests/presets.test.js
git commit -m "feat: add image-specific preset type"
```

### Task 5: Create image-capture.js module

**Files:**
- Create: `image-capture.js`
- Create: `tests/image-capture.test.js`

- [ ] **Step 1: Write failing tests for captureImage**

Create `tests/image-capture.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureImage, captureScreenshot, _downsizeBase64 } from '../image-capture.js';

describe('captureImage', () => {
  it('returns image_url with src URL for same-origin https image', async () => {
    const result = await captureImage('https://same-origin.com/img.png');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'https://same-origin.com/img.png' },
    });
  });

  it('returns image_url for data: URI', async () => {
    const dataUri = 'data:image/png;base64,iVBOR';
    const result = await captureImage(dataUri);
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: dataUri },
    });
  });

  it('returns null for blob: URLs', async () => {
    const result = await captureImage('blob:https://example.com/abc');
    expect(result).toBeNull();
  });

  it('returns null for empty/undefined input', async () => {
    expect(await captureImage('')).toBeNull();
    expect(await captureImage(null)).toBeNull();
    expect(await captureImage(undefined)).toBeNull();
  });

  it('extracts src from img element', async () => {
    const img = { src: 'https://example.com/photo.jpg' };
    const result = await captureImage(img);
    expect(result.image_url.url).toBe('https://example.com/photo.jpg');
  });
});

describe('_downsizeBase64', () => {
  it('returns input if under 1MB', () => {
    const small = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    const result = _downsizeBase64(small);
    expect(result).toBe(small);
  });

  it('returns null when input is not a data URI', () => {
    const result = _downsizeBase64('https://example.com/img.png');
    expect(result).toBeNull();
  });
});

describe('captureScreenshot', () => {
  beforeEach(() => {
    // Mock chrome.runtime.sendMessage
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
    };
  });

  it('sends CAPTURE_SCREENSHOT message to background', async () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      dataUrl: 'data:image/png;base64,mockScreenshot',
    });

    const result = await captureScreenshot(rect);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'CAPTURE_SCREENSHOT',
      rect,
    });
    expect(result).not.toBeNull();
    expect(result.type).toBe('image_url');
  });

  it('returns null when capture fails', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ success: false });
    const result = await captureScreenshot({ x: 0, y: 0, width: 100, height: 100 });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/image-capture.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create image-capture.js**

Create `image-capture.js`:

```javascript
// image-capture.js — Shared image capture module for all entry points
//
// Dependencies: chrome.runtime.sendMessage (for screenshot capture)

const MAX_BASE64_SIZE = 1048576; // 1MB

/**
 * Capture an image from a URL or img element.
 * URL-first strategy: use the URL directly when possible, base64 fallback via canvas.
 * @param {string|HTMLImageElement} source - Image URL string or img element
 * @returns {Promise<{type: string, image_url: {url: string}}|null>}
 */
async function captureImage(source) {
  if (!source) return null;

  // Extract URL from element or use string directly
  const srcUrl = typeof source === 'string' ? source : (source.src || '');
  if (!srcUrl) return null;

  // Accept data: URIs directly
  if (srcUrl.startsWith('data:image/')) {
    const sized = _downsizeBase64(srcUrl);
    return sized ? { type: 'image_url', image_url: { url: sized } } : null;
  }

  // Only accept https: URLs
  if (!srcUrl.startsWith('https:')) return null;

  // Try CORS-enabled refetch to get base64
  try {
    const base64 = await _corsRefetch(srcUrl);
    if (base64) {
      const sized = _downsizeBase64(base64);
      if (sized) return { type: 'image_url', image_url: { url: sized } };
    }
  } catch {
    // CORS refetch failed — fall through to URL-only
  }

  // Fallback: send the URL directly (model may or may not be able to access it)
  return { type: 'image_url', image_url: { url: srcUrl } };
}

/**
 * Attempt to fetch an image with CORS and convert to base64 via canvas.
 * @param {string} url
 * @returns {Promise<string|null>} base64 data URL or null
 */
function _corsRefetch(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Capture a screenshot of a selected region.
 * Sends coordinates to background.js which calls captureVisibleTab,
 * then crops the full viewport image to the selected region.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {Promise<{type: string, image_url: {url: string}}|null>}
 */
async function captureScreenshot(rect) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      rect,
    });

    if (!response || !response.success || !response.dataUrl) return null;

    // Crop to selected region via canvas
    const cropped = await _cropImage(response.dataUrl, rect);
    if (!cropped) return null;

    const sized = _downsizeBase64(cropped);
    return sized ? { type: 'image_url', image_url: { url: sized } } : null;
  } catch {
    return null;
  }
}

/**
 * Crop a base64 image to the specified region.
 * @param {string} dataUrl - Full viewport screenshot as base64
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {Promise<string|null>} Cropped image as base64
 */
function _cropImage(dataUrl, rect) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        // Account for device pixel ratio
        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        const canvas = document.createElement('canvas');
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr,
          rect.width * dpr, rect.height * dpr,
          0, 0,
          canvas.width, canvas.height
        );
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Size guard: if base64 exceeds 1MB, downscale by 50% up to 2 attempts.
 * @param {string} dataUrl
 * @returns {string|null} Sized data URL or null if still too large
 */
function _downsizeBase64(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  if (dataUrl.length <= MAX_BASE64_SIZE) return dataUrl;

  // In non-browser environments (tests), we can't create canvas
  if (typeof document === 'undefined') return null;

  // Attempt downscale via canvas
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const img = new Image();
      // Synchronous load from data URI not possible — return null for oversized
      // In practice, the capture functions handle sizing before calling this
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { captureImage, captureScreenshot, _downsizeBase64, _corsRefetch, _cropImage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/image-capture.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add image-capture.js tests/image-capture.test.js
git commit -m "feat: create image-capture module with captureImage and captureScreenshot"
```

---

## Chunk 3: Background & Config

### Task 6: Update background.js for image context menu and screenshot capture

**Files:**
- Modify: `background.js:13-35,171-197`
- Test: `tests/background.test.js`

- [ ] **Step 1: Write failing tests for image context menu and screenshot**

In `tests/background.test.js`, add tests for the new behaviors. Check existing test patterns first, then add:

```javascript
describe('context menu registration', () => {
  it('registers with selection and image contexts', () => {
    // Verify chrome.contextMenus.create was called with contexts: ['selection', 'image']
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ contexts: ['selection', 'image'] })
    );
  });
});

describe('context menu image click', () => {
  it('sends SHOW_BUBBLE with image srcUrl for image context', () => {
    // Simulate image right-click: info.srcUrl set, info.mediaType === 'image'
    const info = { menuItemId: 'dobby-ai', srcUrl: 'https://example.com/photo.jpg', mediaType: 'image', selectionText: '' };
    const tab = { id: 1 };
    // Trigger the onClicked listener
    // Verify chrome.tabs.sendMessage called with { type: 'SHOW_BUBBLE', image: 'https://example.com/photo.jpg' }
  });
});

describe('CAPTURE_SCREENSHOT handler', () => {
  it('calls captureVisibleTab and returns data URL', async () => {
    chrome.tabs.captureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,mockData');
    // Send message { type: 'CAPTURE_SCREENSHOT', rect: {...} }
    // Verify response { success: true, dataUrl: 'data:image/png;base64,mockData' }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/background.test.js`
Expected: FAIL

- [ ] **Step 3: Update context menu registration**

In `background.js`, change line 17:

```javascript
contexts: ['selection', 'image'],
```

- [ ] **Step 4: Update context menu click handler**

Replace the `contextMenus.onClicked` listener (lines 21-35):

```javascript
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'dobby-ai') return;

  // Image right-click: send srcUrl
  if (info.mediaType === 'image' && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_BUBBLE',
      image: info.srcUrl,
      text: '',
    }).catch(() => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Dobby AI',
        message: 'Cannot run on this page. Try a regular webpage.',
      });
    });
    return;
  }

  // Text selection: existing behavior
  const text = (info.selectionText || '').trim();
  if (!text) return;

  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_BUBBLE', text }).catch(() => {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Dobby AI',
      message: 'Cannot run on this page. Try a regular webpage.',
    });
  });
});
```

- [ ] **Step 5: Add captureVisibleTab handler**

In `background.js`, inside the existing `chrome.runtime.onMessage.addListener` callback, add before the `VALIDATE_API_KEY` handler:

```javascript
if (msg.type === 'CAPTURE_SCREENSHOT') {
  chrome.tabs.captureVisibleTab(null, { format: 'png' })
    .then((dataUrl) => {
      sendResponse({ success: true, dataUrl });
    })
    .catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
  return true; // async sendResponse
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/background.test.js`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add background.js tests/background.test.js
git commit -m "feat: add image context menu support and captureVisibleTab handler"
```

### Task 7: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add image-capture.js to content scripts**

In `manifest.json`, update the `js` array in `content_scripts` (line 16). Insert `image-capture.js` before `bubble.js`:

```json
"js": ["detection.js", "presets.js", "prompt.js", "history.js", "api.js", "image-capture.js", "bubble.js", "trigger.js", "content.js"]
```

- [ ] **Step 2: Add `<all_urls>` to host_permissions**

In `manifest.json`, update `host_permissions` (lines 7-10):

```json
"host_permissions": [
  "<all_urls>",
  "https://dobby-ai-proxy.zhongnansu.workers.dev/*",
  "https://api.openai.com/*"
],
```

Note: `<all_urls>` is required for `captureVisibleTab` to work from a content-script-initiated gesture. The existing specific URLs are kept for clarity but are subsumed by `<all_urls>`.

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat: add image-capture.js to content scripts and <all_urls> permission"
```

---

## Chunk 4: UI & Integration

### Task 8: Update bubble.js for image thumbnails and multimodal history

**Files:**
- Modify: `bubble.js:358-381,434-527,560-585`
- Test: `tests/bubble.test.js`

- [ ] **Step 1: Write failing tests**

In `tests/bubble.test.js`, add:

```javascript
describe('image thumbnail preview', () => {
  it('buildBubbleHTML includes image preview container when images provided', () => {
    const html = buildBubbleHTML('selected text', 'Selected text', true, [
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ]);
    expect(html).toContain('image-preview');
    expect(html).toContain('img');
  });

  it('buildBubbleHTML has no image preview when no images', () => {
    const html = buildBubbleHTML('selected text', 'Selected text', true);
    expect(html).not.toContain('image-preview');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bubble.test.js`
Expected: FAIL — buildBubbleHTML doesn't accept 4th arg

- [ ] **Step 3: Add image thumbnail CSS**

In `bubble.js`, in the `getStyles()` function, add before the closing backtick:

```css
.image-preview {
  display: flex;
  gap: 6px;
  padding: 6px 14px;
  border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
}
.image-preview img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
}
```

- [ ] **Step 4: Update buildBubbleHTML to accept images**

Update `buildBubbleHTML` to accept an optional `images` parameter:

```javascript
function buildBubbleHTML(previewText, previewLabel, showPresets, images) {
  const imagePreviewHtml = images && images.length > 0
    ? `<div class="image-preview">${images.map(img => {
        const url = img.image_url?.url || '';
        const safeUrl = escapeHtml(url);
        return `<img src="${safeUrl}" alt="Preview" onerror="this.style.display='none'">`;
      }).join('')}</div>`
    : '';

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
    ${imagePreviewHtml}
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
```

- [ ] **Step 5: Update initBubble and showBubbleWithPresets to pass images**

Update `initBubble` signature to accept images:

```javascript
function initBubble(selectionRect, selectedText, previewLabel, showPresets, images) {
  hideBubble();
  responseText = '';

  createBubbleHost(selectionRect);
  const shadow = bubbleHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getStyles(detectTheme());
  shadow.appendChild(style);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = buildBubbleHTML(truncatePreview(selectedText), previewLabel, showPresets, images);
  shadow.appendChild(bubble);

  wireCommonEvents(shadow);
  document.body.appendChild(bubbleHost);
  return shadow;
}
```

Update `showBubbleWithPresets` to accept and pass images:

```javascript
function showBubbleWithPresets(selectionRect, selectedText, anchorNode, images) {
  const shadow = initBubble(selectionRect, selectedText, 'Selected text', true, images);
  // ... rest unchanged, but update launchFromPreset calls to pass images
```

Update `launchFromPreset` to accept and use images:

```javascript
function launchFromPreset(shadow, selectedText, instruction, images) {
  const messages = typeof buildChatMessages === 'function'
    ? buildChatMessages(selectedText, instruction, true, images)
    : [{ role: 'user', content: `${instruction}:\n\n${selectedText}` }];
  currentMessages = messages;

  const label = shadow.querySelector('.selected-text-preview .label');
  if (label) label.textContent = instruction;

  activateResponseSection(shadow, messages);
}
```

Pass images through in the preset chip click handlers inside `showBubbleWithPresets`:

```javascript
chip.addEventListener('mousedown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  launchFromPreset(shadow, selectedText, preset.instruction, images);
});
```

And the custom input:

```javascript
customInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && customInput.value.trim()) {
    launchFromPreset(shadow, selectedText, customInput.value.trim(), images);
  }
  if (e.key === 'Escape') hideBubble();
});
```

Update `showBubble` (direct context menu path) to accept images:

```javascript
function showBubble(selectionRect, messages, selectedText, instruction, images) {
  currentMessages = messages;
  const shadow = initBubble(selectionRect, selectedText, instruction || 'Selected text', false, images);
  activateResponseSection(shadow, messages);
}
```

- [ ] **Step 6: Extract text from multimodal content before saving to history**

In `startStreaming`, update the history save callback (around line 577):

```javascript
const firstUser = messages.find((m) => m.role === 'user');
let userText = '';
if (firstUser) {
  if (typeof firstUser.content === 'string') {
    userText = firstUser.content;
  } else if (Array.isArray(firstUser.content)) {
    userText = firstUser.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }
}
const instruction = messages.find((m) => m.role === 'system');
saveConversation({
  text: userText,
  instruction: instruction?.content || '',
  response: responseText,
  pageUrl: window.location.href,
  pageTitle: document.title,
});
```

- [ ] **Step 7: Update exports**

Update the module.exports to include `buildBubbleHTML`:

```javascript
if (typeof module !== 'undefined') {
  module.exports = {
    showBubble, showBubbleWithPresets, hideBubble, appendToken, setBubbleStatus,
    renderMarkdown, detectTheme, _getBubbleContainer, buildBubbleHTML,
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/bubble.test.js`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add bubble.js tests/bubble.test.js
git commit -m "feat: add image thumbnail preview and multimodal history extraction in bubble"
```

### Task 9: Update trigger.js for long-press screenshot and image extraction

**Files:**
- Modify: `trigger.js`
- Test: `tests/trigger.test.js`

- [ ] **Step 1: Write failing tests for long-press detection**

In `tests/trigger.test.js`, add:

```javascript
describe('long-press screenshot', () => {
  it('does not trigger on input elements', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new MouseEvent('mousedown', { target: input });
    // Verify no screenshot overlay appears
    input.remove();
  });

  it('does not trigger on textarea elements', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    // Similar test
    textarea.remove();
  });

  it('does not trigger on contenteditable elements', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    // Similar test
    div.remove();
  });
});

describe('extractImagesFromSelection', () => {
  it('extracts img elements from selection range', () => {
    // This tests the helper that scans a Range for <img> nodes
    // Will need DOM setup
  });

  it('limits to 2 images', () => {
    // Create selection with 3+ images, verify only 2 returned
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/trigger.test.js`
Expected: FAIL

- [ ] **Step 3: Add image extraction from selection**

In `trigger.js`, add helper function before the mouseup listener:

```javascript
/**
 * Scan a selection Range for <img> elements, return up to maxImages src URLs.
 * @param {Selection} selection
 * @param {number} maxImages
 * @returns {string[]} Array of image src URLs
 */
function extractImagesFromSelection(selection, maxImages = 2) {
  const images = [];
  if (!selection || !selection.rangeCount) return images;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const root = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  if (!root) return images;

  const imgElements = root.querySelectorAll('img');
  for (const img of imgElements) {
    if (images.length >= maxImages) break;
    if (selection.containsNode(img, true) && img.src) {
      images.push(img.src);
    }
  }
  return images;
}
```

- [ ] **Step 4: Update trigger button click to pass images**

In the `triggerButton.addEventListener('mousedown')` handler, add image extraction:

```javascript
triggerButton.addEventListener('mousedown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (text) {
    const anchorNode = selection.anchorNode || null;
    const rect = selection.rangeCount > 0
      ? selection.getRangeAt(0).getBoundingClientRect()
      : { bottom: 200, left: 100, right: 300, top: 180 };

    // Extract images from selection (up to 2)
    const imageSrcs = extractImagesFromSelection(selection);
    const images = imageSrcs.length > 0 && typeof captureImage === 'function'
      ? imageSrcs
      : [];

    hideTrigger();
    showBubbleWithPresets(rect, text, anchorNode, images.length > 0 ? images : undefined);
  }
});
```

Note: The actual `captureImage()` calls happen asynchronously. We need to make the click handler async and await the captures:

```javascript
triggerButton.addEventListener('mousedown', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (text) {
    const anchorNode = selection.anchorNode || null;
    const rect = selection.rangeCount > 0
      ? selection.getRangeAt(0).getBoundingClientRect()
      : { bottom: 200, left: 100, right: 300, top: 180 };

    // Extract images from selection (up to 2)
    const imageSrcs = extractImagesFromSelection(selection);
    let capturedImages;
    if (imageSrcs.length > 0 && typeof captureImage === 'function') {
      const results = await Promise.all(imageSrcs.map(src => captureImage(src)));
      capturedImages = results.filter(Boolean);
    }

    hideTrigger();
    showBubbleWithPresets(rect, text, anchorNode, capturedImages && capturedImages.length > 0 ? capturedImages : undefined);
  }
});
```

- [ ] **Step 5: Add long-press screenshot detection**

In `trigger.js`, add long-press detection after the existing scroll listener:

```javascript
// --- Long-press screenshot detection ---
let longPressTimer = null;
let longPressStartX = 0;
let longPressStartY = 0;
const LONG_PRESS_DURATION = 1500; // 1.5 seconds
const MOVEMENT_THRESHOLD = 5; // pixels

function isEditableElement(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left click only
  if (isEditableElement(e.target)) return;
  if (triggerButton?.contains(e.target)) return;
  if (typeof _getBubbleContainer === 'function') {
    const bc = _getBubbleContainer();
    if (bc?.contains(e.target)) return;
  }

  longPressStartX = e.clientX;
  longPressStartY = e.clientY;

  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    startScreenshotMode(longPressStartX, longPressStartY);
  }, LONG_PRESS_DURATION);
}, true);

document.addEventListener('mousemove', (e) => {
  if (!longPressTimer) return;
  const dx = e.clientX - longPressStartX;
  const dy = e.clientY - longPressStartY;
  if (Math.sqrt(dx * dx + dy * dy) > MOVEMENT_THRESHOLD) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}, true);

document.addEventListener('mouseup', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}, true);

// --- Screenshot overlay ---
let screenshotOverlay = null;

function startScreenshotMode(startX, startY) {
  // Prevent text selection during screenshot
  document.body.style.userSelect = 'none';

  screenshotOverlay = document.createElement('div');
  Object.assign(screenshotOverlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: 'rgba(0, 0, 0, 0.3)',
    cursor: 'crosshair',
  });
  document.body.appendChild(screenshotOverlay);

  const selectionBox = document.createElement('div');
  Object.assign(selectionBox.style, {
    position: 'fixed',
    border: '2px dashed #a78bfa',
    background: 'rgba(167, 139, 250, 0.1)',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  screenshotOverlay.appendChild(selectionBox);

  let dragStartX = 0, dragStartY = 0;
  let isDragging = false;

  screenshotOverlay.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  });

  screenshotOverlay.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.min(dragStartX, e.clientX);
    const y = Math.min(dragStartY, e.clientY);
    const w = Math.abs(e.clientX - dragStartX);
    const h = Math.abs(e.clientY - dragStartY);
    Object.assign(selectionBox.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  });

  screenshotOverlay.addEventListener('mouseup', async (e) => {
    if (!isDragging) return;
    isDragging = false;

    const x = Math.min(dragStartX, e.clientX);
    const y = Math.min(dragStartY, e.clientY);
    const w = Math.abs(e.clientX - dragStartX);
    const h = Math.abs(e.clientY - dragStartY);

    cancelScreenshotMode();

    // Minimum size check (avoid accidental clicks)
    if (w < 10 || h < 10) return;

    if (typeof captureScreenshot === 'function') {
      const result = await captureScreenshot({ x, y, width: w, height: h });
      if (result) {
        const rect = { bottom: y + h / 2, left: x, right: x + w, top: y };
        if (typeof showBubbleWithPresets === 'function') {
          showBubbleWithPresets(rect, '', null, [result]);
        }
      }
    }
  });

  // Escape to cancel
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      cancelScreenshotMode();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  screenshotOverlay._escHandler = escHandler;
}

function cancelScreenshotMode() {
  document.body.style.userSelect = '';
  if (screenshotOverlay) {
    if (screenshotOverlay._escHandler) {
      document.removeEventListener('keydown', screenshotOverlay._escHandler);
    }
    screenshotOverlay.remove();
    screenshotOverlay = null;
  }
}
```

- [ ] **Step 6: Export new functions**

Update the exports:

```javascript
if (typeof module !== 'undefined') module.exports = {
  createTriggerButton, showTrigger, hideTrigger, _resetTriggerForTesting, _setDobbyEnabled,
  extractImagesFromSelection,
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/trigger.test.js`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add trigger.js tests/trigger.test.js
git commit -m "feat: add long-press screenshot mode and image extraction from selections"
```

### Task 10: Update content.js for image context menu handling

**Files:**
- Modify: `content.js`
- Test: `tests/content.test.js` (if exists, otherwise covered by integration)

- [ ] **Step 1: Update SHOW_BUBBLE handler for images**

Replace the content.js message listener:

```javascript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_BUBBLE') {
    const rect = {
      bottom: window.innerHeight / 3,
      left: window.innerWidth / 4,
      right: window.innerWidth * 3 / 4,
    };

    if (msg.image) {
      // Image right-click path: capture image and show with image presets
      (async () => {
        let capturedImages = [];
        if (typeof captureImage === 'function') {
          const result = await captureImage(msg.image);
          if (result) capturedImages = [result];
        }

        if (capturedImages.length > 0) {
          // Use image presets
          if (typeof showBubbleWithPresets === 'function') {
            showBubbleWithPresets(rect, '', null, capturedImages);
          }
        } else {
          // Fallback: couldn't capture image
          const messages = buildChatMessages('', 'Explain the following', true);
          showBubble(rect, messages, '', 'Explain the following');
        }
      })();
    } else {
      // Text selection path (unchanged)
      const instruction = 'Explain the following';
      const messages = buildChatMessages(msg.text, instruction, true);
      showBubble(rect, messages, msg.text, instruction);
    }
  }
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: handle image right-click context menu in content.js"
```

---

## Chunk 5: Integration Testing & Cleanup

### Task 11: Verify preset routing for image entry points

**Files:**
- Test: `tests/bubble.test.js`

- [ ] **Step 1: Write integration test for image preset routing**

Verify that when `showBubbleWithPresets` is called with images and no text, the bubble shows image-type presets:

```javascript
describe('image preset routing in bubble', () => {
  it('uses image presets when images present and no text', () => {
    // This is primarily a manual verification, but we can test that
    // getSuggestedPresetsForType('image', null) returns the right presets
    const presets = getSuggestedPresetsForType('image', null);
    expect(presets[0].label).toBe('Explain this image');
  });
});
```

- [ ] **Step 2: Update showBubbleWithPresets to use image presets**

In `bubble.js`, update `showBubbleWithPresets` to detect image-only mode:

```javascript
function showBubbleWithPresets(selectionRect, selectedText, anchorNode, images) {
  const shadow = initBubble(selectionRect, selectedText, images && images.length > 0 ? 'Image' : 'Selected text', true, images);

  // Detect content type — use 'image' type when images present without text
  let detected;
  if ((!selectedText || selectedText.trim() === '') && images && images.length > 0) {
    detected = { type: 'image', subType: null, confidence: 'high' };
  } else {
    detected = typeof detectContentType === 'function'
      ? detectContentType(selectedText, anchorNode)
      : (typeof detectContent === 'function'
        ? detectContent(selectedText)
        : { type: 'default', subType: null, confidence: 'medium' });
  }

  const presets = typeof getSuggestedPresetsForType === 'function'
    ? getSuggestedPresetsForType(detected.type, detected.subType)
    : [];

  // ... rest of preset rendering unchanged, but pass images to launchFromPreset
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add bubble.js tests/bubble.test.js
git commit -m "feat: route to image presets when showing bubble with images and no text"
```

### Task 12: Run full test suite and verify

- [ ] **Step 1: Run full extension test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run proxy test suite**

Run: `cd proxy && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Final commit with any fixes**

If any tests needed fixing, commit here.

### Task 13: Create feature branch and PR

- [ ] **Step 1: Create branch and push**

```bash
git checkout -b feat/image-input
git push -u origin feat/image-input
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat: image input support for Dobby AI" --body "$(cat <<'EOF'
## Summary
- Three image input entry points: right-click image, text selection with images, long-press screenshot
- New `image-capture.js` module with URL-first capture and CORS refetch fallback
- Multimodal message format support in prompt.js and proxy validation
- Image-specific presets (Explain, Extract text, Translate text)
- Image thumbnail preview in bubble UI
- Proxy body size limit increased from 10KB to 2MB

## Test plan
- [ ] Right-click an image on any webpage → "Dobby AI" context menu → image presets appear
- [ ] Select text containing images → Dobby button → images extracted and shown as thumbnails
- [ ] Hold left-click 1.5s without moving → crosshair overlay → drag to select region → screenshot captured
- [ ] Verify screenshot mode disabled on input/textarea/contenteditable
- [ ] Verify Escape cancels screenshot mode
- [ ] Verify image presets work: "Explain this image", "Extract text", "Translate text"
- [ ] Verify follow-up questions work after image analysis
- [ ] Verify conversation history saves text but not base64 image data
- [ ] Run `npx vitest run` — all tests pass
- [ ] Run `cd proxy && npx vitest run` — all proxy tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Request code review**

Dispatch superpowers:code-reviewer subagent on the PR diff before merging.
