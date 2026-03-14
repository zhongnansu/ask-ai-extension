// image-capture.js — Shared image capture module for all entry points
//
// Dependencies (shared global scope via manifest.json content_scripts):
// - chrome.runtime.sendMessage (for screenshot capture via background.js)

const MAX_BASE64_SIZE = 1048576; // 1MB
const MAX_DOWNSCALE_ATTEMPTS = 2;

/**
 * Capture an image from a source URL or <img> element.
 * Strategy: URL-first (smallest payload), CORS-refetch fallback for cross-origin.
 * @param {string|HTMLImageElement} source - Image URL string or <img> element
 * @returns {Promise<{type: string, image_url: {url: string}}|null>}
 */
async function captureImage(source) {
  try {
    const url = typeof source === 'string' ? source : source.src;
    if (!url) return null;

    // Same-origin https URL — use directly
    if (url.startsWith('https:')) {
      try {
        const sameOrigin = new URL(url).origin === window.location.origin;
        if (sameOrigin) {
          return { type: 'image_url', image_url: { url } };
        }
      } catch { /* invalid URL, fall through */ }

      // Cross-origin: try CORS refetch to get base64
      const base64 = await _corsRefetch(url);
      if (base64) {
        const sized = await _downsizeBase64(base64);
        if (sized) return { type: 'image_url', image_url: { url: sized } };
      }

      // CORS failed — send URL directly, model may or may not access it
      return { type: 'image_url', image_url: { url } };
    }

    // data: URL — already base64
    if (url.startsWith('data:image/')) {
      const sized = await _downsizeBase64(url);
      if (sized) return { type: 'image_url', image_url: { url: sized } };
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Capture a screenshot of a selected region.
 * Sends coordinates to background.js which calls captureVisibleTab.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {Promise<{type: string, image_url: {url: string}}|null>}
 */
async function captureScreenshot(rect) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
    });

    if (!response || !response.dataUrl) return null;

    const cropped = await _cropImage(response.dataUrl, rect);
    if (!cropped) return null;

    const sized = await _downsizeBase64(cropped);
    if (sized) return { type: 'image_url', image_url: { url: sized } };
    return null;
  } catch {
    return null;
  }
}

/**
 * CORS-enabled refetch: create a new Image with crossOrigin, draw to canvas.
 * @param {string} url
 * @returns {Promise<string|null>} base64 data URL or null
 */
function _corsRefetch(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
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
 * Crop a full-viewport screenshot to the selected region.
 * Accounts for devicePixelRatio.
 * @param {string} dataUrl - Full viewport base64
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {Promise<string|null>}
 */
function _cropImage(dataUrl, rect) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr,
          rect.width * dpr, rect.height * dpr,
          0, 0,
          rect.width * dpr, rect.height * dpr
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
 * Downscale base64 image if it exceeds MAX_BASE64_SIZE.
 * Reduces dimensions by 50% per attempt, max 2 attempts.
 * @param {string} dataUrl
 * @returns {Promise<string|null>}
 */
async function _downsizeBase64(dataUrl) {
  // Check size (base64 portion is after the comma)
  const base64Part = dataUrl.split(',')[1] || '';
  if (base64Part.length <= MAX_BASE64_SIZE) return dataUrl;

  let current = dataUrl;
  for (let i = 0; i < MAX_DOWNSCALE_ATTEMPTS; i++) {
    current = await _scaleDown(current);
    if (!current) return null;
    const part = current.split(',')[1] || '';
    if (part.length <= MAX_BASE64_SIZE) return current;
  }
  return null; // Still too large
}

function _scaleDown(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(img.naturalWidth / 2);
        canvas.height = Math.floor(img.naturalHeight / 2);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

if (typeof module !== 'undefined') {
  module.exports = { captureImage, captureScreenshot, _corsRefetch, _cropImage, _downsizeBase64 };
}
