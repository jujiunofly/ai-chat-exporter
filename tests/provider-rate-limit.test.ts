import { describe, expect, it } from 'vitest'
import {
  isProviderRateLimitError,
  isRateLimitedResponse,
  payloadLooksRateLimited,
  PROVIDER_RATE_LIMITED_ERROR,
  ProviderRateLimitError,
} from '../src/lib/provider-rate-limit'

describe('provider rate-limit signal', () => {
  it('recognizes a 429 response without needing provider response text', () => {
    expect(isRateLimitedResponse({ status: 429 })).toBe(true)
    expect(isRateLimitedResponse({ status: 403 })).toBe(false)
    expect(isRateLimitedResponse({ ok: false })).toBe(false)
  })

  it('keeps the persisted diagnostic to a safe, provider-neutral sentinel', () => {
    expect(new ProviderRateLimitError().message).toBe(PROVIDER_RATE_LIMITED_ERROR)
    expect(isProviderRateLimitError(new ProviderRateLimitError())).toBe(true)
    expect(isProviderRateLimitError(PROVIDER_RATE_LIMITED_ERROR)).toBe(true)
    expect(isProviderRateLimitError('429 Too Many Requests')).toBe(true)
    expect(isProviderRateLimitError('network disconnected')).toBe(false)
    expect(isProviderRateLimitError(
      'To prevent chatgpt from sending too many requests, and to ensure data security, we have temporarily restricted your access to chat history.'
    )).toBe(true)
  })

  it('detects nested ChatGPT history-lock payloads', () => {
    expect(payloadLooksRateLimited({
      error: { message: 'We have temporarily restricted your access to chat history.' },
    })).toBe(true)
    expect(payloadLooksRateLimited({ items: [{ id: 'ok' }] })).toBe(false)
  })
})
