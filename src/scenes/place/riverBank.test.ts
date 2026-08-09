// The walkable river bank of a riverside settlement (work-order 482). Pure
// geometry, so all of it is pinned here rather than in a browser: the village
// stays dry, the bank is REACHABLE, the water is on the side the world model
// puts it, the two stretches run opposite ways along the current, and the
// landmark boulder the chief sends the player to is nowhere near any of it.

import { describe, it, expect } from 'vitest'
import {
  BANK_BED_REACH,
  BANK_MAX_GAP,
  BANK_MIN_GAP,
  BANK_SHALLOWS_SPAN,
  BANK_SHORE_HALF,
  bankWaterDepth,
  buildRiverBank,
  type PlaceRiverBank,
} from './riverBank'
import { balance } from '../../config/balance'
import { BACKDROP_SCALE, GROUND_DISC_OVERHANG } from './backdrop'
import { insidePlace, isOutsidePlace, maxBoundaryRadius, groundPlateRadius, placeBoundaryRadius } from './boundary'
import { buildLayout, PLACE_RADIUS } from './layout'
import { resolveMove, PLAYER_RADIUS, WALKER_RADIUS, standingClear } from './collision'
import { buildPlaceNavGrid, findPlaceRoute } from './routing'
import { PLACES, RIVERS, VILLAGE_RIVER_CLEARANCE_DEG, placeById, latLonToWorld } from '../../world/geo'
import { RIVER_WIDTH_DEG } from '../../world/riverWidth'
import { communicationRockSite, ROCK_VILLAGE_ID } from '../../world/communicationRock'

const SEED = 4711
/** The verify lane's world, and the one the F6 reports of work-order 583/584
 *  were taken in — the bank rules have to hold in both. */
const BANK_SEEDS = [SEED, 1425108822]
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

  it.each(BANK_SEEDS)('at seed %d the centre and every built thing stay dry', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    const wet = (x: number, z: number, r: number) => dot({ x, z }, bank.nx, bank.nz) + r >= bank.distance
    expect(wet(0, 0, 0)).toBe(false)
    for (const d of layout.dwellings) expect(wet(d.x, d.z, d.r), `dwelling at ${d.x},${d.z}`).toBe(false)
    for (const it of layout.interactives) expect(wet(it.pos[0], it.pos[1], 3.4)).toBe(false)
    for (const [x, z, s] of layout.rocks) expect(wet(x, z, 0.35 + s * 0.5)).toBe(false)
    for (const f of layout.flora) expect(wet(f.x, f.z, 0.45)).toBe(false)
    for (const s of layout.digSites) expect(wet(s.x, s.z, 1)).toBe(false)
    if (layout.teachingStone) expect(wet(layout.teachingStone.x, layout.teachingStone.z, layout.teachingStone.r)).toBe(false)
  })

  it.each(BANK_SEEDS)('THE WATER IS NOT A WALL at seed %d: nothing invisible stands at the waterline', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    // Work-order 584, from the F6 report "Ich laufe hier gegen das Wasser wie
    // gegen eine Wand": a collider ran along the waterline and stopped the
    // player a metre short of the bank his village exists to let him reach.
    // Swept in the bank's own frame: from the top of the bank out to the wade
    // limit, along the whole stretch the walkable lobe covers, nothing solid may
    // stand. Every collider belongs to something the renderer draws, and past
    // the top of the bank the renderer draws only shore and water.
    for (let along = -12; along <= 12; along += 1) {
      for (let out = bank.walkEdge; out <= bank.wadeEdge; out += 0.25) {
        const x = bank.nx * out + bank.fx * along
        const z = bank.nz * out + bank.fz * along
        expect(
          standingClear(layout.colliders, x, z, PLAYER_RADIUS),
          `collider ${out.toFixed(2)} m out, ${along} m along the bank`,
        ).toBe(true)
      }
    }
  })

  it.each(BANK_SEEDS)('at seed %d a walk from the village centre into the river WADES, and is handed on to the map', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    // The state the decision names (work-order 584): he crosses the waterline,
    // walks on until the water is at his wading depth, and there — out of his
    // depth, where the river is swum — the settlement ends. Never a dead stop
    // inside it.
    // The route is the settlement's own — he walks round the huts and the fence
    // the way anyone crossing a village does, and the only thing under test is
    // what happens where the ground meets the water.
    const grid = buildPlaceNavGrid(layout, layout.colliders, PLAYER_RADIUS)
    const target = { x: bank.nx * bank.wadeEdge, z: bank.nz * bank.wadeEdge }
    const route = findPlaceRoute(grid, { x: 0, z: 0 }, target)
    expect(route, 'no way from the village centre to the water').not.toBeNull()
    // One step past the wade limit, so the walk ends by LEAVING rather than by
    // arriving — the traveller does not stop at the water, he goes on into it.
    const legs = [...route!, { x: bank.nx * (bank.wadeEdge + 2), z: bank.nz * (bank.wadeEdge + 2) }]

    const STEP = 0.1
    let x = 0
    let z = 0
    let left = false
    let wettest = -Infinity
    for (const leg of legs) {
      for (let i = 0; i < 4000 && !left; i++) {
        const dxl = leg.x - x
        const dzl = leg.z - z
        const d = Math.hypot(dxl, dzl)
        if (d < STEP) break
        const [px, pz] = resolveMove(layout.colliders, x + (dxl / d) * STEP, z + (dzl / d) * STEP, PLAYER_RADIUS, [x, z])
        const out = dot({ x, z }, bank.nx, bank.nz)
        // Past the top of the bank there is nothing left to slide along: a step
        // that gains nothing there is the dead stop the report described.
        if (out > bank.walkEdge - 1) {
          expect(Math.hypot(px - x, pz - z), `dead stop ${out.toFixed(2)} m out`).toBeGreaterThan(STEP * 0.9)
        }
        x = px
        z = pz
        const now = dot({ x, z }, bank.nx, bank.nz)
        if (now > bank.walkEdge) wettest = Math.max(wettest, bankWaterDepth(bank, now))
        left = isOutsidePlace(layout, x, z)
      }
      if (left) break
    }
    expect(left, 'the walk into the river never left the settlement').toBe(true)
    // He got PAST the waterline, and stood in water up to the stated depth.
    expect(dot({ x, z }, bank.nx, bank.nz)).toBeGreaterThan(bank.distance)
    expect(wettest).toBeCloseTo(balance.bankWadeDepth, 1)
  })

  it('the wade limit is solved on the drawn shore, not stated beside it', () => {
    expect(bankWaterDepth(bank, bank.wadeEdge)).toBeCloseTo(balance.bankWadeDepth, 9)
    expect(bank.wadeEdge).toBeGreaterThan(bank.distance)
    expect(bank.wadeEdge).toBeLessThan(bank.distance + BANK_SHALLOWS_SPAN + 1e-9)
  })

  it('the drawn ground reaches every walkable point — plate inland, shore at the water', () => {
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    // Half-length of the drawn shore strip, as PlaceScene builds it.
    const shoreHalf = Math.sqrt(Math.max(1, discEdge * discEdge - bank.walkEdge * bank.walkEdge))
    for (let j = 0; j < 720; j++) {
      const angle = (j / 720) * Math.PI * 2
      const plate = groundPlateRadius(layout, angle, discEdge)
      // ... never past the top of the bank, where the shore takes over.
      const rim = { x: Math.cos(angle) * plate, z: Math.sin(angle) * plate }
      expect(dot(rim, bank.nx, bank.nz)).toBeLessThanOrEqual(bank.walkEdge + 1e-6)
      // The player can never stand on ground the scene does not draw: out to the
      // boundary the plate carries him, and past the top of the bank the shore
      // strip does — along its whole length, and no further out than the bed.
      const edge = placeBoundaryRadius(layout, angle)
      const p = { x: Math.cos(angle) * edge, z: Math.sin(angle) * edge }
      const out = dot(p, bank.nx, bank.nz)
      if (out <= bank.walkEdge + 1e-9) {
        expect(plate + 1e-9, `plate at ${angle.toFixed(3)}`).toBeGreaterThanOrEqual(edge)
      } else {
        expect(out, `shore at ${angle.toFixed(3)}`).toBeLessThanOrEqual(bank.distance + BANK_BED_REACH)
        expect(Math.abs(dot(p, bank.fx, bank.fz)), `shore at ${angle.toFixed(3)}`).toBeLessThanOrEqual(shoreHalf)
      }
    }
  })

  it('leaves the shore strip room between the top of the bank and the water', () => {
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
