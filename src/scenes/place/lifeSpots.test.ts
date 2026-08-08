// Where the village's life stands, and where the children play (work-order
// point 481.4). The one rule this file exists for: the children's play ground
// must clear every fixed adult vignette by the §13.4 hearing radius, so that
// among the children the player hears the children and among the adults the
// adults — what he cannot hear teaches him nothing, so two groups within one
// earshot would teach him a muddle.

import { describe, expect, it } from 'vitest'
import {
  FABRIC_REACH,
  MIN_FABRIC,
  MIN_PLAY_RADIUS,
  SPECTATOR_MARGIN,
  PORT_TALKERS,
  VILLAGE_SPOTS,
  childPlayGround,
  villageAdultStations,
} from './lifeSpots'
import { balance } from '../../config/balance'
import { PLACE_RADIUS, buildLayout, builtFabric } from './layout'
import { standingClear, WALKER_RADIUS } from './collision'
import { PLACES } from '../../world/geo'
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

  it('prefers OPEN ground among the bearings that are far enough', () => {
    // One station in the middle, so every bearing is equally far — and half the
    // settlement a boulder field. The ground must land in the other half,
    // because a chase behind rocks is a chase nobody can watch.
    const middle: Array<[number, number]> = [[0, 0]]
    const open = childPlayGround(middle, WALK, PLAY, HEARING, { free: (x) => x <= 0 })
    expect(open.clearance).toBeGreaterThanOrEqual(HEARING)
    expect(open.openness).toBe(1)
    expect(open.x).toBeLessThanOrEqual(0)
    // The mirrored obstacle mirrors the choice: it is the ground, not a bias.
    const mirrored = childPlayGround(middle, WALK, PLAY, HEARING, { free: (x) => x >= 0 })
    expect(mirrored.x).toBeGreaterThanOrEqual(0)
  })

  it('never buys openness with the separation rule', () => {
    // Everything but the adults' own corner is blocked: the ground still keeps
    // its distance and reports the openness it had to accept, rather than
    // moving into earshot for a clear view.
    const g = childPlayGround(villageAdultStations(FIRE), WALK, PLAY, HEARING, {
      free: (x, z) => Math.hypot(x - 4.6, z - 5.6) < 8,
    })
    expect(g.clearance).toBeGreaterThanOrEqual(HEARING)
    expect(g.openness).toBeLessThan(0.5)
  })

  it('reports the openness of the ground it picked in the shipped village', () => {
    // No predicate: nothing is known, and it says so rather than guessing.
    expect(ground().openness).toBe(1)
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

describe('the children play against the village, not behind it (point 524)', () => {
  it('says nothing is known when no fabric is named', () => {
    expect(ground().fabric).toBe(1)
  })

  it('stays among the huts rather than out on the bare edge', () => {
    // A ring of huts at 12 m and nothing beyond it: the far rim is emptier and
    // quieter, and the earlier placement went there — which is how the evidence
    // frame came to show one child on an empty plain. The ground must stay on
    // the ring.
    const huts: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2
      return [Math.cos(a) * 12, Math.sin(a) * 12]
    })
    const g = childPlayGround(villageAdultStations(FIRE), WALK, PLAY, HEARING, { fabric: huts })
    expect(g.clearance).toBeGreaterThanOrEqual(HEARING)
    expect(g.fabric).toBeGreaterThanOrEqual(MIN_FABRIC)
    // Its far edge does not reach out past the built ring by more than the reach
    // that still counts as standing against it.
    expect(Math.hypot(g.x, g.z) + g.radius).toBeLessThanOrEqual(12 + FABRIC_REACH)
  })

  it('gives up SIZE for the picture, never the walkable rim', () => {
    const huts: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2
      return [Math.cos(a) * 12, Math.sin(a) * 12]
    })
    const g = childPlayGround(villageAdultStations(FIRE), WALK, PLAY, HEARING, { fabric: huts })
    // Smaller than the ground the rim would have allowed, because it had to come
    // in to the huts — and still a game of tag.
    expect(g.radius).toBeGreaterThanOrEqual(MIN_PLAY_RADIUS)
    expect(g.radius).toBeLessThanOrEqual(PLAY)
    expect(Math.hypot(g.x, g.z) + g.radius + SPECTATOR_MARGIN).toBeLessThanOrEqual(WALK + 1e-6)
  })

  it('lets the SEPARATION give when nothing separated stands against the village', () => {
    // Every hut in one corner, and an adult station standing in it: no ground can
    // be both far enough and against the fabric. Point 524.2 says which one gives
    // — and it gives as little as it must.
    const corner: Array<[number, number]> = [
      [-14, -14],
      [-12, -16],
      [-16, -12],
      [-10, -13],
      [-13, -10],
    ]
    const g = childPlayGround([[-13, -13]], WALK, PLAY, HEARING, { fabric: corner })
    expect(g.fabric).toBeGreaterThanOrEqual(MIN_FABRIC)
    expect(g.clearance).toBeLessThan(HEARING)
    // As little as it must: it works its way to the far side of the huts and
    // spends its SIZE getting there, rather than settling on top of the adult.
    expect(g.clearance).toBeGreaterThan(2)
    expect(g.radius).toBeLessThan(PLAY)
  })

  it('reports an empty answer rather than inventing one when a place has no fabric at all', () => {
    const g = childPlayGround([[0, 0]], 6, PLAY, HEARING, { fabric: [[40, 40]] })
    expect(g.fabric).toBeLessThan(MIN_FABRIC)
    expect(g.clearance).toBeLessThan(HEARING)
    expect(g.radius).toBeGreaterThanOrEqual(MIN_PLAY_RADIUS)
  })
})

describe('every shipped village can seat its children (point 524)', () => {
  const VILLAGES = PLACES.filter((p) => p.kind === 'village')

  it('has villages to check at all', () => {
    expect(VILLAGES.length).toBeGreaterThan(10)
  })

  it.each(VILLAGES.map((p) => p.id))('%s: separated AND against the built fabric', (id) => {
    const layout = buildLayout(id, 7)
    const walk = Math.max(1, layout.radius - WALKER_RADIUS * 2)
    const g = childPlayGround(villageAdultStations(FIRE), walk, PLAY, HEARING, {
      free: (x, z) => standingClear(layout.colliders, x, z, WALKER_RADIUS),
      fabric: builtFabric(layout),
    })
    // The separation rule of point 481.4 still holds …
    expect(g.clearance).toBeGreaterThanOrEqual(HEARING)
    // … and the ground stands against the village, so the chase is watched with
    // the settlement behind it rather than against an empty plain.
    expect(g.fabric).toBeGreaterThanOrEqual(MIN_FABRIC)
    // Still a game of tag, still inside the settlement, still on ground a child
    // can stand on.
    expect(g.radius).toBeGreaterThanOrEqual(MIN_PLAY_RADIUS)
    expect(Math.hypot(g.x, g.z) + g.radius + SPECTATOR_MARGIN).toBeLessThanOrEqual(walk + 1e-6)
    expect(g.openness).toBeGreaterThan(0.4)
  })

  it('counts the buildings as fabric and the villager markers not', () => {
    const layout = buildLayout('maasai-village', 7)
    const fabric = builtFabric(layout)
    expect(fabric.length).toBe(
      layout.dwellings.length + layout.interactives.filter((it) => it.type !== 'villager').length,
    )
    expect(layout.interactives.some((it) => it.type === 'villager')).toBe(true)
    for (const it of layout.interactives) {
      if (it.type === 'villager') expect(fabric).not.toContainEqual(it.pos)
    }
  })
})
