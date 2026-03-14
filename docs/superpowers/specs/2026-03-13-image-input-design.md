# Image Input for Dobby AI

Users can send images to the model for analysis through three entry points, all reusing existing UI patterns.

## Entry Points

### 1. Right-Click Image

User right-clicks an image on any web page and selects "Dobby AI" from the context menu.

- `background.js` registers context menu with `contexts: ['selection', 'image']` (updated from `['selection']` only)
- On image context click, `background.js` receives `info.srcUrl` and sends `{type: 'SHOW_BUBBLE', image: info.srcUrl}` to the content script
- `content.js` receives the message, captures the image via `image-capture.js` (URL-first, base64 fallback)
- Opens bubble with image-specific presets: "Explain this image," "Extract text from image," "Translate text in image," plus custom input
- Image thumbnail shown in the bubble preview area

### 2. Text Selection with Images

User selects text that contains images and clicks the Dobby floating button.

- `trigger.js` scans the selection `Range` for `<img>` nodes
- Captures up to 2 images via `image-capture.js`
- Passes both text and images to `bubble.js`
- Bubble shows the existing text-based presets (text is primary content)
- Image thumbnails shown alongside the text preview

### 3. Long-Press Screenshot

User holds left-click for 1.5 seconds without moving the cursor (movement threshold: 5px).

- `trigger.js` detects the long-press via `mousedown` timer + 5px movement threshold
- Disabled on text input fields, textareas, and contenteditable elements to avoid conflicts with click-to-position-cursor
- Semi-transparent dark overlay appears with crosshair cursor
- User drags to select a rectangular region
- On mouseup: sends region coordinates to `background.js`
- `background.js` calls `chrome.tabs.captureVisibleTab({format: "png"})`
- Returns full viewport as base64 to content script
- Content script crops to selected region via canvas, exports as JPEG
- Opens bubble with image-specific presets + screenshot preview
- Escape key cancels screenshot mode

**Permission note:** `captureVisibleTab` requires a qualifying user gesture. Since the long-press is detected in the content script (not a browser-level gesture like a context menu click), `activeTab` alone may not grant capture rights. Solution: add `"<all_urls>"` to `host_permissions` in manifest.json. This is acceptable since the extension already has `activeTab` and needs broad page access for content scripts.

## Image Capture Module

New file: `image-capture.js` — shared by all three entry points.

### `captureImage(imgElement | srcUrl)`

For right-click and selection entry points:

1. Read the image's `src` URL
2. If `https:` and same-origin, use the URL directly (smallest payload)
3. If cross-origin, attempt CORS-enabled refetch: create a new `Image()` with `crossOrigin = "anonymous"`, set `src` to the same URL, wait for load, draw to canvas, export as `dataURL("image/jpeg", 0.8)`
4. If CORS refetch fails (server doesn't send CORS headers), send the original `https:` URL directly — the model may or may not be able to access it, but it's the best available option
5. Returns `{type: "image_url", image_url: {url: "..."}}`

### `captureScreenshot(rect)`

For long-press entry point:

1. Send region coordinates to background.js via `chrome.runtime.sendMessage`
2. Background calls `chrome.tabs.captureVisibleTab({format: "png"})`
3. Returns base64 of full viewport to content script
4. Content script creates canvas sized to selection rect, draws cropped region, exports as JPEG base64
5. Returns same format as `captureImage`

### Size Guard

If base64 exceeds 1MB after conversion, downscale the image (reduce canvas dimensions by 50%) and re-export. Cap at 2 attempts. If still too large, return an error.

## Message Format

Text-only messages remain unchanged (content as string). When images are present, content becomes an array:

```json
{
  "role": "user",
  "content": [
    {"type": "image_url", "image_url": {"url": "https://example.com/img.png"}},
    {"type": "text", "text": "Explain this image"}
  ]
}
```

For text+image selections, text comes first:

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "selected text content here"},
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}},
    {"type": "image_url", "image_url": {"url": "https://example.com/second.png"}}
  ]
}
```

## Proxy Changes

### Body Size Limit

`proxy/src/index.js` currently enforces `MAX_BODY_SIZE = 10240` (10KB). Base64-encoded images can be hundreds of KB to over 1MB. Increase to `MAX_BODY_SIZE = 2097152` (2MB) to accommodate image payloads.

### Validation

`proxy/src/validate.js` currently requires `message.content` to be a string. Updated rules:

- Accept `content` as `string` or `Array`
- When array, each item must be one of:
  - `{type: "text", text: "..."}` — text must be a string
  - `{type: "image_url", image_url: {url: "..."}}` — url must start with `https:` or `data:image/`
- Max 2 `image_url` items per message
- Character counting: only count `text` items toward the 6000 char limit; `content.length` on an array returns item count not char count, so iterate and sum only text items
- HMAC signature computation is unchanged — `JSON.stringify(messages)` serializes the full structure including arrays

### Model

`gpt-4o-mini` supports vision inputs. No model change needed. Image inputs cost more tokens than text (an image is ~85-170 tokens depending on size via OpenAI's "low" detail mode). The current `max_tokens: 1000` is adequate for image analysis responses.

No changes to rate limiting or SSE relay.

## UI Changes

### Image-Specific Presets

New preset set in `presets.js` for image-only inputs:

- "Explain this image"
- "Extract text from image"
- "Translate text in image"
- Custom input field (same as existing)

Shown for right-click image and screenshot entry points. Text+image selections keep the existing text-based presets.

### Image Preview in Bubble

Small thumbnail(s) shown above the preset chips in the `.selected-text-preview` area. Reuse existing `.response-img` CSS styling. For screenshots, show the cropped region.

### Screenshot Overlay

New UI element managed by `trigger.js`:

- Semi-transparent dark overlay covers the full page
- Crosshair cursor
- Dashed-border rectangle drawn as user drags
- Mouseup: capture and remove overlay, open bubble
- Escape: cancel and remove overlay

## Follow-Up Behavior

Follow-up questions after an image message are text-only. The conversation history retains the original image message, so the model maintains context. No need to re-send images on follow-ups.

## History Storage

Save conversations as today. `bubble.js` extracts text portions from multimodal content arrays before calling `saveConversation()` — this keeps `history.js` unchanged. Base64 image data is dropped (too large for localStorage). Image URLs are preserved if they were URL-based. History replay shows text context but not images.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Image fails to load/convert | Skip silently, proceed with text only |
| Canvas tainted (CORS) | Try CORS refetch; if fails, send URL directly |
| No text and no images captured | Show "Couldn't capture this image" |
| Base64 too large after downscale | "Image too large to analyze" |
| Proxy rejects array content | "Update your extension" |
| Model returns vision error | Show error same as today |
| `captureVisibleTab` fails | Show "Screenshot failed — try right-clicking the image instead" |

## Files Changed

| File | Change |
|------|--------|
| `image-capture.js` | **New** — `captureImage(el)`, `captureScreenshot(rect)`, size guard, CORS refetch fallback |
| `trigger.js` | Long-press detection (1.5s, 5px threshold, disabled on inputs), screenshot overlay, extract images from selection Range |
| `content.js` | Handle `SHOW_BUBBLE` with image src, pass to capture, open bubble with image presets |
| `prompt.js` | `buildChatMessages()` accepts optional `images[]`, builds content array when present |
| `presets.js` | Add image-specific preset set |
| `bubble.js` | Image thumbnail preview, pass images through to `startStreaming()`, extract text from multimodal content before saving to history |
| `background.js` | Register context menu with `contexts: ['selection', 'image']`, pass `info.srcUrl` for image clicks, add `captureVisibleTab` handler for screenshot requests |
| `manifest.json` | Add `image-capture.js` to content scripts, add `"<all_urls>"` to `host_permissions` |
| `proxy/src/index.js` | Increase `MAX_BODY_SIZE` to 2MB |
| `proxy/src/validate.js` | Accept content as string or array, validate image_url items, fix character counting for array content |

No changes to: `api.js`, `history.js`, `detection.js`, `proxy/src/openai.js`, rate limiting, HMAC signing.
