// The sea plane's land mask must be the terrain's own coast (point 314): the
// raw DEM land flag it used before disagrees with the terrain's shore, which
// left terrain sea bare (pale floor patches) and laid the sea over terrain land.
import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../test/geodata'
import { getDemMeta, getDemPixels } from './geodata'
import { sampleTerrain, shoreLandFraction } from './terrain'
import { bakeShoreLand } from './seaMask'

let flags: Uint8Array
let width = 0
let height = 0
let texelLatLon: (x: number, y: number) => { lat: number; lon: number }

beforeAll(async () => {
  await setupGeodata()
  const meta = getDemMeta()
  const dem = getDemPixels()
  width = dem.width
  height = dem.height
  const res = (meta.lonMax - meta.lonMin) / width
  flags = new Uint8Array(width * height)
  for (let i = 0; i < flags.length; i++) flags[i] = dem.data[i * 4 + 2] > 0 ? 1 : 0
  texelLatLon = (x, y) => ({ lat: meta.latMax - (y + 0.5) * res, lon: meta.lonMin + (x + 0.5) * res })
})

const landAt = (x: number, y: number) => {
  const { lat, lon } = texelLatLon(x, y)
  return shoreLandFraction(lat, lon).land
}

describe('sea plane land mask (point 314)', () => {
  it('the raw raster flag disagrees with the terrain coast at the Nile delta — the old mask rule', () => {
    // Texels whose flag says land while the terrain lays sea there: the plane
    // used to stay transparent over them and the bare shallow floor showed.
    let wrong = 0
    for (let lat = 31.0; lat <= 31.6; lat += 0.025) {
      for (let lon = 29.8; lon <= 32.4; lon += 0.025) {
        const s = sampleTerrain(lat, lon, 1)
        const meta = getDemMeta()
        const x = Math.floor((lon - meta.lonMin) / meta.res)
        const y = Math.floor((meta.latMax - lat) / meta.res)
        if (flags[y * width + x] === 1 && s.type === 'ocean') wrong++
      }
    }
    expect(wrong).toBeGreaterThan(0)
  })

  it('the baked mask equals the terrain land fraction at every texel centre of the continent', () => {
    const t0 = performance.now()
    const baked = bakeShoreLand(flags, width, height, landAt)
    const ms = performance.now() - t0
    let mismatches = 0
    let sea = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const want = landAt(x, y)
        if (Math.abs(baked[y * width + x] - want) > 1e-6) mismatches++
        if (want < 0.5) sea++
      }
    }
    expect(mismatches).toBe(0)
    expect(sea).toBeGreaterThan(0)
    // The bake runs once when the sea material is built; it must stay cheap.
    expect(ms).toBeLessThan(1500)
  }, 60000)

  it('the mask and the terrain agree on land or sea at the reported shores', () => {
    const baked = bakeShoreLand(flags, width, height, landAt)
    const meta = getDemMeta()
    let checked = 0
    // Rosetta mouth, Congo mouth: texel centres within half a degree.
    for (const [clat, clon] of [[31.4, 30.4], [-6.0, 12.4]]) {
      for (let dy = -20; dy <= 20; dy++) {
        for (let dx = -20; dx <= 20; dx++) {
          const x = Math.floor((clon - meta.lonMin) / meta.res) + dx
          const y = Math.floor((meta.latMax - clat) / meta.res) + dy
          const { lat, lon } = texelLatLon(x, y)
          const terrainSea = sampleTerrain(lat, lon, 1).type === 'ocean'
          expect(baked[y * width + x] < 0.5, `${lat.toFixed(3)},${lon.toFixed(3)}`).toBe(terrainSea)
          checked++
        }
      }
    }
    expect(checked).toBe(2 * 41 * 41)
  })
})
