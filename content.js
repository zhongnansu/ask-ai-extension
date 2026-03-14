// content.js — Glue script: wires context menu messages to bubble
// All modules loaded via manifest.json content_scripts share this scope

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_BUBBLE') {
    // When triggered from context menu, use approximate center-screen position
    const rect = {
      bottom: window.innerHeight / 3,
      left: window.innerWidth / 4,
      right: window.innerWidth * 3 / 4,
    };

    // Image context menu click
    if (msg.image) {
      (async () => {
        let images = [];
        if (typeof captureImage === 'function') {
          const captured = await captureImage(msg.image);
          if (captured) images = [captured];
        }
        if (images.length > 0) {
          showBubbleWithPresets(rect, '', null, images);
        } else {
          showBubble(rect, [{ role: 'user', content: "Couldn't capture this image" }], '', 'Error');
        }
      })();
      return;
    }

    // Text selection context menu click
    const instruction = 'Explain the following';
    const messages = buildChatMessages(msg.text, instruction, true);
    showBubble(rect, messages, msg.text, instruction);
  }
});

// Dismiss bubble on click outside
setTimeout(() => {
  document.addEventListener('mousedown', (e) => {
    const bubble = typeof _getBubbleContainer === 'function' ? _getBubbleContainer() : null;
    if (bubble && !bubble.contains(e.target)) {
      const trigger = document.getElementById('dobby-ai-trigger');
      if (trigger && trigger.contains(e.target)) return;
      hideBubble();
    }
  });
}, 100);
