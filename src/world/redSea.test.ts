// Northeast world cut (design.md §3.1/§11.2): the walkable continent ends at
// the African Red Sea coast — the Red Sea, Sinai, the Levant and the Arabian
// peninsula are open, impassable ocean, with no change to the hull behavior
// of the remaining bays. Covers the pure boundary side test, the pure DEM
// stamping pass and the real-DEM acceptance coordinates.
import { describe, it, expect, beforeAll } from 'vitest'
import { isNortheastOfBoundary, stampNortheastOcean } from './redSea'
import { sampleTerrain, isBlocked } from './terrain'
import { elevationAt, landFractionAt } from './geodata'
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

describe('stampNortheastOcean', () => {
  // Synthetic 23x24 grid at 1°/texel covering lon 30..53, lat 8..32, all land
  // (B = 5, elevation 500 m at offset 12000 → value 12500).
  const meta = { width: 23, height: 24, lonMin: 30, latMax: 32, res: 1, offsetMeters: 12000 }
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
    return px
  }
  const elev = (px: Uint8ClampedArray, i: number) => px[i] * 256 + px[i + 1] - meta.offsetMeters

  it('stamps land northeast of the boundary to below-sea ocean', () => {
    const px = fill()
    stampNortheastOcean(px, meta)
    const arabia = texel(45.5, 24.5)
    expect(px[arabia + 2]).toBe(0)
    expect(elev(px, arabia)).toBeLessThan(0)
    const sinai = texel(33.5, 29.5)
    expect(px[sinai + 2]).toBe(0)
  })

  it('leaves the African side untouched', () => {
    const px = fill()
    stampNortheastOcean(px, meta)
    const delta = texel(30.5, 30.5)
    expect(px[delta + 2]).toBe(5)
    expect(elev(px, delta)).toBe(500)
    const sudanCoast = texel(36.5, 19.5)
    expect(px[sudanCoast + 2]).toBe(5)
  })

  it('keeps the real bathymetry of texels that already are ocean', () => {
    const px = fill()
    const redSea = texel(38.5, 20.5)
    px[redSea] = 11800 >> 8 // -200 m: existing sea depth
    px[redSea + 1] = 11800 & 0xff
    px[redSea + 2] = 0
    stampNortheastOcean(px, meta)
    expect(elev(px, redSea)).toBe(-200)
    expect(px[redSea + 2]).toBe(0)
  })
})

describe('world cut on the real DEM', () => {
  const seed = 1

  it('mid Red Sea is ocean and blocked', () => {
    const t = sampleTerrain(20, 38, seed)
    expect(t.type).toBe('ocean')
    expect(isBlocked(t.type, 20, 38)).toBe(true)
  })

  it('the Arabian peninsula is ocean and blocked (stamped, formerly land)', () => {
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

  it('the African Red Sea coast stays walkable land', () => {
    const t = sampleTerrain(19, 37, seed)
    expect(t.type).toBe('desert')
    expect(landFractionAt(19, 37)).toBeGreaterThan(0.9)
    expect(isBlocked(t.type, 19, 37)).toBe(false)
  })

  it('the other bays and seas behave as before', () => {
    // Gulf of Guinea: enclosed bay inside the hull, swimmable.
    const guinea = sampleTerrain(5.5, 3, seed)
    expect(guinea.type).toBe('ocean')
    expect(isBlocked(guinea.type, 5.5, 3)).toBe(false)
    // Mozambique channel: outside the mainland hull, blocked (as before).
    const mozambique = sampleTerrain(-18, 41, seed)
    expect(mozambique.type).toBe('ocean')
    expect(isBlocked(mozambique.type, -18, 41)).toBe(true)
    // Mediterranean off the Gulf of Sidra: inside the hull, swimmable bay
    // (as before); the open Mediterranean further out stays blocked.
    const sidra = sampleTerrain(34, 15, seed)
    expect(sidra.type).toBe('ocean')
    expect(isBlocked(sidra.type, 34, 15)).toBe(false)
    const openMed = sampleTerrain(37.5, 11.5, seed)
    expect(openMed.type).toBe('ocean')
    expect(isBlocked(openMed.type, 37.5, 11.5)).toBe(true)
  })
})
