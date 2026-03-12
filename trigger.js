// trigger.js — Floating "Dobby AI" trigger button + preset selector
//
// Dependencies (shared global scope via manifest.json content_scripts):
// - detectContentType(text, anchorNode) from detection.js
// - getSuggestedPresetsForType(type, subType) from presets.js
// - buildChatMessages(text, instruction, includePageContext) from prompt.js
// - showBubble(rect, messages) from bubble.js
// - hideBubble() from bubble.js

let triggerButton = null;
let presetSelector = null;
let lastSelectedText = '';
let lastSelectionRect = null;
let lastAnchorNode = null;

function createTriggerButton() {
  if (triggerButton) return;

  // Cockapoo icon as inline SVG data URI — avoids web_accessible_resources
  const cockapooSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <!-- Fluffy head -->
    <circle cx="32" cy="30" r="22" fill="#C4956A"/>
    <!-- Curly fur puffs -->
    <circle cx="14" cy="22" r="8" fill="#B8845A"/>
    <circle cx="50" cy="22" r="8" fill="#B8845A"/>
    <circle cx="20" cy="12" r="7" fill="#D4A574"/>
    <circle cx="44" cy="12" r="7" fill="#D4A574"/>
    <circle cx="32" cy="10" r="7" fill="#C4956A"/>
    <circle cx="26" cy="8" r="5" fill="#BF8F60"/>
    <circle cx="38" cy="8" r="5" fill="#BF8F60"/>
    <!-- Floppy ears -->
    <ellipse cx="10" cy="34" rx="7" ry="12" fill="#A07048" transform="rotate(-10 10 34)"/>
    <ellipse cx="54" cy="34" rx="7" ry="12" fill="#A07048" transform="rotate(10 54 34)"/>
    <!-- Face -->
    <ellipse cx="32" cy="34" rx="14" ry="11" fill="#E8C9A0"/>
    <!-- Eyes -->
    <circle cx="24" cy="28" r="3.5" fill="#2D1B0E"/>
    <circle cx="40" cy="28" r="3.5" fill="#2D1B0E"/>
    <circle cx="25.2" cy="27" r="1.2" fill="white"/>
    <circle cx="41.2" cy="27" r="1.2" fill="white"/>
    <!-- Nose -->
    <ellipse cx="32" cy="35" rx="4" ry="3" fill="#2D1B0E"/>
    <ellipse cx="32" cy="34.5" rx="1.5" ry="0.8" fill="#5A3A1E" opacity="0.4"/>
    <!-- Mouth -->
    <path d="M28 38 Q32 42 36 38" fill="none" stroke="#2D1B0E" stroke-width="1.2" stroke-linecap="round"/>
    <!-- Tongue -->
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

  triggerButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text) {
      lastSelectedText = text;
      lastAnchorNode = selection.anchorNode || null;
      lastSelectionRect = selection.rangeCount > 0
        ? selection.getRangeAt(0).getBoundingClientRect()
        : null;
      showPresetSelector();
    }
  });

  document.body.appendChild(triggerButton);
}

function showPresetSelector() {
  hidePresetSelector();
  hideTrigger();

  const detected = typeof detectContentType === 'function'
    ? detectContentType(lastSelectedText, lastAnchorNode)
    : (typeof detectContent === 'function'
      ? detectContent(lastSelectedText)
      : { type: 'default', subType: null, confidence: 'medium' });

  const presets = typeof getSuggestedPresetsForType === 'function'
    ? getSuggestedPresetsForType(detected.type, detected.subType)
    : [];

  presetSelector = document.createElement('div');
  presetSelector.id = 'dobby-ai-presets';
  Object.assign(presetSelector.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: triggerButton ? triggerButton.style.left : '100px',
    top: triggerButton ? triggerButton.style.top : '100px',
    background: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.08)',
    padding: '8px',
    width: '280px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
  });

  // Selected text preview — shows the user what text was captured
  const preview = document.createElement('div');
  const previewText = lastSelectedText.length > 100
    ? lastSelectedText.substring(0, 100) + '...'
    : lastSelectedText;
  Object.assign(preview.style, {
    padding: '6px 8px',
    fontSize: '12px',
    color: '#52525b',
    background: 'rgba(79, 70, 229, 0.05)',
    borderRadius: '6px',
    marginBottom: '6px',
    lineHeight: '1.4',
    maxHeight: '52px',
    overflow: 'hidden',
    wordBreak: 'break-word',
    borderLeft: '3px solid rgba(79, 70, 229, 0.4)',
  });
  preview.textContent = previewText;
  presetSelector.appendChild(preview);

  // Detection badge
  if (detected.type !== 'default') {
    const badge = document.createElement('div');
    badge.textContent = `${detected.subType || detected.type} detected`;
    Object.assign(badge.style, {
      padding: '2px 8px 4px',
      fontSize: '11px',
      color: '#7c3aed',
      fontWeight: '500',
    });
    presetSelector.appendChild(badge);
  }

  // Preset buttons
  presets.slice(0, 4).forEach((preset) => {
    const btn = document.createElement('div');
    btn.textContent = preset.label;
    Object.assign(btn.style, {
      padding: '6px 8px',
      cursor: 'pointer',
      borderRadius: '6px',
      color: '#18181b',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(79,70,229,0.08)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      launchBubble(preset.instruction);
    });
    presetSelector.appendChild(btn);
  });

  // Custom input
  const separator = document.createElement('div');
  separator.style.borderTop = '1px solid rgba(0,0,0,0.06)';
  separator.style.margin = '4px 0';
  presetSelector.appendChild(separator);

  const customInput = document.createElement('input');
  customInput.placeholder = 'Custom prompt...';
  Object.assign(customInput.style, {
    width: '100%',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  });
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && customInput.value.trim()) {
      launchBubble(customInput.value.trim());
    }
    if (e.key === 'Escape') {
      hidePresetSelector();
    }
  });
  presetSelector.appendChild(customInput);

  document.body.appendChild(presetSelector);
  // Don't auto-focus the input — it clears the browser's text selection highlight
}

function launchBubble(instruction) {
  hidePresetSelector();
  const messages = typeof buildChatMessages === 'function'
    ? buildChatMessages(lastSelectedText, instruction, true)
    : [{ role: 'user', content: `${instruction}:\n\n${lastSelectedText}` }];

  const rect = lastSelectionRect || { bottom: 200, left: 100, right: 300 };
  showBubble(rect, messages, lastSelectedText, instruction);
}

function hidePresetSelector() {
  if (presetSelector && presetSelector.parentNode) {
    presetSelector.parentNode.removeChild(presetSelector);
  }
  presetSelector = null;
}

function showTrigger(x, y) {
  createTriggerButton();
  triggerButton.style.display = 'block';
  const buttonWidth = triggerButton.offsetWidth || 80;
  const buttonHeight = triggerButton.offsetHeight || 28;
  const maxLeft = window.innerWidth - buttonWidth - 8;
  const maxTop = window.innerHeight - buttonHeight - 8;
  // Position below-right of cursor: close enough to click, but not blocking
  // the selected text or surrounding content
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
  if (presetSelector?.contains(e.target)) return;
  // Errata #11: use _getBubbleContainer instead of bubbleHost
  if (typeof _getBubbleContainer === 'function') {
    const bc = _getBubbleContainer();
    if (bc?.contains(e.target)) return;
  }

  const cursorX = e.clientX;
  const cursorY = e.clientY;
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length >= 3) {
      showTrigger(cursorX, cursorY);
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
      showTrigger(rect.right, rect.top);
    }
  }, 150);
}, true);

// Hide on click away
document.addEventListener('mousedown', (e) => {
  if (triggerButton?.contains(e.target)) return;
  if (presetSelector?.contains(e.target)) return;
  if (typeof _getBubbleContainer === 'function') {
    const bc = _getBubbleContainer();
    if (bc?.contains(e.target)) return;
  }
  hideTrigger();
  hidePresetSelector();
});

function _resetTriggerForTesting() {
  if (triggerButton && triggerButton.parentNode) {
    triggerButton.parentNode.removeChild(triggerButton);
  }
  triggerButton = null;
  hidePresetSelector();
  lastSelectedText = '';
  lastSelectionRect = null;
  lastAnchorNode = null;
}

if (typeof module !== 'undefined') module.exports = { createTriggerButton, showTrigger, hideTrigger, _resetTriggerForTesting };
