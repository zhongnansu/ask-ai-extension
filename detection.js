// Content type detection — determines smart presets based on selected text
// Enhanced in v1.1: rich detection objects with sub-type, confidence, and metadata

/**
 * Detect the content type of selected text.
 * @param {string} text - The selected text
 * @param {Node|null} anchorNode - The DOM node where selection starts
 * @returns {{ type: string, subType: string|null, confidence: number, wordCount: number, charCount: number }}
 */
function detectContentType(text, anchorNode) {
  const charCount = text.length;
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

  // --- Priority 1: Code in <pre> or <code> DOM node ---
  if (anchorNode) {
    let node = anchorNode;
    while (node) {
      const tag = node.nodeName?.toLowerCase();
      if (tag === 'pre' || tag === 'code') {
        const subType = detectCodeLanguage(text);
        return { type: 'code', subType, confidence: 0.95, wordCount, charCount };
      }
      node = node.parentElement;
    }
  }

  // --- Priority 2: Code heuristics ---
  const codeResult = detectCodeHeuristics(text);
  if (codeResult) {
    const subType = detectCodeLanguage(text);
    return { type: 'code', subType, confidence: codeResult.confidence, wordCount, charCount };
  }

  // --- Priority 3: Error / stack trace ---
  const errorResult = detectError(text);
  if (errorResult) {
    return { type: 'error', subType: null, confidence: errorResult.confidence, wordCount, charCount };
  }

  // --- Priority 4: Math / formula ---
  const mathResult = detectMath(text);
  if (mathResult) {
    return { type: 'math', subType: null, confidence: mathResult.confidence, wordCount, charCount };
  }

  // --- Priority 5: List / structured data ---
  const dataResult = detectData(text);
  if (dataResult) {
    return { type: 'data', subType: null, confidence: dataResult.confidence, wordCount, charCount };
  }

  // --- Priority 6: Email / message ---
  const emailResult = detectEmail(text);
  if (emailResult) {
    return { type: 'email', subType: null, confidence: emailResult.confidence, wordCount, charCount };
  }

  // --- Priority 7: Foreign language ---
  const foreignResult = detectForeign(text);
  if (foreignResult) {
    return { type: 'foreign', subType: foreignResult.subType, confidence: foreignResult.confidence, wordCount, charCount };
  }

  // --- Priority 8: Long text ---
  if (wordCount > 200) {
    return { type: 'long', subType: null, confidence: 0.9, wordCount, charCount };
  }

  // --- Default ---
  return { type: 'default', subType: null, confidence: 1.0, wordCount, charCount };
}

// ─── Code heuristics ────────────────────────────────────────────────────────

function detectCodeHeuristics(text) {
  const hasBraces = /[{}]/.test(text);
  const hasSemicolons = /;/.test(text);
  const hasIndentation = /^\s{2,}/m.test(text);
  const codeKeywords = (text.match(/\b(function|func|fn|const|let|var|def|class|import|export|return|if|else|for|while|console|require|async|await|typeof|print|puts|self|end|package|impl|trait|struct|enum|pub|mod)\b/g) || []).length;

  // SQL detection (separate path — SQL has its own syntax)
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(text) &&
      /\b(FROM|INTO|TABLE|WHERE|SET|VALUES)\b/i.test(text)) {
    return { confidence: 0.9 };
  }

  if ((hasBraces && hasSemicolons) ||
      (hasBraces && codeKeywords >= 2) ||
      (hasBraces && hasIndentation && codeKeywords >= 1) ||
      (hasIndentation && hasSemicolons && codeKeywords >= 1) ||
      (hasSemicolons && codeKeywords >= 2) ||
      (hasIndentation && codeKeywords >= 2)) {
    const signals = [hasBraces, hasSemicolons, hasIndentation, codeKeywords >= 2].filter(Boolean).length;
    const confidence = Math.min(0.95, 0.6 + signals * 0.1);
    return { confidence };
  }
  return null;
}

// ─── Programming language sub-type detection ────────────────────────────────

function detectCodeLanguage(text) {
  const scores = {
    javascript: 0,
    python: 0,
    rust: 0,
    go: 0,
    sql: 0,
    java: 0,
    'c/c++': 0,
    ruby: 0,
    php: 0,
  };

  // JavaScript signals
  if (/\b(const|let|var)\b/.test(text)) scores.javascript += 2;
  if (/=>/.test(text)) scores.javascript += 2;
  if (/\bconsole\.(log|warn|error)\b/.test(text)) scores.javascript += 3;
  if (/\b(require|module\.exports)\b/.test(text)) scores.javascript += 3;
  if (/\b(document|window|addEventListener)\b/.test(text)) scores.javascript += 2;
  if (/\basync\b.*\bawait\b/.test(text)) scores.javascript += 1;
  if (/\btypeof\b/.test(text)) scores.javascript += 1;

  // Python signals
  if (/\bdef\s+\w+\s*\(/.test(text)) scores.python += 3;
  if (/\bself\b/.test(text)) scores.python += 2;
  if (/\belif\b/.test(text)) scores.python += 3;
  if (/\bprint\s*\(/.test(text)) scores.python += 2;
  if (/^\s*#(?!include|define|pragma).*$/m.test(text)) scores.python += 1;
  if (/\b(True|False|None)\b/.test(text)) scores.python += 2;
  if (/\bimport\s+\w+/.test(text) && !/\bfrom\s+['"]/.test(text)) scores.python += 1;

  // Rust signals
  if (/\bfn\s+\w+/.test(text)) scores.rust += 3;
  if (/\blet\s+mut\b/.test(text)) scores.rust += 3;
  if (/\b(impl|trait|enum|struct)\b/.test(text)) scores.rust += 3;
  if (/\b(println!|vec!|format!)\b/.test(text)) scores.rust += 3;
  if (/->/.test(text) && /\bfn\b/.test(text)) scores.rust += 2;
  if (/&(mut\s+)?\w+/.test(text) && /\bfn\b/.test(text)) scores.rust += 1;

  // Go signals
  if (/\bfunc\s+\w+/.test(text)) scores.go += 3;
  if (/\bpackage\s+\w+/.test(text)) scores.go += 3;
  if (/\bfmt\.\w+/.test(text)) scores.go += 3;
  if (/\b:=\b/.test(text)) scores.go += 3;
  if (/\bgo\s+(func|routine)\b/.test(text)) scores.go += 2;
  if (/\bdefer\b/.test(text)) scores.go += 2;

  // SQL signals
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(text) &&
      /\b(FROM|INTO|TABLE|WHERE|SET|VALUES)\b/i.test(text)) scores.sql += 4;
  if (/\b(JOIN|LEFT\s+JOIN|INNER\s+JOIN|GROUP\s+BY|ORDER\s+BY)\b/i.test(text)) scores.sql += 3;
  if (/\b(VARCHAR|INTEGER|BOOLEAN|TEXT|PRIMARY\s+KEY)\b/i.test(text)) scores.sql += 2;

  // Java signals
  if (/\bpublic\s+(static\s+)?(void|class|int|String)\b/.test(text)) scores.java += 3;
  if (/\bSystem\.out\.print(ln)?\b/.test(text)) scores.java += 3;
  if (/\bnew\s+\w+\(/.test(text) && /\bclass\b/.test(text)) scores.java += 2;
  if (/\b(extends|implements|@Override)\b/.test(text)) scores.java += 3;
  if (/\bprivate\s+\w+/.test(text)) scores.java += 1;

  // C/C++ signals
  if (/\b(#include|#define|#pragma)\b/.test(text)) scores['c/c++'] += 3;
  if (/\b(printf|scanf|malloc|free|sizeof)\b/.test(text)) scores['c/c++'] += 3;
  if (/\b(int|char|float|double|void)\s+\w+\s*\(/.test(text)) scores['c/c++'] += 2;
  if (/\bstd::/.test(text)) scores['c/c++'] += 3;
  if (/\b(cout|cin|endl)\b/.test(text)) scores['c/c++'] += 3;
  if (/->/.test(text) && /\b(struct|typedef)\b/.test(text)) scores['c/c++'] += 2;

  // Ruby signals
  if (/\bdo\s*\|/.test(text)) scores.ruby += 3;
  if (/\bend\b/.test(text) && /\b(def|class|module|if|do)\b/.test(text)) scores.ruby += 2;
  if (/\bputs\b/.test(text)) scores.ruby += 2;
  if (/\brequire\s+['"]/.test(text) && !/\brequire\s*\(/.test(text)) scores.ruby += 2;
  if (/\battr_(reader|writer|accessor)\b/.test(text)) scores.ruby += 3;

  // PHP signals
  if (/\$\w+/.test(text) && /->/.test(text)) scores.php += 2;
  if (/<\?php/.test(text)) scores.php += 4;
  if (/\becho\b/.test(text) && /\$\w+/.test(text)) scores.php += 2;
  if (/\b(function\s+\w+|class\s+\w+)\b/.test(text) && /\$\w+/.test(text)) scores.php += 2;

  // Find the highest scoring language
  let best = null;
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }

  // Require a minimum score threshold for confident sub-type detection
  return bestScore >= 3 ? best : null;
}

// ─── Error / stack trace detection ──────────────────────────────────────────

function detectError(text) {
  let signals = 0;

  if (/\b(Error|Exception|TypeError|ReferenceError|SyntaxError|RangeError|ValueError|KeyError|RuntimeError|NullPointerException|IndexOutOfBoundsException)\b/.test(text)) signals += 2;
  if (/\bTraceback\b.*\bcall\s+last\b/i.test(text)) signals += 3;
  if (/\bat\s+[\w$.]+\s*\(.*:\d+:\d+\)/.test(text)) signals += 3;
  if (/^\s+at\s+/m.test(text) && signals > 0) signals += 1;
  if (/\b(FATAL|WARN|ERROR|SEVERE)\b.*\d{2,4}[:\-/]\d{2}/.test(text)) signals += 2;
  if (/File\s+"[^"]+",\s+line\s+\d+/i.test(text)) signals += 3;
  if (/\b(stack\s*trace|caused\s+by|exception\s+in)\b/i.test(text)) signals += 2;

  if (signals >= 3) {
    const confidence = Math.min(0.95, 0.6 + signals * 0.08);
    return { confidence };
  }
  return null;
}

// ─── Math / formula detection ───────────────────────────────────────────────

function detectMath(text) {
  let signals = 0;

  // LaTeX patterns
  if (/\\(frac|sqrt|sum|int|prod|lim|infty|alpha|beta|gamma|delta|theta|pi|sigma|omega|partial|nabla)\b/.test(text)) signals += 3;
  if (/\\\[.*\\\]/.test(text) || /\$\$.*\$\$/.test(text) || /\\\(.*\\\)/.test(text)) signals += 3;

  // Mathematical operators and notation
  if (/[=<>]\s*[+-]?\s*\d/.test(text) && /[+\-*/^]/.test(text) && /\d/.test(text)) {
    // Check it looks formulaic, not just prose with numbers
    const mathChars = (text.match(/[=+\-*/^()∑∏∫√≤≥≠±∞∂∇∈∉⊂⊃∪∩]/g) || []).length;
    if (mathChars >= 3) signals += 2;
  }

  // Unicode math symbols
  if (/[∑∏∫√≤≥≠±∞∂∇∈∉⊂⊃∪∩]/.test(text)) signals += 2;

  // Equation-like patterns: x^2, f(x), etc.
  if (/\b[a-z]\s*\^\s*\d/.test(text) || /\b[a-z]\s*\(\s*[a-z]\s*\)/.test(text)) signals += 1;

  if (signals >= 3) {
    const confidence = Math.min(0.9, 0.5 + signals * 0.1);
    return { confidence };
  }
  return null;
}

// ─── List / structured data detection ───────────────────────────────────────

function detectData(text) {
  let signals = 0;

  // JSON-like structure
  if (/^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text)) {
    if (/"\w+"\s*:/.test(text)) signals += 3;
  }

  // XML/HTML-like tags (not just a single tag, but structured data)
  if (/<\w+>[\s\S]*<\/\w+>/.test(text) && (text.match(/<\w+>/g) || []).length >= 3) signals += 2;

  // CSV patterns: multiple lines with consistent comma/tab separation
  const lines = text.trim().split('\n');
  if (lines.length >= 3) {
    const commaLines = lines.filter(l => l.includes(','));
    const tabLines = lines.filter(l => l.includes('\t'));
    if (commaLines.length >= lines.length * 0.7) {
      const fieldCounts = commaLines.map(l => l.split(',').length);
      if (fieldCounts.length >= 2 && new Set(fieldCounts).size <= 2) signals += 3;
    }
    if (tabLines.length >= lines.length * 0.7) signals += 3;
  }

  // Numbered or bullet list patterns
  const bulletLines = lines.filter(l => /^\s*(\d+[.)]\s|[-*+]\s|•\s)/.test(l));
  if (bulletLines.length >= 3 && bulletLines.length >= lines.length * 0.5) signals += 3;

  if (signals >= 3) {
    const confidence = Math.min(0.9, 0.5 + signals * 0.1);
    return { confidence };
  }
  return null;
}

// ─── Email / message detection ──────────────────────────────────────────────

function detectEmail(text) {
  let signals = 0;

  if (/^(Subject|From|To|Cc|Bcc|Date):\s/m.test(text)) signals += 3;
  if (/\b(Dear|Hi|Hello|Hey)\s+\w+/i.test(text) &&
      /\b(Regards|Best|Thanks|Sincerely|Cheers)\b/i.test(text)) signals += 3;
  if (/\b(Dear|Hi|Hello|Hey)\s+\w+/i.test(text) && wordCount(text) > 20) signals += 1;
  if (/\b(reply|forward|attachment|attached)\b/i.test(text)) signals += 1;

  if (signals >= 3) {
    const confidence = Math.min(0.9, 0.5 + signals * 0.1);
    return { confidence };
  }
  return null;
}

function wordCount(text) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

// ─── Foreign language detection + sub-type ──────────────────────────────────

function detectForeign(text) {
  if (text.length === 0) return null;

  const nonLatinChars = (text.match(/[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g) || []).length;
  if (nonLatinChars / text.length <= 0.3) return null;

  const subType = detectNaturalLanguage(text);
  const confidence = Math.min(0.95, 0.6 + (nonLatinChars / text.length) * 0.4);
  return { subType, confidence };
}

function detectNaturalLanguage(text) {
  // Count characters in each script range
  const counts = {
    japanese: (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length,
    chinese: (text.match(/[\u4E00-\u9FFF]/g) || []).length,
    korean: (text.match(/[\uAC00-\uD7AF]/g) || []).length,
    arabic: (text.match(/[\u0600-\u06FF]/g) || []).length,
    russian: (text.match(/[\u0400-\u04FF]/g) || []).length,
    hindi: (text.match(/[\u0900-\u097F]/g) || []).length,
    thai: (text.match(/[\u0E00-\u0E7F]/g) || []).length,
  };

  // Japanese: if hiragana/katakana present, it's Japanese even with CJK
  if (counts.japanese > 0) return 'japanese';

  // Find highest count among remaining
  let best = null;
  let bestCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (lang === 'japanese') continue;
    if (count > bestCount) {
      bestCount = count;
      best = lang;
    }
  }

  return best;
}

// Export for testing (no-op in browser)
if (typeof module !== 'undefined') module.exports = {
  detectContentType,
  detectCodeLanguage,
  detectCodeHeuristics,
  detectError,
  detectMath,
  detectData,
  detectEmail,
  detectForeign,
  detectNaturalLanguage,
};
