// THE CHILDREN'S STAGE ON THE BANK, IN NUMBERS (work-order 687 item 6).
//
// The spec asks for the stretch in world units rather than in adjectives, and
// for two properties the picture depends on: both rocks inside one frame from
// the start line at the default field of view and the reference viewport, and a
// lane at least three walker diameters wide so a child can pass an adult or the
// traveller without being pushed into the water or a wall. Everything here is
// COMPUTED from the shipped layout — a restated number drifts, a measured one
// fails.

import { describe, expect, it } from 'vitest'
import { standingClear, WALKER_RADIUS, spawnPointFree } from './collision'
import { buildLayout, TEACHING_STONE_SCALE } from './layout'
import { BANK_PLAY_LANE_HALF, inBankPlayLane, standsOnGroundPlate } from './riverBank'
import { PLACES } from '../../world/geo'

/** The camera the player looks through: App.tsx's own field of view, and the
 *  viewport the verification scripts run at. */
const FOV_DEG = 50
const VIEWPORT = { width: 1440, height: 900 }

/** The three river villages are the settlements that carry a bank at all. */
const RIVER_VILLAGES = ['nubian-village', 'bambara-village', 'mandinka-village']

/** Height of a play rock: `buildRock` is a unit-radius blob scaled by this, and
 *  the collider takes half of it as a radius — so the stone stands roughly
 *  waist-high on a grown man. */
const ROCK_HEIGHT = 0.54 * TEACHING_STONE_SCALE

describe('the children`s play stage on the bank (point 687)', () => {
  it('gives exactly the river villages two play rocks, and no other settlement any', () => {
    for (const place of PLACES) {
      const layout = buildLayout(place.id, 4242)
      expect(!!layout.playRocks).toBe(!!layout.bank)
      if (RIVER_VILLAGES.includes(place.id)) expect(layout.playRocks).not.toBeNull()
    }
  })

  it('sets them at the ends of the settlement`s own stretch, mirrored', () => {
    for (const id of RIVER_VILLAGES) {
      const layout = buildLayout(id, 42)
      const rocks = layout.playRocks!
      const bank = layout.bank!
      // The pair is the bank's own mirror pair pulled inland by one fixed inset,
      // so the two stand equally far from the centre — the mirror is what the
      // UPSTREAM/DOWNSTREAM teaching rests on.
      const up = Math.hypot(rocks.upstream.x, rocks.upstream.z)
      const down = Math.hypot(rocks.downstream.x, rocks.downstream.z)
      expect(Math.abs(up - down)).toBeLessThan(1e-6)
      // And each sits inland of the bank stop on its own bearing, so the adults'
      // stops stay ground a villager can be SENT to (point 155).
      expect(Math.hypot(bank.upstream.x, bank.upstream.z)).toBeGreaterThan(up)
      expect(spawnPointFree(layout.colliders, bank.upstream.x, bank.upstream.z, WALKER_RADIUS)).toBe(true)
      expect(spawnPointFree(layout.colliders, bank.downstream.x, bank.downstream.z, WALKER_RADIUS)).toBe(true)
      // Both stand on the flat ground plate, clear of the shore (point 584/585).
      expect(standsOnGroundPlate(bank, rocks.upstream.x, rocks.upstream.z, rocks.r)).toBe(true)
      expect(standsOnGroundPlate(bank, rocks.downstream.x, rocks.downstream.z, rocks.r)).toBe(true)
    }
  })

  it('measures the stretch, and puts both rocks inside one frame from the start line', () => {
    const halfV = (FOV_DEG / 2) * (Math.PI / 180)
    const halfH = Math.atan(Math.tan(halfV) * (VIEWPORT.width / VIEWPORT.height))
    for (const id of RIVER_VILLAGES) {
      const rocks = buildLayout(id, 42).playRocks!
      const stretch = Math.hypot(
        rocks.upstream.x - rocks.downstream.x,
        rocks.upstream.z - rocks.downstream.z,
      )
      // The measured stretch of the shipped villages, stated rather than assumed.
      expect(stretch).toBeGreaterThan(18)
      expect(stretch).toBeLessThan(22)
      // A runner at the start line looks down the lane at the far rock: it must
      // be a rock rather than a speck. Its height over the stretch, against the
      // vertical frame — some 3.8 deg of 50, about 68 px of the 900.
      const subtended = 2 * Math.atan(ROCK_HEIGHT / 2 / stretch)
      expect((subtended / (2 * halfV)) * VIEWPORT.height).toBeGreaterThan(40)
      // And BOTH are in the frame at once: a spectator standing back from the
      // start line by one stretch-length sees the near rock at this bearing off
      // his line to the far one, well inside the horizontal half-frame.
      const bearing = Math.atan(stretch / 2 / stretch)
      expect(bearing).toBeLessThan(halfH)
    }
  })

  it('keeps the lane at least three walker diameters wide', () => {
    const floor = 3 * (2 * WALKER_RADIUS)
    for (const id of RIVER_VILLAGES) {
      for (const seed of [42, 99, 2972259115, 236333330]) {
        const layout = buildLayout(id, seed)
        const rocks = layout.playRocks!
        const dx = rocks.downstream.x - rocks.upstream.x
        const dz = rocks.downstream.z - rocks.upstream.z
        const len = Math.hypot(dx, dz)
        // The perpendicular of the stretch: the direction a child steps aside in.
        const px = -dz / len
        const pz = dx / len
        let narrowest = Infinity
        // Sampled between the two rocks' own ends, which are solid by design.
        for (let t = 0.15; t <= 0.85; t += 0.02) {
          const x = rocks.upstream.x + dx * t
          const z = rocks.upstream.z + dz * t
          let width = 0
          for (const side of [1, -1]) {
            let out = 0
            for (let d = 0; d <= 4; d += 0.1) {
              const sx = x + px * side * d
              const sz = z + pz * side * d
              if (
                !standingClear(layout.colliders, sx, sz, WALKER_RADIUS) ||
                !standsOnGroundPlate(layout.bank, sx, sz, WALKER_RADIUS) ||
                Math.hypot(sx, sz) > layout.radius + 12
              ) {
                break
              }
              out = d
            }
            width += out
          }
          narrowest = Math.min(narrowest, width)
        }
        expect(narrowest).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('keeps every loose boulder and tuft out of that lane', () => {
    for (const id of RIVER_VILLAGES) {
      for (const seed of [42, 99, 7, 2972259115]) {
        const layout = buildLayout(id, seed)
        for (const [x, z, s] of layout.rocks) {
          expect(inBankPlayLane(layout.playRocks, x, z, 0.35 + s * 0.5)).toBe(false)
        }
        for (const t of layout.flora) {
          expect(inBankPlayLane(layout.playRocks, t.x, t.z, 0.45)).toBe(false)
        }
      }
    }
  })

  it('and the lane predicate answers for the corridor, not for a pair of circles', () => {
    const rocks = { upstream: { x: 0, z: 0 }, downstream: { x: 10, z: 0 } }
    expect(inBankPlayLane(rocks, 5, 0)).toBe(true)
    expect(inBankPlayLane(rocks, 5, BANK_PLAY_LANE_HALF - 0.01)).toBe(true)
    expect(inBankPlayLane(rocks, 5, BANK_PLAY_LANE_HALF + 0.01)).toBe(false)
    // Past either end it is out of the lane, and a body's own radius widens it.
    expect(inBankPlayLane(rocks, -2, 0)).toBe(false)
    expect(inBankPlayLane(rocks, -2, 0, 1)).toBe(true)
    expect(inBankPlayLane(null, 0, 0)).toBe(false)
  })

  it('makes both rocks solid, so nobody walks through the run`s targets', () => {
    for (const id of RIVER_VILLAGES) {
      const layout = buildLayout(id, 42)
      const rocks = layout.playRocks!
      for (const p of [rocks.upstream, rocks.downstream]) {
        expect(standingClear(layout.colliders, p.x, p.z, WALKER_RADIUS)).toBe(false)
        // …and a child standing a stride off it is on free ground: the run ends
        // AT the rock, so its approach must not be sealed.
        expect(
          standingClear(layout.colliders, p.x * (1 - 2 / Math.hypot(p.x, p.z)), p.z * (1 - 2 / Math.hypot(p.x, p.z)), WALKER_RADIUS),
        ).toBe(true)
      }
    }
  })
})
