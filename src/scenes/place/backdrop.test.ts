// Panorama backdrop geometry (design.md §2.5, CLAUDE.md §7.1 pt. 15/31): the
// annulus heightfield formula and the panorama-wildlife standing height.
// Guards both reported artifacts at the settlement horizon — silhouettes on the
// sunken inner plain horizon-clipped by the ground disc to flat black
// back-slivers "lying on the sand", and (point 181) silhouettes anchored to the
// horizon at infinity with nothing at all under their feet.
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  backdropBase,
  backdropHeightAt,
  backdropRingRadius,
  backdropSurfaceY,
  backdropTaper,
  discHorizonY,
  panoramaStandY,
  groundDiscSegments,
  BACKDROP_DISC_OVERLAP,
  BACKDROP_INNER_OFFSET,
  BACKDROP_MAX_SLOPE,
  BACKDROP_OUTER,
  BACKDROP_RINGS,
  BACKDROP_SEGS,
  GROUND_DISC_OVERHANG,
  PANORAMA_RADIUS,
} from './backdrop'
import { bandHeightAt } from '../travel/panoramaMath'
import { balance } from '../../config/balance'
import { pitchLimit } from '../../systems/lookPitch'
import { createBackdropMaterial } from './backdropMaterial'
import { GIZA_SITE_RADIUS } from './gizaSite'
import { PLACE_RADIUS } from './layout'
import { PLACES, placeById } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { setupGeodata } from '../../test/geodata'

const SEED = 42

/** The widest disc the game mounts: the open-plain Giza site (point 390). The
 *  point-381 seam rules are swept at it like every other radius. */
const GIZA_DISC_EDGE = GIZA_SITE_RADIUS + GROUND_DISC_OVERHANG

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

  it('leaves no moat or looming wall where the ground-disc edge meets the backdrop (point 236)', () => {
    // At the disc edge the ground plane (y = 0) and the backdrop surface must be
    // continuous: no sunken moat (the pre-236 artificial -2 drop that read as a
    // rectangular notch on the flat delta ports) and no looming wall. What sits
    // ON the join is the real surrounding relief — Cairo abuts the Giza/Mokattam
    // desert plateau — so the positive side allows the genuine ~1-unit rise the
    // plateau makes here. (Point 281: the former symmetric 0.75 cap reflected a
    // spurious river carve that never faded far from the channel and
    // OVER-DEPRESSED the near-Nile-band terrain; correcting it restores the true
    // relief. The moat guard below is unchanged.)
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    const discEdge = r0 + BACKDROP_DISC_OVERLAP
    for (const a of [0, 1.2, 2.5, 4.1, 5.7]) {
      const x = Math.cos(a) * discEdge
      const z = Math.sin(a) * discEdge
      const y = backdropHeightAt(x, z, lat, lon, SEED, centerH, r0)
      expect(y).toBeGreaterThan(-0.75) // no moat
      expect(y).toBeLessThan(1.2) // no looming wall (structural cap here is ~1.73)
    }
  })

  it('reads as a smooth ridge, not a staircase, across the escarpment (point 281)', () => {
    // The reported Cairo artifact: a row of hard rectangular steps along the
    // backdrop ridge. It was NOT the mesh resolution (the crest is captured at
    // 48 rings) but two heightfield step discontinuities the carve band carried
    // into the settlement backdrop: the wide-Nile river-bed-profile carve, whose
    // strength was frozen by the range-1 riverDistance cap and stepped where the
    // bed-profile lookup dropped out, and the hard elevation<400 coast-ramp
    // switch. Both are fixed at the SAMPLING (riverProfile.ts / terrain.ts).
    //
    // A smooth C1 heightfield's largest per-step change scales DOWN with finer
    // azimuth sampling (≈¼ for 4× samples); a quantised staircase's fixed jump
    // (~4.6 units at the carve boundary, ~1 unit at the 400 m notch) does not.
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    const azSweep = (R: number, N: number) => {
      const h: number[] = []
      for (let si = 0; si < N; si++) {
        const a = (si / N) * Math.PI * 2
        h.push(backdropHeightAt(Math.cos(a) * R, Math.sin(a) * R, lat, lon, SEED, centerH, r0))
      }
      return h
    }
    const maxFirst = (h: number[]) => {
      let m = 0
      for (let i = 1; i < h.length; i++) m = Math.max(m, Math.abs(h[i] - h[i - 1]))
      return m
    }
    const maxSecond = (h: number[]) => {
      let m = 0
      for (let i = 2; i < h.length; i++) m = Math.max(m, Math.abs(h[i] - 2 * h[i - 1] + h[i - 2]))
      return m
    }
    // The Cairo escarpment radii where the wide-Nile carve band and the 400 m
    // coast-ramp threshold sit — the steep profile the steps rode.
    for (const R of [70, 80, 90]) {
      const coarse = maxFirst(azSweep(R, 720))
      const fine = azSweep(R, 2880)
      // Refining 4× cuts the max step to well under half — a staircase would
      // hold it (its step is a fixed discontinuity, not a sampled slope).
      expect(maxFirst(fine)).toBeLessThan(coarse * 0.5)
      // The second difference stays bounded: no isolated flat-then-jump left.
      expect(maxSecond(fine)).toBeLessThan(0.2)
    }
  })

  it('closes the horizon for every disc radius, camera height and relief profile (point 381)', () => {
    // The reported tear: past the ground disc there was NO ground at all — the
    // disc's own rim was the last thing drawn, and above it the captured band's
    // low rows and the sky behind them.
    //
    // The condition, stated without any site: a point outside the disc is drawn
    // ground only while it sits at or above the eye's grazing line over the disc
    // edge. That line is SHALLOWEST for the camera standing at the OPPOSITE rim
    // (the sight ray then leaves the disc a whole diameter away), so the worst
    // case over every reachable standpoint is the line from there — and it is
    // the one the surface must clear.
    const RELIEFS = [
      ['flat desert', () => 0],
      ['sunken plain (the reported Giza case)', () => -8],
      ['deep sea', () => -40],
      ['plateau over a valley', (r: number) => (r < 120 ? -12 : 4)],
      ['ridge', (r: number) => Math.sin(r / 40) * 30],
      ['mountain range', (r: number) => Math.max(-20, r * 0.5 - 60)],
    ] as const
    const openings: string[] = []
    for (const discRadius of [28, 40, 48, 60, 74, 96, GIZA_DISC_EDGE]) {
      const r0 = discRadius - BACKDROP_DISC_OVERLAP
      const discEdge = discRadius
      for (const eye of [1.2, 1.5, 1.9]) {
        for (const [label, relief] of RELIEFS) {
          for (let i = 0; i <= 200; i++) {
            const r = discEdge + (i / 200) * (BACKDROP_OUTER - discEdge)
            const y = backdropSurfaceY(r, r0, relief(r))
            // Worst reachable standpoint: the opposite rim, looking across.
            const line = discHorizonY(r, 0, -discEdge, 0, eye, discEdge)
            if (y < line) openings.push(`${label} disc=${discRadius} eye=${eye} r=${r.toFixed(1)} y=${y.toFixed(2)} < line=${line.toFixed(2)}`)
          }
        }
      }
    }
    expect(openings).toEqual([])
  })

  it('never lets the first visible band row sit above the disc edge (point 381)', () => {
    // The other half of the seam: the rim must stay UNDER the ground disc, and
    // the first row that emerges past its edge must not stand proud of the
    // plane the player walks on — a lit top with an unlit face is what an open
    // rim looks like from inside.
    for (const discRadius of [28, 42, 62, 74, GIZA_DISC_EDGE]) {
      const r0 = discRadius - BACKDROP_DISC_OVERLAP
      for (const relief of [-30, -5, 0, 3, 40]) {
        // Hidden under the disc: strictly below its plane all the way to the edge.
        for (let i = 0; i < 10; i++) {
          const r = r0 + (i / 10) * BACKDROP_DISC_OVERLAP
          expect(backdropSurfaceY(r, r0, relief)).toBeLessThan(0)
        }
        // At the edge itself: exactly flush, whatever the surroundings do.
        expect(backdropSurfaceY(discRadius, r0, relief)).toBeGreaterThanOrEqual(0)
        expect(backdropSurfaceY(discRadius, r0, Math.min(relief, 0))).toBeCloseTo(0, 10)
      }
    }
  })

  it('pins a mesh ring on the ground-disc edge so the join is not interpolated (point 381)', () => {
    for (const r0 of [40, 54, 72, GIZA_DISC_EDGE - BACKDROP_DISC_OVERLAP]) {
      const edge = r0 + BACKDROP_DISC_OVERLAP
      expect(backdropRingRadius(0, r0)).toBe(r0)
      expect(backdropRingRadius(1, r0)).toBe(edge)
      expect(backdropRingRadius(BACKDROP_RINGS - 1, r0)).toBeCloseTo(BACKDROP_OUTER, 6)
      // Strictly increasing, so the annulus never folds back on itself.
      for (let ri = 1; ri < BACKDROP_RINGS; ri++) {
        expect(backdropRingRadius(ri, r0)).toBeGreaterThan(backdropRingRadius(ri - 1, r0))
      }
      // The drawn surface at the edge ring IS the disc plane — not the third of
      // a unit below it that the unpinned ladder interpolated into the join.
      expect(backdropSurfaceY(backdropRingRadius(1, r0), r0, -20)).toBeCloseTo(0, 10)
    }
  })

  it('clamps the fall at the disc plane while leaving the rise untouched (point 381)', () => {
    const r0 = 72
    for (let i = 0; i <= 40; i++) {
      const r = r0 + BACKDROP_DISC_OVERLAP + (i / 40) * (BACKDROP_OUTER - r0)
      // A surround BELOW the place centre reads as its plane, never as a pit.
      expect(backdropSurfaceY(r, r0, -25)).toBe(backdropSurfaceY(r, r0, 0))
      // A surround ABOVE it keeps its relief, still under the looming cap.
      expect(backdropSurfaceY(r, r0, 12)).toBeGreaterThan(backdropSurfaceY(r, r0, 0))
      expect(backdropSurfaceY(r, r0, 4000)).toBeCloseTo(r * BACKDROP_MAX_SLOPE * backdropTaper(r, r0), 6)
    }
  })

  it('closes the horizon at every real place on the map (point 381)', () => {
    // The same rule against the REAL terrain, all round every enterable place:
    // before the fix the sight line escaped in 48/320 azimuths from Giza's
    // centre and in 3–241/320 from the far rim at EVERY one of them.
    const EYE = 1.5
    for (const place of PLACES) {
      const radius =
        place.kind === 'port' ? 30 + (place.size ?? 1) * 6 : place.kind === 'monument' ? GIZA_SITE_RADIUS : PLACE_RADIUS
      const r0 = radius + BACKDROP_INNER_OFFSET
      const discEdge = r0 + BACKDROP_DISC_OVERLAP
      const centerH = sampleTerrain(place.lat, place.lon, SEED).height
      let open = 0
      for (let si = 0; si < 64; si++) {
        const a = (si / 64) * Math.PI * 2
        let closed = false
        for (let i = 0; i <= 24; i++) {
          const r = discEdge * Math.pow(BACKDROP_OUTER / discEdge, i / 24)
          const x = Math.cos(a) * r
          const z = Math.sin(a) * r
          const y = backdropHeightAt(x, z, place.lat, place.lon, SEED, centerH, r0)
          // Worst reachable standpoint again: the rim opposite this azimuth.
          if (y >= discHorizonY(x, z, -Math.cos(a) * discEdge, -Math.sin(a) * discEdge, EYE, discEdge)) {
            closed = true
            break
          }
        }
        if (!closed) open++
      }
      expect({ place: place.id, open }).toEqual({ place: place.id, open: 0 })
    }
  })

  it('keeps the ground line curved however wide the disc gets (point 390)', () => {
    // The disc's chord must not grow with the disc: the widened Giza plate puts
    // the player 14 m from an edge that a fixed 192-gon would have coarsened
    // from 2.4 m to 3.7 m chords — the straight ground line of point 381.
    const chord = (edge: number) => (2 * Math.PI * edge) / groundDiscSegments(edge)
    const reference = chord(74)
    for (const edge of [42, 60, 74, 96, GIZA_DISC_EDGE, 300]) {
      expect(chord(edge)).toBeLessThanOrEqual(reference + 1e-9)
    }
    // Small discs keep the historic count exactly — nothing else changes shape.
    expect(groundDiscSegments(42)).toBe(192)
    expect(groundDiscSegments(74)).toBe(192)
    expect(groundDiscSegments(GIZA_DISC_EDGE)).toBeGreaterThan(192)
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
    const { material: m } = createBackdropMaterial(3)
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

  it('carries the bank frame the panorama measures its water in (work-order 525)', () => {
    const handle = createBackdropMaterial(3)
    // The frame is a UNIFORM, so walking into another settlement moves the
    // panorama's water field without re-linking the shader.
    expect(handle.flow.value).toBeInstanceOf(THREE.Vector4)
    expect(typeof handle.waterline.value).toBe('number')
    handle.flow.value.set(0.6, -0.8, 0.8, 0.6)
    handle.waterline.value = 36
    expect(handle.flow.value.x).toBeCloseTo(0.6, 10)
    expect(handle.waterline.value).toBe(36)
    // Water is shaded, not rocked: the mask drives roughness and metalness too,
    // so a river in the panorama can never read as a rough rock face.
    expect(handle.material.roughnessNode).toBeTruthy()
    expect(handle.material.metalnessNode).toBeTruthy()
  })
})

describe('panorama-wildlife standing height (design.md §2.5, point 181)', () => {
  const EYE = 1.5

  it('puts the ground line exactly on the sight line over the disc edge', () => {
    const discR = 62
    // From the centre, a point twice the disc radius out lies one eye height
    // below the plate — the straight continuation of the grazing sight line.
    expect(discHorizonY(discR * 2, 0, 0, 0, EYE, discR)).toBeCloseTo(-EYE, 6)
    expect(discHorizonY(0, discR * 3, 0, 0, EYE, discR)).toBeCloseTo(-2 * EYE, 6)
    // On the edge itself the line is the disc plane, and inside it is above.
    expect(discHorizonY(discR, 0, 0, 0, EYE, discR)).toBeCloseTo(0, 6)
    expect(discHorizonY(discR / 2, 0, 0, 0, EYE, discR)).toBeCloseTo(EYE / 2, 6)
  })

  it('drops the ground line as the viewer walks toward the silhouette', () => {
    const discR = 62
    const far = discHorizonY(130, 0, 0, 0, EYE, discR)
    const nearer = discHorizonY(130, 0, 40, 0, EYE, discR)
    const nearest = discHorizonY(130, 0, 55, 0, EYE, discR)
    // The disc edge is CLOSE from the town's rim, so its horizon falls away
    // much faster there — a fixed anchor cannot serve both viewpoints.
    expect(nearer).toBeLessThan(far)
    expect(nearest).toBeLessThan(nearer)
  })

  it('stands a silhouette on drawn ground all round Cairo, never on the horizon constant', () => {
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    // What the anchor used to be: the band's horizon at infinity.
    const OLD_ANCHOR = EYE - 0.4
    let onLine = 0
    let onRelief = 0
    let floated = 0
    let buried = 0
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const r = r0 + 14 + (i % 3) * 7
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const raw = backdropHeightAt(x, z, lat, lon, SEED, centerH, r0)
      const line = discHorizonY(x, z, 0, 0, EYE, r0 + BACKDROP_DISC_OVERLAP)
      const y = panoramaStandY(x, z, lat, lon, SEED, centerH, r0, 0, 0, EYE)
      // Never below the drawn ground line (no horizon-clipped black sliver)
      // and never above the relief it stands on plus that line.
      expect(y).toBe(Math.max(raw, line))
      expect(y).toBeGreaterThanOrEqual(line)
      if (y === line) onLine++
      else onRelief++
      // The regression witnesses: the old constant anchor stood ABOVE the
      // last drawn surface over the sunken plain (feet on nothing — the
      // float) and BELOW the relief where the ground rises (buried inside a
      // dune). It was never ON the drawn ground.
      if (OLD_ANCHOR > y) floated++
      if (OLD_ANCHOR < y) buried++
    }
    // Point 181's max() is KEPT as the safety net, but since point 381 closed
    // the seam it no longer has to fire: the drawn surface itself clears the
    // sight line all round, so every silhouette stands on relief. A ground-line
    // anchor reappearing here would mean the horizon has torn open again.
    expect(onLine).toBe(0)
    expect(onRelief).toBeGreaterThan(0)
    expect(floated).toBeGreaterThan(0)
    expect(buried).toBeGreaterThan(0)
  })

  it('follows a rising dune instead of burying the silhouette inside it', () => {
    const { lat, lon, centerH, r0 } = placeParams('cairo', 48)
    let checked = 0
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2
      const r = r0 + 20
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const raw = backdropHeightAt(x, z, lat, lon, SEED, centerH, r0)
      if (raw <= 0.5) continue
      const y = panoramaStandY(x, z, lat, lon, SEED, centerH, r0, 0, 0, EYE)
      expect(y).toBe(raw) // ON the dune, not sunk into it
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})

// --- Vertical look (design.md §17.5, point 392) -------------------------------
// The seam rules above are swept over disc radii, eye heights and reliefs at a
// camera that only ever looked at the horizon. With a pitching camera the same
// surfaces are asked a new question: what does the frame draw ALONG the view
// ray? Looking down it must be the walkable ground (no hole between one's feet
// and the horizon); looking up it must be the band and then sky, never a wall
// of backdrop terrain arcing over the camera.

const PITCH_EYE = 1.5
/** Height of the §2.5 panorama band cylinder, centred on the eye height. */
const BAND_H = bandHeightAt(PANORAMA_RADIUS)

/**
 * The first thing the frame draws along the view ray: the walkable ground disc,
 * the geometry backdrop past its edge, or the panorama band at the horizon.
 * `null` means the ray reached the band without meeting any of them — a hole,
 * or (above the band) the sky.
 */
function firstSurfaceHit(
  camX: number,
  camZ: number,
  ux: number,
  uz: number,
  pitch: number,
  discEdge: number,
  surfaceAt: (x: number, z: number, r: number) => number,
): { surface: 'disc' | 'backdrop' | 'band' | null; distance: number } {
  const slope = Math.tan(pitch)
  for (let d = 0.25; d <= PANORAMA_RADIUS * 2; d += 0.5) {
    const x = camX + ux * d
    const z = camZ + uz * d
    const r = Math.hypot(x, z)
    const y = PITCH_EYE + d * slope
    if (r >= PANORAMA_RADIUS) {
      // The band draws the real captured horizon over its own height.
      return { surface: Math.abs(y - PITCH_EYE) <= BAND_H / 2 ? 'band' : null, distance: d }
    }
    if (r <= discEdge) {
      if (y <= 0) return { surface: 'disc', distance: d }
    } else if (y <= surfaceAt(x, z, r)) {
      return { surface: 'backdrop', distance: d }
    }
  }
  return { surface: null, distance: Infinity }
}

describe('vertical look over the settlement horizon (design.md §17.5, point 392)', () => {
  const LIMIT = pitchLimit(balance.lookPitchLimitDeg)
  /** Fractions of the down-clamp swept: from a hair below the horizon (where
   *  the far horizon still answers) down to the clamp itself. */
  const DOWN_FRACTIONS = [0.002, 0.01, 0.05, ...Array.from({ length: 24 }, (_, i) => (i + 1) / 24)]
  const RELIEFS = [
    ['flat desert', () => 0],
    ['sunken plain (the reported Giza case)', () => -8],
    ['deep sea', () => -40],
    ['plateau over a valley', (r: number) => (r < 120 ? -12 : 4)],
    ['mountain range', (r: number) => Math.max(-20, r * 0.5 - 60)],
  ] as const

  /** The backdrop surface for a synthetic radial relief profile. */
  const syntheticSurface =
    (r0: number, relief: (r: number) => number) => (_x: number, _z: number, r: number) =>
      backdropSurfaceY(r, r0, relief(r))

  it('draws a surface under EVERY downward ray — no hole between the feet and the horizon', () => {
    const holes: string[] = []
    const seen = new Set<string>()
    for (const discEdge of [28, 48, 74, GIZA_DISC_EDGE]) {
      const r0 = discEdge - BACKDROP_DISC_OVERLAP
      for (const [label, relief] of RELIEFS) {
        const surfaceAt = syntheticSurface(r0, relief)
        // Standpoints from the centre out to the last step the player may take.
        for (const camDist of [0, discEdge * 0.5, discEdge - GROUND_DISC_OVERHANG]) {
          for (let ai = 0; ai < 8; ai++) {
            const a = (ai / 8) * Math.PI * 2
            const ux = Math.cos(a)
            const uz = Math.sin(a)
            for (const frac of DOWN_FRACTIONS) {
              // The whole reachable downward range, from a hair below the
              // horizon to the clamp — the player can hold any of them.
              const pitch = -frac * LIMIT
              const hit = firstSurfaceHit(camDist, 0, ux, uz, pitch, discEdge, surfaceAt)
              if (!hit.surface) {
                holes.push(
                  `${label} disc=${discEdge} cam=${camDist.toFixed(0)} az=${ai} pitch=${((pitch * 180) / Math.PI).toFixed(1)}`,
                )
              } else seen.add(hit.surface)
            }
          }
        }
      }
    }
    expect(holes).toEqual([])
    // Not vacuous: the sweep really crosses the seam — the plate near the feet,
    // the backdrop past its edge and the band at the horizon all answer rays.
    expect([...seen].sort()).toEqual(['backdrop', 'band', 'disc'])
  })

  it('shows the walkable ground itself as soon as the look drops past the disc edge', () => {
    // The seam question in the pitch's own terms: a ray steeper than the
    // grazing line over the disc edge must land ON the plate — inside its own
    // edge, at a distance the player reads as ground at his feet. A hole there
    // is exactly what point 381 reported, seen by looking down instead of out.
    for (const discEdge of [28, 48, 74, GIZA_DISC_EDGE]) {
      const r0 = discEdge - BACKDROP_DISC_OVERLAP
      for (const [, relief] of RELIEFS) {
        const surfaceAt = syntheticSurface(r0, relief)
        for (const camDist of [0, discEdge * 0.6]) {
          const toEdge = discEdge - camDist // straight out from the centre
          const grazing = -Math.atan(PITCH_EYE / toEdge)
          for (const pitch of [grazing * 1.02, grazing * 1.5, grazing * 4, -LIMIT]) {
            const hit = firstSurfaceHit(camDist, 0, 1, 0, pitch, discEdge, surfaceAt)
            // The plate, or the backdrop's flush first row right past its edge
            // (the two meet AT the edge since point 381) — never the far
            // horizon and never nothing.
            const near = hit.surface === 'disc' || hit.surface === 'backdrop'
            expect({ discEdge, camDist, near }).toEqual({ discEdge, camDist, near: true })
            expect(hit.distance).toBeLessThanOrEqual(toEdge + 1)
          }
        }
      }
    }
  })

  it('meets the band and then sky looking UP — never a backdrop wall over the camera', () => {
    // The backdrop is capped at BACKDROP_MAX_SLOPE of its own distance, so it
    // stays a distant range. Measured from every reachable standpoint: the
    // highest elevation at which any backdrop surface is seen must stay far
    // below the up clamp, or a pitched-up camera would look into terrain.
    let highestBackdropDeg = -90
    for (const discEdge of [28, 48, 74, GIZA_DISC_EDGE]) {
      const r0 = discEdge - BACKDROP_DISC_OVERLAP
      for (const [, relief] of RELIEFS) {
        const surfaceAt = syntheticSurface(r0, relief)
        for (const camDist of [0, discEdge - GROUND_DISC_OVERHANG]) {
          for (const ux of [1, -1]) {
            for (let pi = 0; pi <= 24; pi++) {
              const pitch = (pi / 24) * LIMIT
              const hit = firstSurfaceHit(camDist, 0, ux, 0, pitch, discEdge, surfaceAt)
              if (hit.surface === 'backdrop') highestBackdropDeg = Math.max(highestBackdropDeg, (pitch * 180) / Math.PI)
              // Below the band's own top the picture is never empty: band,
              // backdrop or ground — a gap there would read as a torn horizon.
              // The band's rim elevation from the FAR side of the ring — the
              // conservative bound, since the ray may cross either side.
              const bandTop = Math.atan(BAND_H / 2 / (PANORAMA_RADIUS + camDist))
              if (pitch < bandTop * 0.9) expect(hit.surface).not.toBeNull()
            }
          }
        }
      }
    }
    // A mountain range may stand at the horizon, but never overhead: the cap is
    // atan(BACKDROP_MAX_SLOPE), and the up clamp is far above it.
    expect(highestBackdropDeg).toBeLessThan((Math.atan(BACKDROP_MAX_SLOPE) * 180) / Math.PI + 1)
    expect(highestBackdropDeg).toBeLessThan((LIMIT * 180) / Math.PI - 45)
  })

  it('draws ground under the downward look at every real place on the map', () => {
    // The same question against the REAL terrain, all round every enterable
    // place — the pitched counterpart of the point-381 sweep above.
    for (const place of PLACES) {
      const radius =
        place.kind === 'port' ? 30 + (place.size ?? 1) * 6 : place.kind === 'monument' ? GIZA_SITE_RADIUS : PLACE_RADIUS
      const r0 = radius + BACKDROP_INNER_OFFSET
      const discEdge = r0 + BACKDROP_DISC_OVERLAP
      const centerH = sampleTerrain(place.lat, place.lon, SEED).height
      const surfaceAt = (x: number, z: number) => backdropHeightAt(x, z, place.lat, place.lon, SEED, centerH, r0)
      let holes = 0
      for (let ai = 0; ai < 8; ai++) {
        const a = (ai / 8) * Math.PI * 2
        const ux = Math.cos(a)
        const uz = Math.sin(a)
        for (const camDist of [0, radius - 2]) {
          for (const frac of [0.05, 0.2, 0.5, 1]) {
            const hit = firstSurfaceHit(camDist * ux, camDist * uz, ux, uz, -frac * LIMIT, discEdge, surfaceAt)
            if (!hit.surface) holes++
          }
        }
      }
      expect({ place: place.id, holes }).toEqual({ place: place.id, holes: 0 })
    }
  })
})
