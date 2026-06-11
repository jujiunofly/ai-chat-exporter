import type { PlasmoConfig } from "plasmo"

const config: PlasmoConfig = {
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*"],
      js: ["src/contents/chatgpt-parser.ts"]
    },
    {
      matches: ["https://gemini.google.com/*"],
      js: ["src/contents/gemini-parser.ts"]
    }
  ],
  permissions: ["storage", "activeTab", "downloads", "alarms"]
}

export default config
