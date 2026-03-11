<p align="center">
  <img src="icons/icon128.png" alt="Ask AI" width="80" />
</p>

<h1 align="center">Ask AI</h1>

<p align="center">
  <strong>Select any text on the web and send it to ChatGPT or Claude with one click.</strong>
</p>

<p align="center">
  <a href="https://github.com/zhongnansu/ask-ai-extension/actions/workflows/ci.yml"><img src="https://github.com/zhongnansu/ask-ai-extension/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/zhongnansu/ask-ai-extension/actions/workflows/security.yml"><img src="https://github.com/zhongnansu/ask-ai-extension/actions/workflows/security.yml/badge.svg" alt="Security"></a>
  <a href="https://github.com/zhongnansu/ask-ai-extension/actions/workflows/coverage.yml"><img src="https://github.com/zhongnansu/ask-ai-extension/actions/workflows/coverage.yml/badge.svg" alt="Coverage"></a>
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/manifest-v3-green" alt="Manifest V3">
  <a href="https://github.com/zhongnansu/ask-ai-extension/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="License"></a>
  <img src="https://img.shields.io/badge/chrome-web%20store-orange?logo=googlechrome&logoColor=white" alt="Chrome Web Store">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

<p align="center">
  Zero setup · Zero cost · Zero data collection
</p>

---

Ask AI is a lightweight Chrome extension that adds a floating trigger to any text selection. Pick a smart preset prompt or write your own, choose your AI, and go — no copy-pasting, no tab-switching, no accounts.

## Why Ask AI?

| | Ask AI | HARPA AI | Merlin | Monica | Sider |
|---|:---:|:---:|:---:|:---:|:---:|
| **100% Free** | ✅ | ❌ $12-19/mo | ❌ $19/mo | ❌ $8-17/mo | ❌ $8-17/mo |
| **No Account Required** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Zero Data Collection** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Smart Content Detection** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Open Source** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Lightweight** | ✅ ~1K LOC | ❌ | ❌ | ❌ | ❌ |

## Features

- **Smart content detection** — automatically detects code (JavaScript, Python, SQL, etc.), foreign languages (Japanese, Arabic, Korean, etc.), error logs, emails, data/tables, math formulas, and more — then suggests the most relevant presets
- **AI selector** — toggle between ChatGPT and Claude; your preference is remembered
- **Preset prompts** — one-click actions like "Explain this JavaScript", "Translate from Japanese", "Debug this error", "Summarize"
- **Custom instructions** — type any prompt to pair with your selected text
- **Page context injection** — optionally include the page title and URL for richer AI responses
- **Context menu fallback** — right-click "Ask AI" works even on pages with strict Content Security Policies
- **Shadow DOM isolation** — the popup UI is fully encapsulated and won't conflict with page styles
- **Clipboard fallback** — when the prompt is too long for a URL, it's copied to your clipboard automatically

## Quick Start

### Chrome Web Store

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/ask-ai/ebkmcgbkhegdmmmofiobmpnfmlljjjea) — one click and you're ready.

### Manual Installation

```bash
git clone https://github.com/zhongnansu/ask-ai-extension.git
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** → select the `ask-ai-extension` directory
4. Done — select any text on a webpage to try it

## Usage

```
Select text → Click "Ask AI" → Pick a preset → Send → AI responds in new tab
```

1. **Select text** on any web page (minimum 3 characters)
2. Click the floating **"✦ Ask AI"** trigger button
3. **Pick a preset** (auto-suggested based on content type) or **type a custom instruction**
4. **Choose your AI** — ChatGPT or Claude
5. Click **Send** — a new tab opens with your prompt ready

> **Tip:** On pages where the popup can't appear (e.g., Chrome Web Store), right-click and choose **"Ask AI"** from the context menu.

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Content Scripts │     │  Shadow DOM      │     │  Background       │
│                  │────>│  Popup           │────>│  Service Worker   │
│  detection.js    │     │  popup.js        │     │  background.js    │
│  trigger.js      │     │  presets.js      │     │  Opens AI tab     │
│  content.js      │     │  prompt.js       │     │  Context menu     │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

**Smart Detection** is what sets Ask AI apart. When you select text, `detection.js` analyzes it using heuristics — code keywords, Unicode character ranges, structural patterns — to determine the content type and even the specific language:

| Content Type | Detection | Example Presets |
|---|---|---|
| JavaScript | `const`, `let`, `=>`, `function` | "Explain this JavaScript", "Debug this" |
| Python | `def`, `import`, `self`, `elif` | "Explain this Python", "Add type hints" |
| Japanese | Hiragana/Katakana ranges | "Translate from Japanese" |
| Error/Stack trace | `Error:`, `Traceback`, `TypeError` | "Explain this error", "Suggest fix" |
| Email | `Dear`/`Hi` + `Regards`/`Best` | "Draft reply", "Make more professional" |
| Math formula | LaTeX patterns, operators | "Solve this", "Explain step by step" |
| Long text | >200 words | "Summarize", "Key points" |

## Architecture

```
ask-ai-extension/
├── manifest.json          # Chrome extension manifest (MV3)
├── background.js          # Service worker — tab management, context menu
├── content.js             # Entry point — message listener, click-outside dismiss
├── detection.js           # Smart content type detection engine
├── presets.js             # Preset prompt configurations per content type
├── prompt.js              # Prompt construction and AI URL generation
├── trigger.js             # Floating "Ask AI" trigger button on text selection
├── popup.js               # Shadow DOM popup UI and interaction handlers
├── icons/                 # Extension icons (16, 48, 128 PNG)
├── tests/                 # Vitest test suite (200+ tests)
├── .github/workflows/     # CI, coverage, security, release pipelines
├── vitest.config.js       # Test configuration
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint manifest
npx --yes chrome-manifest-lint manifest.json
```

### CI/CD

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Tests + manifest linting on every push/PR |
| `coverage.yml` | Code coverage reporting |
| `security.yml` | Security scanning |
| `release.yml` | Build + GitHub Release + Chrome Web Store publish on `v*` tags |
| `pr-preview.yml` | PR preview builds |
| `auto-label.yml` | Auto-labels PRs by file path |
| `permission-guard.yml` | Flags manifest permission changes |
| `version-bump.yml` | Automated version bumping |

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

Please follow the existing code style and include tests for any new functionality.

## Privacy

Ask AI collects **zero data**. No accounts, no analytics, no cookies, no telemetry. Your text selections are processed locally and sent directly to the AI provider you choose. See [PRIVACY.md](PRIVACY.md) for details.

## License

[MIT](LICENSE) — free and open source.

---

<p align="center">
  Built with ☕ and a dislike for copy-pasting
</p>
