const config = {
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*"],
      js: ["src/contents/chatgpt-parser.ts"]
    },
    {
      matches: ["https://gemini.google.com/*"],
      js: ["src/contents/gemini-parser.ts"]
    },
    {
      matches: ["https://deepseek.com/*", "https://chat.deepseek.com/*"],
      js: ["src/contents/deepseek-parser.ts"]
    },
    {
      matches: ["https://grok.com/*"],
      js: ["src/contents/grok-parser.ts"]
    },
    {
      matches: ["https://claude.ai/*"],
      js: ["src/contents/claude-parser.ts"]
    }
  ],
  permissions: ["storage", "activeTab", "downloads", "alarms"]
}

export default config
