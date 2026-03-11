// Content type detection — determines smart presets based on selected text
// Implemented by Engineer A

/**
 * Detect the content type of selected text.
 * @param {string} text - The selected text
 * @param {Node|null} anchorNode - The DOM node where selection starts
 * @returns {'code'|'foreign'|'long'|'default'}
 */
function detectContentType(text, anchorNode) {
  // Check if selection is inside <pre> or <code>
  if (anchorNode) {
    let node = anchorNode;
    while (node) {
      const tag = node.nodeName?.toLowerCase();
      if (tag === 'pre' || tag === 'code') return 'code';
      node = node.parentElement;
    }
  }

  const hasBraces = /[{}]/.test(text);
  const hasSemicolons = /;/.test(text);
  const hasIndentation = /^\s{2,}/m.test(text);
  const codeKeywords = (text.match(/\b(function|const|let|var|def|class|import|export|return|if|else|for|while|console|require|async|await|typeof)\b/g) || []).length;

  if ((hasBraces && hasSemicolons) ||
      (hasBraces && codeKeywords >= 2) ||
      (hasIndentation && hasSemicolons && codeKeywords >= 1) ||
      (hasSemicolons && codeKeywords >= 2)) {
    return 'code';
  }

  const nonLatinChars = (text.match(/[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g) || []).length;
  if (text.length > 0 && nonLatinChars / text.length > 0.3) {
    return 'foreign';
  }

  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount > 200) {
    return 'long';
  }

  return 'default';
}

// Export for testing (no-op in browser)
if (typeof module !== 'undefined') module.exports = { detectContentType };
