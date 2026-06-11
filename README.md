<div align="center">

# AI Chat Exporter

**Export your ChatGPT, Gemini, Claude, DeepSeek & Grok conversations to beautifully formatted files.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)](https://github.com/pinguarmy/ai-chat-exporter)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Plasmo](https://img.shields.io/badge/Built_with-Plasmo-purple.svg)](https://plasmo.com)

<br/>

One-click export. Bulk download. Custom filenames. Beautiful output.

[Install](#installation) · [Features](#features) · [Usage](#usage) · [Development](#development)

</div>

---

## Why?

ChatGPT, Gemini, Claude, DeepSeek, and Grok don't let you export your conversations in a clean, portable format. Your conversations are trapped inside their platforms. **AI Chat Exporter** fixes that.

Export any conversation to **PDF** or **Markdown** with proper formatting, code blocks, images, and metadata. Perfect for:

- **Archiving** important conversations before they get deleted
- **Sharing** AI-generated content with colleagues or classmates
- **Building a personal knowledge base** from your best AI interactions
- **Migrating** conversations between platforms
- **Printing** long research sessions or coding tutorials

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Platform** | Works on ChatGPT, Gemini, Claude, DeepSeek, and Grok |
| **PDF Export** | Clean, print-ready PDF with proper page breaks and typography |
| **Markdown Export** | Structured `.md` files with code blocks, headers, and formatting |
| **Bulk Export** | Fetch ALL your conversations via API and export multiple at once |
| **Custom Filenames** | Template system with `{date}`, `{title}`, `{platform}`, `{conv_date}` |
| **Auto-Download** | No save dialogs — files go straight to your configured folder |
| **Organized Folders** | Auto-sort exports into `ChatGPT/`, `Gemini/`, `Claude/`, `DeepSeek/`, or `Grok/` subfolders |
| **Dark Mode** | Full light/dark theme support via CSS custom properties |
| **Zero Tracking** | No analytics, no accounts, no data leaves your browser |
| **Open Source** | MIT licensed — inspect, fork, and contribute |

## Installation

### From Source (2 minutes)

```bash
# Clone
git clone https://github.com/pinguarmy/ai-chat-exporter.git
cd ai-chat-exporter

# Install
npm install

# Build
npx plasmo build

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked"
# 4. Select the build/chrome-mv3-prod/ folder
```

### Chrome Web Store

*Coming soon — star the repo to get notified!*

## Usage

### Export Current Conversation

1. Open any conversation on **ChatGPT**, **Gemini**, **Claude**, **DeepSeek**, or **Grok**
2. Click the **AI Chat Exporter** icon in your toolbar
3. Choose **PDF** or **Markdown**
4. Click **Export** — file downloads automatically

### Bulk Export

1. Navigate to ChatGPT, Gemini, Claude, DeepSeek, or Grok
2. Click the extension icon → **Bulk** tab
3. Wait for conversations to load (uses API — gets ALL, not just visible)
4. Select conversations with checkboxes
5. Click **Export Selected**

### Custom Filenames

Configure filename patterns in Settings:

| Token | Output | Example |
|-------|--------|---------|
| `{date}` | Current date | `2026-06-11` |
| `{conv_date}` | Conversation start date | `2026-06-08` |
| `{title}` | Session title | `how-to-learn-python` |
| `{platform}` | Platform name | `chatgpt` |
| `{index}` | Number (bulk) | `001` |
| `{msgcount}` | Message count | `24` |

Default pattern: `{conv_date}-{title}` → `2026-06-08-how-to-learn-python.pdf`

### Download Folders

Choose where files are saved in Settings:

- **Default** → `Downloads/` root
| **By Platform** | `Downloads/ChatGPT/`, `Downloads/Gemini/`, `Downloads/Claude/`, `Downloads/DeepSeek/`, or `Downloads/Grok/` |
- **Custom** → Any folder name you choose

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Content     │────▶│  DOM Parser  │────▶│  Conversation │
│  Script      │     │  (messages)  │     │  Object       │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                  │
┌─────────────┐     ┌──────────────┐              ▼
│  Hook        │────▶│  Credential  │     ┌───────────────┐
│  Script      │     │  Capture     │     │  Export Engine │
└─────────────┘     └──────────────┘     │  (PDF / MD)   │
                                          └───────┬───────┘
                                                  │
                                                  ▼
                                          ┌───────────────┐
                                          │  Download      │
                                          │  (auto-save)   │
                                          └───────────────┘
```

- **Content scripts** parse conversations from the page DOM
- **Hook script** intercepts API calls to capture auth credentials
- **API fetcher** retrieves full conversation list with pagination
- **Export engine** converts to PDF (html2canvas + jsPDF) or Markdown
- **Auto-download** saves to configured folder without prompts

## Development

```bash
# Install
npm install

# Development mode (watch + hot reload)
npx plasmo dev

# Run tests (231 tests)
npm test

# Production build
npx plasmo build
```

### Project Structure

```
ai-chat-exporter/
├── src/
│   ├── popup.tsx              # Main UI (Current + Bulk tabs)
│   ├── options.tsx            # Settings page
│   ├── background.ts          # Service worker
│   ├── contents/
│   │   ├── chatgpt-parser.ts  # ChatGPT DOM + API parser
│   │   └── gemini-parser.ts   # Gemini DOM + API parser
│   ├── lib/
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── export-markdown.ts # Markdown generator
│   │   ├── export-pdf.ts      # PDF generator
│   │   ├── filename.ts        # Filename templates
│   │   └── dom-utils.ts       # DOM helpers
│   ├── components/            # React UI components
│   ├── styles/                # CSS (Gemini design system)
│   └── tabs/                  # Preview page
├── tests/                     # 231 tests (Vitest + jsdom)
├── GUIDE.md                   # Full development guide
└── package.json
```

### Testing

```bash
npm test                # Run all 231 tests
npx vitest run          # Same
npx vitest watch        # Watch mode
```

## Contributing

Contributions welcome! Here's how:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/awesome`)
3. **Commit** your changes (`git commit -m 'Add awesome feature'`)
4. **Push** to the branch (`git push origin feature/awesome`)
5. **Open** a Pull Request

### Good First Issues

- Add Firefox support (Manifest V2 compatibility)
- Add conversation search/filter in bulk mode
- Add HTML export format
- Add Notion/Obsidian integration
- Improve PDF styling with syntax highlighting

## Privacy

This extension:

- ✅ Runs entirely in your browser
- ✅ Sends NO data to any server
- ✅ Uses NO analytics or tracking
- ✅ Stores settings locally in chrome.storage
- ✅ Source code is fully auditable

## License

[MIT](LICENSE) — use it however you want.

## Acknowledgments

- Built with [Plasmo](https://plasmo.com/) — the browser extension framework
- UI design inspired by [Linear](https://linear.app/) and [Notion](https://notion.so/)
- PDF generation via [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://github.com/niklasvh/html2canvas)

---

<div align="center">

**Made with ❤️ by [pinguarmy](https://github.com/pinguarmy)**

If this saved you time, give it a ⭐ — it helps others find it.

</div>
