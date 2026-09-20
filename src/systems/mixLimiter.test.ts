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
