// The slope-footing verdict (point 412). The live check used to read ONE instant
// at a place where the panorama stands on the flat disc-horizon line: it reported
// PASS while `slope over the wheelbase` was 0.00 four times over — a verdict
// without its population. These cases pin the rule that replaced it.

import { describe, expect, it } from 'vitest'
import {
  judgeFootingSeries,
  judgePitchSeries,
  MAX_FOOT_GAP_RATIO,
  MIN_SLOPED_SAMPLES,
  MIN_WHEELBASE_SLOPE,
} from './footingSeries.mjs'

/** One stance sample: body height 2, foot gap `gap`, rise over wheelbase `slope`. */
const sample = (gap, slope, pitch = 0) => ({ gap, h: 2, slope, pitch, stretch: 1 })
const flat = (gap = 0) => sample(gap, 0)
const sloped = (gap = 0, slope = 0.4) => sample(gap, slope, 0.1)

describe('judgeFootingSeries (point 412 — a verdict needs its population)', () => {
  it('fails an empty series and says it measured nothing', () => {
    const v = judgeFootingSeries([])
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('empty')
    expect(v.detail).toMatch(/MEASURED NOTHING/)
    expect(v.total).toBe(0)
  })

  it('fails an ALL-FLAT series, naming the count — the exact old false green', () => {
    // Perfect seating on flat ground: every gap is 0, so the gap rule is happy.
    const v = judgeFootingSeries(Array.from({ length: 40 }, () => flat(0)))
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('no-slope')
    expect(v.sloped).toBe(0)
    expect(v.detail).toMatch(/0 of 40/)
    expect(v.detail).toMatch(/sloped ground/)
  })

  it('fails a series with too FEW sloped samples rather than judging on one', () => {
    const v = judgeFootingSeries([...Array.from({ length: 30 }, () => flat()), sloped()])
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('no-slope')
    expect(v.sloped).toBe(1)
    expect(MIN_SLOPED_SAMPLES).toBeGreaterThan(1)
  })

  it('passes a mixed series and judges ONLY the sloped samples', () => {
    // The flat samples hang badly off the ground; they must not decide it.
    const v = judgeFootingSeries([
      ...Array.from({ length: 10 }, () => flat(1.5)),
      ...Array.from({ length: 5 }, () => sloped(0.01)),
    ])
    expect(v.ok).toBe(true)
    expect(v.sloped).toBe(5)
    expect(v.worstSloped).toBeLessThan(MAX_FOOT_GAP_RATIO)
    expect(v.worstFlat).toBeGreaterThan(MAX_FOOT_GAP_RATIO)
  })

  it('fails when a sloped foot hangs off its ground', () => {
    const v = judgeFootingSeries([
      ...Array.from({ length: 10 }, () => flat(0)),
      ...Array.from({ length: 4 }, () => sloped(0.01)),
      sloped(0.6), // 30 % of the body height above the ground
    ])
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('gap')
    expect(v.detail).toMatch(/hang off the ground/)
  })

  it('reports the distribution, not just a word', () => {
    const v = judgeFootingSeries([...Array.from({ length: 7 }, () => flat()), ...Array.from({ length: 3 }, () => sloped(0.02, 0.9))])
    expect(v.detail).toMatch(/10 stance samples/)
    expect(v.detail).toMatch(/3 on sloped ground/)
    expect(v.detail).toMatch(/steepest 0\.900/)
    expect(v.detail).toMatch(/worst sloped foot gap/)
  })

  it('counts a sample AT the slope floor as sloped, and just under it as flat', () => {
    const at = judgeFootingSeries(Array.from({ length: 5 }, () => sample(0, MIN_WHEELBASE_SLOPE)))
    expect(at.sloped).toBe(5)
    const under = judgeFootingSeries(Array.from({ length: 5 }, () => sample(0, MIN_WHEELBASE_SLOPE - 1e-9)))
    expect(under.sloped).toBe(0)
    expect(under.ok).toBe(false)
  })

  it('reads a downhill rise as sloped too (sign must not matter)', () => {
    const v = judgeFootingSeries(Array.from({ length: 5 }, () => sample(0, -0.4)))
    expect(v.sloped).toBe(5)
    expect(v.ok).toBe(true)
  })

  it('drops malformed samples instead of trusting a NaN', () => {
    const v = judgeFootingSeries([{ gap: NaN, h: 2, slope: 1 }, { gap: 0, h: NaN, slope: 1 }])
    expect(v.total).toBe(0)
    expect(v.ok).toBe(false)
  })

  it("honours a caller's own thresholds", () => {
    const rows = Array.from({ length: 5 }, () => sample(0, 0.2))
    expect(judgeFootingSeries(rows, { minSlope: 0.5 }).ok).toBe(false)
    expect(judgeFootingSeries(rows, { minSlope: 0.1 }).ok).toBe(true)
  })
})

describe('judgePitchSeries (point 412 — a flat stance cannot lean)', () => {
  it('fails an all-flat series instead of reporting pitch 0.000 as proof', () => {
    const v = judgePitchSeries(Array.from({ length: 20 }, () => flat()))
    expect(v.ok).toBe(false)
    expect(v.detail).toMatch(/MEASURED THE WRONG THING/)
    expect(v.sloped).toBe(0)
  })

  it('passes sloped samples within the stand-able cap and reports the steepest', () => {
    const v = judgePitchSeries(Array.from({ length: 6 }, () => sample(0, 0.4, 0.22)))
    expect(v.ok).toBe(true)
    expect(v.worst).toBeCloseTo(0.22, 6)
    expect(v.detail).toMatch(/steepest body pitch 0\.220 rad/)
  })

  it('fails a body leaning past the cap', () => {
    const v = judgePitchSeries([
      ...Array.from({ length: 5 }, () => sample(0, 0.4, 0.1)),
      sample(0, 0.4, 0.45),
    ])
    expect(v.ok).toBe(false)
  })
})
