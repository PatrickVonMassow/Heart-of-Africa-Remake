import { describe, expect, it } from 'vitest'
import { escortHeading, fleeHeading, turnToward } from './wildlifeBehavior'

const dir = (h: number): [number, number] => [Math.sin(h), Math.cos(h)]

describe('fleeHeading (design.md §19 — stable prey escape)', () => {
  it('returns null when no threat is within range', () => {
    expect(fleeHeading(0, 0, [[10, 0]], 3)).toBeNull()
    expect(fleeHeading(0, 0, [], 3)).toBeNull()
  })

  it('flees directly away from a single threat', () => {
    // Threat ahead at +z; the animal should flee toward -z (heading π).
    const h = fleeHeading(0, 0, [[0, 2]], 3)
    expect(h).not.toBeNull()
    const [sx, sz] = dir(h as number)
    expect(sx).toBeCloseTo(0, 5)
    expect(sz).toBeCloseTo(-1, 5)
  })

  it('flees the resultant of two flanking threats, moving away from both', () => {
    // Two elephants ~90° apart, both at +x (one at +z, one at -z): the escape
    // heading must point in -x (away from both), not toward either one.
    const threats: [number, number][] = [
      [2, 2],
      [2, -2],
    ]
    const h = fleeHeading(0, 0, threats, 5) as number
    const [sx, sz] = dir(h)
    expect(sx).toBeCloseTo(-1, 2) // moves in -x
    expect(sz).toBeCloseTo(0, 2)
    // A step along the heading increases the distance to BOTH threats.
    const step = 0.5
    for (const [tx, tz] of threats) {
      const before = Math.hypot(0 - tx, 0 - tz)
      const after = Math.hypot(sx * step - tx, sz * step - tz)
      expect(after).toBeGreaterThan(before)
    }
  })

  it('falls back to a single threat when the repulsion cancels out exactly', () => {
    // Two threats exactly opposite at equal distance: the summed vector is zero,
    // so it must still bolt (toward the first-seen one's away side), not freeze
    // on a NaN heading.
    const h = fleeHeading(0, 0, [[0, 1], [0, -1]], 5)
    expect(h).not.toBeNull()
    expect(Number.isNaN(h as number)).toBe(false)
    const [, sz] = dir(h as number)
    expect(sz).toBeLessThan(0) // away from the +z threat seen first
  })

  it('stays stable (no oscillation) as the animal moves away from flankers', () => {
    // Reproduces the reported symptom setup: a prey straddled by two elephants.
    // Walking along the escape heading and recomputing each step must yield a
    // heading that barely changes and never reverses — the old nearest-threat
    // pick would flip ~90° here.
    const threats: [number, number][] = [
      [3, 1.4],
      [3, -1.8],
    ]
    let x = 0
    let z = 0
    let prev = fleeHeading(x, z, threats, 5) as number
    let maxDelta = 0
    let reversals = 0
    let prevDelta = 0
    for (let i = 0; i < 40; i++) {
      const h = fleeHeading(x, z, threats, 5)
      if (h === null) break // fled out of range — fine
      let d = h - prev
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      maxDelta = Math.max(maxDelta, Math.abs(d))
      if (i > 0 && d * prevDelta < -1e-6) reversals++
      prevDelta = d
      prev = h
      const [sx, sz] = dir(h)
      x += sx * 0.2
      z += sz * 0.2
    }
    expect(maxDelta).toBeLessThan(0.35) // no ~90° snap
    expect(reversals).toBeLessThanOrEqual(1)
  })
})

describe('escortHeading (design.md §19 — parent escorts its hunted calf)', () => {
  it('bolts away from the predator while near the calf', () => {
    // Parent at origin, calf beside it, predator at +x: flee toward -x.
    const h = escortHeading(0, 0, 1, 0, 5, 0, 8)
    expect(h).not.toBeNull()
    const [sx, sz] = dir(h as number)
    expect(sx).toBeCloseTo(-1, 5)
    expect(sz).toBeCloseTo(0, 5)
  })

  it('holds once the calf is keepNear or farther away (never abandons it)', () => {
    expect(escortHeading(0, 0, 9, 0, 12, 0, 8)).toBeNull()
    expect(escortHeading(0, 0, 8, 0, 12, 0, 8)).toBeNull() // boundary: >= holds
  })

  it('holds in the degenerate case of standing on the predator', () => {
    expect(escortHeading(3, 3, 4, 3, 3, 3, 8)).toBeNull()
  })

  it('leaves the parent clear of — but near — the calf when the hunter closes in', () => {
    // Mini-simulation of the chase contract (design.md §19): the predator runs
    // the fleeing calf down while the parent escorts. At the catch the parent
    // must stand clear of the pin (so the rescue charge is a visible run) yet
    // never beyond the escort range of its calf.
    const keepNear = 8
    const calf = { x: 0, z: 0 }
    const parent = { x: 1.8, z: 0 }
    const pred = { x: -12, z: 0 }
    const dt = 1 / 60
    let caught = false
    for (let i = 0; i < 60 * 20 && !caught; i++) {
      const toCalf = Math.atan2(calf.x - pred.x, calf.z - pred.z)
      pred.x += Math.sin(toCalf) * 5.6 * dt
      pred.z += Math.cos(toCalf) * 5.6 * dt
      if (Math.hypot(pred.x - calf.x, pred.z - calf.z) < 0.9) {
        caught = true
        break
      }
      const away = Math.atan2(calf.x - pred.x, calf.z - pred.z)
      calf.x += Math.sin(away) * 3.8 * dt
      calf.z += Math.cos(away) * 3.8 * dt
      const h = escortHeading(parent.x, parent.z, calf.x, calf.z, pred.x, pred.z, keepNear)
      if (h !== null) {
        parent.x += Math.sin(h) * 5 * dt
        parent.z += Math.cos(h) * 5 * dt
      }
    }
    expect(caught).toBe(true) // the slower calf is run down
    const dParentCalf = Math.hypot(parent.x - calf.x, parent.z - calf.z)
    expect(dParentCalf).toBeGreaterThan(2) // clear of the pin — the charge is a run
    expect(dParentCalf).toBeLessThan(keepNear + 1) // but never abandoned
  })
})

describe('turnToward', () => {
  it('caps the step and takes the shorter way around the circle', () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1, 6)
    expect(turnToward(0, -1, 0.1)).toBeCloseTo(-0.1, 6)
    // Wrap: from just below +π toward just above -π goes forward, not all the way back.
    const r = turnToward(3.0, -3.0, 0.2)
    expect(r).toBeCloseTo(3.2, 6)
  })

  it('reaches the target when within one step', () => {
    expect(turnToward(0, 0.05, 0.2)).toBeCloseTo(0.05, 6)
  })
})
