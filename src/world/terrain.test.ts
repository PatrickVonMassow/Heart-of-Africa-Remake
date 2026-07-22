// Terrain height-field smoothness (design.md §3.3, CLAUDE.md §7.1 pt. 11):
// the relief the travel-scene chunk mesh and the settlement backdrop sample
// must be C1-smooth — bilinear DEM interpolation is only C0, and every texel
// boundary is then a gradient crease the mesh renders as a polygon fold
// ("angular mountains"). The witness compares the shipped elevation sampler
// against a reference bilinear resample of the SAME pixels on the same
// mountain transects: the bilinear profile shows sharp curvature spikes at
// texel edges, the shipped profile must stay far below them. A second check
// pins that sampleTerrain (the field the mesh actually reads) inherits that
// smooth sampler plus only the bounded C1 micro-relief noise — never a
// re-quantized height.
import { describe, it, expect, beforeAll } from 'vitest'
import { sampleTerrain } from './terrain'
import { elevationAt, getDemMeta, getDemPixels } from './geodata'
import { setupGeodata } from '../test/geodata'

const SEED = 42
/** Vertical exaggeration used by sampleTerrain (terrain.ts). */
const METERS_TO_UNITS = 1.35 / 1000
/** Amplitude bound of the per-run micro-relief noise added inland
 *  (`detail * 0.2 * shoreT` with detail in [0,1], shoreT = 1 inland). */
const DETAIL_NOISE_BOUND = 0.2

beforeAll(async () => {
  await setupGeodata()
})

/** Reference bilinear elevation (meters) from the raw DEM pixels — the pre-215
 *  C0 sampler, rebuilt here so the test proves the metric discriminates. */
function bilinearElevation(lat: number, lon: number): number {
  const meta = getDemMeta() as unknown as { lonMin: number; latMax: number; lonMax: number; offsetMeters: number }
  const { data, width, height } = getDemPixels()
  const res = (meta.lonMax - meta.lonMin) / width
  const x = (lon - meta.lonMin) / res - 0.5
  const y = (meta.latMax - lat) / res - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const at = (tx: number, ty: number) => {
    const cx = Math.max(0, Math.min(width - 1, tx))
    const cy = Math.max(0, Math.min(height - 1, ty))
    const t = (cy * width + cx) * 4
    return data[t] * 256 + data[t + 1]
  }
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx
  const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx
  return top + (bot - top) * fy - meta.offsetMeters
}

/**
 * Largest gradient jump across the DEM texel boundaries of a south-north
 * transect, probed with step `eps` (degrees): J = |h(b+eps) - 2 h(b) +
 * h(b-eps)| / eps. For a C1 field J shrinks linearly with eps (it measures
 * eps * curvature); across a C0 crease it converges to the constant gradient
 * jump — the refinement ratio J(eps/4) / J(eps) separates the two sharply.
 */
function maxBoundaryJump(sample: (lat: number, lon: number) => number, latFrom: number, latTo: number, lon: number, eps: number): number {
  const meta = getDemMeta() as unknown as { lonMin: number; lonMax: number; latMax: number }
  const { width } = getDemPixels()
  const res = (meta.lonMax - meta.lonMin) / width
  // Bilinear pieces break where gridPos y = (latMax - lat) / res - 0.5 is an
  // integer k, i.e. at lat = latMax - (k + 0.5) * res.
  const kFrom = Math.ceil((meta.latMax - latTo) / res - 0.5)
  const kTo = Math.floor((meta.latMax - latFrom) / res - 0.5)
  let max = 0
  for (let k = kFrom; k <= kTo; k++) {
    const lat = meta.latMax - (k + 0.5) * res
    if (lat - eps < latFrom || lat + eps > latTo) continue
    const j = Math.abs(sample(lat + eps, lon) - 2 * sample(lat, lon) + sample(lat - eps, lon)) / eps
    if (j > max) max = j
  }
  return max
}

/** Points of a lat/lon transect sampled at 1/5-texel spacing. */
function transectPoints(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  steps: number,
): Array<{ lat: number; lon: number }> {
  const pts: Array<{ lat: number; lon: number }> = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({ lat: from.lat + (to.lat - from.lat) * t, lon: from.lon + (to.lon - from.lon) * t })
  }
  return pts
}

// Kilimanjaro flanks: high relief, far from every river/lake/coast band, so
// the terrain height there is the pure (exaggerated) elevation field plus the
// C1 detail noise — any curvature spike would be the interpolation's own
// crease. Each transect crosses ~20 DEM texel boundaries.
const CASES: Array<[string, { lat: number; lon: number }, { lat: number; lon: number }]> = [
  ['south-north across the west flank', { lat: -3.35, lon: 37.15 }, { lat: -2.85, lon: 37.15 }],
  ['west-east across the massif', { lat: -3.2, lon: 37.0 }, { lat: -3.2, lon: 37.6 }],
]

describe('elevation sampling is C1-smooth (no gradient creases at DEM texel edges)', () => {
  // Two flank transects, each crossing ~20 texel rows south to north.
  const TRANSECTS: Array<[string, number, number, number]> = [
    ['west flank (lon 37.15)', -3.35, -2.85, 37.15],
    ['east flank (lon 37.55)', -3.35, -2.85, 37.55],
  ]
  const meta = () => {
    const m = getDemMeta() as unknown as { lonMin: number; lonMax: number }
    return (m.lonMax - m.lonMin) / getDemPixels().width
  }

  for (const [name, latFrom, latTo, lon] of TRANSECTS) {
    it(`${name}: the boundary gradient jump vanishes under refinement — the bilinear reference's does not`, () => {
      const res = meta()
      const big = res / 10
      const small = res / 40
      // The C0 reference: a real, refinement-stable crease exists here (its
      // jump is the gradient change across the texel row — meters per degree).
      const bilBig = maxBoundaryJump(bilinearElevation, latFrom, latTo, lon, big)
      const bilSmall = maxBoundaryJump(bilinearElevation, latFrom, latTo, lon, small)
      expect(bilBig).toBeGreaterThan(100)
      expect(bilSmall).toBeGreaterThan(bilBig * 0.8) // the crease survives refinement
      // The shipped sampler: C1 — the jump measures eps * curvature and must
      // shrink ~linearly with the probe step (ratio ~0.25; 0.5 with margin).
      const smoothBig = maxBoundaryJump(elevationAt, latFrom, latTo, lon, big)
      const smoothSmall = maxBoundaryJump(elevationAt, latFrom, latTo, lon, small)
      expect(smoothSmall).toBeLessThan(smoothBig * 0.5)
      // And at the finest probe it sits far below the reference's crease.
      expect(smoothSmall).toBeLessThan(bilSmall * 0.25)
    })
  }
})

describe('sampleTerrain reads the smooth sampler (no re-quantized mountain height)', () => {
  for (const [name, from, to] of CASES) {
    it(`${name}: height = smooth elevation + bounded micro-relief noise`, () => {
      for (const p of transectPoints(from, to, 100)) {
        const s = sampleTerrain(p.lat, p.lon, SEED)
        const base = Math.max(0.06, elevationAt(p.lat, p.lon) * METERS_TO_UNITS)
        expect(s.type).not.toBe('water') // precondition: no river/lake carve here
        expect(Math.abs(s.height - base)).toBeLessThanOrEqual(DETAIL_NOISE_BOUND + 1e-9)
      }
    })
  }
})
