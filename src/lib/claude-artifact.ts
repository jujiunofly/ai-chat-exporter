import type { ConversationArtifact } from './types'

/** Infer the exported artifact type from both the Claude tool name and payload. */
export function inferClaudeArtifactType(block: Record<string, any>): ConversationArtifact['type'] {
  const name = String(block.name || '').toLowerCase()
  const inputType = String(block.input?.type || '').toLowerCase()
  const mimeType = String(block.input?.mimeType || block.input?.mime_type || '').toLowerCase()

  if (inputType === 'html' || name.includes('html') || mimeType.includes('text/html')) {
    return 'html'
  }
  if (inputType === 'document' || name.includes('document')) {
    return 'document'
  }
  return 'code'
}
