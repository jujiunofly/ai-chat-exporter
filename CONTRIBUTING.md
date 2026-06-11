# Contributing to AI Chat Exporter

Thanks for your interest! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/pinguarmy/ai-chat-exporter.git
cd ai-chat-exporter
npm install
npm test
```

## Development

```bash
npx plasmo dev    # Watch mode with hot reload
npm test          # Run all 231 tests
npx plasmo build  # Production build
```

## Pull Request Process

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Build: `npx plasmo build`
6. Commit: `git commit -m 'Add my feature'`
7. Push: `git push origin feature/my-feature`
8. Open a PR

## Code Style

- TypeScript with strict mode
- Functional React components with hooks
- CSS custom properties (no Tailwind)
- JSDoc comments on public functions
- All changes need tests

## Good First Issues

- Firefox support (Manifest V2)
- HTML export format
- Conversation search in bulk mode
- Syntax highlighting in PDF exports
- Notion/Obsidian integration

## Questions?

Open a [Discussion](https://github.com/pinguarmy/ai-chat-exporter/discussions) or an [Issue](https://github.com/pinguarmy/ai-chat-exporter/issues).
