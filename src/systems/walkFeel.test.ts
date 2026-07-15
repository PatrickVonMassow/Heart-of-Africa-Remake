// Walk-feel math (CLAUDE.md §7.1 pt. 20, point 97): velocity inertia, step
// phase / footstep crossings, bob amplitude fade at rest, and the strafe roll
// sign/clamp.
import { describe, it, expect } from 'vitest'
import { easeSpeed, easeToward, advanceStepPhase, headBob, strafeRollTarget, idleSway } from './walkFeel'

describe('easeSpeed (velocity inertia)', () => {
  it('ramps up toward the target without overshooting', () => {
    let v = 0
    for (let i = 0; i < 200; i++) v = easeSpeed(v, 10, 0.12, 0.06, 1 / 60)
    expect(v).toBeGreaterThan(9.9)
    expect(v).toBeLessThanOrEqual(10)
  })

  it('does not jump instantly to the target (there is real inertia)', () => {
    const v = easeSpeed(0, 10, 0.12, 0.06, 1 / 60)
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(4) // one frame covers only a fraction
  })

  it('uses the faster decelerate constant when slowing down', () => {
    // decelTau (0.06) < accelTau (0.12): for the same 10-unit gap, one frame
    // of decelerating (10 → 0) changes MORE than one frame of accelerating
    // (0 → 10), so the walk settles quicker than it ramps up.
    const accelStep = easeSpeed(0, 10, 0.12, 0.06, 1 / 60) // toward a higher speed
    const decelStep = 10 - easeSpeed(10, 0, 0.12, 0.06, 1 / 60) // toward 0
    expect(decelStep).toBeGreaterThan(accelStep)
  })
})

describe('advanceStepPhase (footstep crossings)', () => {
  it('advances the phase proportional to speed·dt·cadence', () => {
    const { phase } = advanceStepPhase(0, 10, 0.5, 0.1)
    expect(phase).toBeCloseTo(0.5, 6) // 10 * 0.5 * 0.1
  })

  it('does not advance (and fires no footstep) while standing still', () => {
    const r = advanceStepPhase(1.0, 0, 0.5, 0.1)
    expect(r.phase).toBe(1.0)
    expect(r.footstep).toBe(false)
  })

  it('fires a footstep exactly when the phase crosses a multiple of π', () => {
    // Just below π → just above π.
    const before = Math.PI - 0.05
    const r = advanceStepPhase(before, 10, 1, 0.01) // +0.1 → crosses π
    expect(r.footstep).toBe(true)
    // A step within the same half-cycle fires nothing.
    const r2 = advanceStepPhase(0.1, 10, 1, 0.01)
    expect(r2.footstep).toBe(false)
  })

  it('gives two footsteps per full stride (0..2π)', () => {
    let phase = 0
    let steps = 0
    // Walk one full stride's worth of phase in small increments.
    while (phase < 2 * Math.PI) {
      const r = advanceStepPhase(phase, 10, 1, 0.005)
      if (r.footstep) steps++
      phase = r.phase
    }
    expect(steps).toBe(2)
  })
})

describe('headBob (fades with speed, figure-eight)', () => {
  it('is zero at rest and grows with the speed fraction', () => {
    expect(headBob(1.2, 0, 0.06, 0.03)).toEqual({ dy: expect.closeTo(0, 6), dx: expect.closeTo(0, 6) })
    const moving = headBob(0.7, 1, 0.06, 0.03)
    expect(Math.abs(moving.dy) + Math.abs(moving.dx)).toBeGreaterThan(0)
  })

  it('the vertical bob runs at twice the lateral sway frequency', () => {
    // Over a phase sweep the vertical completes twice as many cycles.
    const zeroCross = (fn: (p: number) => number) => {
      let n = 0
      let prev = fn(0)
      for (let p = 0.001; p <= 2 * Math.PI; p += 0.001) {
        const v = fn(p)
        if ((prev <= 0 && v > 0) || (prev >= 0 && v < 0)) n++
        prev = v
      }
      return n
    }
    const vert = zeroCross((p) => headBob(p, 1, 0.06, 0.03).dy)
    const lat = zeroCross((p) => headBob(p, 1, 0.06, 0.03).dx)
    expect(vert).toBe(lat * 2)
  })

  it('amplitude never exceeds its balance value', () => {
    for (let p = 0; p < 10; p += 0.13) {
      const b = headBob(p, 1, 0.06, 0.03)
      expect(Math.abs(b.dy)).toBeLessThanOrEqual(0.06 + 1e-9)
      expect(Math.abs(b.dx)).toBeLessThanOrEqual(0.03 + 1e-9)
    }
  })
})

describe('strafeRollTarget (sign + clamp)', () => {
  const MAX = (3 * Math.PI) / 180 // 3°

  it('leans into the strafe direction and is zero at rest', () => {
    expect(strafeRollTarget(0, 8, MAX)).toBe(0)
    expect(strafeRollTarget(8, 8, MAX)).toBeCloseTo(MAX, 6)
    expect(strafeRollTarget(-8, 8, MAX)).toBeCloseTo(-MAX, 6)
  })

  it('never exceeds the max roll even at high lateral speed', () => {
    expect(strafeRollTarget(100, 8, MAX)).toBeCloseTo(MAX, 6)
    expect(strafeRollTarget(-100, 8, MAX)).toBeCloseTo(-MAX, 6)
  })
})

describe('easeToward + idleSway', () => {
  it('easeToward converges to the target', () => {
    let r = 0.05
    for (let i = 0; i < 300; i++) r = easeToward(r, 0, 0.1, 1 / 60)
    expect(Math.abs(r)).toBeLessThan(1e-3)
  })

  it('idleSway stays tiny (well under a centimetre)', () => {
    for (let t = 0; t < 20; t += 0.2) {
      expect(Math.abs(idleSway(t, 0.004, 0.6))).toBeLessThan(0.01)
    }
  })
})
