# Export integrity remediation

This is an implementation record for the provider-export hardening work. It
contains no conversation content, credentials, cookies, or account identifiers.

| Area | Status | Code/tests | Live status |
| --- | --- | --- | --- |
| Shared conversation completeness | Implemented | `src/lib/conversation-integrity.ts`, `tests/conversation-integrity.test.ts` | Fixture only |
| Claude DOM assistant extraction | Implemented | `src/contents/claude-parser.ts`, `tests/claude-parser-live-regression.test.ts` | Not live-tested |
| Claude active tree branch | Implemented | `selectClaudeActiveBranch` and branch fixtures | Not live-tested |
| ChatGPT legacy host injection | Implemented | content-script match and manifest verification | Chrome/Firefox live test pending |
| DeepSeek/Grok DOM fallback | Implemented | `tests/provider-dom-fallback-live.test.ts` | Not live-tested |
| DeepSeek history pagination | Implemented conservatively with cursor/offset guards | parser pagination helper | Endpoint live test pending |
| Gemini incomplete DOM hydration | Implemented | detail fallback and credential recency selection | Not live-tested |
| Scheduled retry/single-flight | Implemented | shared run classification and background lock | Browser alarm test pending |
| Download completion/history | Implemented | `src/lib/download-completion.ts`, `tests/download-completion.test.ts` | Browser download interruption test pending |
| Preview/PDF/Markdown attachment parity | Implemented | preview settings, strict ID, renderer parity | Not live-tested |
| Release package consistency | Implemented | clean-tree build guard and archive checks | Requires clean committed build |

## Verification record

The automated gate to run before release is:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Browser live verification remains intentionally separate from fixture tests.
It must use only an explicitly authorized test account and should record
provider, browser, message role counts, preview/Markdown/PDF results, branch
handling, attachments, and failure/retry behavior without recording chat text
or credentials.
