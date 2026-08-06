// The communication PoC's landmark boulder (work-order 482, dug at in 487).
// What the point demands of it, checked over a seed sweep: it stands OUTSIDE
// the village, at the Niger, genuinely UPSTREAM (measured against the flow the
// world model reports, never assumed), in travel reach, on dry ground, and its
// dig spot is exactly the coordinate the renderer is handed.
import { describe, it, expect, beforeAll } from 'vitest'
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

  it('is an upright block, taller than the tallest rock dressing around it', () => {
    // A kopje (the largest dressing boulder pile) reaches ~1.45 units tall at
    // instance scale 1 and ~1.9 at its largest; the erratic must read as a
    // different kind of thing, not as one more pile.
    expect(ROCK_HEIGHT_UNITS).toBeGreaterThan(1.9 * 1.5)
    expect(ROCK_HEIGHT_UNITS).toBeGreaterThan(ROCK_FOOTPRINT_UNITS * 2)
  })
})
