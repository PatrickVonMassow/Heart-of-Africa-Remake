// Pure tests for the main-thread liveness attribution (point 304). The two
// witnesses that matter are pinned by name: a long animation frame with a live
// tick train must NOT count as a block (the false accusation the voice suite's
// old raf-gap metric made), and a synchronous stall outside the frame callbacks
// MUST count in full.
import { describe, expect, it } from 'vitest'
import { attributeBlocks, maxGap, unionCoverage } from './liveness.mjs'

describe('unionCoverage', () => {
  it('is zero for an empty or inverted window', () => {
    expect(unionCoverage([{ start: 0, end: 100 }], 50, 50)).toBe(0)
    expect(unionCoverage([{ start: 0, end: 100 }], 80, 20)).toBe(0)
    expect(unionCoverage([], 0, 100)).toBe(0)
  })

  it('clips intervals to the window', () => {
    expect(unionCoverage([{ start: -50, end: 150 }], 0, 100)).toBe(100)
    expect(unionCoverage([{ start: 40, end: 60 }], 0, 100)).toBe(20)
    expect(unionCoverage([{ start: 200, end: 300 }], 0, 100)).toBe(0)
  })

  it('merges overlapping and nested intervals instead of double counting', () => {
    expect(unionCoverage([{ start: 0, end: 60 }, { start: 40, end: 100 }], 0, 100)).toBe(100)
    expect(unionCoverage([{ start: 0, end: 100 }, { start: 20, end: 30 }], 0, 100)).toBe(100)
  })

  it('sums disjoint intervals and tolerates unsorted input', () => {
    expect(unionCoverage([{ start: 70, end: 90 }, { start: 10, end: 20 }], 0, 100)).toBe(30)
  })
})

describe('maxGap', () => {
  it('is zero below two samples', () => {
    expect(maxGap([])).toBe(0)
    expect(maxGap([5])).toBe(0)
  })

  it('finds the largest step', () => {
    expect(maxGap([0, 50, 100, 5100, 5150])).toBe(5000)
  })
})

describe('attributeBlocks', () => {
  const cadence = (n, step = 50, from = 0) => Array.from({ length: n }, (_, i) => from + i * step)

  it('reports no block for a healthy tick train', () => {
    const ticks = cadence(40)
    const frames = ticks.map((t) => ({ start: t + 5, end: t + 12 }))
    const r = attributeBlocks(ticks, frames)
    expect(r.blockMs).toBeLessThan(50)
    expect(r.tickGapMs).toBe(50)
  })

  it('charges a stall with NO frame activity in full — a real main-thread block', () => {
    const ticks = [0, 50, 100, 5100, 5150]
    const r = attributeBlocks(ticks, [])
    expect(r.blockMs).toBe(5000)
    expect(r.blockAtMs).toBe(100)
    expect(r.frameBlockMs).toBe(0)
  })

  it('does NOT charge a long animation frame whose callbacks span the stall (the point-304 witness)', () => {
    // The startup frame awaits the whole shader-program set: 15 s of wall clock
    // inside the page's own frame callbacks. The old raf-gap metric called this a
    // 15 s TTS freeze; it is the renderer's own cost and no block at all.
    const ticks = [0, 50, 100, 15100, 15150]
    const frames = [{ start: 100, end: 15100 }]
    const r = attributeBlocks(ticks, frames)
    // Only the tick interval itself remains unexplained — the metric's floor,
    // three orders of magnitude below the gate.
    expect(r.blockMs).toBeLessThanOrEqual(50)
    expect(r.frameBlockMs).toBe(15000)
    expect(r.tickGapMs).toBe(15000)
  })

  it('splits a stall that is only partly frame work', () => {
    const ticks = [0, 6000]
    const frames = [{ start: 0, end: 1000 }]
    const r = attributeBlocks(ticks, frames)
    expect(r.blockMs).toBe(5000)
    expect(r.frameBlockMs).toBe(1000)
  })

  it('takes the WORST stall, not the last one', () => {
    const ticks = [0, 3000, 3050, 9050]
    const r = attributeBlocks(ticks, [])
    expect(r.blockMs).toBe(6000)
    expect(r.blockAtMs).toBe(3050)
  })

  it('still sees a block that happens BETWEEN two long frames', () => {
    // A blocking task wedged between frame callbacks must survive the
    // attribution — otherwise a busy renderer would launder any stall.
    const ticks = [0, 50, 5050]
    const frames = [{ start: 0, end: 40 }, { start: 5000, end: 5050 }]
    const r = attributeBlocks(ticks, frames)
    expect(r.blockMs).toBeCloseTo(4950, 5)
  })

  it('is empty-safe', () => {
    const r = attributeBlocks([], [])
    expect(r).toEqual({ blockMs: 0, blockAtMs: 0, frameBlockMs: 0, tickGapMs: 0 })
    expect(attributeBlocks([10], [{ start: 0, end: 5 }]).blockMs).toBe(0)
  })
})
