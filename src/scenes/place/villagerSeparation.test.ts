// Walking villagers never stand inside one another (finding from the village
// walk frame: a walking woman and a man behind her drawn as one body at the
// village centre). The separation already kept two BODY discs apart, but a
// disc of 0.24 m is the torso alone — a walking figure's stride and arm swing
// reach well beyond it, so two walkers at disc contact still interpenetrate
// where the camera sees them. These cases replay walkers through the village
// with the scene's own steppers and measure every walking pair.

import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { resolveMove } from './collision'
import {
  claimBodies,
  createInhabitantSet,
  separateBody,
  stepRoundBodies,
  type InhabitantBody,
} from './inhabitantBodies'
import { buildLayout } from './layout'
import { crowd, NPC_RADIUS } from './tagShuffleHarness'

const SEP = balance.villageLife.separation
/** The centre distance two walking adults must keep for their drawn figures
 *  to show a gap: a stride reaches ~0.35 m fore and aft of the body centre and
 *  the swinging hands about as far to the side. */
const VISIBLE_GAP = 0.7
const DT = 1 / 60

/** The closest pair of striding bodies this frame. */
function closestWalkingPair(bodies: readonly InhabitantBody[]): number {
  let worst = Infinity
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (!a.active || !a.striding) continue
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (!b.active || !b.striding) continue
      worst = Math.min(worst, Math.hypot(a.x - b.x, a.z - b.z))
    }
  }
  return worst
}

describe('walking villager separation', () => {
  it('gives a walking body room for its stride', () => {
    expect(2 * (SEP.bodyRadius + SEP.strideMargin) - SEP.slop).toBeGreaterThanOrEqual(VISIBLE_GAP)
  })

  it('keeps every pair of routine walkers apart while they cross and overtake at the village centre', () => {
    // Walkers stepped as `PlaceWalkers` steps them, one after another: walked
    // round the other bodies, swept against the colliders, then separated.
    const layout = buildLayout('zulu-village', 1)
    const colliders = layout.colliders
    const set = createInhabitantSet()
    const rand = mulberry32(1396)
    const count = 6
    const bodies = claimBodies(set, count)
    // Lanes through the plaza from both sides, at slightly different speeds,
    // so walkers meet head-on, overtake and cross behind one another.
    const centre = { x: 0, z: 3 }
    const walkers = bodies.map((b, i) => {
      const a = (i / count) * Math.PI * 2 + rand() * 0.3
      const from = { x: centre.x + Math.cos(a) * 6, z: centre.z + Math.sin(a) * 6 }
      const to = { x: centre.x - Math.cos(a) * 6, z: centre.z - Math.sin(a) * 6 }
      b.x = from.x
      b.z = from.z
      b.striding = true
      return { from, to, speed: 1.05 + rand() * 0.5 }
    })
    const blocked = () => false
    let worst = Infinity
    let frames = 0
    for (let f = 0; f < 60 * 90; f++) {
      walkers.forEach((w, i) => {
        const b = bodies[i]
        const dx = w.to.x - b.x
        const dz = w.to.z - b.z
        const d = Math.hypot(dx, dz)
        if (d < 0.4) {
          // Turn round at the lane end and walk back through the centre.
          ;[w.from, w.to] = [w.to, w.from]
          return
        }
        const step = w.speed * DT
        const want = stepRoundBodies(set, b, b.x, b.z, b.x + (dx / d) * step, b.z + (dz / d) * step, SEP, blocked)
        ;[b.x, b.z] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [b.x, b.z])
        separateBody(set, b, DT, SEP)
      })
      // Each walker resolved against neighbours some of which have not moved
      // yet this frame — the scene's own order — so judge the end of the frame.
      worst = Math.min(worst, closestWalkingPair(bodies))
      frames++
    }
    expect(frames).toBe(60 * 90)
    expect(worst).toBeGreaterThanOrEqual(VISIBLE_GAP - 0.02)
  })

  it('keeps the porters and the errand villagers apart over a long village walk', () => {
    const layout = buildLayout('zulu-village', 7)
    const set = createInhabitantSet()
    // Every stroll goes to the plaza, so the walkers keep meeting there.
    const life = crowd(set, 'zulu-village', layout, 7, { x: 0, z: 3, radius: 4 })
    let worst = Infinity
    let walkingFrames = 0
    let clock = 0
    for (let f = 0; f < 60 * 240; f++) {
      clock += DT
      life.step(DT, clock)
      const pair = closestWalkingPair(set.bodies)
      if (Number.isFinite(pair)) walkingFrames++
      worst = Math.min(worst, pair)
    }
    expect(walkingFrames).toBeGreaterThan(60 * 60)
    expect(worst).toBeGreaterThanOrEqual(VISIBLE_GAP - 0.02)
  })
})
