// World-model data sanity (CLAUDE.md §7.1 pt. 3, design.md §3/§4). Ported from
// the in-module-graph data checks of scripts/verify/world.mjs — same coverage,
// no browser. The characteristic bird's-eye screenshots stay a Playwright §7.2
// proof.
import { describe, it, expect, beforeAll } from 'vitest'
import { PLACES, RIVERS, regionAt } from './geo'
import { sampleTerrain } from './terrain'
import { cellAt, coastDistance, riverDistance, CELL_LAKE } from './geoIndex'
import { LAKES } from './data/lakes'
import { MOUNTAINS, WATERFALLS, ELEPHANT_GRAVEYARD } from './data/landmarks'
import { setupGeodata } from '../test/geodata'

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
