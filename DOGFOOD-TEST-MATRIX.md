# Round 1 Dogfood QA Matrix — AI Chat Exporter

> Platforms: ChatGPT · Gemini · Claude · DeepSeek · Grok
> Formats: Markdown · PDF
> Created: 2026-07-08

---

## 1 — Basic Single-Export Smoke Test (all 5 platforms)

**Scenario:** Open a simple 3-turn conversation on each platform → click Export → choose Markdown → click Export.
**Steps per platform:**
1. Navigate to a known conversation with ~3 user/assistant turns
2. Click extension icon → verify platform detected correctly
3. Select "Markdown" → click "Export"
4. Verify file downloads

**Pass criteria:**
- [ ] Platform auto-detected (popup shows correct platform name)
- [ ] `.md` file downloads to `Downloads/` (default folder)
- [ ] File contains `# <title>` header, metadata block, user/assistant messages in order
- [ ] Footer contains `*Exported from <PlatformName> on <date>*`
- [ ] Repeat for PDF: valid PDF opens, has title + messages + footer

---

## 2 — Code Block Preservation (all platforms)

**Scenario:** Export a conversation containing fenced code blocks with language tags.

**Test data:** A conversation where the assistant replies with a triple-backtick code block (e.g. ````python ... ```), an unlabeled code block, and inline code.

**Pass criteria (Markdown):**
- [ ] Fenced blocks appear as ```` ```<language> ```` in output
- [ ] Language tag preserved (e.g. `python`, `javascript`, or empty)
- [ ] Indentation/whitespace inside code block preserved
- [ ] Inline backtick code not confused with block delimiters

**Pass criteria (PDF):**
- [ ] Code block renders with monospace font
- [ ] Syntax-highlighted block has distinct visual style vs. body text

---

## 3 — LaTeX / Math Equations (ChatGPT, Gemini, Claude)

**Scenario:** Export a conversation where the assistant replies with LaTeX formulas (inline `$...$` and display `$$...$$`).

**Pass criteria (Markdown):**
- [ ] LaTeX expressions preserved verbatim in the markdown (not HTML-encoded)
- [ ] Both inline `$x^2$` and display `$$\int f(x) dx$$` are intact

**Pass criteria (PDF):**
- [ ] LaTeX renders as formatted math (not raw `$` symbols)

---

## 4 — Images & Attachments

**Scenario:** Export a conversation containing uploaded images (user attachments) and assistant-generated images.

**Test data:** A conversation where the user uploaded a screenshot and the assistant replied with an inline image.

**Pass criteria (Markdown):**
- [ ] Images render as `![alt text](url)` in markdown
- [ ] Image alt text or caption preserved (if available)
- [ ] Non-image attachments (files, links) listed under `**Attachments:**`

**Pass criteria (PDF):**
- [ ] Images embedded in the PDF at a reasonable size
- [ ] Broken/missing images don't crash the export

---

## 5 — Claude Artifacts (tool_use, tool_result, document blocks)

**Scenario:** Export a Claude conversation where the assistant created an artifact (e.g., an HTML page or code document).

**Test data:** A conversation with `tool_use` (name: `artifacts`) containing `input.content` and a follow-up `tool_result`.

**Pass criteria:**
- [ ] Artifact content captured (type: code/html based on tool name)
- [ ] Artifact title extracted from `input.title`
- [ ] Tool use JSON appears as text in the message: `Tool use: artifacts`
- [ ] Tool result content merged into message text
- [ ] Multiple artifacts in one conversation each captured separately
- [ ] `document` type blocks extract title + content + mimeType

---

## 6 — Gemini Research / Document Artifacts

**Scenario:** Export a Gemini conversation containing a research document or generated document artifact.

**Test data:** A Gemini conversation where the model produced a multi-section document with headers, tables, or embedded links.

**Pass criteria:**
- [ ] Document section headers preserved as markdown `#` / `##`
- [ ] Table content rendered (as markdown table or text)
- [ ] Links within the document preserved
- [ ] If API detail fetch succeeds: richer formatting than DOM-only parse
- [ ] If API fails: DOM fallback still produces readable output

---

## 7 — Long Conversation (50+ turns)

**Scenario:** Export a long conversation (50+ messages, mixed user/assistant).

**Pass criteria (Markdown):**
- [ ] All 50+ messages present in order
- [ ] No truncation — file size scales with content
- [ ] Metadata shows correct `**Messages:** 50+` count
- [ ] Footer `---` separator still present at end

**Pass criteria (PDF):**
- [ ] All content rendered across multiple pages
- [ ] Page breaks don't split mid-code-block
- [ ] File renders smoothly in PDF viewer (no corruption)

---

## 8 — Unicode / CJK Title & Filename

**Scenario:** Export a conversation titled in Chinese characters (e.g. "父亲体检报告分析与病情评估").

**Pass criteria:**
- [ ] Title preserved correctly in markdown header: `# 父亲体检报告分析与病情评估`
- [ ] Filename contains CJK characters: `2026-07-08-父亲体检报告分析与病情评估.md`
- [ ] File saves without error on macOS
- [ ] No filename encoding issues or replacement with underscores

---

## 9 — Filename Template Tokens

**Scenario:** Set a custom filename pattern `{platform}-{conv_date}-{title}-{msgcount}` and export.

**Pass criteria:**
- [ ] `{platform}` → `chatgpt` / `gemini` / `claude` / `deepseek` / `grok`
- [ ] `{conv_date}` → `YYYY-MM-DD` from conversation creation date
- [ ] `{title}` → sanitized (spaces→hyphens, unsafe chars removed, truncated to 200)
- [ ] `{msgcount}` → actual message count
- [ ] `{date}` → today's export date
- [ ] `{datetime}` → `YYYY-MM-DDTHHmmss`
- [ ] Missing tokens (e.g. no `createdAt`) fall back to current date

---

## 10 — Download Folder Modes

**Scenario:** Toggle between Default, By-Platform, and Custom folder modes in settings, then export.

**Pass criteria:**
| Mode | Expected path |
|------|--------------|
| `default` | `Downloads/2026-07-08-my-title.md` |
| `by-platform` | `Downloads/ChatGPT/2026-07-08-my-title.md` |
| `by-platform` (Claude) | `Downloads/Claude/2026-07-08-my-title.md` |
| `custom` ("我的导出") | `Downloads/我的导出/2026-07-08-my-title.md` |
| `custom` (unsafe `../Bad:Name*?`) | `Downloads/_Bad_Folder_Name_/2026-07-08-my-title.md` |
| `custom` (empty string) | `Downloads/AI Chat Exports/2026-07-08-my-title.md` |

---

## 11 — Bulk Export (ChatGPT, Claude, DeepSeek, Grok)

**Scenario:** Navigate to ChatGPT (or other platform) → click Bulk tab → wait for list → select 5 conversations → Export Selected.

**Pass criteria:**
- [ ] Conversation list loads (API-based, not limited to sidebar visible items)
- [ ] List shows title, message count (if available), creation date
- [ ] Checkboxes allow selecting/deselecting
- [ ] "Export Selected" processes each conversation sequentially
- [ ] Progress indicator updates: fetching → exporting → done
- [ ] Each file downloads to correct path (respecting folder mode)
- [ ] Index token `{index}` produces `001`, `002`, etc.
- [ ] Failed conversations increment `failed` count, don't block others

---

## 12 — Gemini Bulk Export (batchexecute API)

**Scenario:** Navigate to gemini.google.com → Bulk tab → fetch conversation list.

**Pass criteria:**
- [ ] Auth token obtained from hook script (stored in `gemini_credentials_map`)
- [ ] Batchexecute API call uses correct RPC ID `MaZiqc`
- [ ] Conversation list parsed from response (items with ID + title)
- [ ] Fallback to DOM sidebar list if API returns empty
- [ ] Multi-account support: correct `f.sid` selected for current account slot (`/u/0/...`)

---

## 13 — Parser Fallback: DOM vs API

**Scenario:** On ChatGPT/Claude, open a conversation where the DOM only renders the user message (assistant in virtualized tree) but the API returns full content.

**Pass criteria:**
- [ ] `preferMoreCompleteConversation()` detects DOM-only result has no assistant content
- [ ] API result with assistant content is preferred
- [ ] If both have assistant content, the one with more messages wins
- [ ] If API fails (network error), DOM result used as fallback without crash

---

## 14 — Empty & Edge-Case Conversations

**Scenario A:** Export a conversation with 0 messages (empty chat).
**Scenario B:** Export a conversation where all messages have empty string content.
**Scenario C:** Export a conversation with only user messages (no assistant response — e.g., interrupted).

**Pass criteria:**
- [ ] Zero messages: valid markdown with `**Messages:** 0` + footer
- [ ] Zero messages: valid HTML/PDF with `<!DOCTYPE html>` + `<footer>`
- [ ] Empty string messages: still produces valid output, no crash
- [ ] No assistant response: valid export, footer present, no undefined/NaN in metadata

---

## 15 — Special Characters & XSS Safety

**Scenario:** Export a conversation containing HTML entities, markdown-breaking characters, and potential XSS payloads in user messages.

**Test data:** Messages with `<script>alert(1)</script>`, `&amp;`, `| pipes |`, `> 45%`, `E=mc²`, emoji 🎉, Arabic text مرحبا.

**Pass criteria (Markdown):**
- [ ] `<script>` tag appears as literal text (not interpreted)
- [ ] `&amp;`, `&lt;` etc. preserved or decoded to readable characters
- [ ] Pipe characters don't break markdown table syntax
- [ ] Emoji and non-Latin text preserved

**Pass criteria (PDF):**
- [ ] HTML entities escaped properly via `escapeHtml()`
- [ ] Special chars render correctly (not as mojibake)

---

## 16 — Metadata Toggle

**Scenario:** Export the same conversation with `includeMetadata: true` and `includeMetadata: false`.

**Pass criteria (Markdown, metadata ON):**
- [ ] `# <title>` present
- [ ] `## Metadata` section with Platform, URL, Messages, Created

**Pass criteria (Markdown, metadata OFF):**
- [ ] No `# <title>` header
- [ ] No `## Metadata` section
- [ ] Messages still present with role labels

**Pass criteria (PDF, metadata ON):**
- [ ] `<h1>` with title
- [ ] `<div class="metadata">` with platform + message count

**Pass criteria (PDF, metadata OFF):**
- [ ] No `<h1>` or metadata div

---

## 17 — Code Blocks Deduplication in Markdown

**Scenario:** Export a conversation where the assistant's message already contains a fenced code block inline, AND also has extracted `codeBlocks[]` — verify no duplicate rendering.

**Pass criteria:**
- [ ] Markdown output contains the code block exactly once
- [ ] Dedup logic checks `contentLower.includes(blockCode.slice(0, 50))`
- [ ] Short code blocks (<10 chars) from `codeBlocks[]` are always included (bypass dedup)
- [ ] Long code blocks already in `content` are not re-emitted

---

## 18 — Platform Label Consistency

**Scenario:** Export from each platform and verify the platform name appears correctly in:
1. Markdown header metadata (`**Platform:** <label>`)
2. Markdown footer (`*Exported from <label> on <date>*`)
3. PDF metadata section (`<strong>Platform:</strong> <label>`)
4. PDF footer (`Exported from <label>`)

| Platform key | Expected label |
|-------------|----------------|
| `chatgpt` | `ChatGPT` |
| `gemini` | `Google Gemini` |
| `claude` | `Claude` |
| `deepseek` | `DeepSeek` |
| `grok` | `Grok` |

**Pass criteria:**
- [ ] All 5 labels match exactly (no "GPT" or "Deep Seek" etc.)
- [ ] PDF HTML uses correct `escapeHtml()` for the label

---

## 19 — Scheduled Export (background periodic)

**Scenario:** Enable scheduled export for ChatGPT with frequency `daily`, `maxPerRun: 5`, `closeTabAfterExport: true`.

**Pass criteria:**
- [ ] Settings save to `chrome.storage` correctly
- [ ] Alarm fires at configured frequency
- [ ] `maxPerRun` limits exported conversations
- [ ] `closeTabAfterExport` closes the tab after each export
- [ ] `requestDelayMs` inserts pause between exports (rate limiting)
- [ ] Exported record stored in dedup history (no re-export next run)
- [ ] Status tracks `lastRunAt`, `lastRunExported`, `lastRunFailed`

---

## 20 — Auth Expiration & Token Refresh

**Scenario:** Simulate an expired access token during bulk export.

**ChatGPT:** First API call returns 401 → extension clears cached token, fetches new one from `/api/auth/session`, retries.
**Gemini:** Hook script fails to capture `at` token → falls back to `__WIZ_global_data` → falls back to DOM.
**Claude:** Session cookie expired → API returns 401 → extension falls back to DOM parsing.

**Pass criteria:**
- [ ] ChatGPT: `resetAccessToken()` called, new token fetched, bulk export continues
- [ ] Gemini: credential fallback chain works (hook → __WIZ → script tag → DOM)
- [ ] Claude: cookie-based auth gracefully falls back to DOM
- [ ] All platforms: user sees error state, not infinite spinner

---

## Summary

| # | Scenario | Platforms | Formats | Priority |
|---|----------|-----------|---------|----------|
| 1 | Basic single-export smoke | All 5 | MD + PDF | P0 |
| 2 | Code block preservation | All 5 | MD + PDF | P0 |
| 3 | LaTeX equations | ChatGPT, Gemini, Claude | MD + PDF | P1 |
| 4 | Images & attachments | All 5 | MD + PDF | P1 |
| 5 | Claude artifacts | Claude | MD + PDF | P0 |
| 6 | Gemini research documents | Gemini | MD + PDF | P0 |
| 7 | Long conversation (50+ turns) | All 5 | MD + PDF | P1 |
| 8 | Unicode/CJK filenames | All 5 | MD | P1 |
| 9 | Filename template tokens | All 5 | MD | P1 |
| 10 | Download folder modes | All 5 | MD + PDF | P0 |
| 11 | Bulk export | ChatGPT, Claude, DeepSeek, Grok | MD + PDF | P0 |
| 12 | Gemini bulk (batchexecute) | Gemini | MD + PDF | P0 |
| 13 | Parser fallback (DOM vs API) | ChatGPT, Claude | MD + PDF | P1 |
| 14 | Empty/edge-case conversations | All 5 | MD + PDF | P1 |
| 15 | Special characters & XSS | All 5 | MD + PDF | P1 |
| 16 | Metadata toggle | All 5 | MD + PDF | P2 |
| 17 | Code block dedup | All 5 | MD | P2 |
| 18 | Platform label consistency | All 5 | MD + PDF | P2 |
| 19 | Scheduled export | All 5 | MD | P2 |
| 20 | Auth expiration & refresh | ChatGPT, Gemini, Claude | — | P1 |

**Total: 20 scenarios × 5 platforms × 2 formats ≈ up to 200 individual test cases at full matrix depth.**
