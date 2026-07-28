import { describe, expect, it } from 'vitest'
import { classifyPublishResponse, publishStatePatch, responseText } from './publish-outcome-core.mjs'

// The real Artifact success body, shortened but structurally intact.
const REAL_SUCCESS =
  'Published C:\\tmp\\hoa-batch-dashboard.html at https://claude.ai/code/artifact/fe669d50-9b71-43a3-bf82-2fce7abe774b\n' +
  'To update: republish the same file path in this conversation (keeps this URL)'

describe('responseText', () => {
  it('flattens strings, arrays and the nested content shapes', () => {
    expect(responseText('plain')).toBe('plain')
    expect(responseText(['a', 'b'])).toBe('a\nb')
    expect(responseText({ content: [{ text: 'deep' }] })).toContain('deep')
    expect(responseText({ error: 'boom' })).toBe('boom')
  })

  it('is total on the shapes that carry no text', () => {
    expect(responseText(null)).toBe('')
    expect(responseText(undefined)).toBe('')
    expect(responseText(42)).toBe('')
    expect(responseText({})).toBe('')
  })
})

describe('classifyPublishResponse', () => {
  it('reads the real success body as success', () => {
    expect(classifyPublishResponse(REAL_SUCCESS)).toBe('success')
    expect(classifyPublishResponse({ content: [{ text: REAL_SUCCESS }] })).toBe('success')
  })

  it('reads a harness error flag as failure whatever the body says', () => {
    expect(classifyPublishResponse({ is_error: true, content: REAL_SUCCESS })).toBe('failure')
    expect(classifyPublishResponse({ isError: true, content: REAL_SUCCESS })).toBe('failure')
  })

  it('reads the failure wordings as failure', () => {
    expect(classifyPublishResponse('Error: publish refused')).toBe('failure')
    expect(classifyPublishResponse('409 conflict — another session published a newer version')).toBe('failure')
    expect(classifyPublishResponse({ error: 'Permission denied' })).toBe('failure')
  })

  it('keeps an unrecognised or empty shape as unknown, never a guess', () => {
    expect(classifyPublishResponse('')).toBe('unknown')
    expect(classifyPublishResponse(null)).toBe('unknown')
    expect(classifyPublishResponse('something entirely new')).toBe('unknown')
  })

  it('does not let the word "published" alone pass without an artifact url', () => {
    // A failure body may well mention publishing; the URL is what proves one happened.
    expect(classifyPublishResponse('Publishing failed, nothing was published')).toBe('failure')
  })
})

describe('publishStatePatch', () => {
  const args = { hash: 'abc123', path: '/tmp/board.html', at: 1000 }

  it('records the publish and clears the doubt flags on success', () => {
    const patch = publishStatePatch('success', args)
    expect(patch.publishedHash).toBe('abc123')
    expect(patch.publishedAt).toBe(1000)
    expect(patch.publishUnverified).toBeUndefined()
    expect(patch.publishFailed).toBeUndefined()
  })

  it('records NO publishedHash on failure — the board is not live', () => {
    const patch = publishStatePatch('failure', args)
    expect(patch).not.toHaveProperty('publishedHash')
    expect(patch.publishFailed.path).toBe('/tmp/board.html')
    expect(patch.publishFailed.at).toBe(1000)
  })

  it('still records an unknown outcome, but flags it unverified', () => {
    const patch = publishStatePatch('unknown', args)
    expect(patch.publishedHash).toBe('abc123')
    expect(patch.publishUnverified).toBe(true)
  })

  it('writes nothing when the file hash could not be read (and it is not a failure)', () => {
    expect(publishStatePatch('success', { ...args, hash: null })).toBeNull()
    expect(publishStatePatch('unknown', { ...args, hash: null })).toBeNull()
  })

  it('reports a failure even without a hash — the failure is the news', () => {
    expect(publishStatePatch('failure', { ...args, hash: null })).not.toBeNull()
  })
})
