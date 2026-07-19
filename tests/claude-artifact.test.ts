import { describe, expect, it } from 'vitest'
import { inferClaudeArtifactType } from '../src/lib/claude-artifact'

describe('inferClaudeArtifactType', () => {
  it('uses the payload type for a generic artifacts tool', () => {
    expect(inferClaudeArtifactType({
      name: 'artifacts',
      input: { type: 'document', content: '<html></html>' }
    })).toBe('document')
  })

  it('recognizes HTML MIME types independently of the tool name', () => {
    expect(inferClaudeArtifactType({
      name: 'create_artifact',
      input: { mimeType: 'text/html', content: '<html></html>' }
    })).toBe('html')
  })
})
