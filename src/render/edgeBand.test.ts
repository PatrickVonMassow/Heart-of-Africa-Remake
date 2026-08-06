// The settlement edge painted on the ground (design.md §2.6, work-order
// 352/488). The one thing this feature must do is TELL THE TRUTH, so the tests
// below are about honesty first and looks second: the band is measured against
// the leave check itself — bisected, not read off a constant — for every place
// in the roster, and the wander is pinned inside the tolerance that keeps the
// true boundary within the visible give-way.

import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three/webgpu'
import { PLACES, PLACE_KINDS } from '../world/geo'
import { buildLayout } from '../scenes/place/layout'
import { buildBoundaryLut, isOutsidePlace, placeBoundaryRadius, BOUNDARY_LUT_SIZE } from '../scenes/place/boundary'
import { REGION_PLACE_STYLES } from '../scenes/place/regionStyles'
import { seasonTintCpu } from './seasonTint'
import { balance } from '../config/balance'
import {
  EDGE_BAND_MAX_WANDER_M,
  SWEPT_GROUND_BY_KIND,
  clampWander,
  clearEdgeBand,
  edgeBandBounds,
  edgeBandState,
  edgeOpenness,
  setEdgeBandBoundary,
  setEdgeBandLook,
  sweptGroundColor,
} from './edgeBand'

const SEED = 4711

/** The radius at which the LEAVE CHECK flips, found by bisection — never read
 *  off a constant, so a band that quietly grew its own radius would fail. */
function leaveRadiusAt(layout: { radius: number }, angle: number): number {
  const outside = (r: number) => isOutsidePlace(layout, Math.cos(angle) * r, Math.sin(angle) * r)
  let lo = 0
  let hi = 1000
  expect(outside(hi)).toBe(true)
  expect(outside(lo)).toBe(false)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (outside(mid)) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

const ANGLES = Array.from({ length: 32 }, (_, i) => (i / 32) * Math.PI * 2)

beforeEach(() => {
  clearEdgeBand()
})

describe('the band sits where the leave check flips (design.md §2.6 "it must not lie")', () => {
  it('matches the bisected leave radius at every angle, for every place in the roster', () => {
    for (const place of PLACES) {
      const layout = buildLayout(place.id, SEED)
      const lut = buildBoundaryLut(layout)
      setEdgeBandBoundary(lut)
      const band = edgeBandState()
      let step = 0
      for (let j = 0; j < lut.length; j++) {
        step = Math.max(step, Math.abs(lut[(j + 1) % lut.length] - lut[j]))
      }
      for (const angle of ANGLES) {
        const truth = leaveRadiusAt(layout, angle)
        // Byte-quantised lookup read at its NEAREST texel, so two errors bound
        // it and both are derived from the boundary itself rather than guessed:
        // the byte step, and — once the boundary varies with the angle at all
        // (work-order 482's bank lobe) — how far it can move between two
        // neighbouring texels. Both are 0 while the boundary is a circle, so
        // this stays exactly as strict as it was for every other place.
        const tol = 1e-6 + band.span / 255 + step
        expect(Math.abs(band.radiusAt(angle) - truth), `${place.id} @ ${angle.toFixed(2)}`).toBeLessThanOrEqual(tol)
      }
    }
  })

  it('follows when the boundary moves — no second constant anywhere', () => {
    const layout = buildLayout('cairo', SEED)
    for (const delta of [-9, 0, 7, 31]) {
      const moved = { ...layout, radius: layout.radius + delta }
      setEdgeBandBoundary(buildBoundaryLut(moved))
      const band = edgeBandState()
      expect(band.radiusAt(0)).toBeCloseTo(leaveRadiusAt(moved, 0), 5)
      expect(band.radiusAt(2.4)).toBeCloseTo(leaveRadiusAt(moved, 2.4), 5)
    }
  })

  it('samples the boundary per angle, so a non-circular boundary needs no band edit', () => {
    // A boundary that is NOT a plain circle (work-order 482): the lookup is fed
    // straight from it and reproduces it, bulge and all.
    const lut = new Float32Array(BOUNDARY_LUT_SIZE)
    const radiusAt = (a: number) => 28 + 6 * Math.max(0, Math.cos(a - 1))
    for (let j = 0; j < lut.length; j++) lut[j] = radiusAt(((j + 0.5) / lut.length) * Math.PI * 2)
    setEdgeBandBoundary(lut)
    const band = edgeBandState()
    expect(band.span).toBeCloseTo(6, 2)
    for (const angle of ANGLES) {
      expect(Math.abs(band.radiusAt(angle) - radiusAt(angle))).toBeLessThan(0.2)
    }
  })

  it('a place kind never changes the boundary the band reads', () => {
    for (const kind of PLACE_KINDS) {
      const place = PLACES.find((p) => p.kind === kind)
      expect(place, `no place of kind ${kind}`).toBeDefined()
      const layout = buildLayout(place!.id, SEED)
      setEdgeBandBoundary(buildBoundaryLut(layout))
      setEdgeBandLook(kind, balance.placeEdgeBand)
      expect(edgeBandState().radiusAt(1.1)).toBeCloseTo(placeBoundaryRadius(layout, 1.1), 5)
    }
  })
})

describe('the wander stays inside its tolerance (it may look natural, it may not mislead)', () => {
  it('caps whatever the debug menu sets — hard limit and band-relative limit', () => {
    expect(clampWander(99)).toBe(EDGE_BAND_MAX_WANDER_M)
    expect(clampWander(-5)).toBe(0)
    // Never more than 45 % of the width, so a narrow band cannot be shifted off
    // the line it stands for.
    expect(clampWander(99, 1)).toBeCloseTo(0.45, 6)
    expect(clampWander(0.4, 1)).toBeCloseTo(0.4, 6)
    for (const width of [0.2, 1, 3, 12]) {
      for (const wander of [-1, 0, 0.5, 3, 50]) {
        const w = clampWander(wander, width)
        expect(w).toBeGreaterThanOrEqual(0)
        expect(w).toBeLessThanOrEqual(EDGE_BAND_MAX_WANDER_M)
        expect(w).toBeLessThan(Math.max(0.05, width) / 2)
      }
    }
  })

  it('the true boundary always lies inside the visible give-way, at every warp offset', () => {
    const radius = 28
    for (const width of [0.5, 3, 8]) {
      const wander = clampWander(99, width) // worst case the config can reach
      // Sampled as the shader's clamped noise does: the offset never leaves
      // [-wander, +wander].
      for (let i = 0; i <= 20; i++) {
        const warp = -wander + (2 * wander * i) / 20
        const at = edgeOpenness(radius, width, radius, warp)
        expect(at).toBeGreaterThan(0)
        expect(at).toBeLessThan(1)
      }
      const bounds = edgeBandBounds(radius, width, 99)
      expect(bounds.inner).toBeGreaterThan(radius - width / 2 - EDGE_BAND_MAX_WANDER_M - 1e-9)
      expect(bounds.outer).toBeLessThan(radius + width / 2 + EDGE_BAND_MAX_WANDER_M + 1e-9)
      // Fully swept well inside, fully open well outside — whatever the warp.
      expect(edgeOpenness(radius, width, bounds.inner - 0.01, wander)).toBe(0)
      expect(edgeOpenness(radius, width, bounds.outer + 0.01, -wander)).toBe(1)
    }
  })

  it('the shipped calibration keeps the band a give-way, not a stripe', () => {
    expect(balance.placeEdgeBand.widthM).toBeGreaterThan(1)
    expect(balance.placeEdgeBand.widthM).toBeLessThanOrEqual(6)
    expect(clampWander(balance.placeEdgeBand.wanderM, balance.placeEdgeBand.widthM))
      .toBeCloseTo(balance.placeEdgeBand.wanderM, 6)
    expect(balance.placeEdgeBand.wanderM).toBeGreaterThan(0)
  })

  it('the ramp is monotone: further out never reads MORE swept', () => {
    let last = -1
    for (let d = 20; d <= 36; d += 0.25) {
      const open = edgeOpenness(28, 3, d)
      expect(open).toBeGreaterThanOrEqual(last)
      last = open
    }
    expect(edgeOpenness(28, 3, 28)).toBeCloseTo(0.5, 6)
  })
})

describe('every place kind decides about its edge (PLACE_KINDS totality, point 335)', () => {
  it('the swept-ground look covers exactly the place kinds', () => {
    expect(Object.keys(SWEPT_GROUND_BY_KIND).sort()).toEqual([...PLACE_KINDS].sort())
  })

  it('every kind gets a readable, bounded look on all three terms', () => {
    for (const kind of PLACE_KINDS) {
      const look = SWEPT_GROUND_BY_KIND[kind]
      for (const [term, v] of Object.entries(look)) {
        expect(v, `${kind}.${term}`).toBeGreaterThan(0.05)
        expect(v, `${kind}.${term}`).toBeLessThanOrEqual(1)
      }
      setEdgeBandLook(kind, balance.placeEdgeBand)
      const state = edgeBandState()
      expect(state.tone).toBeCloseTo(look.tone * balance.placeEdgeBand.strength, 6)
      expect(state.relief).toBeCloseTo(look.relief * balance.placeEdgeBand.strength, 6)
      expect(state.mottle).toBeCloseTo(look.mottle * balance.placeEdgeBand.strength, 6)
    }
  })

  it('the master strength scales the whole edge and 0 switches it off', () => {
    setEdgeBandLook('village', { widthM: 3, wanderM: 0.9, strength: 0 })
    const off = edgeBandState()
    expect(off.tone + off.relief + off.mottle).toBe(0)
    setEdgeBandLook('village', { widthM: 3, wanderM: 0.9, strength: 0.5 })
    expect(edgeBandState().tone).toBeCloseTo(SWEPT_GROUND_BY_KIND.village.tone * 0.5, 6)
  })
})

describe('the edge stays readable at BOTH ends of the year (design.md §19.13)', () => {
  const linear = (hex: string): [number, number, number] => {
    const c = new THREE.Color(hex)
    return [c.r, c.g, c.b]
  }
  const luma = (c: [number, number, number]) => c[0] * 0.35 + c[1] * 0.5 + c[2] * 0.15

  it('the swept/open contrast is the SAME ratio in the dry straw as in the rains', () => {
    for (const style of Object.values(REGION_PLACE_STYLES)) {
      for (const kind of PLACE_KINDS) {
        const look = SWEPT_GROUND_BY_KIND[kind]
        const ratios = [0, 0.25, 0.5, 0.75, 1].map((tint) => {
          const tinted = seasonTintCpu(linear(style.ground[0]), tint)
          const inside = sweptGroundColor(tinted, 1, look)
          const outside = sweptGroundColor(tinted, 0, look)
          expect(luma(outside)).toBeGreaterThan(0)
          return luma(inside) / luma(outside)
        })
        for (const r of ratios) {
          expect(r).toBeCloseTo(ratios[0], 6)
          // A readable step: at least 10 % of the ground's own brightness.
          expect(1 - r).toBeGreaterThan(0.1)
        }
      }
    }
  })

  it('the tone step is multiplicative, so it cannot bleach away on a pale ground', () => {
    const look = SWEPT_GROUND_BY_KIND.village
    for (const base of [0.02, 0.2, 0.9] as const) {
      const c: [number, number, number] = [base, base, base]
      const inside = sweptGroundColor(c, 1, look)
      expect(inside[0] / c[0]).toBeCloseTo(1 - look.tone, 6)
    }
  })
})
