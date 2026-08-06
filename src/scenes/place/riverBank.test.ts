// The walkable river bank of a riverside settlement (work-order 482). Pure
// geometry, so all of it is pinned here rather than in a browser: the village
// stays dry, the bank is REACHABLE, the water is on the side the world model
// puts it, the two stretches run opposite ways along the current, and the
// landmark boulder the chief sends the player to is nowhere near any of it.

import { describe, it, expect } from 'vitest'
import {
  BANK_MAX_GAP,
  BANK_MIN_GAP,
  BANK_SHORE_HALF,
  BANK_WALL_INSET,
  buildRiverBank,
  type PlaceRiverBank,
} from './riverBank'
import { BACKDROP_SCALE, GROUND_DISC_OVERHANG } from './backdrop'
import { insidePlace, isOutsidePlace, maxBoundaryRadius, groundPlateRadius, placeBoundaryRadius } from './boundary'
import { buildLayout, PLACE_RADIUS } from './layout'
import { resolveMove, PLAYER_RADIUS, WALKER_RADIUS, standingClear } from './collision'
import { PLACES, RIVERS, VILLAGE_RIVER_CLEARANCE_DEG, placeById, latLonToWorld } from '../../world/geo'
import { RIVER_WIDTH_DEG } from '../../world/riverWidth'
import { communicationRockSite, ROCK_VILLAGE_ID } from '../../world/communicationRock'

const SEED = 4711
const village = placeById(ROCK_VILLAGE_ID)
const bank = buildRiverBank(village, PLACE_RADIUS) as PlaceRiverBank

/** Component of a point along a bank direction. */
const dot = (p: { x: number; z: number }, dx: number, dz: number) => p.x * dx + p.z * dz

describe('the PoC village stands on its river (work-order 482)', () => {
  it('has a bank at all, on the Niger', () => {
    expect(bank).not.toBeNull()
    expect(bank.riverId).toBe('niger')
  })

  it('keeps the §4.2 river clearance: the village never reaches into the water', () => {
    expect(bank.axisDeg).toBeGreaterThanOrEqual(VILLAGE_RIVER_CLEARANCE_DEG - 1e-9)
    // Which is the same statement as: the water's edge lies outside the built
    // disc, by the gap the bank rule demands.
    expect(bank.distance).toBeGreaterThanOrEqual(PLACE_RADIUS + BANK_MIN_GAP)
    expect(bank.distance).toBeLessThanOrEqual(PLACE_RADIUS + BANK_MAX_GAP)
  })

  it('lies where the world model puts the river — the same side in both views', () => {
    // The bearing of the nearest river axis from the village, in the bird's-eye
    // view's own world units, must be the bearing of the bank in the settlement.
    let best = Infinity
    let axis = { lat: 0, lon: 0 }
    for (const river of RIVERS) {
      // The course data is (lon, lat) tuples — the raw ~1890 waypoints, read
      // here independently of the densified axis the bank is measured against.
      for (const [lon, lat] of river.points) {
        const d = Math.hypot(lat - village.lat, lon - village.lon)
        if (d < best) {
          best = d
          axis = { lat, lon }
        }
      }
    }
    const here = latLonToWorld(village.lat, village.lon)
    const there = latLonToWorld(axis.lat, axis.lon)
    const len = Math.hypot(there.x - here.x, there.z - here.z)
    const worldBearing = Math.atan2((there.z - here.z) / len, (there.x - here.x) / len)
    const bankBearing = Math.atan2(bank.nz, bank.nx)
    let delta = Math.abs(worldBearing - bankBearing) % (Math.PI * 2)
    if (delta > Math.PI) delta = Math.PI * 2 - delta
    // Within a few degrees: the bank is measured against the DENSIFIED course,
    // the check against the raw control points, so a bend moves it slightly.
    expect(delta).toBeLessThan(0.25)
  })

  it('puts the waterline exactly where the panorama samples water', () => {
    // distance · BACKDROP_SCALE degrees out, plus the band's own half width, is
    // the distance to the axis: the water in the scene begins where the water
    // in the world begins.
    expect(bank.distance * BACKDROP_SCALE + RIVER_WIDTH_DEG).toBeCloseTo(bank.axisDeg, 6)
  })

  it('runs the current along the bank, square to the water', () => {
    expect(Math.hypot(bank.nx, bank.nz)).toBeCloseTo(1, 9)
    expect(Math.hypot(bank.fx, bank.fz)).toBeCloseTo(1, 9)
    expect(dot({ x: bank.fx, z: bank.fz }, bank.nx, bank.nz)).toBeCloseTo(0, 9)
  })

  it('runs DOWNSTREAM the way the course runs, source → mouth', () => {
    // The upper Niger flows north-east out of its Ségou reach: east (+x) and
    // north (−z) in the settlement's own frame.
    expect(bank.fx).toBeGreaterThan(0)
    expect(bank.fz).toBeLessThan(0)
  })
})

describe('the bank is REACHABLE, and the village stays dry', () => {
  const layout = buildLayout(ROCK_VILLAGE_ID, SEED)

  it('carries the bank into the layout', () => {
    expect(layout.bank).not.toBeNull()
    expect(layout.bank?.riverId).toBe('niger')
  })

  it('the bank point a villager stands at is inside the walkable region', () => {
    expect(isOutsidePlace(layout, bank.bank.x, bank.bank.z)).toBe(false)
    // And with a walker's clearance to spare, so it can stand there.
    expect(insidePlace(layout, bank.bank.x, bank.bank.z, WALKER_RADIUS * 2)).toBe(true)
    // It is genuinely OUT at the water, not a token step past the huts.
    expect(Math.hypot(bank.bank.x, bank.bank.z)).toBeGreaterThan(PLACE_RADIUS)
  })

  it('so are both stretches, with a walker’s clearance', () => {
    for (const p of [bank.upstream, bank.downstream]) {
      expect(isOutsidePlace(layout, p.x, p.z)).toBe(false)
      expect(insidePlace(layout, p.x, p.z, WALKER_RADIUS * 2)).toBe(true)
      expect(standingClear(layout.colliders, p.x, p.z, WALKER_RADIUS)).toBe(true)
    }
  })

  it('the two stretches run in OPPOSITE senses along the flow', () => {
    const up = dot({ x: bank.upstream.x - bank.bank.x, z: bank.upstream.z - bank.bank.z }, bank.fx, bank.fz)
    const down = dot({ x: bank.downstream.x - bank.bank.x, z: bank.downstream.z - bank.bank.z }, bank.fx, bank.fz)
    expect(up).toBeLessThan(-4)
    expect(down).toBeGreaterThan(4)
    // Mirrored, so the only thing that differs between the two pictures is the
    // direction (the rule the UPSTREAM/DOWNSTREAM teaching rests on).
    expect(up).toBeCloseTo(-down, 6)
  })

  it('the centre and every built thing stay dry', () => {
    const wet = (x: number, z: number, r: number) => dot({ x, z }, bank.nx, bank.nz) + r >= bank.distance
    expect(wet(0, 0, 0)).toBe(false)
    for (const d of layout.dwellings) expect(wet(d.x, d.z, d.r), `dwelling at ${d.x},${d.z}`).toBe(false)
    for (const it of layout.interactives) expect(wet(it.pos[0], it.pos[1], 3.4)).toBe(false)
    for (const [x, z, s] of layout.rocks) expect(wet(x, z, 0.35 + s * 0.5)).toBe(false)
    for (const f of layout.flora) expect(wet(f.x, f.z, 0.45)).toBe(false)
    for (const s of layout.digSites) expect(wet(s.x, s.z, 1)).toBe(false)
    if (layout.teachingStone) expect(wet(layout.teachingStone.x, layout.teachingStone.z, layout.teachingStone.r)).toBe(false)
  })

  it('the water is a wall: the player is stopped at the boundary, never wades out', () => {
    for (const a of [-0.3, -0.1, 0, 0.12, 0.3]) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      const dx = bank.nx * c + bank.fx * s
      const dz = bank.nz * c + bank.fz * s
      // A stride that would carry him well past the waterline.
      const [x, z] = resolveMove(layout.colliders, dx * (bank.distance + 6), dz * (bank.distance + 6), PLAYER_RADIUS, [
        dx * (bank.distance - 6),
        dz * (bank.distance - 6),
      ])
      expect(dot({ x, z }, bank.nx, bank.nz)).toBeLessThanOrEqual(bank.walkEdge - BANK_WALL_INSET + 1e-6)
      // And being stopped there, he has NOT left the settlement.
      expect(isOutsidePlace(layout, x, z)).toBe(false)
    }
  })

  it('the drawn ground reaches every walkable point, and stops at the bank', () => {
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    for (let j = 0; j < 720; j++) {
      const angle = (j / 720) * Math.PI * 2
      const plate = groundPlateRadius(layout, angle, discEdge)
      // Never short of the boundary at that bearing — the player can never
      // stand on ground the scene does not draw...
      expect(plate + 1e-9, `plate at ${angle.toFixed(3)}`).toBeGreaterThanOrEqual(
        placeBoundaryRadius(layout, angle),
      )
      // ... and never past the top of the bank, where the shore takes over.
      const rim = { x: Math.cos(angle) * plate, z: Math.sin(angle) * plate }
      expect(dot(rim, bank.nx, bank.nz)).toBeLessThanOrEqual(bank.walkEdge + 1e-6)
    }
  })

  it('leaves the shore strip room between the walkable edge and the water', () => {
    expect(bank.walkEdge).toBeCloseTo(bank.distance - BANK_SHORE_HALF, 9)
  })
})

describe('the landmark boulder is nowhere near the settlement (work-order 482 item 6)', () => {
  it('lies far outside the walkable region, upstream', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, SEED)
    for (const seed of [1, 7, 42, 1337, 90210]) {
      const rock = communicationRockSite(seed)
      // Expressed in the settlement's own frame (the panorama's scale).
      const x = (rock.lon - village.lon) / BACKDROP_SCALE
      const z = -(rock.lat - village.lat) / BACKDROP_SCALE
      expect(isOutsidePlace(layout, x, z)).toBe(true)
      expect(Math.hypot(x, z)).toBeGreaterThan(maxBoundaryRadius(layout) * 5)
      // And it stands on the same river the bank belongs to.
      expect(rock.upstreamDeg).toBeGreaterThan(1)
    }
  })
})

describe('a bank exists only where the geography carries one', () => {
  it('no port grows one — a port sits AT its river by design (§4.2 exemption)', () => {
    for (const place of PLACES.filter((p) => p.kind === 'port')) {
      expect(buildRiverBank(place, 30 + (place.size ?? 2) * 6), place.id).toBeNull()
    }
  })

  it('no monument site grows one', () => {
    for (const place of PLACES.filter((p) => p.kind === 'monument')) {
      expect(buildRiverBank(place, PLACE_RADIUS), place.id).toBeNull()
    }
  })

  it('a village away from every river has none, and the riverside ones all do', () => {
    const withBank = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
    expect(withBank).toContain(ROCK_VILLAGE_ID)
    expect(withBank).not.toContain('san-village')
    expect(withBank).not.toContain('maasai-village')
    // Every one of them stands on a real course, at the water's edge.
    for (const id of withBank) {
      const b = buildRiverBank(placeById(id), PLACE_RADIUS) as PlaceRiverBank
      expect(RIVERS.some((r) => r.id === b.riverId), id).toBe(true)
      expect(b.distance, id).toBeGreaterThan(PLACE_RADIUS)
    }
  })

  it('every place in the roster still builds a layout, bank or no bank', () => {
    for (const place of PLACES) {
      const layout = buildLayout(place.id, SEED)
      expect(layout.radius, place.id).toBeGreaterThan(0)
      if (place.kind !== 'village') expect(layout.bank, place.id).toBeNull()
    }
  })
})
