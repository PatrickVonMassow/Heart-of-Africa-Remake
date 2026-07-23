// World-model data sanity (CLAUDE.md §7.1 pt. 3, design.md §3/§4). Ported from
// the in-module-graph data checks of scripts/verify/world.mjs — same coverage,
// no browser. The characteristic bird's-eye screenshots stay a Playwright §7.2
// proof.
import * as THREE from 'three'
import { describe, it, expect, beforeAll } from 'vitest'
import { PLACES, RIVERS, regionAt, VILLAGE_HEARTLANDS, VILLAGE_RIVER_CLEARANCE_DEG, PORT_RIVER_CLEARANCE_DEG, placeById } from './geo'
import { sampleTerrain, isBlocked, RIVER_WIDTH_DEG } from './terrain'
import { cellAt, coastDistance, riverDistance, CELL_LAKE, CELL_OCEAN, CELL_LAND } from './geoIndex'
import { lakeContains } from './hydro'
import { landFractionAt } from './geodata'
import { LAKES } from './data/lakes'
import { LAND_POLYGONS } from './data/coastline'
import { MOUNTAINS, WATERFALLS, ELEPHANT_GRAVEYARD, CULTURAL_LANDMARKS, NATURAL_SITES } from './data/landmarks'
import { setupGeodata } from '../test/geodata'
import { densifyRiver } from '../scenes/travel/waterSurface'
import { balance } from '../config/balance'
import { buildWetland } from '../render/landmarks'

// The rendered XZ footprint radius (in degrees, 10 world units/°) of a landmark
// mesh built at the origin — the honest "what the renderer draws" the clearance
// must exceed so no part of the mesh floats over the widened water band
// (point 129/156: the clearance derives from the same placement the renderer
// draws). Used to pin the Sudd marsh's clearance to its actual reach.
// Typed against three's own BufferGeometry: the structural shape this used to
// declare no longer matches NormalBufferAttributes' index signature, and the
// mismatch failed `typecheck:test` — which is the fail-fast preflight of the
// LARGE regression, so it stopped every browser suite before one could run.
function meshFootprintDeg(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  let maxR = 0
  for (let i = 0; i < pos.count; i++) maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)))
  return maxR / 10 // world units → degrees
}

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
    // Still AT Cairo: the bound grew with points 136/156 — the widened Nile
    // holds Cairo's cluster east of the band and clears the Giza field west
    // of it, so the two anchors sit ~1.1 deg apart across the channel. The
    // place-scene skyline mounts Giza regardless of this world distance.
    expect(Math.hypot(giza.lat - cairo.lat, giza.lon - cairo.lon)).toBeLessThan(1.15)
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

  it('no lake sheet stands tall over its own shore (point 190 — the basin-level carve)', () => {
    // The rendered sheet is max(interior bed) + LAKE_LIFT (0.12). With the
    // basin-level carve the interior blends to (lowest shore ground − 0.35),
    // so the sheet sits near or below every shore. The OLD relative carve kept
    // the rift slope in the bed and floated Lake Edward 2.3 units over its
    // south shore (the user report); this sweeps ALL lakes so the fix
    // generalises. Tolerance 0.5: the blend keeps a little edge relief, the
    // worst measured overhang after the fix is 0.35 (Albert).
    for (let li = 0; li < LAKES.length; li++) {
      const lake = LAKES[li]
      // bedMax over a 9x9 interior grid (the sheet rule from waterSurface.ts).
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
      for (const [lon, lat] of lake.points) {
        minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon)
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
      }
      let bedMax = -Infinity
      for (let i = 1; i < 9; i++) for (let j = 1; j < 9; j++) {
        const lon = minLon + ((maxLon - minLon) * i) / 9
        const lat = minLat + ((maxLat - minLat) * j) / 9
        if (!lakeContains(lat, lon)) continue
        bedMax = Math.max(bedMax, sampleTerrain(lat, lon, SEED).height)
      }
      if (bedMax === -Infinity) continue
      const sheet = Math.max(-0.05, bedMax + 0.12)
      // Shore ground just outside each vertex (pushed 0.06 deg outward).
      const cx = lake.points.reduce((s, p) => s + p[0], 0) / lake.points.length
      const cy = lake.points.reduce((s, p) => s + p[1], 0) / lake.points.length
      for (const [lon, lat] of lake.points) {
        const dx = lon - cx, dy = lat - cy
        const n = Math.hypot(dx, dy) || 1
        const olat = lat + (dy / n) * 0.06
        const olon = lon + (dx / n) * 0.06
        if (lakeContains(olat, olon)) continue
        const shore = Math.max(0, sampleTerrain(olat, olon, SEED).height)
        expect(sheet - shore, `${lake.id} sheet overhang at (${olat.toFixed(2)}, ${olon.toFixed(2)})`).toBeLessThan(0.5)
      }
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

  it.each(ports.map((p) => [p.id, p] as const))(
    '%s keeps its cluster footprint out of the widened band (point 156)',
    (_id, p) => {
      // Ports stay AT the river (§4.2 exemption for closeness) but the
      // rendered building cluster must not stand IN it — Khartoum at the
      // White/Blue Nile confluence was the reported case.
      expect(riverDistance(p.lat, p.lon)).toBeGreaterThanOrEqual(PORT_RIVER_CLEARANCE_DEG - 1e-9)
    },
  )

  it('Khartoum sits clear of BOTH widened Nile arms (the reported case)', () => {
    const khartoum = placeById('khartoum')
    expect(riverDistance(khartoum.lat, khartoum.lon)).toBeGreaterThanOrEqual(PORT_RIVER_CLEARANCE_DEG - 1e-9)
    expect(sampleTerrain(khartoum.lat, khartoum.lon, SEED).type).not.toBe('water')
  })

  it.each(NATURAL_SITES.filter((n) => n.id !== 'okavango').map((n) => [n.id, n] as const))(
    '%s anchors outside the widened band (point 156 — the Okavango floods by design)',
    (_id, n) => {
      expect(riverDistance(n.lat, n.lon)).toBeGreaterThanOrEqual(RIVER_WIDTH_DEG + 0.05 - 1e-9)
    },
  )

  it('the Sudd marsh clears the widened band by its own rendered footprint, not floating over the channel (point 218)', () => {
    // The wetland (render/landmarks.ts buildWetland) is a spread of solid water
    // lobes with a riverward TONGUE the scene aims at the nearest channel
    // (point 189). Before point 218 its clearance was only RIVER_WIDTH_DEG +
    // 0.05, so with the point-136/156 river widening the tongue reached back
    // ACROSS the widened channel and floated over the water at land height (the
    // user report). The anchor must now clear the band by the marsh's whole
    // rendered footprint so no lobe sits in the channel.
    const footprint = meshFootprintDeg(buildWetland()) // ~0.315°
    expect(footprint).toBeGreaterThan(0.3) // the tongue really does reach that far
    const sudd = NATURAL_SITES.find((n) => n.id === 'sudd')
    expect(sudd).toBeDefined()
    if (!sudd) return
    const d = riverDistance(sudd.lat, sudd.lon, 4, 2)
    // The whole footprint clears the widened water band.
    expect(d).toBeGreaterThanOrEqual(RIVER_WIDTH_DEG + footprint - 1e-9)
    // Regression witness: the pre-218 margin of 0.05 was LESS than the footprint,
    // so the tongue lobe sat inside the widened band — the float the fix removes.
    expect(RIVER_WIDTH_DEG + 0.05).toBeLessThan(RIVER_WIDTH_DEG + footprint)
    // Grounded on land (savanna bank), never a water cell.
    const t = sampleTerrain(sudd.lat, sudd.lon, SEED)
    expect(t.type).not.toBe('water')
    expect(t.type).not.toBe('ocean')
    // Still the Sudd: it moved off the water, not away from the White Nile.
    // The nudge is minimal (a small overshoot past the required clearance), so
    // the marsh's riverward tongue still reaches down to the bank — its tip lands
    // just past the water band edge (reeds hug the waterline), not far inland.
    expect(d).toBeLessThanOrEqual(RIVER_WIDTH_DEG + footprint + 0.15)
    expect(d - footprint - RIVER_WIDTH_DEG).toBeLessThan(0.15) // tongue tip near the water edge
    expect(sudd.lat).toBeGreaterThan(6) // in the historical Sudd basin
    expect(sudd.lat).toBeLessThan(10)
    expect(sudd.lon).toBeGreaterThan(29)
    expect(sudd.lon).toBeLessThan(32)
  })

  it('the elephant graveyard stands clear of the widened band', () => {
    expect(riverDistance(ELEPHANT_GRAVEYARD.lat, ELEPHANT_GRAVEYARD.lon)).toBeGreaterThanOrEqual(
      RIVER_WIDTH_DEG + 0.05 - 1e-9,
    )
  })

  it('no flat-mesh river-near landmark floats over the widened water band (point 218 sweep)', () => {
    // The point-218 defect: a flat marker/field mesh placed by the OLD narrower
    // bank (or at a §4.2 exemption) ended up over the widened water surface and
    // read as floating. Sweep EVERY flat-mesh landmark family — natural sites,
    // cultural landmarks, the elephant graveyard, ports and villages — and
    // assert each anchor clears the widened band by at least a footprint margin,
    // so no part of its mesh sits over the channel. EXEMPTIONS (asserted as such
    // below): waterfalls render AS the river cascade (rd 0, on the axis by
    // design), the Okavango's fan floods by design, and mountains raise terrain
    // rather than laying a flat mesh over the water (a massif may straddle a
    // river valley).
    const MIN_FOOTPRINT = 0.05 // the smallest cleared margin any family uses
    for (const n of NATURAL_SITES) {
      if (n.id === 'okavango') continue // floods by design
      expect(riverDistance(n.lat, n.lon, 4, 2), `natural ${n.id}`).toBeGreaterThanOrEqual(
        RIVER_WIDTH_DEG + MIN_FOOTPRINT - 1e-9,
      )
    }
    for (const c of CULTURAL_LANDMARKS) {
      expect(riverDistance(c.lat, c.lon, 4, 2), `cultural ${c.id}`).toBeGreaterThanOrEqual(
        RIVER_WIDTH_DEG + MIN_FOOTPRINT - 1e-9,
      )
    }
    for (const p of PLACES) {
      const margin = p.kind === 'port' ? PORT_RIVER_CLEARANCE_DEG : VILLAGE_RIVER_CLEARANCE_DEG
      expect(riverDistance(p.lat, p.lon), `place ${p.id}`).toBeGreaterThanOrEqual(margin - 1e-9)
    }
    expect(riverDistance(ELEPHANT_GRAVEYARD.lat, ELEPHANT_GRAVEYARD.lon)).toBeGreaterThanOrEqual(
      RIVER_WIDTH_DEG + MIN_FOOTPRINT - 1e-9,
    )
    // Exemption check: every waterfall sits ON its river (the cascade IS water).
    for (const w of WATERFALLS) {
      expect(riverDistance(w.lat, w.lon), `waterfall ${w.id}`).toBeLessThanOrEqual(0.25)
    }
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

  it('cellAt is boundary-exact at the landFractionAt < 0.5 threshold (point 173 hardening)', () => {
    // Binary-search a real coastal transect (Nile delta into the
    // Mediterranean) for the point where landFractionAt crosses 0.5, then
    // confirm cellAt flips from OCEAN to non-OCEAN exactly there — the
    // documented "< 0.5" contract (not "<= 0.5").
    let landSide = 31.0 // land: south of the delta coast
    let seaSide = 31.6 // sea: Mediterranean, north of the delta
    expect(landFractionAt(landSide, 30.5)).toBeGreaterThanOrEqual(0.5)
    expect(landFractionAt(seaSide, 30.5)).toBeLessThan(0.5)
    for (let i = 0; i < 40; i++) {
      const mid = (landSide + seaSide) / 2
      if (landFractionAt(mid, 30.5) >= 0.5) landSide = mid
      else seaSide = mid
    }
    expect(landFractionAt(landSide, 30.5)).toBeGreaterThanOrEqual(0.5)
    expect(cellAt(landSide, 30.5)).not.toBe(CELL_OCEAN)
    expect(landFractionAt(seaSide, 30.5)).toBeLessThan(0.5)
    expect(cellAt(seaSide, 30.5)).toBe(CELL_OCEAN)
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
