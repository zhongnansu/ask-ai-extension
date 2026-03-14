// trigger.js — Floating "Dobby AI" trigger button
//
// Dependencies (shared global scope via manifest.json content_scripts):
// - showBubbleWithPresets(rect, text, anchorNode) from bubble.js
// - hideBubble() from bubble.js
// - _getBubbleContainer() from bubble.js

let triggerButton = null;
let dobbyEnabled = true;

// Load initial enabled state and listen for toggle from toolbar popup
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get('dobbyEnabled', (data) => {
    dobbyEnabled = data.dobbyEnabled !== false;
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DOBBY_TOGGLE') {
      dobbyEnabled = msg.enabled;
      if (!dobbyEnabled) { hideTrigger(); }
    }
  });
}

function createTriggerButton() {
  if (triggerButton) return;

  // Cockapoo icon as inline SVG data URI
  const cockapooSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <circle cx="32" cy="30" r="22" fill="#C4956A"/>
    <circle cx="14" cy="22" r="8" fill="#B8845A"/>
    <circle cx="50" cy="22" r="8" fill="#B8845A"/>
    <circle cx="20" cy="12" r="7" fill="#D4A574"/>
    <circle cx="44" cy="12" r="7" fill="#D4A574"/>
    <circle cx="32" cy="10" r="7" fill="#C4956A"/>
    <circle cx="26" cy="8" r="5" fill="#BF8F60"/>
    <circle cx="38" cy="8" r="5" fill="#BF8F60"/>
    <ellipse cx="10" cy="34" rx="7" ry="12" fill="#A07048" transform="rotate(-10 10 34)"/>
    <ellipse cx="54" cy="34" rx="7" ry="12" fill="#A07048" transform="rotate(10 54 34)"/>
    <ellipse cx="32" cy="34" rx="14" ry="11" fill="#E8C9A0"/>
    <circle cx="24" cy="28" r="3.5" fill="#2D1B0E"/>
    <circle cx="40" cy="28" r="3.5" fill="#2D1B0E"/>
    <circle cx="25.2" cy="27" r="1.2" fill="white"/>
    <circle cx="41.2" cy="27" r="1.2" fill="white"/>
    <ellipse cx="32" cy="35" rx="4" ry="3" fill="#2D1B0E"/>
    <ellipse cx="32" cy="34.5" rx="1.5" ry="0.8" fill="#5A3A1E" opacity="0.4"/>
    <path d="M28 38 Q32 42 36 38" fill="none" stroke="#2D1B0E" stroke-width="1.2" stroke-linecap="round"/>
    <ellipse cx="32" cy="41" rx="2.5" ry="3" fill="#E87B7B"/>
  </svg>`;

  const iconDataUri = 'data:image/svg+xml,' + encodeURIComponent(cockapooSvg);

  triggerButton = document.createElement('div');
  triggerButton.id = 'dobby-ai-trigger';
  const img = document.createElement('img');
  img.src = iconDataUri;
  img.alt = 'Dobby AI';
  Object.assign(img.style, { width: '28px', height: '28px', display: 'block' });
  triggerButton.appendChild(img);
  Object.assign(triggerButton.style, {
    position: 'fixed',
    zIndex: '2147483647',
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '4px',
    borderRadius: '50%',
    cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.08)',
    display: 'none',
    userSelect: 'none',
    lineHeight: '0',
  });

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
      hideTrigger();

      // Extract images from selection range
      let images = [];
      if (selection.rangeCount > 0 && typeof captureImage === 'function') {
        images = await extractImagesFromSelection(selection);
      }

      showBubbleWithPresets(rect, text, anchorNode, images.length > 0 ? images : undefined);
    }
  });

  document.body.appendChild(triggerButton);
}

function showTrigger(x, y) {
  createTriggerButton();
  triggerButton.style.display = 'block';
  const buttonWidth = triggerButton.offsetWidth || 36;
  const buttonHeight = triggerButton.offsetHeight || 36;
  const maxLeft = window.innerWidth - buttonWidth - 8;
  const maxTop = window.innerHeight - buttonHeight - 8;
  triggerButton.style.left = `${Math.min(Math.max(8, x + 12), maxLeft)}px`;
  triggerButton.style.top = `${Math.min(Math.max(4, y + 10), maxTop)}px`;
}

function hideTrigger() {
  if (triggerButton) {
    triggerButton.style.display = 'none';
  }
}

// Listen for text selection
document.addEventListener('mouseup', (e) => {
  if (triggerButton?.contains(e.target)) return;
  if (typeof _getBubbleContainer === 'function') {
    const bc = _getBubbleContainer();
    if (bc?.contains(e.target)) return;
  }

  const cursorX = e.clientX;
  const cursorY = e.clientY;
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length >= 3 && dobbyEnabled) {
      showTrigger(cursorX, cursorY);
    } else {
      hideTrigger();
    }
  }, 10);
});

// Fallback: selectionchange fires even when sites (Gmail, etc.) capture mouseup
let selectionChangeTimer = null;
document.addEventListener('selectionchange', () => {
  clearTimeout(selectionChangeTimer);
  selectionChangeTimer = setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length >= 3 && dobbyEnabled && selection.rangeCount > 0) {
      // Only show if trigger isn't already visible
      if (!triggerButton || triggerButton.style.display === 'none') {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showTrigger(rect.right, rect.bottom);
      }
    }
  }, 300);
});

// Hide trigger on scroll, re-show after scroll stops
let scrollTimer = null;
window.addEventListener('scroll', () => {
  hideTrigger();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length >= 3 && dobbyEnabled && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTrigger(rect.right, rect.top);
    }
  }, 150);
}, true);

// Hide on click away
document.addEventListener('mousedown', (e) => {
  if (triggerButton?.contains(e.target)) return;
  if (typeof _getBubbleContainer === 'function') {
    const bc = _getBubbleContainer();
    if (bc?.contains(e.target)) return;
  }
  hideTrigger();
});

// --- Image extraction from text selection ---

async function extractImagesFromSelection(selection, maxImages = 2) {
  const images = [];
  if (!selection.rangeCount) return images;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const imgElements = container.nodeType === Node.ELEMENT_NODE
    ? container.querySelectorAll('img')
    : (container.parentElement ? container.parentElement.querySelectorAll('img') : []);

  for (const imgEl of imgElements) {
    if (images.length >= maxImages) break;
    if (!range.intersectsNode(imgEl)) continue;
    if (!imgEl.src) continue;

    if (typeof captureImage === 'function') {
      const captured = await captureImage(imgEl);
      if (captured) images.push(captured);
    }
  }
  return images;
}

// --- Long-press screenshot mode ---

let longPressTimer = null;
let longPressStartX = 0;
let longPressStartY = 0;
const LONG_PRESS_DURATION = 1500;
const MOVEMENT_THRESHOLD = 5;
let screenshotOverlay = null;
let screenshotStartX = 0;
let screenshotStartY = 0;
let screenshotRect = null;

function isInputElement(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left click only
  if (isInputElement(e.target)) return;
  if (triggerButton?.contains(e.target)) return;
  if (typeof _getBubbleContainer === 'function') {
    const bc = _getBubbleContainer();
    if (bc?.contains(e.target)) return;
  }
  if (screenshotOverlay) return;

  longPressStartX = e.clientX;
  longPressStartY = e.clientY;

  longPressTimer = setTimeout(() => {
    startScreenshotMode();
  }, LONG_PRESS_DURATION);
});

document.addEventListener('mousemove', (e) => {
  if (longPressTimer) {
    const dx = Math.abs(e.clientX - longPressStartX);
    const dy = Math.abs(e.clientY - longPressStartY);
    if (dx > MOVEMENT_THRESHOLD || dy > MOVEMENT_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // Screenshot region drag
  if (screenshotOverlay && screenshotRect) {
    const x = Math.min(screenshotStartX, e.clientX);
    const y = Math.min(screenshotStartY, e.clientY);
    const w = Math.abs(e.clientX - screenshotStartX);
    const h = Math.abs(e.clientY - screenshotStartY);
    Object.assign(screenshotRect.style, {
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px',
    });
  }
});

document.addEventListener('mouseup', (e) => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}, true);

function startScreenshotMode() {
  longPressTimer = null;

  screenshotOverlay = document.createElement('div');
  Object.assign(screenshotOverlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: 'rgba(0, 0, 0, 0.3)',
    cursor: 'crosshair',
  });

  screenshotRect = document.createElement('div');
  Object.assign(screenshotRect.style, {
    position: 'fixed',
    border: '2px dashed #7c3aed',
    background: 'rgba(124, 58, 237, 0.1)',
    display: 'none',
    zIndex: '2147483647',
  });
  screenshotOverlay.appendChild(screenshotRect);

  screenshotOverlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotStartX = e.clientX;
    screenshotStartY = e.clientY;
    screenshotRect.style.display = 'block';
    Object.assign(screenshotRect.style, {
      left: e.clientX + 'px',
      top: e.clientY + 'px',
      width: '0px',
      height: '0px',
    });
  });

  screenshotOverlay.addEventListener('mouseup', async (e) => {
    const x = Math.min(screenshotStartX, e.clientX);
    const y = Math.min(screenshotStartY, e.clientY);
    const w = Math.abs(e.clientX - screenshotStartX);
    const h = Math.abs(e.clientY - screenshotStartY);

    cancelScreenshotMode();

    if (w < 10 || h < 10) return; // Too small, ignore

    const rect = { x, y, width: w, height: h };
    if (typeof captureScreenshot === 'function') {
      const captured = await captureScreenshot(rect);
      if (captured) {
        const bubbleRect = {
          bottom: y + h + 8,
          left: x,
          right: x + w,
          top: y,
        };
        showBubbleWithPresets(bubbleRect, '', null, [captured]);
      }
    }
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      cancelScreenshotMode();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  screenshotOverlay._escHandler = escHandler;

  document.body.appendChild(screenshotOverlay);
}

function cancelScreenshotMode() {
  if (screenshotOverlay) {
    if (screenshotOverlay._escHandler) {
      document.removeEventListener('keydown', screenshotOverlay._escHandler);
    }
    if (screenshotOverlay.parentNode) {
      screenshotOverlay.parentNode.removeChild(screenshotOverlay);
    }
    screenshotOverlay = null;
    screenshotRect = null;
  }
}

function _resetTriggerForTesting() {
  if (triggerButton && triggerButton.parentNode) {
    triggerButton.parentNode.removeChild(triggerButton);
  }
  triggerButton = null;
  dobbyEnabled = true;
}

function _setDobbyEnabled(val) { dobbyEnabled = val; }

if (typeof module !== 'undefined') module.exports = { createTriggerButton, showTrigger, hideTrigger, _resetTriggerForTesting, _setDobbyEnabled, extractImagesFromSelection, startScreenshotMode, cancelScreenshotMode };
