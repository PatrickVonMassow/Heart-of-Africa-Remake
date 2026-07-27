// Pure tests for the main-thread liveness attribution (point 304). The two
// witnesses that matter are pinned by name: a long animation frame with a live
// tick train must NOT count as a block (the false accusation the voice suite's
// old raf-gap metric made), and a synchronous stall outside the frame callbacks
// MUST count in full.
import { describe, expect, it } from 'vitest'
import { attributeBlocks, maxGap, unionCoverage, pictureSettled, SETTLE_DEFAULTS } from './liveness.mjs'

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

// The predicate that decides when the startup measurement window CLOSES
// (point 337). It replaced a fixed wall-clock tail, so its whole value is that
// it cannot close early on a stall — that is what these cases pin.
describe('pictureSettled', () => {
  /** A quiet stretch: ticks every 20 ms and frames every 16 ms up to `now`. */
  const quiet = (now, span = 2000) => {
    const ticks = []
    const raf = []
    for (let t = now - span; t <= now; t += 20) ticks.push(t)
    for (let t = now - span; t <= now; t += 16) raf.push(t)
    return { ticks, raf }
  }

  it('settles on a live picture', () => {
    const { ticks, raf } = quiet(10000)
    expect(pictureSettled(ticks, raf, 10000)).toBe(true)
  })

  it('does NOT settle while a stall sits inside the window', () => {
    const { ticks, raf } = quiet(10000)
    // Punch a 3 s hole 800 ms back — well inside the 1500 ms window.
    const holed = ticks.filter((t) => !(t > 10000 - 800 - 3000 && t < 10000 - 800))
    expect(pictureSettled(holed, raf, 10000)).toBe(false)
  })

  it('does NOT settle on the quiet tail of a stall that just ended', () => {
    // THE CASE THE FIXED TAIL GOT WRONG: 400 ms of calm after a long freeze.
    // Without the both-edges rule this reads as settled and the window closes
    // with the standstill still running.
    const now = 10000
    const ticks = []
    for (let t = now - 400; t <= now; t += 20) ticks.push(t)
    ticks.unshift(now - 20000)
    const raf = []
    for (let t = now - 400; t <= now; t += 16) raf.push(t)
    expect(pictureSettled(ticks, raf, now)).toBe(false)
  })

  it('does NOT settle when the ticks run but nothing is PAINTED', () => {
    // The WebGPU shape of the defect: a free main thread, a frozen picture.
    const { ticks } = quiet(10000)
    expect(pictureSettled(ticks, [], 10000)).toBe(false)
  })

  it('does NOT settle when the train stops right before now', () => {
    const { ticks, raf } = quiet(10000)
    // Now is 2 s past the last sample — the freeze is in progress.
    expect(pictureSettled(ticks, raf, 12000)).toBe(false)
  })

  it('honours the tuning options', () => {
    const { ticks, raf } = quiet(10000)
    expect(pictureSettled(ticks, raf, 10000, { minFrames: 10000 })).toBe(false)
    const holed = ticks.filter((t) => !(t > 10000 - 900 && t < 10000 - 500))
    expect(pictureSettled(holed, raf, 10000)).toBe(false)
    expect(pictureSettled(holed, raf, 10000, { quietGapMs: 600 })).toBe(true)
  })

  it('is total on missing input', () => {
    expect(pictureSettled(undefined, undefined, 0)).toBe(false)
    expect(pictureSettled([], [], 0)).toBe(false)
  })

  // The function repeats SETTLE_DEFAULTS as literals because startup.mjs
  // stringifies it into the page and it may close over nothing. Pin the two
  // together so that duplication can never drift apart.
  it('keeps its inline fallbacks equal to SETTLE_DEFAULTS', () => {
    const { ticks, raf } = quiet(10000)
    for (const [t, r, now] of [
      [ticks, raf, 10000],
      [ticks, raf, 12000],
      [ticks, [], 10000],
      [ticks.filter((x) => !(x > 9000 && x < 9600)), raf, 10000],
    ]) {
      expect(pictureSettled(t, r, now)).toBe(pictureSettled(t, r, now, SETTLE_DEFAULTS))
    }
  })

  // It is stringified into the page, so it must survive losing its module.
  it('survives being stringified into a page (closes over nothing)', () => {
    const revived = new Function('return ' + pictureSettled.toString())()
    const { ticks, raf } = quiet(10000)
    expect(revived(ticks, raf, 10000, SETTLE_DEFAULTS)).toBe(true)
    expect(revived(ticks, raf, 12000, SETTLE_DEFAULTS)).toBe(false)
  })
})
