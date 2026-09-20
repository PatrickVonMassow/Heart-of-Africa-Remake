import { afterEach, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import {
  MIX_LIMITER_CURVE_POINTS,
  MIX_LIMITER_DOMAIN,
  limitMixSample,
  mixLimiterCurve,
  readCurveTable,
} from './mixLimiter'

/** The whole stage as it is deployed: scaled into the shaper's ±1 domain, read
 *  off the table, and scaled back out. */
const throughCurve = (curve: Float32Array, x: number) =>
  readCurveTable(curve, x / MIX_LIMITER_DOMAIN) * MIX_LIMITER_DOMAIN

describe('the mix limiter curve (point 1156 — design.md §19.1)', () => {
  const held = { ...balance.mixLimiter }
  afterEach(() => {
    balance.mixLimiter.threshold = held.threshold
    balance.mixLimiter.ceiling = held.ceiling
  })

  it('leaves everything under the threshold exactly as it was', () => {
    for (const x of [0, 0.01, 0.2475, 0.5, 0.849, balance.mixLimiter.threshold]) {
      expect(limitMixSample(x)).toBe(x)
      expect(limitMixSample(-x)).toBe(-x)
    }
  })

  it('never passes the ceiling, however large the sum', () => {
    for (const x of [0.96, 1, 1.24155117094, 1.33605117094, 4, 40, 4000]) {
      expect(limitMixSample(x)).toBeLessThanOrEqual(balance.mixLimiter.ceiling)
      expect(limitMixSample(x)).toBeGreaterThan(balance.mixLimiter.threshold)
      expect(limitMixSample(-x)).toBe(-limitMixSample(x))
    }
    // Every sum the graph can actually carry stays strictly under it — the
    // whole shaped domain does, up to about 2.75. Past that `tanh` saturates
    // to exactly 1 in float64 and the value lands ON the ceiling. Either way
    // nothing leaves the stage ABOVE it, which is the promise design.md §19.1
    // makes.
    for (const x of [0.96, 1, 1.24155117094, 1.33605117094, 2]) {
      expect(limitMixSample(x)).toBeLessThan(balance.mixLimiter.ceiling)
    }
  })

  // The two sums point 1156 was opened for, taken from the graph test's
  // conservative worst case: 2.52 dB over full scale with the debug drum bed
  // and 1.88 dB without it.
  it('absorbs the measured village worst case', () => {
    expect(limitMixSample(1.33605117094)).toBeCloseTo(0.94999, 5)
    expect(limitMixSample(1.24155117094)).toBeCloseTo(0.94992, 5)
    expect(limitMixSample(1.33605117094)).toBeLessThan(1)
    expect(limitMixSample(1.24155117094)).toBeLessThan(1)
  })

  // The limiter must not become a loudness change in disguise: the everyday
  // single close voice (0.932) sits above the threshold only by a hair, and
  // what the curve takes off it is an order of magnitude under the ~1 dB a
  // listener can hear at all.
  it('does not audibly pull down a single close voice', () => {
    const single = 0.93187573184
    const lost = -20 * Math.log10(limitMixSample(single) / single)
    expect(lost).toBeGreaterThan(0)
    expect(lost).toBeLessThan(0.25)
    // A drum strike over the village floor (0.249) and a lone footstep are
    // under the threshold outright, so they are not shaped at all.
    expect(limitMixSample(0.24875)).toBe(0.24875)
  })

  it('opens out of the identity with the same slope, so the knee has no corner', () => {
    const t = balance.mixLimiter.threshold
    const step = 1e-6
    const below = (limitMixSample(t) - limitMixSample(t - step)) / step
    const above = (limitMixSample(t + step) - limitMixSample(t)) / step
    expect(below).toBeCloseTo(1, 4)
    expect(above).toBeCloseTo(1, 4)
  })

  it('degenerates safely when the two values are calibrated together or crossed', () => {
    balance.mixLimiter.threshold = 0.5
    balance.mixLimiter.ceiling = 0.5
    expect(limitMixSample(3)).toBe(0.5)
    balance.mixLimiter.threshold = 0.9
    balance.mixLimiter.ceiling = 0.4
    expect(limitMixSample(3)).toBe(0.4)
    expect(limitMixSample(0.2)).toBe(0.2)
  })

  // Four-eyes review (GPT-6 Astra, 20.09.2026) on the first cut of this stage.
  it('answers a non-finite sample with silence rather than passing it on', () => {
    for (const x of [NaN, Infinity, -Infinity]) expect(limitMixSample(x)).toBe(0)
    // One NaN written into the table would poison every sample read through it.
    balance.mixLimiter.ceiling = NaN
    expect(Number.isFinite(limitMixSample(1.3))).toBe(true)
    expect(mixLimiterCurve(65).every((v) => Number.isFinite(v))).toBe(true)
    balance.mixLimiter.threshold = NaN
    balance.mixLimiter.ceiling = 0.9
    expect(limitMixSample(1.3)).toBeLessThanOrEqual(0.9)
    expect(mixLimiterCurve(65).every((v) => Number.isFinite(v))).toBe(true)
  })

  it('reads a non-finite input off the table as silence too', () => {
    const curve = mixLimiterCurve()
    for (const x of [NaN, Infinity, -Infinity]) expect(readCurveTable(curve, x)).toBe(0)
  })

  describe('the deployed table', () => {
    it('is odd, so silence stays silent', () => {
      const curve = mixLimiterCurve()
      expect(MIX_LIMITER_CURVE_POINTS % 2).toBe(1)
      expect(curve).toHaveLength(MIX_LIMITER_CURVE_POINTS)
      expect(curve[(curve.length - 1) / 2]).toBe(0)
      expect(curve[0]).toBeCloseTo(-curve[curve.length - 1], 12)
    })

    it('carries the transfer function, read the way the browser reads it', () => {
      const curve = mixLimiterCurve()
      for (const x of [0, 0.25, 0.5, 0.932, 1, 1.24155117094, 1.33605117094, 1.9]) {
        expect(throughCurve(curve, x)).toBeCloseTo(limitMixSample(x), 5)
        expect(throughCurve(curve, -x)).toBeCloseTo(-limitMixSample(x), 5)
      }
    })

    // Four-eyes review (GPT-6 Astra, 20.09.2026): a Float32Array stores to the
    // NEAREST float32, so at threshold 0.7 / ceiling 0.8 the stored edge came
    // back as 0.4000000059604645 and the stage delivered 0.800000011920929 —
    // a hair ABOVE the ceiling, which is the one thing it promises never
    // happens. The table rounds inward now, at every calibration.
    it('never stores a value the ceiling does not cover, at any calibration', () => {
      for (const [threshold, ceiling] of [[0.7, 0.8], [0.85, 0.95], [0.1, 0.3], [0.5, 0.5], [0.33, 0.97]]) {
        balance.mixLimiter.threshold = threshold
        balance.mixLimiter.ceiling = ceiling
        const curve = mixLimiterCurve()
        for (const v of curve) expect(Math.abs(v) * MIX_LIMITER_DOMAIN).toBeLessThanOrEqual(ceiling)
        for (const x of [-12, -3, -1, 1, 3, 12]) {
          expect(Math.abs(throughCurve(curve, x))).toBeLessThanOrEqual(ceiling)
        }
      }
    })

    // Round 2 of the same review: the first inward rounding stepped by a
    // RELATIVE ulp, which is worth nothing among the subnormals, where the
    // spacing is absolute — at ceiling 2e-45 the stored edge still came back
    // above it, on both signs. The step is one of the bit pattern now.
    // Round 3: inward-rounded neighbours bound the EXACT interpolation, but the
    // browser's is not exact — it weights both neighbours in float32 and adds
    // them, and those three roundings can land a couple of ulps above both. The
    // reviewer reproduced it from Gecko's WaveShaperNode arithmetic at exactly
    // this input, where two neighbours of 0.4749999940395355 came out as
    // 0.4750000238418579 — 0.9500000476837158 past the post-gain, over the
    // ceiling. The table now reserves four ulps for it.
    it('holds the ceiling through the browser\'s own float32 interpolation', () => {
      balance.mixLimiter.threshold = 0.85
      balance.mixLimiter.ceiling = 0.95
      const curve = mixLimiterCurve()
      expect(throughCurve(curve, 1.7114522457122803)).toBeLessThanOrEqual(0.95)
      // Every sample of the table, at the interpolation's worst weighting.
      for (let i = 0; i < curve.length - 1; i++) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const position = (i + t) / (curve.length - 1)
          const x = (position * 2 - 1) * MIX_LIMITER_DOMAIN
          expect(Math.abs(throughCurve(curve, x))).toBeLessThanOrEqual(0.95)
        }
      }
    })

    it('holds a subnormal ceiling too, where a relative step is worth nothing', () => {
      for (const ceiling of [2e-45, 1.4e-45, 7e-45, 1e-40]) {
        balance.mixLimiter.threshold = 0
        balance.mixLimiter.ceiling = ceiling
        const curve = mixLimiterCurve(129)
        for (const v of curve) expect(Math.abs(v) * MIX_LIMITER_DOMAIN).toBeLessThanOrEqual(ceiling)
        for (const x of [-3, -1, 1, 3]) {
          expect(Math.abs(throughCurve(curve, x))).toBeLessThanOrEqual(ceiling)
        }
      }
    })

    it('holds the ceiling at its edge too, so a sum past the domain still cannot clip', () => {
      const curve = mixLimiterCurve()
      for (const x of [MIX_LIMITER_DOMAIN, 3, 12]) {
        expect(throughCurve(curve, x)).toBeLessThan(balance.mixLimiter.ceiling)
      }
      // The table's own extreme is the bound the browser clamps to.
      expect(Math.max(...curve) * MIX_LIMITER_DOMAIN).toBeLessThan(balance.mixLimiter.ceiling)
    })
  })
})
