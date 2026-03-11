// Glue script — wires context menu messages to popup
// All modules loaded via manifest.json content_scripts share this scope

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_POPUP') {
    showPopup(msg.text, null);
  }
});
