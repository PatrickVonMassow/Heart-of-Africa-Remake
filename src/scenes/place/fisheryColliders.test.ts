// The fishers' scene is solid (point 1275): every fixed prop and figure of it is
// in the settlement's collision set in each village that has a fishery, the
// fishers' own walks stay clear of it, and the movers' live colliders follow
// the dugout and the walking figures.

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { fireHasCookShelter, fireShelterResponse, shelteredFireRainFactor } from '../../systems/cookShelter'
import { fireRainFactor } from '../../systems/season'
import { resolveMove, standingClear, PLAYER_RADIUS, type Collider } from './collision'
import { sharedLayout } from './layoutHarness'
import { PLACE_RADIUS } from './layout'
import { buildRiverBank } from './riverBank'
import { createFishFire, createFisheryRing, fisherySites } from './fishFire'
import { canoeLane, createCanoe } from './villagerCanoe'
import {
  createFisheryMovers,
  fisheryAlong,
  fisheryShelterPosts,
  fisheryStaticColliders,
  placeFisheryMovers,
} from './fisheryColliders'

beforeAll(setupGeodata)

const RIVER_VILLAGES = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS))
const SEEDS = [7, 42, 1337]
const same = (a: Collider, b: Collider) => JSON.stringify(a) === JSON.stringify(b)

describe('the fishers\' scene in the collision set (point 1275)', () => {
  it('there are riverside villages of both kinds: roofed and open fires', () => {
    expect(RIVER_VILLAGES.some((p) => fireHasCookShelter(p.peopleId))).toBe(true)
    expect(RIVER_VILLAGES.length).toBeGreaterThan(0)
  })

  it.each(RIVER_VILLAGES.flatMap((p) => SEEDS.map((seed) => [p.id, seed] as const)))(
    '%s @%i: fire, grill, rack, storage, board, griller and shelter posts are all solid',
    (id, seed) => {
      const place = PLACES.find((p) => p.id === id)!
      const layout = sharedLayout(id, seed)
      const bank = layout.bank!
      const sites = fisherySites(bank, canoeLane(bank))
      const sheltered = fireHasCookShelter(place.peopleId)
      const own = fisheryStaticColliders(sites, bank, sheltered)
      expect(own.length).toBe(sheltered ? 9 : 5)
      for (const c of own) expect(layout.colliders.some((k) => same(k, c))).toBe(true)
      // Each solid's middle is ground the traveller cannot stand on.
      const solids: Array<[string, { x: number; z: number }]> = [
        ['fire', sites.fire],
        ['rack', sites.rack],
        ['storage', sites.storage],
        ['board', sites.board],
        ['griller', sites.griller],
        ...(sheltered ? fisheryShelterPosts(sites, fisheryAlong(bank)).map((p, i): [string, { x: number; z: number }] => [`post${i}`, p]) : []),
      ]
      for (const [name, p] of solids) expect(standingClear(layout.colliders, p.x, p.z, PLAYER_RADIUS), name).toBe(false)
      // And the grill's forked posts, at the fire's local z ±0.95.
      const along = fisheryAlong(bank)
      for (const s of [-1, 1]) {
        const x = sites.fire.x + Math.sin(along) * 0.95 * s
        const z = sites.fire.z + Math.cos(along) * 0.95 * s
        expect(standingClear(layout.colliders, x, z, PLAYER_RADIUS), 'grill post').toBe(false)
      }
    },
  )

  it.each(RIVER_VILLAGES.map((p) => p.id))('%s: the fishers\' own walks and stands stay clear of their scene', (id) => {
    const place = PLACES.find((p) => p.id === id)!
    const bank = buildRiverBank(place, PLACE_RADIUS)!
    const sites = fisherySites(bank, canoeLane(bank))
    // The props as DRAWN (no stand-off), the griller's own body left out: it is him.
    const drawn = { ...balance.villageLife.fishFire, colliderMargin: 0 }
    const solids = fisheryStaticColliders(sites, bank, true, drawn).filter((c) => !(c.kind === undefined && c.x === sites.griller.x && c.z === sites.griller.z))
    // A scripted figure is never pushed; it must only not walk THROUGH a prop.
    // Its body is the drawn figure's own (0.15 m), not the stand-off.
    const R = 0.15
    // The carrier rises beside his own board and may brush it (work-order 1245
    // lets him touch it); every other prop, and the shelter posts, he clears.
    const board = solids[3]
    const walks = [
      [sites.carrierAtFire, sites.carrierAtBank, solids.filter((c) => c !== board)],
      ...sites.duoStands.map((p, i) => [p, sites.duoAtRack[i], solids] as const),
    ] as const
    for (const [a, b, against] of walks) {
      for (let k = 0; k <= 60; k++) {
        const x = a.x + (b.x - a.x) * (k / 60)
        const z = a.z + (b.z - a.z) * (k / 60)
        expect(standingClear(against, x, z, R), `walk ${k}`).toBe(true)
      }
    }
  })
})

describe('the movers follow the dugout and the walking fishers (point 1275)', () => {
  const place = RIVER_VILLAGES[0]
  it('the hull, the carrier and both women are bodies; the net man only ashore', () => {
    const bank = buildRiverBank(place, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const sites = fisherySites(bank, lane)
    const canoe = createCanoe(lane)
    const fire = createFishFire(sites, createFisheryRing(), 60)
    const movers = createFisheryMovers(fire.duo.women.length)
    canoe.netMan.inBoat = true
    let live = placeFisheryMovers(movers, canoe, fire)
    expect(live.length).toBe(2 + fire.duo.women.length)
    canoe.netMan.inBoat = false
    live = placeFisheryMovers(movers, canoe, fire, undefined, undefined, live)
    expect(live.length).toBe(3 + fire.duo.women.length)
    // A walk straight at the hull's middle stops outside it.
    const nx = Math.cos(canoe.yaw)
    const nz = -Math.sin(canoe.yaw)
    let x = canoe.x + nx * 3
    let z = canoe.z + nz * 3
    for (let i = 0; i < 60; i++) [x, z] = resolveMove(live, x - nx * 0.1, z - nz * 0.1, PLAYER_RADIUS, [x, z])
    // Signed along the starting normal: he stays on his own side, not beyond the hull.
    const off = (x - canoe.x) * nx + (z - canoe.z) * nz
    expect(off).toBeGreaterThanOrEqual(balance.villageLife.canoe.hullBeam / 2 + PLAYER_RADIUS - 1e-6)
    // The carrier's body moves with him.
    fire.carrier.x += 5
    placeFisheryMovers(movers, canoe, fire, undefined, undefined, live)
    expect(movers.carrier.x).toBe(fire.carrier.x)
    expect(standingClear(live, fire.carrier.x, fire.carrier.z, PLAYER_RADIUS)).toBe(false)
  })
})

describe('the fishers\' fire takes the village fire\'s rain shelter (point 1275)', () => {
  it.each(RIVER_VILLAGES.map((p) => [p.id, p.peopleId] as const))('%s: same sheltered flag and rain factor as the village fire', (_, peopleId) => {
    const village = fireHasCookShelter(peopleId)
    for (const rain of [0, 0.25, 0.6, 1]) {
      const fishery = fireShelterResponse(peopleId, rain)
      expect(fishery.sheltered).toBe(village)
      // The village fire pit's own reading (PlaceScene's FirePit and its dev hook).
      expect(fishery.rainFactor).toBe(fireRainFactor(rain, village, balance.fire.shelteredRainDamp, balance.fire.openRainDamp))
      expect(fishery.rainFactor).toBe(shelteredFireRainFactor(rain, village))
    }
    // Roofed it barely dips; open it is beaten down.
    const full = fireShelterResponse(peopleId, 1).rainFactor
    if (village) expect(full).toBeGreaterThan(fireShelterResponse('zulu', 1).rainFactor)
  })

  it('the canopy\'s posts stand round the grill, its forked posts and the kneeling griller', () => {
    const place = RIVER_VILLAGES.find((p) => fireHasCookShelter(p.peopleId))!
    const bank = buildRiverBank(place, PLACE_RADIUS)!
    const sites = fisherySites(bank, canoeLane(bank))
    const along = fisheryAlong(bank)
    const P = balance.villageLife.fishFire.shelterPostR
    // In the fire's frame every post is P along and P across; the griller and
    // the grill's posts lie inside that square.
    const local = (p: { x: number; z: number }) => {
      const dx = p.x - sites.fire.x
      const dz = p.z - sites.fire.z
      return { lx: Math.cos(along) * dx - Math.sin(along) * dz, lz: Math.sin(along) * dx + Math.cos(along) * dz }
    }
    for (const post of fisheryShelterPosts(sites, along)) {
      const { lx, lz } = local(post)
      expect(Math.abs(Math.abs(lx) - P)).toBeLessThan(1e-9)
      expect(Math.abs(Math.abs(lz) - P)).toBeLessThan(1e-9)
    }
    const g = local(sites.griller)
    expect(Math.max(Math.abs(g.lx), Math.abs(g.lz))).toBeLessThan(P)
    expect(0.95).toBeLessThan(P)
  })
})
