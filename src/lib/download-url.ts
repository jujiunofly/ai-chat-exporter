/**
 * Build a download URL that is safe to create inside an MV3 service worker.
 * Blob URLs are unavailable in service workers, so scheduled text exports use
 * a data URL instead.
 */
export function textToDataUrl(text: string, mimeType = 'text/plain'): string {
  // encodeURIComponent throws on lone UTF-16 surrogates. Provider payloads
  // are untrusted text, so encode bytes instead; TextEncoder replaces an
  // invalid surrogate deterministically and data: base64 works in MV3 workers.
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}
