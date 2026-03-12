// history.js — Chat history storage (chrome.storage.local)

const MAX_HISTORY = 100;
const MAX_RESPONSE_LENGTH = 2000;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Save a completed conversation to history.
 * @param {{ text, instruction, response, pageUrl, pageTitle }} entry
 * @returns {Promise<void>}
 */
function saveConversation(entry) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['chatHistory'], (result) => {
      const history = result.chatHistory || [];

      // Errata #12: null safety for missing response
      const resp = entry.response || '';
      const newEntry = {
        id: generateId(),
        text: entry.text,
        instruction: entry.instruction,
        response: resp.length > MAX_RESPONSE_LENGTH
          ? resp.substring(0, MAX_RESPONSE_LENGTH)
          : resp,
        pageUrl: entry.pageUrl,
        pageTitle: entry.pageTitle,
        timestamp: Date.now(),
      };

      history.unshift(newEntry);

      // FIFO eviction
      if (history.length > MAX_HISTORY) {
        history.length = MAX_HISTORY;
      }

      chrome.storage.local.set({ chatHistory: history }, resolve);
    });
  });
}

/**
 * Get all history entries, most recent first.
 * @returns {Promise<Array>}
 */
function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['chatHistory'], (result) => {
      resolve(result.chatHistory || []);
    });
  });
}

/**
 * Clear all history.
 * @returns {Promise<void>}
 */
function clearHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ chatHistory: [] }, resolve);
  });
}

if (typeof module !== 'undefined') module.exports = { saveConversation, getHistory, clearHistory, MAX_HISTORY };
