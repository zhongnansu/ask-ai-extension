# Ask AI

**Select any text on the web and send it to ChatGPT or Claude with one click.**

Ask AI is a Chrome extension that adds a floating trigger button to any text selection. Pick a smart preset prompt or write your own, choose your AI, and go — no copy-pasting, no tab-switching.

---

## Features

- **Text selection trigger** — select 3+ characters on any page and a floating "Ask AI" button appears
- **AI selector** — toggle between ChatGPT and Claude; your preference is remembered
- **Smart content detection** — automatically detects code, foreign language, long text, or general content and suggests relevant presets
- **Preset prompts** — one-click actions like "Explain code", "Translate", "Summarize", "Debug this"
- **Custom instructions** — type any prompt to pair with your selected text
- **Page context injection** — optionally include the page title and URL for richer AI responses
- **Clipboard fallback** — when the prompt is too long for a URL, it's copied to your clipboard automatically
- **Context menu fallback** — right-click "Ask AI" works even on pages with strict Content Security Policies
- **Shadow DOM isolation** — the popup UI is fully encapsulated and won't conflict with page styles

## Screenshots

> *Coming soon — screenshots and demo GIF will be added here.*

## Installation

1. Clone or download this repository
2. Open **chrome://extensions** in Chrome
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `ask-ai-extension` directory
6. The Ask AI icon appears in your toolbar — you're ready to go

## Usage

1. **Select text** on any web page (minimum 3 characters)
2. Click the floating **"Ask AI"** trigger button that appears near your selection
3. **Pick a preset** (suggested based on content type) or **type a custom instruction**
4. **Choose your AI** — ChatGPT or Claude
5. Optionally toggle **"Include page context"** to send the page title and URL
6. Click **Send** — a new tab opens with your prompt ready in the AI chat

For pages where content scripts are blocked (e.g., Chrome Web Store), right-click your selection and choose **"Ask AI"** from the context menu.

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Content     │     │  Shadow DOM  │     │   Background     │
│  Scripts     │────>│  Popup       │────>│   Service Worker │
│              │     │              │     │                  │
│ detection.js │     │  popup.js    │     │  background.js   │
│ trigger.js   │     │  presets.js  │     │  Opens AI tab    │
│ content.js   │     │  prompt.js   │     │  Context menu    │
└─────────────┘     └──────────────┘     └─────────────────┘
```

- **Content scripts** detect text selection and show the floating trigger button
- **Smart detection** (`detection.js`) analyzes selected text using heuristics — code keywords, non-Latin character ratios, word count — to determine content type
- **Popup** (`popup.js`) renders inside a closed Shadow DOM for style isolation, loads user preferences from `chrome.storage.local`, and builds the prompt
- **Prompt engine** (`prompt.js`) constructs the final prompt with optional page context and generates the AI URL (with clipboard fallback for long prompts exceeding 8,000 characters)
- **Background service worker** (`background.js`) opens AI tabs and provides the context menu fallback for CSP-blocked pages

## Development

```bash
# Clone the repository
git clone https://github.com/zhongnansu/ask-ai-extension.git
cd ask-ai-extension

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Load the extension in Chrome (see Installation above)
```

### Project Structure

```
ask-ai-extension/
├── manifest.json          # Chrome extension manifest (MV3)
├── background.js          # Service worker — tab management, context menu
├── content.js             # Entry point — message listener, click-outside dismiss
├── detection.js           # Content type detection (code/foreign/long/default)
├── presets.js             # Preset prompt configurations per content type
├── prompt.js              # Prompt construction and AI URL generation
├── trigger.js             # Floating "Ask AI" trigger button on text selection
├── popup.js               # Shadow DOM popup UI and interaction handlers
├── icons/                 # Extension icons
├── tests/                 # Vitest test suite
│   ├── background.test.js
│   ├── detection.test.js
│   ├── popup.test.js
│   ├── presets.test.js
│   ├── prompt.test.js
│   ├── trigger.test.js
│   └── wirePopupEvents.test.js
├── vitest.config.js       # Test configuration
└── package.json
```

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

Please follow the existing code style and include tests for any new functionality.

## License

MIT
