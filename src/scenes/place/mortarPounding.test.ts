import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { FIGURE_LIMBS } from '../../render/figures'
import {
  bowlRadiusAt,
  footAtElevation,
  footDriftAt,
  footHeightAt,
  grainLevel,
  HEAD_RADIUS,
  impactFootY,
  impactsBetween,
  mortarProfile,
  POUND_ELEVATION_RANGE,
  poundFrame,
  poundPhase,
  puffGrain,
  sinceImpact,
} from './mortarPounding'

const cfg = balance.villageLife.mortar
const phases = Array.from({ length: 200 }, (_, i) => i / 200)
const topOf = (f: ReturnType<typeof poundFrame>) => f.centre[1] + (cfg.pestleLength / 2) * f.axis[1]
/** The second woman stands across the mortar, facing the first: her frame
 *  turned half round about the mortar's centre. */
const acrossTheMortar = ([x, y, z]: readonly number[]) => [-x, y, 2 * cfg.standOff - z]

describe('the mortar is a footed, hollowed, waist-high block', () => {
  it('is waist-high to the figure and hourglass-shaped', () => {
    // Waist-high: above the figure's hip (where its legs end) and below its shoulder.
    expect(cfg.height).toBeGreaterThan(FIGURE_LIMBS.hipY)
    expect(cfg.height).toBeLessThan(FIGURE_LIMBS.shoulderY)
    expect(cfg.waistRadius).toBeLessThan(cfg.footRadius * 0.7)
    expect(cfg.waistRadius).toBeLessThan(cfg.rimRadius * 0.7)
  })

  it('has a bowl below the rim holding grain', () => {
    const profile = mortarProfile()
    const floor = profile[profile.length - 1][1]
    expect(floor).toBeCloseTo(cfg.height - cfg.bowlDepth)
    expect(grainLevel()).toBeLessThan(cfg.height)
    expect(grainLevel()).toBeGreaterThan(floor)
    expect(bowlRadiusAt(grainLevel())).toBeGreaterThan(0.05)
  })
})

describe('the stroke cycle', () => {
  it('drives the pestle foot below the mortar rim into the grain at impact', () => {
    const impact = poundFrame(0)
    expect(impact.foot[1]).toBeLessThan(cfg.height)
    expect(impact.foot[1]).toBeLessThan(grainLevel())
    expect(impact.foot[1]).toBeCloseTo(impactFootY(), 3)
    // Inside the bowl, never through its wall or floor.
    expect(impact.foot[1]).toBeGreaterThan(cfg.height - cfg.bowlDepth)
    const sideways = Math.hypot(impact.foot[0], impact.foot[2] - cfg.standOff)
    expect(sideways + cfg.pestleRadius).toBeLessThan(bowlRadiusAt(impact.foot[1]))
  })

  it('lifts the pestle clear of the rim and high over her head at the top', () => {
    const top = poundFrame(0.57)
    expect(top.foot[1]).toBeCloseTo(cfg.height + cfg.liftAboveRim, 3)
    // The figure's head tops out at 1.34 body heights; the pole towers over it.
    expect(topOf(top)).toBeGreaterThan(1.34 + 0.3)
    // And the hands are raised well above the impact grip.
    expect(top.grip[1] - poundFrame(0).grip[1]).toBeGreaterThan(0.2)
  })

  it('bends the knees into the impact and straightens for the lift', () => {
    expect(poundFrame(0).squat).toBeCloseTo(1 - cfg.squatDepth)
    expect(poundFrame(0.5).squat).toBe(1)
    expect(poundFrame(0.95).squat).toBeLessThan(1)
  })

  it('drives down accelerating: the last stretch before impact is the fastest', () => {
    const drop = (a: number, b: number) => footHeightAt(a) - footHeightAt(b)
    expect(drop(0.9, 0.999)).toBeGreaterThan(drop(0.7, 0.8))
  })

  it('keeps both hands on the shaft and the shaft through them at every phase', () => {
    for (const p of phases) {
      const f = poundFrame(p)
      expect(f.foot[1], `phase ${p}`).toBeCloseTo(footHeightAt(p), 3)
      // Grip lies on the shaft, gripFromFoot along it.
      const along = Math.hypot(f.grip[0] - f.foot[0], f.grip[1] - f.foot[1], f.grip[2] - f.foot[2])
      expect(along, `phase ${p}`).toBeCloseTo(cfg.gripFromFoot, 3)
      // Each hand sits against the shaft, on either side of it.
      for (const hand of f.hands) {
        const off = Math.hypot(hand[0] - f.grip[0], hand[2] - f.grip[2])
        expect(off, `phase ${p}`).toBeLessThan(cfg.gripHalf + 0.02)
      }
      // A pestle held near upright, never a pole swung flat.
      expect(f.tilt, `phase ${p}`).toBeLessThan(0.3)
    }
  })

  it('never runs the shaft through a head, hers or the other woman\'s', () => {
    // Closest approach of a point to the drawn shaft segment.
    const toShaft = (f: ReturnType<typeof poundFrame>, q: readonly number[]) => {
      const rel = q.map((v, k) => v - f.foot[k])
      const s = Math.max(0, Math.min(cfg.pestleLength, rel[0] * f.axis[0] + rel[1] * f.axis[1] + rel[2] * f.axis[2]))
      return Math.hypot(...rel.map((v, k) => v - f.axis[k] * s))
    }
    let own = Infinity
    let other = Infinity
    for (const p of phases) {
      const a = poundFrame(p)
      const b = poundFrame((p + 0.5) % 1)
      own = Math.min(own, toShaft(a, a.head))
      other = Math.min(other, toShaft(a, acrossTheMortar(b.head)))
    }
    expect(own).toBeGreaterThan(HEAD_RADIUS + cfg.pestleRadius)
    expect(other).toBeGreaterThan(HEAD_RADIUS + cfg.pestleRadius)
  })

  it('keeps the foot over the opening whenever it is at or below the rim', () => {
    for (const p of phases) {
      const f = poundFrame(p)
      const off = Math.hypot(f.foot[0], f.foot[2] - cfg.standOff)
      expect(footDriftAt(f.foot[1])).toBeCloseTo(cfg.standOff - f.foot[2], 9)
      if (f.foot[1] <= cfg.height + 0.02) {
        expect(off + cfg.pestleRadius, `phase ${p}`).toBeLessThan(bowlRadiusAt(Math.min(cfg.height, Math.max(f.foot[1], grainLevel()))))
      } else {
        // Above the rim it cannot touch the wood; it only hangs over the top.
        expect(off, `phase ${p}`).toBeLessThan(cfg.rimRadius)
      }
    }
  })

  it('solves on a monotone range: a higher arm always lifts the foot', () => {
    for (const p of [0, 0.3, 0.57, 0.85]) {
      let last = -Infinity
      for (let e = POUND_ELEVATION_RANGE[0]; e <= POUND_ELEVATION_RANGE[1]; e += 0.05) {
        const y = footAtElevation(e, p)
        expect(y, `phase ${p}, elevation ${e.toFixed(2)}`).toBeGreaterThan(last)
        last = y
      }
    }
  })
})

describe('two women alternate at one mortar', () => {
  it('strikes half a stroke apart, so one pestle is up while the other lands', () => {
    expect(cfg.pounders).toBe(2)
    for (const t of [0, 0.37, 1.1, 5.55]) {
      const gap = poundPhase(t, 1) - poundPhase(t, 0)
      expect(((gap % 1) + 1) % 1).toBeCloseTo(0.5)
    }
    const t = cfg.strokeSeconds * 3 // the first woman's impact
    expect(poundPhase(t, 0)).toBeCloseTo(0)
    const other = poundFrame(poundPhase(t, 1))
    expect(other.foot[1]).toBeGreaterThan(cfg.height + cfg.liftAboveRim * 0.8)
  })

  it('never thuds both at once: their impacts interleave', () => {
    const impacts: Array<[number, number]> = []
    const dt = 1 / 60
    for (let t = 0; t < cfg.strokeSeconds * 6; t += dt) {
      for (const w of [0, 1]) if (impactsBetween(t, t + dt, w) > 0) impacts.push([t + dt, w])
    }
    expect(impacts.length).toBe(12)
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i][1]).not.toBe(impacts[i - 1][1])
      expect(impacts[i][0] - impacts[i - 1][0]).toBeCloseTo(cfg.strokeSeconds / 2, 1)
    }
  })

  it('keeps their hands and their pestles apart through the whole cycle', () => {
    let closestHands = Infinity
    let closestShafts = Infinity
    for (const p of phases) {
      const a = poundFrame(p)
      const b = poundFrame((p + 0.5) % 1)
      for (const ha of a.hands) for (const hb of b.hands) {
        const w = acrossTheMortar(hb)
        closestHands = Math.min(closestHands, Math.hypot(ha[0] - w[0], ha[1] - w[1], ha[2] - w[2]))
      }
      // Sample both shafts and take their closest approach.
      for (let s = 0; s <= 1; s += 0.05) for (let u = 0; u <= 1; u += 0.05) {
        const pa = a.foot.map((v, k) => v + a.axis[k] * s * cfg.pestleLength)
        const pb = acrossTheMortar(b.foot.map((v, k) => v + b.axis[k] * u * cfg.pestleLength))
        closestShafts = Math.min(closestShafts, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]))
      }
    }
    expect(closestHands).toBeGreaterThan(2 * FIGURE_LIMBS.handRadius)
    expect(closestShafts).toBeGreaterThan(2 * cfg.pestleRadius)
  })
})

describe('the impact edge, the thud timing and the grain puff', () => {
  it('counts one impact per stroke and every stroke a long frame spans', () => {
    const T = cfg.strokeSeconds
    expect(impactsBetween(T - 0.01, T + 0.01, 0)).toBe(1)
    expect(impactsBetween(T + 0.01, T + 0.02, 0)).toBe(0)
    expect(impactsBetween(0.1, 0.1 + 3 * T, 0)).toBe(3)
    expect(impactsBetween(T, T, 0)).toBe(0)
    expect(sinceImpact(T + 0.2, 0)).toBeCloseTo(0.2)
  })

  it('throws grain up out of the bowl and lets it fall back, then hides it', () => {
    for (let i = 0; i < cfg.puffGrains; i++) {
      expect(puffGrain(i, 0.08).visible).toBe(true)
      expect(puffGrain(i, 0.08).offset[1]).toBeGreaterThan(0)
      expect(puffGrain(i, cfg.puffSeconds).visible).toBe(false)
      expect(puffGrain(i, -0.01).visible).toBe(false)
    }
    // A spread: not every grain flies the same way.
    const dirs = new Set(Array.from({ length: cfg.puffGrains }, (_, i) => Math.sign(puffGrain(i, 0.1).offset[0])))
    expect(dirs.size).toBeGreaterThan(1)
  })
})
