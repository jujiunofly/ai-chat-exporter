# Privacy Policy — AI Chat Exporter

**Last updated: June 2026**

## Overview

AI Chat Exporter is a browser extension that helps you export your AI chat conversations
to PDF and Markdown files. All processing happens locally in your browser.

## Data Collection

**We do not collect, transmit, or store any of your data on external servers.**

The extension accesses the following data solely to perform exports:

- **Conversation content**: The text, code blocks, and metadata of conversations you choose to export from ChatGPT, Gemini, Claude, DeepSeek, and Grok.
- **Authentication tokens**: Session tokens from AI platforms (stored locally) to access conversation APIs for bulk export. These tokens are never transmitted to any third party.
- **User preferences**: Your export settings (filename format, download folder, format preferences) stored in your browser's local storage.

## Data Storage

All data is stored locally in your browser using the `chrome.storage` API:

- `chrome.storage.local`: Export settings, temporary conversation cache (auto-cleaned after 1 hour)
- Auth tokens are stored in `chrome.storage.local` and never synced across devices

## Data Transmission

The extension makes network requests ONLY to the AI platform APIs you are already authenticated to:

- `chatgpt.com` / `chat.openai.com`
- `gemini.google.com`
- `claude.ai`
- `deepseek.com` / `chat.deepseek.com`
- `grok.com` / `www.grok.com`

No data is sent to any other servers. No analytics, telemetry, or tracking.

## Third-Party Services

None. The extension does not integrate with any third-party analytics, advertising,
or data processing services.

## Data Deletion

To delete all stored data:
1. Right-click the extension icon → "Options"
2. Reset all settings to defaults
3. Or uninstall the extension — this removes all stored data automatically

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Store your export preferences |
| `activeTab` | Access the current tab when you click export |
| `downloads` | Save exported files to your computer |
| `alarms` | Clean up temporary export data |

## Contact

For privacy questions, open an issue on our GitHub repository:
https://github.com/pinguarmy/ai-chat-exporter/issues

## Changes

We will update this policy if our practices change. Check the "Last updated" date above.
