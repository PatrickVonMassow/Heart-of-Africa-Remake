// Where the village's life stands, and where the children play (work-order
// point 481.4). The one rule this file exists for: the children's play ground
// must clear every fixed adult vignette by the §13.4 hearing radius, so that
// among the children the player hears the children and among the adults the
// adults — what he cannot hear teaches him nothing, so two groups within one
// earshot would teach him a muddle.

import { describe, expect, it } from 'vitest'
import {
  MIN_PLAY_RADIUS,
  SPECTATOR_MARGIN,
  PORT_TALKERS,
  VILLAGE_SPOTS,
  childPlayGround,
  villageAdultStations,
} from './lifeSpots'
import { balance } from '../../config/balance'
import { PLACE_RADIUS } from './layout'
import { isWithinHearing } from '../../communication/heard'

/** The village fire of the shipped settlement scene (PlaceScene). */
const FIRE: [number, number] = [-3.5, 2.5]
/** The walkable rim the chase is given: the settlement minus two body radii. */
const WALK = PLACE_RADIUS - 0.6
const HEARING = balance.communication.hearingRadius
const PLAY = balance.villageLife.tag.playRadius

function ground(fire: readonly [number, number] = FIRE, walk = WALK, play = PLAY) {
  return childPlayGround(villageAdultStations(fire), walk, play, HEARING)
}

/** Distance from a point to the nearest adult station. */
function nearestStation(x: number, z: number, fire: readonly [number, number] = FIRE): number {
  return Math.min(...villageAdultStations(fire).map(([sx, sz]) => Math.hypot(x - sx, z - sz)))
}

describe('the adult stations', () => {
  it('names the fixed vignettes, and moves the three at the fire with it', () => {
    const here = villageAdultStations([0, 0])
    const there = villageAdultStations([10, 10])
    expect(here.length).toBe(there.length)
    expect(here).toContainEqual(VILLAGE_SPOTS.talkers)
    expect(here).toContainEqual(VILLAGE_SPOTS.well)
    // The fire party moved with the fire; the well did not.
    expect(there).toContainEqual([10, 10])
    expect(there).toContainEqual(VILLAGE_SPOTS.well)
    expect(PORT_TALKERS).toHaveLength(2) // ports have no children's ground yet
  })
})

describe('the children play out of the adults’ earshot (point 481.4)', () => {
  it('clears every adult station by the hearing radius, from anywhere on the ground', () => {
    const g = ground()
    expect(g.clearance).toBeGreaterThanOrEqual(HEARING)
    // The claim spelled out: the nearest point of the ground to any station is
    // still outside hearing.
    expect(nearestStation(g.x, g.z) - g.radius).toBeGreaterThanOrEqual(HEARING)
    for (const [sx, sz] of villageAdultStations(FIRE)) {
      const nearestOnGround = Math.max(0, Math.hypot(sx - g.x, sz - g.z) - g.radius)
      expect(isWithinHearing(nearestOnGround, HEARING)).toBe(false)
    }
  })

  it('holds wherever the fire is, by shrinking the ground rather than giving up', () => {
    for (let fx = -9; fx <= 9; fx += 1.5) {
      for (let fz = -9; fz <= 9; fz += 1.5) {
        const g = ground([fx, fz])
        expect(g.clearance, `fire at ${fx},${fz}`).toBeGreaterThanOrEqual(HEARING)
        expect(g.radius).toBeGreaterThanOrEqual(MIN_PLAY_RADIUS)
        expect(g.radius).toBeLessThanOrEqual(PLAY)
      }
    }
  })

  it('keeps the whole ground inside the settlement, with room to stand and watch', () => {
    for (let fx = -9; fx <= 9; fx += 3) {
      for (let fz = -9; fz <= 9; fz += 3) {
        const g = ground([fx, fz])
        // The far edge of the ground plus a spectator's margin still lies inside
        // the walkable rim: watching from any side never walks the player out of
        // the village (leaving the rim leaves the place).
        expect(Math.hypot(g.x, g.z) + g.radius + SPECTATOR_MARGIN).toBeLessThanOrEqual(WALK + 1e-6)
        expect(g.radius).toBeGreaterThanOrEqual(MIN_PLAY_RADIUS)
      }
    }
  })

  it('takes the biggest ground that is far enough — it only shrinks when it must', () => {
    // With no adults at all, nothing constrains it: the full radius stands.
    expect(childPlayGround([], WALK, PLAY, HEARING).radius).toBe(PLAY)
    // With a station right where the far ground would be, it shrinks.
    const g = ground()
    const crowded = childPlayGround([[g.x, g.z]], WALK, PLAY, HEARING)
    expect(crowded.radius).toBeLessThanOrEqual(PLAY)
    expect(Math.hypot(crowded.x - g.x, crowded.z - g.z)).toBeGreaterThan(HEARING)
  })

  it('is deterministic — the same village puts its children in the same place', () => {
    const a = ground()
    const b = ground()
    expect(a).toEqual(b)
  })

  it('reports what it achieved when a settlement is too small to separate anyone', () => {
    // A tiny place with a station in the middle: no ground can clear it, and the
    // function says so instead of returning a comfortable lie.
    const g = childPlayGround([[0, 0]], 6, PLAY, HEARING)
    expect(g.clearance).toBeLessThan(HEARING)
    expect(g.radius).toBeGreaterThanOrEqual(MIN_PLAY_RADIUS)
  })
})
