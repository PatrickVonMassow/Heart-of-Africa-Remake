// The shield at the river (user report 05.10.2026): a lion hunting an antelope
// calf, the parent shielding, a river between. The browser section
// `calf-shield-river` (scripts/verify/enrichments.mjs) stages the scene in the
// live game; this layer stages the same contact race on the pure helpers in
// Wildlife.tsx's frame order (herds pre-pass: shield station + take; render
// loop: calf flight; hunt frame: braked lion step + catch) and pins the pose
// rule that fixes the one reproduced defect — the feed pose snap.
import { describe, expect, it } from 'vitest'
import {
  blockHeading,
  chaseFleeStep,
  chaseSwimEscaped,
  feedFlank,
  fleeWaterStep,
  segPointDist,
  swimBrakedPace,
} from './wildlifeBehavior'

// Mirrors of Wildlife.tsx's module constants (not exported there).
const HUNT_LION_SPEED = 5.6
const HUNT_LION_TURN = 3
const CALF_POUNCE_RADIUS = 3
const CALF_FLEE_SPEED = 3.8
const RESCUE_SPEED = 6 // rescueSpeed(balance.family.rescueBurst = 2)
const SWIM_PACE = 2.6 // CROSS_SWIM_SPEED in the dry season (flow factor <= 1)
const PARENT_BLOCK_OFFSET = 1.8
const PARENT_TAKE_DIST = 1.0
const CALF_CATCH_DIST = 0.9
const FEED_FLANK_DIST = Math.hypot(0.7, 0.25)

type P = { x: number; z: number }
type Outcome = 'parent-taken' | 'calf-caught' | 'far-bank' | 'open'

/** One staged hunt; returns which body the lion reached first. */
function stage(river: (x: number, z: number) => string, calf0: P, parent0: P, lion0: P, dt: number): Outcome {
  const calf = { ...calf0, swim: undefined as P | undefined, corridor: undefined as number | undefined }
  const par = { ...parent0 }
  const lion = { ...lion0, h: Math.atan2(calf0.x - lion0.x, calf0.z - lion0.z) }
  for (let f = 0; f < 30 / dt; f++) {
    // Herds pre-pass: the parent runs for its station, then the swept take.
    const h = blockHeading(par.x, par.z, calf.x, calf.z, lion.x, lion.z, PARENT_BLOCK_OFFSET)
    if (h !== null) {
      const s = fleeWaterStep(par.x, par.z, h, swimBrakedPace(RESCUE_SPEED, river(par.x, par.z), SWIM_PACE) * dt, river, 0.8)
      par.x = s.x
      par.z = s.z
    }
    const lmv = HUNT_LION_SPEED * dt
    const lpx = lion.x - Math.sin(lion.h) * lmv
    const lpz = lion.z - Math.cos(lion.h) * lmv
    if (segPointDist(lpx, lpz, lion.x, lion.z, par.x, par.z) < PARENT_TAKE_DIST) return 'parent-taken'
    // Render loop: the hunted calf's flight (swims a river at the braked pace).
    const fromT = river(calf.x, calf.z)
    const from = { x: calf.x, z: calf.z }
    const cs = chaseFleeStep(calf.x, calf.z, lion.x, lion.z, swimBrakedPace(CALF_FLEE_SPEED, fromT, SWIM_PACE) * dt, river, 0.8, calf.corridor)
    calf.corridor = cs.corridor
    calf.x = cs.x
    calf.z = cs.z
    if (river(calf.x, calf.z) === 'water' && (fromT !== 'water' || !calf.swim)) calf.swim = from
    // Hunt frame: far-bank escape, steer, braked step, swept catch.
    if (chaseSwimEscaped(calf.swim, calf.x, calf.z, river)) return 'far-bank'
    const tx = calf.x - lion.x
    const tz = calf.z - lion.z
    if (Math.hypot(tx, tz) < CALF_POUNCE_RADIUS) lion.h = Math.atan2(tx, tz)
    else {
      let dh = Math.atan2(tx, tz) - lion.h
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      lion.h += Math.max(-HUNT_LION_TURN * dt, Math.min(HUNT_LION_TURN * dt, dh))
    }
    const x0 = lion.x
    const z0 = lion.z
    const pace = swimBrakedPace(HUNT_LION_SPEED, river(lion.x, lion.z), SWIM_PACE)
    lion.x += Math.sin(lion.h) * pace * dt
    lion.z += Math.cos(lion.h) * pace * dt
    if (segPointDist(x0, z0, lion.x, lion.z, calf.x, calf.z) < CALF_CATCH_DIST) return 'calf-caught'
  }
  return 'open'
}

describe('the shield at the river (user report 05.10.2026)', () => {
  // A north-south channel 5.4 units wide, like the reported river at x 45.5-50.8.
  const river = (x: number) => (x > 0 && x < 5.4 ? 'water' : 'savanna')

  it('a shielding parent is always the first body the lion reaches — at the river and laterally offset on land', () => {
    const counts: Record<Outcome, number> = { 'parent-taken': 0, 'calf-caught': 0, 'far-bank': 0, open: 0 }
    for (const dt of [1 / 60, 1 / 30, 0.1])
      for (let cx = -3; cx <= 4; cx += 1)
        for (let ang = -2.4; ang <= 2.4; ang += 0.4)
          for (const ld of [6, 10, 14])
            for (const [ox, oz] of [[-1.8, 0], [-1, 1.5], [-2, 2.5], [0, 2], [-3, -2], [1, 1], [-1.5, 3.5]]) {
              const lion = { x: cx - Math.cos(ang) * ld, z: Math.sin(ang) * ld }
              counts[stage(river, { x: cx, z: 0 }, { x: cx + ox, z: oz }, lion, dt)]++
            }
    // Reproduction attempt: never once does the calf die past its shield; the
    // hunt ends with the parent taken or the calf across the water.
    expect(counts['calf-caught']).toBe(0)
    expect(counts['parent-taken']).toBeGreaterThan(0)
    expect(counts['far-bank']).toBeGreaterThan(0)
  })
})

describe('feedFlank — the feeding predator stays on its own side', () => {
  it('stands FEED_FLANK_DIST from the victim toward where the predator was', () => {
    const f = feedFlank(10, 0, 4, 0, FEED_FLANK_DIST) // came from the west
    expect(f.x).toBeCloseTo(10 - FEED_FLANK_DIST, 6)
    expect(f.z).toBeCloseTo(0, 6)
  })

  it('never crosses to the far side of a body it reached from the other bank', () => {
    // The parent taken at the west waterline by a lion from the west: the old
    // fixed (+0.7, +0.25) flank put the lion EAST of the body, on the water.
    const body = { x: 45.68, z: -99.42 }
    const lion = { x: 44.9, z: -99.81 }
    const f = feedFlank(body.x, body.z, lion.x, lion.z, FEED_FLANK_DIST)
    expect(f.x).toBeLessThan(body.x)
    expect(Math.hypot(f.x - lion.x, f.z - lion.z)).toBeLessThan(0.2) // no snap: it barely moves
  })

  it('a victim switch moves the feeder only as far as the new body is from it', () => {
    // Feeding on the calf, the charging parent is taken 1.3 away: the lion
    // re-flanks onto the parent from where it stands, never through it.
    const at = feedFlank(0, 0, -3, 0, FEED_FLANK_DIST)
    const next = feedFlank(-0.6, 1.15, at.x, at.z, FEED_FLANK_DIST)
    expect(Math.hypot(next.x - at.x, next.z - at.z)).toBeLessThan(1.3)
    expect(Math.hypot(next.x + 0.6, next.z - 1.15)).toBeCloseTo(FEED_FLANK_DIST, 6)
  })

  it('falls back to the legacy flank direction when standing on the victim', () => {
    const f = feedFlank(2, 3, 2, 3, FEED_FLANK_DIST)
    expect(f.x).toBeCloseTo(2.7, 6)
    expect(f.z).toBeCloseTo(3.25, 6)
  })
})
