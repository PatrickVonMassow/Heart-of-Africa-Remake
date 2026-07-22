// Panorama backdrop geometry (design.md §2.5, CLAUDE.md §7.1 pt. 15): the
// annulus heightfield formula and the panorama-wildlife standing height.
// Guards the user-reported artifact where silhouettes standing on the sunken
// inner plain (y ≈ -2) were horizon-clipped by the settlement's ground disc
// to flat black back-slivers "lying on the sand".
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  backdropBase,
  backdropHeightAt,
  backdropTaper,
  panoramaGroundY,
  BACKDROP_DISC_OVERLAP,
  BACKDROP_MAX_SLOPE,
  BACKDROP_OUTER,
  BACKDROP_RINGS,
  BACKDROP_SEGS,
} from './backdrop'
import { createBackdropMaterial } from './backdropMaterial'
import { placeById } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { setupGeodata } from '../../test/geodata'

const SEED = 42

beforeAll(async () => {
  await setupGeodata()
})

/** Mirror of the PlaceScene wiring: inner radius = layout radius + 12. */
function placeParams(placeId: string, layoutRadius: number) {
  const p = placeById(placeId)
  const centerH = sampleTerrain(p.lat, p.lon, SEED).height
  return { lat: p.lat, lon: p.lon, centerH, r0: layoutRadius + 12 }
}

describe('backdrop heightfield (design.md §2.5)', () => {
  it('tucks the inner rim exactly 2 units below the settlement ground', () => {
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    // At the inner radius the taper is 0, so the rim sits at -2 regardless
    // of the surrounding relief — hidden under the wider ground disc.
    for (const a of [0, 1.2, 2.5, 4.1]) {
      const y = backdropHeightAt(Math.cos(a) * r0, Math.sin(a) * r0, lat, lon, SEED, centerH, r0)
      expect(y).toBeCloseTo(-2, 5)
    }
  })

  it('never exceeds the looming bound anywhere on the annulus', () => {
    const { lat, lon, centerH, r0 } = placeParams('berber-village', 26)
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const r = r0 + (i % 8) * ((BACKDROP_OUTER - r0) / 8)
      const y = backdropHeightAt(Math.cos(a) * r, Math.sin(a) * r, lat, lon, SEED, centerH, r0)
      expect(y).toBeLessThanOrEqual(r * BACKDROP_MAX_SLOPE)
    }
  })

  it('feathers the backdrop base from the tucked rim up to the ground-disc plane (point 236)', () => {
    // The ground disc is flat at y = 0 out to r0 + BACKDROP_DISC_OVERLAP. The
    // backdrop base tucks -2 under it at the inner rim, then feathers UP to 0 by
    // the disc edge and stays flush beyond — so the horizon meets the walkable
    // ground with no step. Pre-236 the base was a flat -2 (a hard notch).
    const { r0 } = placeParams('cairo', 48)
    const discEdge = r0 + BACKDROP_DISC_OVERLAP
    expect(backdropBase(r0, r0)).toBeCloseTo(-2, 10) // tucked rim, hidden under disc
    expect(backdropBase(discEdge, r0)).toBeCloseTo(0, 10) // flush at the disc edge
    expect(backdropBase(discEdge + 30, r0)).toBeCloseTo(0, 10) // and flush everywhere beyond
    // Monotone rise across the overhang — never a dip back into a moat.
    let prev = -Infinity
    for (let i = 0; i <= 10; i++) {
      const r = r0 + (i / 10) * BACKDROP_DISC_OVERLAP
      const b = backdropBase(r, r0)
      expect(b).toBeGreaterThanOrEqual(prev)
      prev = b
    }
  })

  it('leaves no vertical step where the ground-disc edge meets the backdrop (point 236)', () => {
    // At the disc edge the ground plane (y = 0) and the backdrop surface must be
    // continuous: the only remaining offset is the small, continuous local relief,
    // never the pre-236 artificial -2 drop that read as a rectangular notch on the
    // flat delta ports. Sweep the join circle and bound the height step.
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    const discEdge = r0 + BACKDROP_DISC_OVERLAP
    for (const a of [0, 1.2, 2.5, 4.1, 5.7]) {
      const x = Math.cos(a) * discEdge
      const z = Math.sin(a) * discEdge
      const y = backdropHeightAt(x, z, lat, lon, SEED, centerH, r0)
      // No moat: the join stays within a small bound of the ground plane, and
      // nowhere near the -2 notch it replaced.
      expect(Math.abs(y)).toBeLessThan(0.75)
      expect(y).toBeGreaterThan(-0.75)
    }
  })

  it('holds the raised sampling resolution (no stepped ridge silhouette)', () => {
    // User-reported hard polygon facets at Cairo: the visible steps were the
    // silhouette of the coarse 24×160 heightfield. Floors, not exact values —
    // the resolution may rise further but never fall back.
    expect(BACKDROP_RINGS).toBeGreaterThanOrEqual(48)
    expect(BACKDROP_SEGS).toBeGreaterThanOrEqual(320)
  })

  it('keeps the historic inner-rim taper profile independent of the resolution', () => {
    // The taper used to be a function of the 24-ring index (min(1, ri/5));
    // raising the mesh resolution must not squeeze the fade-in band, so it is
    // now a pure radius function pinned against the historic 24-ring profile.
    const { r0 } = placeParams('cairo', 48)
    for (let i = 0; i <= 20; i++) {
      const r = r0 * Math.pow(BACKDROP_OUTER / r0, i / 20)
      const logFrac = Math.log(r / r0) / Math.log(BACKDROP_OUTER / r0)
      const historic = Math.min(1, (23 * logFrac) / 5)
      expect(backdropTaper(r, r0)).toBeCloseTo(historic, 10)
    }
    expect(backdropTaper(r0, r0)).toBe(0)
    expect(backdropTaper(BACKDROP_OUTER, r0)).toBe(1)
  })
})

describe('backdrop material (design.md §2.5 smooth shading)', () => {
  it('shades smooth — never flat per-face facets — and keeps the §2.5 draw state', () => {
    const m = createBackdropMaterial()
    // The Cairo facet report: flatShading would replace the heightfield's
    // interpolated vertex normals with per-face normals.
    expect(m.flatShading).toBe(false)
    // Double-sided so steep far slopes never show as black backface overhangs.
    expect(m.side).toBe(THREE.DoubleSide)
    // Biome vertex colors under the rock shading, with a real normal node.
    expect(m.vertexColors).toBe(true)
    expect(m.colorNode).toBeTruthy()
    expect(m.normalNode).toBeTruthy()
  })
})

describe('panorama-wildlife standing height (user-reported black slivers)', () => {
  it('clamps a silhouette on the sunken plain to just above the disc plane', () => {
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    // Sweep the wildlife band (r0+14 .. r0+28): wherever the raw backdrop
    // height is below the ground disc, the standing height clamps to 0.02;
    // where the relief genuinely rises it is followed unchanged.
    let clamped = 0
    let followed = 0
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const r = r0 + 14 + (i % 3) * 7
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const raw = backdropHeightAt(x, z, lat, lon, SEED, centerH, r0)
      const y = panoramaGroundY(x, z, lat, lon, SEED, centerH, r0)
      expect(y).toBeGreaterThanOrEqual(0.02)
      if (raw < 0.02) {
        expect(y).toBe(0.02)
        clamped++
      } else {
        expect(y).toBe(raw)
        followed++
      }
    }
    // Cairo's flat delta surroundings must exercise the clamp; its dunes the
    // relief-following branch — both paths are real, not vacuous.
    expect(clamped).toBeGreaterThan(0)
    expect(followed).toBeGreaterThan(0)
  })
})
