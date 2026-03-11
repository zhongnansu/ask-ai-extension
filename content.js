// Glue script — wires context menu messages to popup
// All modules loaded via manifest.json content_scripts share this scope

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_POPUP') {
    showPopup(msg.text, null);
  }
});

// Dismiss popup on click outside
setTimeout(() => {
  document.addEventListener('mousedown', (e) => {
    if (popupContainer && !popupContainer.contains(e.target)) {
      const trigger = document.getElementById('ask-ai-trigger');
      if (trigger && trigger.contains(e.target)) return;
      hidePopup();
    }
  });
}, 100);
