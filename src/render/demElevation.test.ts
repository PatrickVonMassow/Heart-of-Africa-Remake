// point 210: the water-depth shelf grading that stops the Suez trim floor from
// staircasing the water shader's depth colour. Pure test over shelfGradedMeters
// (the texture bake itself needs a GPU/DataTexture, out of scope here).
import { describe, it, expect } from 'vitest'
import { shelfGradedMeters } from './demElevation'

// A synthetic DEM tile around the Cairo/Suez boundary. B channel = land flag.
const W = 120
const H = 80
const LON_MIN = 31
const LAT_MAX = 31
const RES = 0.025 // covers lon [31,34], lat [29,31]
function makeDem(land: boolean) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) data[i * 4 + 2] = land ? 255 : 0
  return { width: W, height: H, data }
}
const DEEP = -3000
const grade = (lat: number, lon: number, land = true, m = DEEP) =>
  shelfGradedMeters(m, lat, lon, makeDem(land), LON_MIN, LAT_MAX, RES)

describe('shelfGradedMeters (point 210 — water depth shelf at the Suez trim coast)', () => {
  it('grades the stamped deep floor to a shallow shelf just NE of the boundary (kept land inward)', () => {
    const shore = grade(30.05, 32.7) // bsd ~ -0.04, inside the band
    expect(shore).toBeGreaterThan(DEEP) // shallower than the stamp
    expect(shore).toBeLessThan(0) // still below sea level
  })

  it('deepens monotonically seaward across the band (no depth step)', () => {
    const near = grade(30.05, 32.7) // just NE of the line
    const mid = grade(30.05, 32.8)
    const far = grade(30.05, 32.9)
    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far) // deeper the further out
  })

  it('leaves the floor untouched past the shelf band (open sea stays deep)', () => {
    expect(grade(30.05, 33.3)).toBe(DEEP) // well NE, beyond SHELF_BAND
  })

  it('leaves the SW (kept-land) side untouched', () => {
    expect(grade(30.05, 32.4)).toBe(DEEP) // bsd > 0 — not the trimmed side
  })

  it('does NOT grade where the boundary runs through open water (guard: no kept land inward)', () => {
    // Same band position, but the inward sample is sea -> the guard refuses, so a
    // genuine gulf/open-sea depth is never turned into a false shallow bank.
    expect(grade(30.05, 32.7, false)).toBe(DEEP)
  })
})
