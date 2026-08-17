// The wedge carve (work-order point 657): the ground between two boundaries
// that pinch below a passage is not offered to the chase. Pinned first on
// synthetic geometry — each rule one case — and then on the REPORTED village
// itself, because the carve exists for two named slots at one named seed.
import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { standingClear, WALKER_RADIUS, type Collider } from './collision'
import { buildLayout, builtFabric } from './layout'
import { childPlayGround, villageAdultStations } from './lifeSpots'
import { buildWedgeCarve, WEDGE_PASSAGE } from './wedgeCarve'

const NPC = 0.3
const GROUND = { x: 0, z: 0, radius: 10 }

describe('buildWedgeCarve on synthetic geometry', () => {
  it('carves the slot between two pinching circles, and nothing beside it', () => {
    // Two huts whose clearance circles leave a 0.8 m slot centred on x = 0.
    const colliders: Collider[] = [
      { x: -2.5, z: 0, r: 1.8 }, // clearance ends at x = -0.4
      { x: 2.5, z: 0, r: 1.8 }, // clearance begins at x = +0.4
    ]
    const carve = buildWedgeCarve(colliders, NPC, GROUND)
    // In the slot: between the two, sub-passage.
    expect(carve(0, 0)).toBe(true)
    // Where the same slot has widened past the passage: kept.
    expect(carve(0, 1.5)).toBe(false)
    // Beside ONE hut with open ground on the other side: kept.
    expect(carve(0, 5)).toBe(false)
    expect(carve(-2.5, 2.5)).toBe(false)
    // Far from both: kept.
    expect(carve(0, -8)).toBe(false)
  })

  it('keeps a corridor at or above the passage width', () => {
    // Clearance circles end at x = ±0.61: a 1.22 m corridor, just passable.
    const colliders: Collider[] = [
      { x: -2.71, z: 0, r: 1.8 },
      { x: 2.71, z: 0, r: 1.8 },
    ]
    const carve = buildWedgeCarve(colliders, NPC, GROUND)
    expect(WEDGE_PASSAGE).toBe(1.2)
    expect(carve(0, 0)).toBe(false)
  })

  it('carves the whole tip of a rim-straddling collider, leaving no sealed pocket', () => {
    // A hut straddling the ground circle: the corridor between its clearance
    // and the rim converges to zero at their intersection. Everything in that
    // corridor below the passage width must carve — a free island past the
    // carve line would catch a rescue teleport.
    const colliders: Collider[] = [{ x: 9, z: 0, r: 2 }]
    const carve = buildWedgeCarve(colliders, NPC, GROUND)
    // Walk the corridor between hut clearance and rim on the +z side: from
    // where it is wide (kept) toward the pinch (carved), every point past the
    // first carved one stays carved.
    let carvedSeen = false
    for (let a = Math.PI / 2; a > 0.05; a -= 0.02) {
      // A point midway between the hut's clearance circle and the rim, on the
      // bearing `a` as seen from the hut centre.
      const hx = 9 + Math.cos(a) * 2.3
      const hz = Math.sin(a) * 2.3
      const toRim = 10 - Math.hypot(hx, hz)
      if (toRim <= 0) continue
      const ux = hx / Math.hypot(hx, hz)
      const uz = hz / Math.hypot(hx, hz)
      const px = hx + (ux * toRim) / 2
      const pz = hz + (uz * toRim) / 2
      const here = carve(px, pz)
      if (carvedSeen) expect(here).toBe(true)
      if (here) carvedSeen = true
    }
    expect(carvedSeen).toBe(true)
  })

  it('does not carve at a fence joint, where two panels form a wall, not a slot', () => {
    // Two segments meeting at a right angle. On the convex side both panels
    // lie on the SAME side of the point; on the concave side their normals are
    // PERPENDICULAR, not opposed — a corner is walked round, not paced in —
    // and the opposed-direction test refuses both by design.
    const colliders: Collider[] = [
      { kind: 'segment', x1: -3, z1: 0, x2: 0, z2: 0, r: 0.4 },
      { kind: 'segment', x1: 0, z1: 0, x2: 0, z2: -3, r: 0.4 },
    ]
    const carve = buildWedgeCarve(colliders, NPC, GROUND)
    expect(carve(0.9, 0.9)).toBe(false)
    expect(carve(1.5, 1.5)).toBe(false)
    expect(carve(-0.75, -0.75)).toBe(false)
  })

  it('handles box colliders', () => {
    // A box wall and a hut pinching a 0.8 m slot between them.
    const colliders: Collider[] = [
      { kind: 'box', x: -2, z: 0, hx: 1, hz: 3, rot: 0 }, // east face at x = -1
      { x: 2.5, z: 0, r: 2.6 }, // clearance begins at x = -0.4 (r + NPC)
    ]
    const carve = buildWedgeCarve(colliders, NPC, GROUND)
    expect(carve(-0.55, 0)).toBe(true)
    expect(carve(-0.55, 6)).toBe(false) // beyond the hut: beside the wall only
  })
})

describe('buildWedgeCarve on the reported village (seed 2972259115)', () => {
  const layout = buildLayout('bambara-village', 2972259115)
  const NPC_RADIUS = WALKER_RADIUS
  const ground = childPlayGround(
    villageAdultStations([-3.5, 2.5]),
    Math.max(1, layout.radius - NPC_RADIUS * 2),
    balance.villageLife.tag.playRadius,
    balance.communication.hearingRadius,
    {
      free: (x, z) => standingClear(layout.colliders, x, z, NPC_RADIUS),
      fabric: builtFabric(layout),
    },
  )
  const carve = buildWedgeCarve(layout.colliders, NPC_RADIUS, ground)

  it('carves the two slots every measured red window sat in', () => {
    // The 0.76 m channel between the two hut clearances — the live-probed
    // windows at (10.4-10.7, -5.6..-5.8) — and the corridor the rim-straddling
    // hut at (13.5, -6.4) pinches shut, where the evader herds compressed.
    expect(carve(10.55, -5.7)).toBe(true)
    expect(carve(15.85, -7.75)).toBe(true)
  })

  it('keeps the ground the game really uses', () => {
    // The passages the panels showed healthy play depending on. The ground's
    // exact CENTRE is deliberately not here: it happens to sit in the 0.06 m
    // pinch between two further huts, which the carve rightly takes — the
    // spawn nudge places the group by the same predicate.
    for (const [x, z] of [
      [13.9, -14.83], // the south band between hut and rim (1.6 m+ wide)
      [7.5, -6.3], // the open west ground
      [12.9, -12.9], // the open south-east field
    ] as const) {
      expect(carve(x, z)).toBe(false)
    }
  })

  it('takes only a small share of the statically free ground', () => {
    // The grid-mask attempt failed exactly here: it carved the passable
    // ribbons and then severed half the ground. The analytic carve must stay
    // a trim, not an amputation.
    let free = 0
    let carved = 0
    for (let gx = ground.x - ground.radius; gx <= ground.x + ground.radius; gx += 0.25) {
      for (let gz = ground.z - ground.radius; gz <= ground.z + ground.radius; gz += 0.25) {
        if (Math.hypot(gx - ground.x, gz - ground.z) > ground.radius) continue
        if (!standingClear(layout.colliders, gx, gz, NPC_RADIUS)) continue
        free++
        if (carve(gx, gz)) carved++
      }
    }
    expect(free).toBeGreaterThan(500)
    expect(carved / free).toBeLessThan(0.15)
  })
})
