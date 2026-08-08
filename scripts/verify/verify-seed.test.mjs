import { describe, expect, it } from 'vitest'
import { VERIFY_SEED, withVerifySeed } from './verify-seed.mjs'

describe('withVerifySeed', () => {
  it('seeds a bare dev-server URL', () => {
    expect(withVerifySeed('http://localhost:5173/')).toBe(`http://localhost:5173/?seed=${VERIFY_SEED}`)
  })

  // The measured hole: the suite defaults carried `?seed=42`, and the runner's
  // BASE_URL (which names the port it just started) replaced the whole string.
  it('seeds the URL the runner passes, port and all', () => {
    expect(withVerifySeed('http://localhost:32845/')).toBe(`http://localhost:32845/?seed=${VERIFY_SEED}`)
  })

  it('leaves a URL that already pins its own seed alone', () => {
    expect(withVerifySeed('http://localhost:5173/?seed=7')).toBe('http://localhost:5173/?seed=7')
  })

  it('keeps other query parameters', () => {
    const out = new URL(withVerifySeed('http://localhost:5173/?lang=de'))
    expect(out.searchParams.get('lang')).toBe('de')
    expect(out.searchParams.get('seed')).toBe(String(VERIFY_SEED))
  })

  it('takes an explicit seed', () => {
    expect(withVerifySeed('http://localhost:5173/', 4711)).toBe('http://localhost:5173/?seed=4711')
  })

  it('hands an unparseable URL back rather than failing the suite', () => {
    expect(withVerifySeed('not a url')).toBe('not a url')
  })
})
