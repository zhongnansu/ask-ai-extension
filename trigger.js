// Floating "Ask AI" trigger button on text selection
//
// Dependencies (loaded via manifest.json content_scripts, shared global scope):
// - showPopup(text, anchorNode) from popup.js
// - popupContainer from popup.js

/**
 * Shows a floating trigger button near text selection.
 * On click, calls showPopup(text, anchorNode) from popup.js.
 *
 * Exported functions (global scope):
 * - showTrigger(rect) — position and show the trigger button
 * - hideTrigger() — hide the trigger button
 */

let triggerButton = null;

function createTriggerButton() {
  if (triggerButton) return;

  triggerButton = document.createElement('div');
  triggerButton.id = 'ask-ai-trigger';
  triggerButton.textContent = '✦ Ask AI';
  Object.assign(triggerButton.style, {
    position: 'fixed',
    zIndex: '2147483647',
    background: 'rgba(79, 70, 229, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'white',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(79,70,229,0.4)',
    border: '1px solid rgba(255,255,255,0.15)',
    display: 'none',
    userSelect: 'none',
    lineHeight: '1',
    whiteSpace: 'nowrap',
  });

  triggerButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text) {
      showPopup(text, selection.anchorNode);
    }
  });

  document.body.appendChild(triggerButton);
}

function showTrigger(rect) {
  createTriggerButton();
  triggerButton.style.display = 'block';
  // Clamp to viewport so button doesn't render off-screen
  const buttonWidth = triggerButton.offsetWidth || 80;
  const maxLeft = window.innerWidth - buttonWidth - 8;
  triggerButton.style.left = `${Math.min(rect.right, maxLeft)}px`;
  triggerButton.style.top = `${Math.max(4, rect.top - 36)}px`;
}

function hideTrigger() {
  if (triggerButton) {
    triggerButton.style.display = 'none';
  }
}

// Listen for text selection
document.addEventListener('mouseup', (e) => {
  // Ignore clicks on our own UI
  if (triggerButton?.contains(e.target)) return;
  if (typeof popupContainer !== 'undefined' && popupContainer?.contains(e.target)) return;

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length >= 3 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTrigger(rect);
    } else {
      hideTrigger();
    }
  }, 10);
});

// Hide trigger on scroll, re-show after scroll stops
let scrollTimer = null;
window.addEventListener('scroll', () => {
  hideTrigger();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length >= 3 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTrigger(rect);
    }
  }, 150);
}, true);

// Hide on click away
document.addEventListener('mousedown', (e) => {
  if (triggerButton?.contains(e.target)) return;
  if (typeof popupContainer !== 'undefined' && popupContainer?.contains(e.target)) return;
  hideTrigger();
});

// Reset internal state (for testing only)
function _resetTriggerForTesting() {
  if (triggerButton && triggerButton.parentNode) {
    triggerButton.parentNode.removeChild(triggerButton);
  }
  triggerButton = null;
}

if (typeof module !== 'undefined') module.exports = { createTriggerButton, showTrigger, hideTrigger, _resetTriggerForTesting };
