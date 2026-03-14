// prompt.js — OpenAI chat message format
const MAX_TEXT_LENGTH = 6000;

/**
 * Build OpenAI chat messages array from selected text and instruction.
 * @param {string} selectedText
 * @param {string} instruction - Preset or custom instruction (can be empty/null)
 * @param {boolean} includePageContext
 * @param {Array} [images] - Optional array of {type: "image_url", image_url: {url}} objects
 * @returns {Array<{role: string, content: string|Array}>}
 */
function buildChatMessages(selectedText, instruction, includePageContext, images) {
  let text = selectedText;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH) + '...[truncated]';
  }

  const messages = [];

  // System message sets the assistant's role
  messages.push({
    role: 'system',
    content: 'You are Dobby AI, a helpful assistant. The user has selected text on a webpage and the full selected text is provided below. Do NOT attempt to access, fetch, or visit any URLs — the text content is already included in the message. A source URL may be provided as metadata only. Be concise and clear. Always respond in the same language as the selected text.',
  });

  // Combine instruction + selected text in the user message so the model
  // clearly knows what task to perform on which text
  let userText = instruction
    ? `${instruction}:\n\n${text}`
    : text;

  if (includePageContext) {
    const title = typeof document !== 'undefined' ? document.title : '';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    userText += `\n\n(Source: "${title}" — ${url})`;
  }

  // When images are present, build multimodal content array
  if (images && images.length > 0) {
    const contentParts = [];
    // If there's meaningful text, put it first
    if (text.trim()) {
      contentParts.push({ type: 'text', text: userText });
      images.forEach(img => contentParts.push(img));
    } else {
      // Image-only: images first, then instruction as text
      images.forEach(img => contentParts.push(img));
      const instructionText = instruction || 'Explain this image';
      contentParts.push({ type: 'text', text: instructionText });
    }
    messages.push({ role: 'user', content: contentParts });
  } else {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
}

/**
 * Append a follow-up question to an existing conversation.
 * @param {Array} existingMessages
 * @param {string} newQuestion
 * @returns {Array}
 */
function buildFollowUp(existingMessages, newQuestion) {
  return [...existingMessages, { role: 'user', content: newQuestion }];
}

if (typeof module !== 'undefined') module.exports = { buildChatMessages, buildFollowUp, MAX_TEXT_LENGTH };
