import { describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { exposureStep, exposureTarget, exposureTau, type ExposureParams } from './exposureControl'

const p: ExposureParams = { ...balance.exposure }
const FRAME = 1 / 60

function run(start: number, target: number, seconds: number, params = p) {
  let e = start
  for (let t = 0; t < seconds; t += FRAME) e = exposureStep(e, target, FRAME, params)
  return e
}

describe('exposure target (design.md §2.7 bounded range)', () => {
  it('equals the base exposure at the key luminance', () => {
    expect(exposureTarget(p.keyLuminance, p)).toBeCloseTo(p.base, 10)
  })

  it('falls for a brighter frame and rises for a darker one', () => {
    expect(exposureTarget(p.keyLuminance * 2, p)).toBeLessThan(p.base)
    expect(exposureTarget(p.keyLuminance / 2, p)).toBeGreaterThan(p.base)
  })

  it('stays inside [min, max] for every measurement, black and blown-out included', () => {
    for (const lum of [0, -1, 1e-12, 1e-3, 0.1, 1, 10, 1e6, Infinity, -Infinity, NaN]) {
      const t = exposureTarget(lum, p)
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(p.min)
      expect(t).toBeLessThanOrEqual(p.max)
    }
    expect(exposureTarget(0, p)).toBe(p.max)
    expect(exposureTarget(1e6, p)).toBe(p.min)
  })

  it('does not adapt at zero compensation', () => {
    expect(exposureTarget(p.keyLuminance * 8, { ...p, compensation: 0 })).toBeCloseTo(p.base, 10)
  })

  it('brackets the base exposure inside its own range', () => {
    expect(p.min).toBeLessThan(p.base)
    expect(p.max).toBeGreaterThan(p.base)
  })
})

describe('exposure step (asymmetric, convergent, never runs away)', () => {
  it('converges from above and from below without overshooting', () => {
    const target = 1.0
    for (const start of [p.min, p.max]) {
      let e = start
      let gap = Math.abs(e - target)
      for (let i = 0; i < 60 * 30; i++) {
        e = exposureStep(e, target, FRAME, p)
        const g = Math.abs(e - target)
        expect(g).toBeLessThanOrEqual(gap + 1e-12)
        expect(Math.sign(e - target) === Math.sign(start - target) || g < 1e-12).toBe(true)
        gap = g
      }
      expect(e).toBeCloseTo(target, 4)
    }
  })

  it('adapts to bright light faster than to the dark', () => {
    expect(p.toBrightSeconds).toBeLessThan(p.toDarkSeconds)
    expect(exposureTau(1.2, 0.8, p)).toBe(p.toBrightSeconds)
    expect(exposureTau(0.8, 1.2, p)).toBe(p.toDarkSeconds)
    // The same log distance in the same time: the fall covers more of it.
    const down = Math.log(1.2) - Math.log(run(1.2, 1.2 / 1.5, 0.5))
    const up = Math.log(run(1.2 / 1.5, 1.2, 0.5)) - Math.log(1.2 / 1.5)
    expect(down).toBeGreaterThan(up * 2)
  })

  it('honours its time constants: one tau covers 1 - 1/e of the log distance', () => {
    const from = 1.3
    const to = 0.7
    const after = run(from, to, p.toBrightSeconds)
    const covered = (Math.log(from) - Math.log(after)) / (Math.log(from) - Math.log(to))
    expect(covered).toBeGreaterThan(0.6)
    expect(covered).toBeLessThan(0.66)
  })

  it('falls well inside a second when facing the sun (bounded frame count)', () => {
    const t = exposureTarget(1e6, p)
    const e = run(p.base, t, 1)
    expect((Math.log(p.base) - Math.log(e)) / (Math.log(p.base) - Math.log(t))).toBeGreaterThan(0.9)
  })

  it('stays finite and bounded on garbage input', () => {
    for (const current of [NaN, Infinity, -1, 0, 1e9]) {
      for (const target of [NaN, Infinity, -Infinity, 0, 1e9]) {
        for (const dt of [NaN, -1, 0, FRAME, 10]) {
          const e = exposureStep(current, target, dt, p)
          expect(Number.isFinite(e)).toBe(true)
          expect(e).toBeGreaterThanOrEqual(p.min)
          expect(e).toBeLessThanOrEqual(p.max)
        }
      }
    }
  })

  it('caps a hitch to the longest frame step', () => {
    expect(exposureStep(p.max, p.min, 5, p)).toBe(exposureStep(p.max, p.min, p.maxStepSeconds, p))
  })

  it('a zero time constant cannot divide by zero', () => {
    const e = exposureStep(1.2, 0.8, FRAME, { ...p, toBrightSeconds: 0 })
    expect(e).toBeCloseTo(0.8, 6)
  })
})
