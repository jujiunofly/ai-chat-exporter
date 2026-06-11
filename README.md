# AI Chat Exporter

A Chrome extension that exports conversations from ChatGPT and Gemini to PDF and Markdown files. Built with the Plasmo framework and TypeScript.

## Features

- **Multi-Platform Support**: Export from both ChatGPT and Gemini
- **Multiple Formats**: Save as PDF or Markdown
- **Rich Content**: Preserves code blocks, images, and links
- **Batch Export**: Export multiple conversations at once
- **Clean Output**: Well-formatted documents ready for sharing or archiving
- **Customizable Options**: Configure what content to include
- **Open Source**: MIT licensed, community contributions welcome

## Installation

### From Source (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/ai-chat-exporter.git
   cd ai-chat-exporter
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the extension:
   ```bash
   pnpm build
   ```

4. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build` folder from the project

### Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store. Stay tuned!

## Usage

1. **Navigate to a conversation** on ChatGPT (chatgpt.com) or Gemini (gemini.google.com)

2. **Click the extension icon** in your browser toolbar

3. **Select export format** (PDF or Markdown)

4. **Click Export** to download the conversation

### Options

Access extension options by clicking the gear icon in the popup:

- **Default Format**: Set your preferred export format
- **Include Metadata**: Add timestamp and conversation info
- **Include Code Blocks**: Preserve formatted code
- **Include Images**: Embed or reference images
- **Theme**: Choose light or dark mode for the interface

## Screenshots

*[Screenshots coming soon]*

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Type check
pnpm lint
```

### Project Structure

```
ai-chat-exporter/
├── src/
│   ├── popup.tsx           # Extension popup UI
│   ├── options.tsx         # Settings page
│   ├── background.ts      # Service worker
│   ├── contents/          # Content scripts for each platform
│   ├── lib/               # Shared utilities and types
│   ├── components/        # Reusable React components
│   ├── styles/            # CSS styles
│   └── tabs/              # Additional pages
├── __tests__/             # Test files
├── icons/                 # Extension icons
└── package.json
```

### Testing

Tests are written using Vitest with jsdom environment:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
- Code follows TypeScript best practices
- Tests are added for new features
- Documentation is updated as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This extension is not affiliated with, endorsed by, or connected to OpenAI (ChatGPT) or Google (Gemini). It reads publicly visible DOM content from these services. Users are responsible for complying with the terms of service of these platforms.

## Acknowledgments

- Built with [Plasmo](https://www.plasmo.com/) framework
- React for the user interface
- TypeScript for type safety
