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
import { isNortheastOfBoundary, trimToGameWorld } from './redSea'
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

  it('keeps the real bathymetry of sea texels', () => {
    const px = fill()
    trimToGameWorld(px, meta, seeds)
    const sea = texel(8.5, 20.5)
    expect(elev(px, sea)).toBe(-200)
    expect(px[sea + 2]).toBe(0)
  })

  // The trimmed east mass sits well beyond the near-shore band (0.6°), so it
  // takes the deep open-sea stamp and its shelf ring is hidden; a trimmed
  // spit at a kept shore is covered by the delta assertions below.
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
    expect(elev(px, shelfEast)).toBeLessThan(-1000) // ghost shelf removed
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
    // Mediterranean off the Gulf of Sidra (~1.7° offshore, inside the hull):
    // blocked by the margin since the world-trim work; formerly swimmable.
    const sidra = sampleTerrain(34, 15, seed)
    expect(sidra.type).toBe('ocean')
    expect(isBlocked(sidra.type, 34, 15)).toBe(true)
  })

  it('the margin is a runtime-editable balance value', () => {
    const prev = balance.oceanSwimMarginDeg
    try {
      balance.oceanSwimMarginDeg = 3
      expect(isBlocked('ocean', 34, 15)).toBe(false)
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
