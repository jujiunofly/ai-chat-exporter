/**
 * A deliberately small, provider-neutral rate-limit signal.
 *
 * Provider parsers run against private web APIs whose response envelopes vary.
 * The scheduled queue only needs to know that it should stop adding pressure;
 * it must not persist raw provider messages, URLs, titles, or credentials.
 */

export const PROVIDER_RATE_LIMITED_ERROR = 'AI_CHAT_EXPORTER_RATE_LIMITED'

/** Shared matcher for HTTP 429, ChatGPT history locks, and common provider copy. */
export const PROVIDER_RATE_LIMIT_PATTERN =
  /(?:\b429\b|rate\s*limit|too many requests|temporarily restricted|restricted your access to (?:chat )?history|conversation_limit|请求(?:过于)?频繁|请求过多|暂时限制你访问对话|访问过于频繁)/i

export class ProviderRateLimitError extends Error {
  constructor() {
    super(PROVIDER_RATE_LIMITED_ERROR)
    this.name = 'ProviderRateLimitError'
  }
}

/** A fetch response may be a lightweight test double, so `status` is optional. */
export function isRateLimitedResponse(response: { status?: unknown } | null | undefined): boolean {
  return Number(response?.status) === 429
}

/**
 * Match the extension's own safe sentinel first. The fallback terms cover a
 * runtime message forwarded by a provider content script without retaining the
 * original provider response anywhere in storage or visible diagnostics.
 */
export function isProviderRateLimitError(error: unknown): boolean {
  if (error instanceof ProviderRateLimitError) return true
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''
  return message === PROVIDER_RATE_LIMITED_ERROR || PROVIDER_RATE_LIMIT_PATTERN.test(message)
}

/** Scan a JSON/text body without keeping the provider copy anywhere else. */
export function payloadLooksRateLimited(data: unknown): boolean {
  if (data == null) return false
  if (typeof data === 'string') return PROVIDER_RATE_LIMIT_PATTERN.test(data)
  try {
    return PROVIDER_RATE_LIMIT_PATTERN.test(JSON.stringify(data).slice(0, 4000))
  } catch {
    return false
  }
}
