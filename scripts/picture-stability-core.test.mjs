// Decision-logic sweep of the capture-stability probe (point 361): the pixel
// comparison, the signal bar that decides whether a golden-image pre-filter is
// buildable at all, and the totality the wrapper's error handling depends on.
import { describe, it, expect } from 'vitest'
import {
  SIGNAL_BAR,
  TOLERANCE,
  comparePixels,
  summarise,
  formatRows,
} from './picture-stability-core.mjs'

/** A width×height RGB buffer of one flat colour. */
function flat(width, height, [r, g, b]) {
  const buf = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = r
    buf[i * 3 + 1] = g
    buf[i * 3 + 2] = b
  }
  return buf
}

describe('the bar', () => {
  // The bar IS the finding: it is the smallest defect the historical corpus
  // produced. Loosening it without a new measurement re-opens the family of
  // levers the replay rejected.
  it('is the smallest real corpus signal, 0.75 % of pixels', () => {
    expect(SIGNAL_BAR).toBe(0.0075)
  })
  it('tolerates dither well below any corpus defect', () => {
    expect(TOLERANCE).toBe(8)
  })
})

describe('comparePixels', () => {
  const geom = { width: 10, height: 10 }

  it('reports a perfect match as zero movement', () => {
    const a = flat(10, 10, [30, 60, 90])
    const r = comparePixels(a, Buffer.from(a), geom)
    expect(r).toEqual({ sizeMismatch: false, ratio: 0, mean: 0, max: 0 })
  })

  it('ignores a delta at or below the tolerance', () => {
    const a = flat(10, 10, [30, 60, 90])
    const b = flat(10, 10, [38, 60, 90]) // exactly TOLERANCE
    const r = comparePixels(a, b, geom)
    expect(r.ratio).toBe(0)
    expect(r.max).toBe(8)
  })

  it('counts a delta above the tolerance', () => {
    const a = flat(10, 10, [30, 60, 90])
    const b = flat(10, 10, [39, 60, 90])
    const r = comparePixels(a, b, geom)
    expect(r.ratio).toBe(1)
    expect(r.max).toBe(9)
  })

  it('takes the largest channel delta, not their sum or mean', () => {
    const a = flat(2, 1, [0, 0, 0])
    const b = flat(2, 1, [0, 0, 40])
    const r = comparePixels(a, b, { width: 2, height: 1 })
    expect(r.max).toBe(40)
    expect(r.ratio).toBe(1)
  })

  it('measures the changed fraction, not merely that something changed', () => {
    const a = flat(10, 10, [0, 0, 0])
    const b = flat(10, 10, [0, 0, 0])
    for (let i = 0; i < 25; i++) b[i * 3] = 200 // a quarter of the pixels
    const r = comparePixels(a, b, geom)
    expect(r.ratio).toBeCloseTo(0.25, 6)
  })

  it('reports a size mismatch instead of guessing', () => {
    const r = comparePixels(flat(4, 4, [0, 0, 0]), flat(2, 2, [0, 0, 0]), { width: 4, height: 4 })
    expect(r.sizeMismatch).toBe(true)
    expect(r.ratio).toBe(1)
  })

  it('never throws on absent buffers', () => {
    expect(comparePixels(null, null, { width: 4, height: 4 }).sizeMismatch).toBe(true)
    expect(comparePixels(undefined, flat(4, 4, [0, 0, 0]), { width: 4, height: 4 }).sizeMismatch).toBe(true)
  })
})

describe('summarise', () => {
  const row = (frame, ratio, extra = {}) => ({ frame, ratio, mean: 1, max: 9, sizeMismatch: false, ...extra })

  it('calls a suite stable only when EVERY frame is under the bar', () => {
    const s = summarise([row('a.png', 0.001), row('b.png', 0.007)])
    expect(s.stable).toBe(true)
    expect(s.overBar).toEqual([])
    expect(s.frames).toBe(2)
  })

  it('one noisy frame is enough to make the suite unusable for a pre-filter', () => {
    const s = summarise([row('a.png', 0.001), row('loud.png', 0.33)])
    expect(s.stable).toBe(false)
    expect(s.overBar).toEqual(['loud.png'])
    expect(s.worst).toBe('loud.png')
    expect(s.worstRatio).toBeCloseTo(0.33, 6)
  })

  it('treats a size mismatch as over the bar whatever its ratio says', () => {
    const s = summarise([row('odd.png', 0, { sizeMismatch: true })])
    expect(s.stable).toBe(false)
    expect(s.overBar).toEqual(['odd.png'])
  })

  // The measured world-suite floor of docs/picture-check-levers.md §3.2, pinned
  // so a later "it looks stable now" claim has to move real numbers.
  it('rejects the measured world-suite floor', () => {
    const s = summarise([
      row('11-worldmodel-khartoum-confluence.png', 0.2781),
      row('12-worldmodel-lake-victoria.png', 0.9862),
    ])
    expect(s.stable).toBe(false)
    expect(s.overBar).toHaveLength(2)
    expect(s.worst).toBe('12-worldmodel-lake-victoria.png')
  })

  it('never claims stability from nothing', () => {
    expect(summarise([]).stable).toBe(false)
    expect(summarise(null).stable).toBe(false)
    expect(summarise([null, {}, 'x']).frames).toBe(0)
  })
})

describe('formatRows', () => {
  it('puts the worst frame first and names a size mismatch', () => {
    const out = formatRows([
      { frame: 'calm.png', ratio: 0.001, mean: 0.5, max: 9, sizeMismatch: false },
      { frame: 'loud.png', ratio: 0.9, mean: 128, max: 220, sizeMismatch: false },
      { frame: 'odd.png', ratio: 1, mean: 255, max: 255, sizeMismatch: true },
    ])
    const lines = out.split('\n')
    expect(lines[1]).toContain('odd.png')
    expect(lines[1]).toContain('SIZE MISMATCH')
    expect(lines[2]).toContain('loud.png')
    expect(lines[3]).toContain('calm.png')
  })
})
