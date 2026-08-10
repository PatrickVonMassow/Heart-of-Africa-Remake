// The communication PoC's landmark boulder (work-order 482, dug at in 487).
// What the point demands of it, checked over a seed sweep: it stands OUTSIDE
// the village, at the Niger, genuinely UPSTREAM (measured against the flow the
// world model reports, never assumed), in travel reach, on dry ground, and its
// dig spot is exactly the coordinate the renderer is handed.
import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  communicationRockSite,
  communicationRockDigSpot,
  communicationRockWorldPos,
  isAtCommunicationRock,
  ROCK_RIVER_ID,
  ROCK_VILLAGE_ID,
  ROCK_FOOTPRINT_UNITS,
  ROCK_HEIGHT_UNITS,
} from './communicationRock'
import { PLACES, RIVERS, placeById, latLonToWorld } from './geo'
import { riverDistanceExact, riverFlowExact } from './hydro'
import { densifyRiverAxis } from './riverProfile'
import { sampleTerrain, isBlocked, RIVER_WIDTH_DEG } from './terrain'
import { balance } from '../config/balance'
import { setupGeodata } from '../test/geodata'

const SEEDS = [1, 7, 42, 99, 123, 777, 2024, 31337, 65535, 1234567]

beforeAll(async () => {
  await setupGeodata()
})

describe('the communication rock stands at the river, upstream of the village', () => {
  it.each(SEEDS)('seed %i: the boulder is at the Niger bank, dry and outside the water band', (seed) => {
    const rock = communicationRockSite(seed)
    const d = riverDistanceExact(rock.lat, rock.lon, 4, 2)
    // ON the bank: past the water band (dry), but within a stone's throw of it.
    expect(d).toBeGreaterThan(RIVER_WIDTH_DEG + ROCK_FOOTPRINT_UNITS / 10)
    expect(d).toBeLessThan(RIVER_WIDTH_DEG + 0.2)
    const t = sampleTerrain(rock.lat, rock.lon, seed)
    expect(t.type).not.toBe('water')
    expect(t.type).not.toBe('ocean')
    expect(isBlocked(t.type, rock.lat, rock.lon)).toBe(false)
  })

  it.each(SEEDS)('seed %i: it lies UPSTREAM of the village, by the flow the world model reports', (seed) => {
    const rock = communicationRockSite(seed)
    const village = placeById(ROCK_VILLAGE_ID)
    // The flow direction at the boulder (downstream, per hydro) must point back
    // toward the village: the vector rock→village runs WITH the current, so the
    // village is downstream and the rock upstream — which is what the chief's
    // UPSTREAM word claims. Judged by the model's own flow, not by the walk.
    const flow = riverFlowExact(rock.lat, rock.lon, 1)
    expect(flow.strength).toBeGreaterThan(0)
    const toVillage = { lat: village.lat - rock.lat, lon: village.lon - rock.lon }
    const len = Math.hypot(toVillage.lat, toVillage.lon)
    const along = (toVillage.lat * flow.dirLat + toVillage.lon * flow.dirLon) / len
    expect(along).toBeGreaterThan(0.5) // clearly downstream, not sideways
    // The site's own reported downstream agrees with the world model's.
    expect(rock.downstream.lat * flow.dirLat + rock.downstream.lon * flow.dirLon).toBeGreaterThan(0.9)
  })

  it.each(SEEDS)('seed %i: it sits outside every settlement, in travel reach of the village', (seed) => {
    const rock = communicationRockSite(seed)
    const village = placeById(ROCK_VILLAGE_ID)
    const straight = Math.hypot(rock.lat - village.lat, rock.lon - village.lon)
    // Outside the village (the enter radius is far smaller), but close enough
    // that the errand stays a short trip: at 10 world units per degree and
    // balance.daysPerUnit, under a week of in-game travel.
    expect(straight).toBeGreaterThan(1)
    expect(straight * 10 * balance.daysPerUnit).toBeLessThan(7)
    for (const p of PLACES) {
      expect(Math.hypot(rock.lat - p.lat, rock.lon - p.lon), p.id).toBeGreaterThan(1)
    }
    // It really was reached by walking the axis upstream, not by a fallback.
    expect(rock.upstreamDeg).toBeGreaterThanOrEqual(1.6)
    const axis = densifyRiverAxis(RIVERS.find((r) => r.id === ROCK_RIVER_ID)?.points ?? [])
    let best = Infinity
    for (const p of axis) best = Math.min(best, Math.hypot(p.lat - rock.lat, p.lon - rock.lon))
    expect(best).toBeLessThan(RIVER_WIDTH_DEG + 0.2) // beside THIS river's axis
  })

  it.each(SEEDS)('seed %i: the dig spot IS the drawn placement', (seed) => {
    const rock = communicationRockSite(seed)
    const dig = communicationRockDigSpot(seed)
    expect(dig.lat).toBe(rock.lat)
    expect(dig.lon).toBe(rock.lon)
    const drawn = communicationRockWorldPos(seed)
    const expected = latLonToWorld(rock.lat, rock.lon)
    expect(drawn.x).toBe(expected.x)
    expect(drawn.z).toBe(expected.z)
    // The dig radius reaches the whole drawn block from its centre, so a player
    // standing at the boulder the renderer draws can always dig (point 487).
    expect(balance.digRadius).toBeGreaterThan(ROCK_FOOTPRINT_UNITS)
  })

  it('is deterministic per seed and moves with the seed', () => {
    for (const seed of SEEDS) {
      const a = communicationRockSite(seed)
      const b = communicationRockSite(seed)
      expect(a).toEqual(b)
    }
    const sites = SEEDS.map((s) => communicationRockSite(s))
    const unique = new Set(sites.map((s) => `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`))
    expect(unique.size).toBeGreaterThan(1) // placed anew each run, like the caches
  })

  it.each(SEEDS)('seed %i: the dig reach covers the drawn block and nothing far off', (seed) => {
    const rock = communicationRockSite(seed)
    const reach = balance.digRadius / 10 // world units → degrees, as the store digs
    // Standing on the block the picture shows: reachable.
    expect(isAtCommunicationRock(rock.lat, rock.lon, seed, reach)).toBe(true)
    // Anywhere past the reach: nothing, on every bearing.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const off = reach * 1.5
      const lat = rock.lat + Math.cos(a) * off
      const lon = rock.lon + Math.sin(a) * off
      expect(isAtCommunicationRock(lat, lon, seed, reach), `bearing ${i}`).toBe(false)
    }
    // The reach is generous enough to include the whole drawn footprint.
    expect(isAtCommunicationRock(rock.lat + rock.radius / 10, rock.lon, seed, reach)).toBe(true)
  })

  it('another run’s boulder is not this run’s dig spot', () => {
    const reach = balance.digRadius / 10
    const a = communicationRockSite(SEEDS[0])
    // A seed whose site differs from seed[0]'s: digging at one must not answer
    // for the other, or the site would not be placed anew per run.
    const other = SEEDS.find((s) => {
      const b = communicationRockSite(s)
      return Math.hypot(b.lat - a.lat, b.lon - a.lon) > reach * 2
    })
    expect(other).toBeDefined()
    expect(isAtCommunicationRock(a.lat, a.lon, other as number, reach)).toBe(false)
  })

  // === Work-order 585: never in the water, and always ON the ground ==========
  // The report was a boulder standing out in the river with its underside clear
  // of the surface. Both halves of that are checked here over a WIDE seed sweep,
  // because a placement that is right at ten seeds and wrong at the eleventh is
  // what the player meets: the whole drawn footprint has to be dry, and the base
  // has to meet the ground the terrain mesh draws under it.
  const SWEEP = Array.from({ length: 120 }, (_, i) => (i + 1) * 7919)
  /** Probe points over the footprint disc — deliberately at other angles and
   *  radii than the placement's own, so this is a check and not an echo. */
  const footprintDisc = (lat: number, lon: number) => {
    const r = ROCK_FOOTPRINT_UNITS / 10
    const out: Array<{ lat: number; lon: number }> = [{ lat, lon }]
    for (const f of [0.3, 0.65, 1]) {
      for (let i = 0; i < 17; i++) {
        const a = ((i + 0.37) / 17) * Math.PI * 2
        out.push({ lat: lat + Math.cos(a) * r * f, lon: lon + Math.sin(a) * r * f })
      }
    }
    return out
  }

  it('stands on dry, unblocked ground over its whole footprint, at every seed', () => {
    for (const seed of SWEEP) {
      const rock = communicationRockSite(seed)
      // Never the last-resort placement: the search really found a bank spot.
      expect(rock.upstreamDeg, `seed ${seed}`).toBeGreaterThanOrEqual(1.6)
      for (const p of footprintDisc(rock.lat, rock.lon)) {
        const t = sampleTerrain(p.lat, p.lon, seed)
        expect(t.type, `seed ${seed} at ${p.lat.toFixed(3)}/${p.lon.toFixed(3)}`).not.toBe('water')
        expect(t.type, `seed ${seed} at ${p.lat.toFixed(3)}/${p.lon.toFixed(3)}`).not.toBe('ocean')
        expect(isBlocked(t.type, p.lat, p.lon), `seed ${seed}`).toBe(false)
      }
    }
  })

  it('its base meets the drawn ground — no gap under the block, at every seed', () => {
    // The tolerance is the residual between the placement's probe ring and this
    // denser one, measured at 0.011 world units over the sweep — a third of a
    // percent of the block's own height, where a hovering block in the report's
    // picture stood clear of the water by a visible fraction of itself.
    const GAP_TOLERANCE = 0.03
    for (const seed of SWEEP) {
      const rock = communicationRockSite(seed)
      let lowest = Infinity
      for (const p of footprintDisc(rock.lat, rock.lon)) {
        const h = sampleTerrain(p.lat, p.lon, seed).height
        lowest = Math.min(lowest, h)
        // Nowhere under the block does the ground lie BELOW its base by more
        // than the tolerance: that difference is the gap the player sees.
        expect(rock.groundY - h, `seed ${seed} gap`).toBeLessThanOrEqual(GAP_TOLERANCE)
      }
      // ... and it is not buried deeper than it has to be: the base sits at the
      // lowest ground it covers (within the same residual — this grid's lowest
      // point and the placement's are not the same point).
      expect(rock.groundY, `seed ${seed} sunk`).toBeGreaterThanOrEqual(lowest - GAP_TOLERANCE)
      // The drawn base is a real height of the terrain field, never a floor
      // value: the block stands on the bank, not at a constant altitude.
      expect(rock.groundY).toBeLessThan(sampleTerrain(rock.lat, rock.lon, seed).height + 1e-9)
    }
  })

  it('REFUSES a wet spot rather than settling for one when the bank is all water', async () => {
    // The defect this point was reported for was not a missing water test — it
    // was the search REMEMBERING its first candidate and handing that back, wet
    // or dry, once the tries ran out. Drown the whole world and the placement
    // must still refuse every one of them.
    vi.resetModules()
    vi.doMock('./terrain', async (importOriginal) => {
      const real = await importOriginal<typeof import('./terrain')>()
      return {
        ...real,
        sampleTerrain: (lat: number, lon: number, seed: number) => ({
          ...real.sampleTerrain(lat, lon, seed),
          type: 'water' as const,
          height: -0.12,
        }),
      }
    })
    const drowned = await import('./communicationRock')
    const site = drowned.communicationRockSite(4242)
    const village = placeById(ROCK_VILLAGE_ID)
    // Nothing was accepted at the river: the site fell back to the village
    // coordinate. In a world that is water everywhere that spot is wet too, and
    // the fallback must SAY so rather than hand it back looking ordinary — the
    // test used to bless a wet site silently (four-eyes review, 11.08.2026).
    expect(site.upstreamDeg).toBe(0)
    expect(site.lat).toBe(village.lat)
    expect(site.lon).toBe(village.lon)
    expect(site.unvouched).toBe(true)
    vi.doUnmock('./terrain')
    vi.resetModules()
  })

  it('is an upright block, taller than the tallest rock dressing around it', () => {
    // A kopje (the largest dressing boulder pile) reaches ~1.45 units tall at
    // instance scale 1 and ~1.9 at its largest; the erratic must read as a
    // different kind of thing, not as one more pile.
    expect(ROCK_HEIGHT_UNITS).toBeGreaterThan(1.9 * 1.5)
    expect(ROCK_HEIGHT_UNITS).toBeGreaterThan(ROCK_FOOTPRINT_UNITS * 2)
  })
})
