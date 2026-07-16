// World-model data sanity (CLAUDE.md §7.1 pt. 3, design.md §3/§4). Ported from
// the in-module-graph data checks of scripts/verify/world.mjs — same coverage,
// no browser. The characteristic bird's-eye screenshots stay a Playwright §7.2
// proof.
import { describe, it, expect, beforeAll } from 'vitest'
import { PLACES, RIVERS, regionAt, VILLAGE_HEARTLANDS, VILLAGE_RIVER_CLEARANCE_DEG, placeById } from './geo'
import { sampleTerrain, isBlocked, RIVER_WIDTH_DEG } from './terrain'
import { cellAt, coastDistance, riverDistance, CELL_LAKE, CELL_OCEAN, CELL_LAND } from './geoIndex'
import { lakeContains } from './hydro'
import { LAKES } from './data/lakes'
import { LAND_POLYGONS } from './data/coastline'
import { MOUNTAINS, WATERFALLS, ELEPHANT_GRAVEYARD, CULTURAL_LANDMARKS } from './data/landmarks'
import { setupGeodata } from '../test/geodata'
import { densifyRiver } from '../scenes/travel/waterSurface'
import { balance } from '../config/balance'

const SEED = 42

// Land/ocean/biome classification needs the real DEM (public/geodata/dem.png),
// which the browser loads via canvas; load it into jsdom before sampling.
beforeAll(async () => {
  await setupGeodata()
})
const ports = PLACES.filter((p) => p.kind === 'port')
const villages = PLACES.filter((p) => p.kind === 'village')

describe('world roster counts (design.md §4)', () => {
  it('has the full set of places, rivers, lakes, mountains and waterfalls', () => {
    expect(ports.length).toBe(10)
    expect(villages.length).toBe(22)
    expect(RIVERS.length).toBe(17)
    expect(LAKES.length).toBe(8)
    expect(WATERFALLS.length).toBe(5)
    expect(MOUNTAINS.length).toBeGreaterThan(0)
  })
})

describe('settlements sit on walkable land', () => {
  it.each(PLACES.map((p) => [p.id, p] as const))('%s is not on water', (_id, p) => {
    const t = sampleTerrain(p.lat, p.lon, SEED)
    expect(t.type).not.toBe('ocean')
    expect(t.type).not.toBe('water')
  })

  it('the elephant graveyard is on land', () => {
    const t = sampleTerrain(ELEPHANT_GRAVEYARD.lat, ELEPHANT_GRAVEYARD.lon, SEED)
    expect(t.type).not.toBe('ocean')
    expect(t.type).not.toBe('water')
  })
})

describe('built cultural landmarks stand clear of river channels (design.md §4.4)', () => {
  // Giza initially landed inside the Nile's rendered band (user report):
  // every built landmark must stand outside the water ribbon so no
  // structure rises out of a channel. RIVER_WIDTH_DEG is the band half
  // width; a small margin keeps the footprint's edge dry too.
  it.each(CULTURAL_LANDMARKS.map((c) => [c.id, c] as const))('%s stands outside the water band', (_id, c) => {
    expect(riverDistance(c.lat, c.lon)).toBeGreaterThanOrEqual(RIVER_WIDTH_DEG + 0.05 - 1e-9)
  })

  it('Giza stands on west-bank land near Cairo, not in the Nile', () => {
    const giza = CULTURAL_LANDMARKS.find((c) => c.id === 'giza')
    expect(giza).toBeDefined()
    if (!giza) return
    const t2 = sampleTerrain(giza.lat, giza.lon, SEED)
    expect(t2.type).not.toBe('ocean')
    expect(t2.type).not.toBe('water')
    // The field GEOMETRY spans ±~0.29° around the anchor (Sphinx east end),
    // and the seeded yaw can rotate it any way — every point of the
    // footprint's rim must clear the water band, not only the centre
    // (riverDistance saturates at ~0.45, so the rim is probed directly).
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const rim = riverDistance(giza.lat + Math.sin(a) * 0.32, giza.lon + Math.cos(a) * 0.32)
      expect(rim, `rim direction ${k}`).toBeGreaterThanOrEqual(RIVER_WIDTH_DEG + 0.03 - 1e-9)
    }
    const cairo = placeById('cairo')
    expect(giza.lon).toBeLessThan(cairo.lon) // west of the city
    // Still AT Cairo: the bound grew with point 136 — the widened Nile pushed
    // Cairo onto its east bank and the Giza field further west of the channel.
    expect(Math.hypot(giza.lat - cairo.lat, giza.lon - cairo.lon)).toBeLessThan(1.05)
  })

  it('the Meroë pyramid field stands wholly on the Nile east bank, not in the river', () => {
    const meroe = CULTURAL_LANDMARKS.find((c) => c.id === 'meroe')
    expect(meroe).toBeDefined()
    if (!meroe) return
    const tm = sampleTerrain(meroe.lat, meroe.lon, SEED)
    expect(tm.type).not.toBe('ocean')
    expect(tm.type).not.toBe('water')
    // The field GEOMETRY spreads ~0.64° from its mount (spot 4.5 + jitter + base)
    // and the seeded yaw can rotate it any way — every point of the footprint's
    // rim must clear the water band, not only the centre (point 110).
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const rim = riverDistance(meroe.lat + Math.sin(a) * 0.64, meroe.lon + Math.cos(a) * 0.64)
      expect(rim, `rim direction ${k}`).toBeGreaterThanOrEqual(RIVER_WIDTH_DEG + 0.03 - 1e-9)
    }
    // Shifted east onto the desert bank, a bounded nudge off the real anchor.
    expect(meroe.lon).toBeGreaterThan(33.75) // east of the raw Nile-side anchor
    expect(Math.hypot(meroe.lat - 16.94, meroe.lon - 33.75)).toBeLessThan(1.4)
  })
})

describe('villages keep clearance from rivers (design.md §4.2)', () => {
  // The river water band reaches ~0.165° from the axis and the village marker
  // footprint ~0.145°, so the clearance keeps every hut dry — a canoe passage
  // carries the traveller past a riverside village, never into its huts.
  it.each(villages.map((v) => [v.id, v] as const))('%s keeps the river clearance', (_id, v) => {
    expect(riverDistance(v.lat, v.lon)).toBeGreaterThanOrEqual(VILLAGE_RIVER_CLEARANCE_DEG - 1e-9)
  })

  it('the clearance nudge stays a small shift off each heartland anchor', () => {
    for (const v of villages) {
      const raw = VILLAGE_HEARTLANDS.find((h) => h.id === v.id)
      expect(raw, v.id).toBeDefined()
      expect(Math.hypot(v.lat - (raw?.lat ?? 0), v.lon - (raw?.lon ?? 0)), v.id).toBeLessThanOrEqual(0.6)
    }
  })

  it('the Nubian village sits clear of the Nile water but stays riverside', () => {
    const v = placeById('nubian-village')
    const d = riverDistance(v.lat, v.lon)
    expect(d).toBeGreaterThanOrEqual(VILLAGE_RIVER_CLEARANCE_DEG - 1e-9)
    expect(d).toBeLessThanOrEqual(0.45) // moved off the water, not away from the Nile
    // The anchor genuinely violated the clearance — the rule does real work here.
    const raw = VILLAGE_HEARTLANDS.find((h) => h.id === 'nubian-village')
    expect(riverDistance(raw?.lat ?? 0, raw?.lon ?? 0)).toBeLessThan(VILLAGE_RIVER_CLEARANCE_DEG)
  })
})

describe('hydrology geometry', () => {
  // Tributaries end at their confluence; all other rivers reach the coast.
  const tributaries = ['white-nile', 'blue-nile', 'vaal', 'sankuru', 'kasai', 'ubangi', 'benue']

  it('non-tributary rivers reach the coast at their mouth', () => {
    for (const r of RIVERS) {
      if (tributaries.includes(r.id)) continue
      const [lon, lat] = r.points[r.points.length - 1]
      expect(coastDistance(lat, lon), `${r.id} mouth`).toBeLessThanOrEqual(0.5)
    }
  })

  it('every waterfall sits on a river', () => {
    for (const w of WATERFALLS) {
      expect(riverDistance(w.lat, w.lon), `${w.id}`).toBeLessThanOrEqual(0.25)
    }
  })

  it('every lake centre is classified as lake', () => {
    for (const l of LAKES) {
      expect(cellAt(l.center[1], l.center[0]), `${l.id}`).toBe(CELL_LAKE)
    }
  })
})

describe('grave search area (store samples lat 24..27.5, lon 29..33)', () => {
  it('is mostly walkable desert/savanna', () => {
    let ok = 0
    for (let i = 0; i < 100; i++) {
      const t = sampleTerrain(24 + (i % 10) * 0.35, 29 + Math.floor(i / 10) * 0.44, SEED)
      if (t.type === 'desert' || t.type === 'savanna') ok++
    }
    expect(ok).toBeGreaterThanOrEqual(50)
  })
})

describe('coordinate mapping (design.md §3)', () => {
  it('regionAt matches each place’s declared region for the fixed banding', () => {
    // Not every place lies inside its banded region (villages nudged toward
    // their heartland), but the port capitals must classify consistently.
    expect(regionAt(30.05, 31.45)).toBe('north') // Cairo
    expect(regionAt(-33.8, 18.5)).toBe('south') // Cape Town
    expect(regionAt(-6.16, 39.3)).toBe('east') // Zanzibar
  })
})

describe('movement boundary (design.md §11)', () => {
  it('blocks open ocean outside the continent hull but not enclosed sea', () => {
    expect(isBlocked('ocean', 0, -30)).toBe(true) // open Atlantic, outside the hull
    expect(isBlocked('ocean', 5, 8)).toBe(false) // Gulf of Guinea, inside the hull
  })

  it('never blocks land terrain', () => {
    expect(isBlocked('savanna', 5, 8)).toBe(false)
    expect(isBlocked('desert', 24, 15)).toBe(false)
  })

  it('blocks ocean with no coordinates given', () => {
    expect(isBlocked('ocean')).toBe(true)
  })
})

describe('terrain sampling on real geodata', () => {
  it('carves rivers at the calibratable half-width (0.17° base × balance widthFactor)', () => {
    expect(RIVER_WIDTH_DEG).toBeCloseTo(0.17 * balance.river.widthFactor, 9)
  })

  it('the width factor actually widens the sampled water span (point 136)', () => {
    // Probe a straight mid-Nile desert stretch: walk the densified axis to the
    // sample nearest lat 23 and scan its cross-channel perpendicular.
    const nile = RIVERS.find((r) => r.id === 'nile')
    expect(nile).toBeDefined()
    const pts = densifyRiver(nile?.points ?? [])
    let k = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].lat - 23) < Math.abs(pts[k].lat - 23)) k = i
    const a = pts[k]
    const b = pts[k + 1]
    const len = Math.hypot(b.lat - a.lat, b.lon - a.lon) || 1
    const pLat = -(b.lon - a.lon) / len
    const pLon = (b.lat - a.lat) / len
    for (const off of [-1, 1].map((side) => side * (RIVER_WIDTH_DEG - 0.03))) {
      // Inside the widened band — beyond the 0.17° base, so a regression to
      // the unwidened carve fails here.
      expect(RIVER_WIDTH_DEG - 0.03).toBeGreaterThan(0.17)
      expect(sampleTerrain(a.lat + pLat * off, a.lon + pLon * off, SEED).type, `off ${off}`).toBe('water')
    }
    for (const off of [-1, 1].map((side) => side * (RIVER_WIDTH_DEG + 0.08))) {
      // Just outside: the band stays bounded, no runaway widening.
      expect(sampleTerrain(a.lat + pLat * off, a.lon + pLon * off, SEED).type, `off ${off}`).not.toBe('water')
    }
  })

  // Land points with a stable terrain type under the fixed seed.
  const landPoints: Array<readonly [number, number]> = [
    [24, 15], // central Sahara
    [-2.5, 34.8], // Serengeti savanna
    [0, 22], // Congo jungle
  ]

  it.each(landPoints)('has a normalized splat and in-range color at (%s, %s)', (lat, lon) => {
    const t = sampleTerrain(lat, lon, SEED)
    const sum = t.splat[0] + t.splat[1] + t.splat[2] + t.splat[3]
    expect(sum).toBeCloseTo(1, 5)
    for (const w of t.splat) expect(w).toBeGreaterThanOrEqual(0)
    for (const c of t.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('cell classification and coast distance', () => {
  it('classifies open ocean and inland land', () => {
    expect(cellAt(0, -30)).toBe(CELL_OCEAN) // open Atlantic
    expect(cellAt(24, 15)).toBe(CELL_LAND) // central Sahara
  })

  it('reports zero coast distance in open ocean and positive inland', () => {
    expect(coastDistance(0, -30)).toBeCloseTo(0)
    expect(coastDistance(24, 15)).toBeGreaterThan(0)
  })

  it('caps the coast distance at maxDist', () => {
    expect(coastDistance(24, 15, 0.5)).toBeLessThanOrEqual(0.5)
  })
})

describe('world data invariants (design.md §4)', () => {
  it('anchors every waterfall to an existing river id', () => {
    const riverIds = new Set(RIVERS.map((r) => r.id))
    for (const w of WATERFALLS) expect(riverIds.has(w.river), w.id).toBe(true)
  })

  it('gives each river a unique id and a non-empty course', () => {
    const ids = RIVERS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of RIVERS) expect(r.points.length).toBeGreaterThan(0)
  })

  it('places every lake centre inside its own polygon', () => {
    for (const l of LAKES) expect(lakeContains(l.center[1], l.center[0]), l.id).toBe(true)
  })

  it('has five land polygons with the mainland as the largest', () => {
    expect(LAND_POLYGONS.length).toBe(5)
    const mainland = LAND_POLYGONS[0]
    for (const p of LAND_POLYGONS.slice(1)) {
      expect(mainland.points.length).toBeGreaterThan(p.points.length)
    }
  })

  it('keeps place ids and people ids unique and well-formed', () => {
    const ids = PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const v of villages) expect(v.peopleId, v.id).toBeTruthy()
    for (const p of ports) expect(p.size, p.id).toBeTruthy()
    const peopleIds = villages.map((v) => v.peopleId)
    expect(peopleIds.length).toBe(22)
    expect(new Set(peopleIds).size).toBe(22)
  })
})
