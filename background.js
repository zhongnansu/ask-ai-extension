// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ask-ai',
    title: 'Ask AI',
    contexts: ['selection']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ask-ai') {
    // Try sending to content script first
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_POPUP',
      text: info.selectionText
    }).catch(() => {
      // Content script not available (CSP-blocked page) — open directly
      chrome.storage.local.get(['lastAI', 'pageContext'], (stored) => {
        const ai = stored.lastAI || 'chatgpt';
        const baseUrls = {
          chatgpt: 'https://chatgpt.com/',
          claude: 'https://claude.ai/new'
        };

        let prompt = info.selectionText;
        if (stored.pageContext !== false) {
          prompt += `\n\nFrom: "${tab.title}" (${tab.url})`;
        }

        const encoded = encodeURIComponent(prompt);
        const fullUrl = `${baseUrls[ai]}?q=${encoded}`;

        if (fullUrl.length > 8000) {
          chrome.tabs.create({ url: baseUrls[ai] });
        } else {
          chrome.tabs.create({ url: fullUrl });
        }
      });
    });
  }
});

// Allowed URL prefixes for AI tab requests
const ALLOWED_URL_PREFIXES = ['https://chatgpt.com/', 'https://claude.ai/'];

function isAllowedUrl(url) {
  return typeof url === 'string' && ALLOWED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

// Handle open-tab requests from content script
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'OPEN_AI_TAB' && isAllowedUrl(msg.url)) {
    chrome.tabs.create({ url: msg.url });
  }
  if (msg.type === 'COPY_AND_OPEN' && isAllowedUrl(msg.url)) {
    chrome.tabs.create({ url: msg.url });
  }
});
