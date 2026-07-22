// World trim and movement boundary (design.md §3.1/§11.2): the walkable
// continent ends at the African Red Sea coast, no land outside the game's
// own land masses is rendered, swimmable sea reaches only a calibratable
// band off the coast, and the hull treatment of the remaining bays is
// unchanged. Covers the pure boundary side test, the pure trimming pass on
// synthetic and raw real data, and the real-DEM acceptance coordinates.
import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isNortheastOfBoundary,
  trimToGameWorld,
  NORTHEAST_BOUNDARY,
  boundarySignedDistance,
  oceanSwimBlocked,
  MEDITERRANEAN_LAT_MIN,
  MEDITERRANEAN_LON_MIN,
  SWIM_MARGIN_DEG_DEFAULT,
} from './redSea'
import { sampleTerrain, isBlocked } from './terrain'
import { elevationAt, landFractionAt } from './geodata'
import { balance } from '../config/balance'
import { setupGeodata } from '../test/geodata'

beforeAll(async () => {
  await setupGeodata()
})

describe('isNortheastOfBoundary', () => {
  it('cuts the Red Sea, Sinai, the Levant and Arabia', () => {
    expect(isNortheastOfBoundary(20, 38)).toBe(true) // mid Red Sea
    expect(isNortheastOfBoundary(24, 45)).toBe(true) // Arabian peninsula
    expect(isNortheastOfBoundary(12, 45)).toBe(true) // Gulf of Aden
    expect(isNortheastOfBoundary(29, 34)).toBe(true) // Sinai
    expect(isNortheastOfBoundary(32.5, 35)).toBe(true) // Levant
  })

  it('keeps the African side and the rest of the world', () => {
    expect(isNortheastOfBoundary(19, 37)).toBe(false) // African Red Sea coast, landside
    expect(isNortheastOfBoundary(30.5, 31.0)).toBe(false) // Nile delta
    expect(isNortheastOfBoundary(30.05, 31.25)).toBe(false) // Cairo
    expect(isNortheastOfBoundary(5.5, 3)).toBe(false) // Gulf of Guinea
    expect(isNortheastOfBoundary(-18, 41)).toBe(false) // Mozambique channel
    expect(isNortheastOfBoundary(34, 15)).toBe(false) // Mediterranean
    expect(isNortheastOfBoundary(11.6, 43.2)).toBe(false) // Gulf of Tadjoura (African bay)
    expect(isNortheastOfBoundary(10.6, 45.0)).toBe(false) // Berbera nearshore strip
  })
})

describe('isNortheastOfBoundary — exact boundary/prefilter edges (point 173 hardening)', () => {
  // Reference computation WITHOUT the cheap box prefilter, built from the
  // real exported polyline — used to prove the prefilter's threshold is
  // exactly where the code says (strict '<'), not an off-by-one.
  function fullNoBoxPrefilter(lat: number, lon: number): boolean {
    let bestD = Infinity
    let bestCross = 0
    for (let i = 0; i < NORTHEAST_BOUNDARY.length - 1; i++) {
      const [ax, ay] = NORTHEAST_BOUNDARY[i]
      const [bx, by] = NORTHEAST_BOUNDARY[i + 1]
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)))
      const px = lon - (ax + dx * t)
      const py = lat - (ay + dy * t)
      const d = px * px + py * py
      if (d < bestD) {
        bestD = d
        bestCross = dx * (lat - ay) - dy * (lon - ax)
      }
    }
    return bestCross >= 0
  }

  it('a point exactly ON the polyline (bestCross === 0, not a rounded near-zero) reads as northeast', () => {
    // Any boundary vertex sits exactly on its own adjoining segment: the
    // closest-segment cross product is exactly 0 by construction (lat-ay and
    // lon-ax are literal 0 there), so bestCross >= 0 must hold at the ===.
    for (const [lon, lat] of [NORTHEAST_BOUNDARY[10], NORTHEAST_BOUNDARY[20]]) {
      expect(isNortheastOfBoundary(lat, lon)).toBe(true)
    }
  })

  it('the lon prefilter is a strict "<": exactly at the box the real geometry still decides', () => {
    // At lat 39.5 the true (unfiltered) classification stays "northeast" down
    // to and including lon 30.5 — the cheap box must not cut it off early.
    expect(fullNoBoxPrefilter(39.5, 30.5)).toBe(true)
    expect(isNortheastOfBoundary(39.5, 30.5)).toBe(true)
    // One hair west of the box: the prefilter forces false even though the
    // real geometry alone would still say true — proving the threshold sits
    // exactly at BOX_LON_MIN with a strict '<', not '<='.
    expect(fullNoBoxPrefilter(39.5, 30.499999)).toBe(true)
    expect(isNortheastOfBoundary(39.5, 30.499999)).toBe(false)
  })

  it('the lat prefilter edge (BOX_LAT_MIN) is inclusive, matching the full computation there', () => {
    // At lat exactly 9.5 the box does not short-circuit: the result always
    // matches the unfiltered geometry (here uniformly false, since the whole
    // boundary polyline sits north of lat ~10.8 — this pins that the box
    // reproduces the real answer at its own edge rather than a hard-coded one).
    for (const lon of [35, 45, 60]) {
      expect(isNortheastOfBoundary(9.5, lon)).toBe(fullNoBoxPrefilter(9.5, lon))
    }
  })
})

describe('trimToGameWorld', () => {
  // Synthetic 23x24 grid at 1°/texel covering lon 0..23, lat 8..32 — west of
  // the Red Sea boundary box, so only the flood/stamp mechanics act (the
  // real-boundary passes are covered by the DEM tests below). Land everywhere
  // (B = 5, elevation 500 m at offset 12000 → value 12500) except a
  // full-height sea column at lon 7..10 that splits a west land mass
  // (seeded) from an east one (unconnected).
  const meta = { width: 23, height: 24, lonMin: 0, latMax: 32, res: 1, offsetMeters: 12000 }
  const texel = (lon: number, lat: number) => {
    const x = Math.floor(lon - meta.lonMin)
    const y = Math.floor(meta.latMax - lat)
    return (y * meta.width + x) * 4
  }
  const fill = () => {
    const px = new Uint8ClampedArray(meta.width * meta.height * 4)
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 12500 >> 8
      px[i + 1] = 12500 & 0xff
      px[i + 2] = 5
      px[i + 3] = 255
    }
    for (let y = 0; y < meta.height; y++) {
      for (let x = 7; x <= 9; x++) {
        const i = (y * meta.width + x) * 4
        px[i] = 11800 >> 8 // -200 m: existing sea depth
        px[i + 1] = 11800 & 0xff
        px[i + 2] = 0
      }
    }
    return px
  }
  const elev = (px: Uint8ClampedArray, i: number) => px[i] * 256 + px[i + 1] - meta.offsetMeters
  const seeds: Array<[number, number]> = [[1.5, 20.5]]

  it('keeps land connected to a seed and trims the unconnected mass', () => {
    const px = fill()
    trimToGameWorld(px, meta, seeds)
    const west = texel(3.5, 20.5)
    expect(px[west + 2]).toBe(5)
    expect(elev(px, west)).toBe(500)
    const east = texel(15.5, 20.5)
    expect(px[east + 2]).toBe(0)
    expect(elev(px, east)).toBeLessThan(0)
  })

  // Point 235: near-shore sea keeps its real bathymetry, far offshore flattens.
  it('keeps near-shore sea bathymetry but flattens far offshore to deep ocean', () => {
    const px = fill()
    trimToGameWorld(px, meta, seeds)
    // A sea texel bordering the kept west land (inside the near-shore band)
    // keeps its real shelf depth.
    const nearSea = texel(7.5, 20.5)
    expect(elev(px, nearSea)).toBe(-200)
    expect(px[nearSea + 2]).toBe(0)
    // A sea texel beyond the near-shore band reads flat deep ocean, not its
    // real -200 m shelf.
    const farSea = texel(8.5, 20.5)
    expect(elev(px, farSea)).toBeLessThan(-800)
    expect(px[farSea + 2]).toBe(0)
  })

  // The trimmed east mass sits well beyond the near-shore band (0.6°), so its
  // shelf ring is flattened to deep open ocean; a trimmed spit at a kept shore
  // is covered by the delta assertions below.
  it('deepens the shallow shelf around trimmed land, not shallows near kept land', () => {
    const px = fill()
    const shelfEast = texel(9.5, 21.5) // shallow sea texel bordering the trimmed east mass
    px[shelfEast] = (12000 - 50) >> 8
    px[shelfEast + 1] = (12000 - 50) & 0xff
    px[shelfEast + 2] = 0
    const shelfWest = texel(7.5, 21.5) // shallow sea texel bordering the kept west mass
    px[shelfWest] = (12000 - 50) >> 8
    px[shelfWest + 1] = (12000 - 50) & 0xff
    px[shelfWest + 2] = 0
    trimToGameWorld(px, meta, seeds)
    expect(elev(px, shelfEast)).toBeLessThan(-800) // ghost shelf removed (flat deep ocean)
    expect(elev(px, shelfWest)).toBe(-50) // kept-land shore untouched
  })

  it('never trims land adjacent to kept land outside the Suez isthmus gate (no bites)', async () => {
    // Run the pure pass on the raw dataset and verify the trim boundary only
    // touches kept land at the isthmus gate — everywhere else trimmed and
    // kept land never share an edge, so no ocean scrap juts into the coast.
    const root = process.cwd()
    const pngBuf = readFileSync(resolve(root, 'public/geodata/dem.png'))
    const demMeta = JSON.parse(readFileSync(resolve(root, 'public/geodata/dem.json'), 'utf8'))
    const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
    const { width, height } = info
    const landBefore = new Uint8Array(width * height)
    for (let idx = 0; idx < width * height; idx++) landBefore[idx] = px[idx * 4 + 2] > 0 ? 1 : 0
    trimToGameWorld(px, demMeta)
    const keptLand = (idx: number) => px[idx * 4 + 2] > 0
    const offenders: string[] = []
    for (let y = 1; y < height - 1 && offenders.length < 10; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (!landBefore[idx] || keptLand(idx)) continue // only trimmed ex-land
        if (!(keptLand(idx - 1) || keptLand(idx + 1) || keptLand(idx - width) || keptLand(idx + width))) continue
        const lon = demMeta.lonMin + (x + 0.5) * demMeta.res
        const lat = demMeta.latMax - (y + 0.5) * demMeta.res
        const inGate = lon >= 31.9 && lon <= 34.7 && lat >= 29.0
        if (!inGate) offenders.push(`${lat.toFixed(2)},${lon.toFixed(2)}`)
      }
    }
    expect(offenders).toEqual([])
  }, 60000)
})

describe('world trim on the real DEM', () => {
  const seed = 1

  it('mid Red Sea is ocean and blocked', () => {
    const t = sampleTerrain(20, 38, seed)
    expect(t.type).toBe('ocean')
    expect(isBlocked(t.type, 20, 38)).toBe(true)
  })

  it('the Arabian peninsula is ocean and blocked (trimmed, formerly land)', () => {
    const t = sampleTerrain(24, 45, seed)
    expect(t.type).toBe('ocean')
    expect(landFractionAt(24, 45)).toBe(0)
    expect(elevationAt(24, 45)).toBeLessThan(-500)
    expect(isBlocked(t.type, 24, 45)).toBe(true)
  })

  it('Sinai and the Levant are ocean and blocked (no land route around the Red Sea)', () => {
    for (const [lat, lon] of [
      [29, 34],
      [32.5, 35],
    ] as const) {
      const t = sampleTerrain(lat, lon, seed)
      expect(t.type).toBe('ocean')
      expect(isBlocked(t.type, lat, lon)).toBe(true)
    }
  })

  it('the Gulf of Aden is blocked', () => {
    const t = sampleTerrain(12, 45, seed)
    expect(t.type).toBe('ocean')
    expect(isBlocked(t.type, 12, 45)).toBe(true)
  })

  it('shallow sea northeast of the boundary reads as deep open ocean (Persian Gulf)', () => {
    expect(elevationAt(27, 51)).toBeLessThan(-500)
    expect(elevationAt(16, 40.2)).toBeLessThan(-500) // Dahlak shelf
  })

  it('offshore shelves and island scraps beyond the continent read as flat deep ocean (point 235)', () => {
    // The user reported leftover shallow-water "Fetzen" (offshore shelf
    // patches, island-like relief) floating in the deep ocean around the Red
    // Sea, the Gulf of Aden and the Horn. Beyond the reachable continent and
    // its near-shore shelf there is only flat deep ocean: each sample reads
    // deep, with no land and blocked movement.
    for (const [lat, lon, label] of [
      [16.7, 42.0, 'Farasan bank (Red Sea)'],
      [16.0, 40.2, 'Dahlak shelf (Red Sea)'],
      [14.5, 42.0, 'southern Red Sea'],
      [12.5, 48.0, 'Gulf of Aden'],
      [12.5, 51.5, 'Socotra-area approaches'],
      [27.0, 51.0, 'Persian Gulf bank'],
      [-17.5, 43.5, 'Madagascar western bank'],
    ] as const) {
      expect(landFractionAt(lat, lon), `land at ${label}`).toBe(0)
      expect(elevationAt(lat, lon), `depth at ${label}`).toBeLessThan(-800)
      const t = sampleTerrain(lat, lon, seed)
      expect(t.type, `type at ${label}`).toBe('ocean')
      expect(isBlocked(t.type, lat, lon), `blocked at ${label}`).toBe(true)
    }
  })

  it('the reachable islands and the African coast keep their near-shore shelf as land (point 235)', () => {
    // The offshore flatten must NOT reach the kept land or its coastal shelf.
    for (const [lat, lon] of [
      [-6.1, 39.3], // Zanzibar
      [-5.15, 39.72], // Pemba
      [3.5, 8.65], // Bioko
    ] as const) {
      expect(landFractionAt(lat, lon), `island land at ${lat},${lon}`).toBeGreaterThan(0.5)
    }
    // Trimmed near-shore spits (the Nile-delta lagoon bars) still inherit the
    // local shallow shelf — not the deep flatten.
    expect(elevationAt(31.6, 30.75)).toBeGreaterThan(-100)
    expect(elevationAt(31.6, 31.25)).toBeGreaterThan(-100)
  })

  it('Madagascar leaves no land and no ghost shelf (unreachable, removed)', () => {
    expect(landFractionAt(-19.5, 46.8)).toBe(0)
    expect(elevationAt(-17.5, 43.5)).toBeLessThan(-500) // its wide western bank
    expect(isBlocked('ocean', -19.5, 46.8)).toBe(true)
  })

  it('land masses outside the walkable continent are trimmed to ocean', () => {
    for (const [lat, lon] of [
      [37, -5], // southern Spain
      [37.2, 14.5], // Sicily
      [35.2, 24.8], // Crete
      [36.9, 22.3], // Peloponnese
      [36.8, 29.5], // southwestern Anatolia
      [28.3, -16.5], // Canary Islands
      [-11.7, 43.35], // Comoros
      [0.25, 6.6], // São Tomé
      [-19.5, 46.8], // Madagascar (unreachable, removed on user request)
    ] as const) {
      expect(landFractionAt(lat, lon), `land at ${lat},${lon}`).toBe(0)
      expect(sampleTerrain(lat, lon, seed).type).toBe('ocean')
    }
  })

  it('the game’s own islands stay land', () => {
    for (const [lat, lon] of [
      [-6.1, 39.3], // Zanzibar
      [-5.15, 39.72], // Pemba
      [3.5, 8.65], // Bioko
    ] as const) {
      expect(landFractionAt(lat, lon), `land at ${lat},${lon}`).toBeGreaterThan(0.5)
    }
  })

  it('the Nile delta and Cairo surroundings stay walkable land', () => {
    for (const [lat, lon] of [
      [30.5, 31.0],
      [30.05, 31.25],
    ] as const) {
      const t = sampleTerrain(lat, lon, seed)
      expect(landFractionAt(lat, lon)).toBeGreaterThan(0.5)
      expect(isBlocked(t.type, lat, lon)).toBe(false)
    }
  })

  it('trimmed coastal spits inherit the local shelf depth, open-sea land stays deep', () => {
    // The dataset's lagoon bars off the Nile delta are trimmed (disconnected
    // land), but must read as the surrounding shallow shelf — the former
    // uniform deep stamp punched dark angular holes into the coastal water.
    expect(elevationAt(31.6, 30.75)).toBeGreaterThan(-100)
    expect(elevationAt(31.6, 31.25)).toBeGreaterThan(-100)
    // Removed open-sea land keeps the plain deep tone (design.md §21.4).
    expect(elevationAt(35.2, 24.8)).toBeLessThan(-500) // Crete
    expect(elevationAt(28.3, -16.5)).toBeLessThan(-500) // Canary Islands
  })

  it('the African Red Sea coast stays walkable land', () => {
    const t = sampleTerrain(19, 37, seed)
    expect(t.type).toBe('desert')
    expect(landFractionAt(19, 37)).toBeGreaterThan(0.9)
    expect(isBlocked(t.type, 19, 37)).toBe(false)
  })
})

describe('boundarySignedDistance + the trim-coast smoothing (point 210)', () => {
  const seed = 1

  it('is signed: positive on the kept-land (SW) side, negative on the trimmed-ocean (NE) side', () => {
    expect(boundarySignedDistance(30.05, 31.25)).toBeGreaterThan(0) // Cairo (land)
    expect(boundarySignedDistance(19, 37)).toBeGreaterThan(0) // African Red Sea coast (land)
    expect(boundarySignedDistance(20, 38)).toBeLessThan(0) // mid Red Sea (ocean)
    expect(boundarySignedDistance(24, 45)).toBeLessThan(0) // Arabia (ocean)
    expect(boundarySignedDistance(12, 45)).toBeLessThan(0) // Gulf of Aden (ocean)
  })

  it('its sign agrees with isNortheastOfBoundary everywhere (≤ 0 ⟺ northeast)', () => {
    for (let lat = 12; lat <= 33; lat += 1.5) {
      for (let lon = 31; lon <= 52; lon += 1.5) {
        const bsd = boundarySignedDistance(lat, lon)
        if (Math.abs(bsd) < 1e-6) continue // skip the exact line
        expect(bsd <= 0, `sign at ${lat},${lon} (bsd=${bsd})`).toBe(isNortheastOfBoundary(lat, lon))
      }
    }
  })

  // The trim stamps ocean per texel northeast of NORTHEAST_BOUNDARY, so where
  // that artificial cut IS the coast (the Suez isthmus east of Cairo) it
  // staircased like the raster coast before point 209 — and 209's vector
  // smoothing does not reach it. Point 210 rebuilds the land fraction there
  // from the signed boundary distance: a smooth diagonal.
  const oceanCrossingLon = (lat: number): number => {
    // First longitude (scanning east) where the terrain turns to ocean.
    let prevLand = false
    for (let lon = 32.0; lon <= 33.6; lon += 0.004) {
      const isOcean = sampleTerrain(lat, lon, seed).type === 'ocean'
      if (isOcean && prevLand) return lon
      prevLand = !isOcean
    }
    return NaN
  }

  it('the Suez-isthmus coast crossing MOVES continuously with latitude (sub-texel smooth, not grid-locked)', () => {
    // A binary per-texel stamp would snap the land→ocean crossing to the DEM
    // texel grid, repeating one quantized longitude across a whole texel band
    // of latitudes. The smoothed boundary must instead shift the crossing
    // continuously as the polyline slants — distinct crossings a fine step apart.
    const crossings = [30.02, 30.06, 30.1, 30.14].map(oceanCrossingLon)
    for (const c of crossings) expect(Number.isFinite(c)).toBe(true)
    const distinct = new Set(crossings.map((c) => c.toFixed(3)))
    expect(distinct.size).toBeGreaterThanOrEqual(3) // not one repeated grid value
    // and the motion is gentle (a smooth slant, no texel jump)
    for (let i = 1; i < crossings.length; i++) {
      expect(Math.abs(crossings[i] - crossings[i - 1])).toBeLessThan(0.03)
    }
  })

  it('the smoothed trim coast has a graded shore ramp, not an instant deep-ocean step', () => {
    // The land fraction ramps down across the boundary, so the sea floor rises
    // toward the shore: a near-shore ocean sample is clearly SHALLOWER than one
    // a band further out. A binary per-texel stamp would drop both to the same
    // deep floor (difference ~0) — the staircase this point removes.
    const cross = oceanCrossingLon(30.05)
    const near = sampleTerrain(30.05, cross + 0.015, seed).height
    const far = sampleTerrain(30.05, cross + 0.1, seed).height
    expect(near).toBeGreaterThan(far + 0.08)
  })

  it('the cropped Gulf-of-Suez head reads as clean graded deep ocean (no blocky trim-stamp wedge)', () => {
    // point 210 (user decision, clean crop — supersedes the 210b shallow-shelf
    // lift at these cells): the tightened boundary hugs the gulf's African west
    // shore, so the former garbage-stamp wedge now lies on the trimmed side —
    // the map simply ends at the line. The cells read as open ocean deepening
    // SMOOTHLY with distance from the new coast: deep tone (no shallow arm
    // poking into the desert), and no per-cell cliff between neighbours.
    const a = sampleTerrain(29.8, 32.55, seed).height
    const b = sampleTerrain(29.85, 32.55, seed).height
    expect(a).toBeLessThan(-0.6) // clean deep ocean, not a shallow arm
    expect(b).toBeLessThan(-0.6)
    expect(Math.abs(a - b)).toBeLessThan(0.3) // graded, no per-cell cliff
    // Deep open Red Sea, far from the boundary, keeps its bathymetry.
    expect(sampleTerrain(19, 39, seed).height).toBeLessThan(-0.8)
  })

  it('does NOT re-add land in the real Gulf-of-Suez head (no spurious sliver across open water)', () => {
    // Genuine gulf water sits southwest of the boundary here; the guard must
    // leave it — and the thin band at the boundary must not sprout a land bridge
    // across the gulf mouth.
    for (const [lat, lon] of [
      [29.7, 32.5],
      [29.5, 32.55],
      [29.5, 32.7], // in the boundary band, but water reaches SW of it
    ] as const) {
      expect(sampleTerrain(lat, lon, seed).type, `gulf head ${lat},${lon}`).toBe('ocean')
    }
  })

  it('leaves every world-trim acceptance verdict unchanged', () => {
    expect(sampleTerrain(20, 38, seed).type).toBe('ocean') // mid Red Sea
    expect(sampleTerrain(29, 34, seed).type).toBe('ocean') // Sinai
    expect(sampleTerrain(30.05, 31.25, seed).type).not.toBe('ocean') // Cairo (land)
    expect(landFractionAt(30.05, 31.25)).toBeGreaterThan(0.5)
    expect(sampleTerrain(19, 37, seed).type).toBe('desert') // African Red Sea coast
  })
})

describe('the Gulf-of-Suez head clean crop (point 210)', () => {
  const seed = 1

  it('the former messy gulf-head water pocket reads clean deep ocean', () => {
    // Before the crop an isolated 2-cell water pocket (the vector gulf tip
    // inside kept raster land) sat at ~29.95N/32.57E, cut off from the main
    // sea — one of the dark arm patches poking into the sand east of Cairo.
    // It now lies on the trimmed side of the tightened boundary: uniform deep
    // open ocean, no land, no shallow garbage.
    expect(sampleTerrain(29.95, 32.57, seed).type).toBe('ocean')
    expect(landFractionAt(29.95, 32.57)).toBe(0)
    expect(elevationAt(29.95, 32.57)).toBeLessThan(-500)
  })

  it('Suez itself stays ocean while the African coast keeps its land', () => {
    expect(sampleTerrain(29.97, 32.55, seed).type).toBe('ocean')
    expect(isBlocked('ocean', 29.97, 32.55)).toBe(true)
    expect(sampleTerrain(19, 37, seed).type).toBe('desert') // African Red Sea coast
    expect(landFractionAt(30.05, 31.25)).toBeGreaterThan(0.5) // Cairo
  })

  it('one clean continent edge: every head-zone latitude crosses land→ocean exactly once', () => {
    // The defect was alternation — narrow water fingers, a detached isthmus
    // land strip and trim-stamp cells switching class cell-by-cell near the
    // boundary (stepped arms, dark patches). Sweep the head zone: each row
    // starts on land, ends in ocean, and once the sea begins it never turns
    // back to land — no pocket, finger or strip survives on either side.
    for (let lat = 29.5; lat <= 30.15 + 1e-9; lat += 0.05) {
      let crossings = 0
      let prev = sampleTerrain(lat, 32.0, seed).type === 'ocean'
      expect(prev, `row ${lat.toFixed(2)} starts on land`).toBe(false)
      for (let lon = 32.01; lon <= 33.2 + 1e-9; lon += 0.01) {
        const ocean = sampleTerrain(lat, lon, seed).type === 'ocean'
        if (ocean !== prev) crossings++
        prev = ocean
      }
      expect(prev, `row ${lat.toFixed(2)} ends in ocean`).toBe(true)
      expect(crossings, `row ${lat.toFixed(2)} crosses the coast once`).toBe(1)
    }
  })
})

describe('swim margin (design.md §11.2)', () => {
  const seed = 1

  it('nearshore sea is swimmable, far offshore blocks even inside the hull', () => {
    // Gulf of Guinea nearshore (~0.9° off the coast): swimmable.
    const guinea = sampleTerrain(5.5, 3, seed)
    expect(guinea.type).toBe('ocean')
    expect(isBlocked(guinea.type, 5.5, 3)).toBe(false)
    // Center of the Gulf of Guinea bight (several degrees offshore): blocked
    // despite lying inside the hull — no swimming far out into the open sea.
    const bight = sampleTerrain(2, 0, seed)
    expect(bight.type).toBe('ocean')
    expect(isBlocked(bight.type, 2, 0)).toBe(true)
    // Mediterranean off the Gulf of Sidra: open sea, always blocked.
    const sidra = sampleTerrain(34, 15, seed)
    expect(sidra.type).toBe('ocean')
    expect(isBlocked(sidra.type, 34, 15)).toBe(true)
  })

  it('the Mediterranean is never swimmable, even inside the coastal band', () => {
    // The convex hull spans the northern coast, so without the explicit
    // Mediterranean rule the sea off Alexandria would read as an enclosed
    // bight with a swimmable band (reported walkable ocean north of Cairo).
    const prev = balance.oceanSwimMarginDeg
    try {
      for (const [lat, lon] of [
        [31.6, 31.0], // off the Nile delta, well inside the old band
        [31.4, 30.0], // off Alexandria
        [33.5, 13.0], // Gulf of Sidra bight
      ] as const) {
        const t = sampleTerrain(lat, lon, seed)
        expect(t.type, `type at ${lat},${lon}`).toBe('ocean')
        expect(isBlocked(t.type, lat, lon), `blocked at ${lat},${lon}`).toBe(true)
      }
      // Not even a widened band opens it — the rule is margin-independent.
      balance.oceanSwimMarginDeg = 3
      expect(isBlocked('ocean', 31.6, 31.0)).toBe(true)
    } finally {
      balance.oceanSwimMarginDeg = prev
    }
  })

  it('the margin is a runtime-editable balance value', () => {
    const prev = balance.oceanSwimMarginDeg
    try {
      // Gulf of Guinea, ~1.8° offshore: blocked by the default band, opened
      // by a widened one.
      expect(isBlocked('ocean', 4.4, 3)).toBe(true)
      balance.oceanSwimMarginDeg = 3
      expect(isBlocked('ocean', 4.4, 3)).toBe(false)
      balance.oceanSwimMarginDeg = 0.2
      expect(isBlocked('ocean', 5.5, 3)).toBe(true)
    } finally {
      balance.oceanSwimMarginDeg = prev
    }
  })

  it('the hull rules stay: open Atlantic and the Mozambique channel block, the strait off Tunisia too', () => {
    expect(isBlocked('ocean', 0, -30)).toBe(true) // open Atlantic
    const mozambique = sampleTerrain(-18, 41, seed)
    expect(mozambique.type).toBe('ocean')
    expect(isBlocked(mozambique.type, -18, 41)).toBe(true)
    const openMed = sampleTerrain(37.5, 11.5, seed)
    expect(openMed.type).toBe('ocean')
    expect(isBlocked(openMed.type, 37.5, 11.5)).toBe(true) // outside the hull
  })
})

describe('oceanSwimBlocked — consistent near-shore band (point 221)', () => {
  // Pure over the coast-distance metric (no geodata needed): the band decision
  // the terrain movement gate delegates to. The reported defect (user 22.07.2026,
  // far out in deep blue at ~32.2S/16.9E) was a swim margin whose SEAWARD reach
  // depended on coast shape — a convex cape blocked the traveller ~0 deg off the
  // beach while a concave bay let him wade ~1.4 deg — so the wadeable distance
  // swung ~35x between coasts. These coast-distance figures are measured off the
  // real vector coastline; the band here treats every coast identically.
  const M = SWIM_MARGIN_DEG_DEFAULT // 1.0 deg

  it('is a bounded, consistent distance from the coast — a point just inside swims, a bounded step further out blocks, IDENTICALLY at every coast', () => {
    // Same margin, same coast-distances, several unrelated coastlines that are
    // NOT in the Red-Sea cut or the Mediterranean: a convex cape and a concave
    // bay must give the SAME verdict at the SAME distance (the shape-independence
    // the point-221 fix installs — the former hull gate did not).
    const coasts: Array<[number, number, string]> = [
      [5.5, 3.0, 'Gulf of Guinea (open coast)'],
      [-32.2, 17.9, 'SW Atlantic (concave St Helena bay)'],
      [-34.4, 18.5, 'Cape of Good Hope (convex cape)'],
      [11.8, 51.4, 'Cape Guardafui (convex cape)'],
    ]
    for (const [lat, lon, label] of coasts) {
      // just inside the band → swimmable
      expect(oceanSwimBlocked(lat, lon, M * 0.8, M), `just inside @ ${label}`).toBe(false)
      // a bounded step further out → blocked, no matter the coast shape
      expect(oceanSwimBlocked(lat, lon, M * 1.2, M), `bounded step out @ ${label}`).toBe(true)
    }
  })

  it('the band width is exactly marginDeg: at the boundary the last swimmable cell is <= marginDeg, the first blocked cell just beyond', () => {
    const lat = -32.2
    const lon = 17.9
    expect(oceanSwimBlocked(lat, lon, M, M)).toBe(false) // exactly at the margin: still swimmable
    expect(oceanSwimBlocked(lat, lon, M + 1e-6, M)).toBe(true) // a hair beyond: blocked
    // and it scales with the calibratable margin (debug-editable balance value)
    expect(oceanSwimBlocked(lat, lon, 0.5, 0.4)).toBe(true)
    expect(oceanSwimBlocked(lat, lon, 0.3, 0.4)).toBe(false)
  })

  it('the reported WIDE-BAY over-permit now blocks: the SW Atlantic point ~1.18 deg offshore is out of the band', () => {
    // Measured coast-distance at the reported spot (~32.2S/16.9E) is ~1.184 deg.
    // The former 1.2 deg margin let it through (deep blue, far from land); the
    // narrowed calibrated band blocks it while the nearshore cases stay in.
    const reportedCoastDist = 1.184
    expect(oceanSwimBlocked(-32.2, 16.9, reportedCoastDist, M)).toBe(true) // now blocked
    expect(oceanSwimBlocked(-32.2, 16.9, reportedCoastDist, 1.2)).toBe(false) // the old over-permit
    // the documented nearshore swim (Gulf of Guinea, ~0.889 deg) stays swimmable
    expect(oceanSwimBlocked(5.5, 3.0, 0.889, M)).toBe(false)
    // and the far-offshore blocks (Gulf of Guinea bight ~1.986 / ~3.338 deg)
    expect(oceanSwimBlocked(4.4, 3.0, 1.986, M)).toBe(true)
    expect(oceanSwimBlocked(2.0, 0.0, 3.338, M)).toBe(true)
  })

  it('deep/far-offshore sea blocks everywhere, independent of coast shape', () => {
    for (const [lat, lon, cd, label] of [
      [0, -30, 18.069, 'open Atlantic'],
      [-18, 41, 2.092, 'Mozambique channel'],
      [-40, 20, 6.0, 'Southern Ocean'],
    ] as const) {
      expect(oceanSwimBlocked(lat, lon, cd, M), `far offshore @ ${label}`).toBe(true)
    }
  })

  it('the Red-Sea cut always blocks, even for a cell hard against the coast (coastDist 0) with a huge margin', () => {
    // mid Red Sea, the Arabian side, the Gulf of Aden — northeast of the boundary.
    for (const [lat, lon] of [
      [20, 38],
      [24, 45],
      [12, 45],
      [29, 34], // Sinai
    ] as const) {
      expect(isNortheastOfBoundary(lat, lon)).toBe(true)
      expect(oceanSwimBlocked(lat, lon, 0, 5)).toBe(true)
    }
  })

  it('the Mediterranean always blocks — off the delta, off Alexandria, in the Sidra bight — even inside the band and even with a widened margin', () => {
    for (const [lat, lon] of [
      [31.6, 31.0], // off the Nile delta
      [31.4, 30.0], // off Alexandria
      [33.5, 13.0], // Gulf of Sidra bight
      [37.5, 11.5], // open Med off Tunisia
      [34.0, 15.0], // Sidra
    ] as const) {
      expect(lat > MEDITERRANEAN_LAT_MIN && lon > MEDITERRANEAN_LON_MIN).toBe(true)
      expect(oceanSwimBlocked(lat, lon, 0, 5)).toBe(true) // coastDist 0, margin 5: still blocked
    }
  })

  it('south of the Mediterranean latitude the same coast-distance swims (the gate is a latitude/longitude box, not a global block)', () => {
    // A sanity check that the Mediterranean rule does not over-reach: an Atlantic
    // coast cell south of the box, within the band, is swimmable.
    expect(oceanSwimBlocked(MEDITERRANEAN_LAT_MIN - 0.1, 3.0, 0.3, M)).toBe(false)
    // west of MEDITERRANEAN_LON_MIN (the Atlantic beyond Gibraltar) is not caught
    // by the Mediterranean box either.
    expect(oceanSwimBlocked(35.0, MEDITERRANEAN_LON_MIN - 0.1, 0.3, M)).toBe(false)
  })
})
