// Prompt construction and AI URL generation
// Implemented by Engineer A

const MAX_TEXT_LENGTH = 2000;
const MAX_URL_LENGTH = 8000;

/**
 * Build the final prompt string.
 * @param {string} selectedText
 * @param {string} instruction - Preset or custom instruction (can be empty)
 * @param {boolean} includePageContext
 * @returns {string}
 */
function buildPrompt(selectedText, instruction, includePageContext) {
  // TODO: Implement in PR #2
  return selectedText;
}

/**
 * Generate the AI URL with the prompt.
 * @param {'chatgpt'|'claude'} ai
 * @param {string} prompt
 * @returns {{ url: string, fallback: boolean, prompt?: string }}
 */
function getAIUrl(ai, prompt) {
  // TODO: Implement in PR #2
  return { url: '', fallback: false };
}
