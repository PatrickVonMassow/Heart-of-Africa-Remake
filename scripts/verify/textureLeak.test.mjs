// The TRAA-toggle leak gate's decision rule (point 334). The browser half —
// forcing a frame and polling until the reading settles — lives in
// settings.mjs; what is decidable without a browser is pinned here, including
// the exact false alarm that made the gate accuse the product: a DIP sampled
// as the baseline.
import { describe, it, expect } from 'vitest'
import { textureKey, tallyByKind, survivorBreakdown, formatBreakdown, leakVerdict } from './textureLeak.mjs'

const rt = (n, w = 1440, h = 900, extra = {}) =>
  Array.from({ length: n }, () => ({ cls: 'Texture', w, h, depth: 1, format: 1023, type: 1009, isRT: true, isDepth: false, name: '', ...extra }))
const depth = (n) => rt(n, 1440, 900, { cls: 'DepthTexture', isDepth: true, isRT: false, format: 1026, type: 1014 })

describe('texture kind key', () => {
  it('separates targets, depth buffers and sizes', () => {
    const [a] = rt(1)
    const [b] = rt(1, 720, 450)
    const [c] = depth(1)
    expect(textureKey(a)).not.toBe(textureKey(b))
    expect(textureKey(a)).not.toBe(textureKey(c))
    expect(textureKey(a)).toContain('1440x900')
    expect(textureKey(c)).toContain('depth')
  })

  it('tallies identical descriptors together', () => {
    expect(tallyByKind([...rt(3), ...depth(2)]).size).toBe(2)
    expect([...tallyByKind(rt(3)).values()]).toEqual([3])
  })
})

describe('survivor breakdown', () => {
  it('is empty when nothing changed', () => {
    expect(survivorBreakdown([...rt(4), ...depth(2)], [...rt(4), ...depth(2)])).toEqual([])
    expect(formatBreakdown([])).toBe('no per-kind change')
  })

  it('names the kinds that grew, biggest first', () => {
    const rows = survivorBreakdown([...rt(4), ...depth(1)], [...rt(9), ...depth(3)])
    expect(rows[0].delta).toBe(5)
    expect(rows[0].kind).toContain('target')
    expect(rows[1].delta).toBe(2)
    expect(rows[1].kind).toContain('depth')
    expect(formatBreakdown(rows)).toContain('+5')
  })
})

describe('leak verdict (point 334)', () => {
  it('passes a count that returns to where it started', () => {
    const live = [...rt(6), ...depth(3)]
    const v = leakVerdict({ before: 47, after: 47, cycles: 5, liveBefore: live, liveAfter: live })
    expect(v.ok).toBe(true)
    expect(v.detail).toContain('47 -> 47')
  })

  it('fails a real leak and NAMES the surviving resources', () => {
    const v = leakVerdict({
      before: 47, after: 61, cycles: 5,
      liveBefore: [...rt(6), ...depth(3)],
      liveAfter: [...rt(16), ...depth(7)],
    })
    expect(v.ok).toBe(false)
    expect(v.detail).toContain('LEAKED')
    expect(v.detail).toContain('+10')
    expect(v.detail).toContain('1440x900')
  })

  it('fails — rather than silently passes — when the reading FELL', () => {
    // The point-334 dip seen from the other side: the post chain's own targets
    // are freed by the rebuild and not yet re-allocated. Sampled as the SECOND
    // reading this looked like a comfortable pass under the old one-sided
    // `after <= before + 2` rule, which is why the gate could only ever accuse
    // the product, never its own measurement.
    const v = leakVerdict({
      before: 47, after: 33, cycles: 5,
      liveBefore: [...rt(9), ...depth(5)],
      liveAfter: [...rt(3), ...depth(1)],
    })
    expect(v.ok).toBe(false)
    expect(v.detail).toContain('mid-rebuild')
    expect(v.detail).toContain('-6')
  })

  it('tolerates a small unrelated drift in both directions', () => {
    expect(leakVerdict({ before: 47, after: 49, cycles: 5 }).ok).toBe(true)
    expect(leakVerdict({ before: 47, after: 45, cycles: 5 }).ok).toBe(true)
    expect(leakVerdict({ before: 47, after: 50, cycles: 5 }).ok).toBe(false)
  })
})
