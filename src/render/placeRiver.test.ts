// The drawn river of a riverside settlement (work-order 482). What can be
// judged without a browser is judged here: where the geometry puts the ground,
// the shore and the water surface, and — the claim the whole UPSTREAM/DOWNSTREAM
// teaching rests on — that the foam the player watches actually travels
// DOWNSTREAM.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  RIVER_DRIFT_SPAN,
  RIVER_REACH,
  buildBankShoreGeometry,
  buildGroundPlateGeometry,
  buildRiverFlecks,
  buildRiverSurfaceGeometry,
  fleckPosition,
} from './placeRiver'
import { BANK_SHORE_HALF, BANK_WATER_DROP, buildRiverBank, type PlaceRiverBank } from '../scenes/place/riverBank'
import { GROUND_DISC_OVERHANG } from '../scenes/place/backdrop'
import { placeBoundaryRadius } from '../scenes/place/boundary'
import { PLACE_RADIUS } from '../scenes/place/layout'
import { placeById } from '../world/geo'
import { ROCK_VILLAGE_ID } from '../world/communicationRock'

const bank = buildRiverBank(placeById(ROCK_VILLAGE_ID), PLACE_RADIUS) as PlaceRiverBank
const discEdge = PLACE_RADIUS + GROUND_DISC_OVERHANG
const bounds = { radius: PLACE_RADIUS, bank }

/** How far out from the centre a point lies along the bank normal. */
const outward = (x: number, z: number) => x * bank.nx + z * bank.nz
/** How far downstream a point lies along the bank. */
const downstream = (x: number, z: number) => x * bank.fx + z * bank.fz

function vertices(g: { getAttribute: (n: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } }) {
  const p = g.getAttribute('position')
  return Array.from({ length: p.count }, (_, i) => ({ x: p.getX(i), y: p.getY(i), z: p.getZ(i) }))
}

describe('the ground plate is cut at the top of the bank', () => {
  const plate = buildGroundPlateGeometry(bounds, discEdge, 192)

  it('never reaches into the water', () => {
    for (const v of vertices(plate)) {
      expect(outward(v.x, v.z)).toBeLessThanOrEqual(bank.walkEdge + 1e-4)
      expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(discEdge + 1e-4)
      expect(v.y).toBe(0)
    }
  })

  it('still carries every bearing of the walkable boundary', () => {
    // Each rim vertex has to be at least as far out as the boundary there,
    // or the player would walk off the drawn ground.
    for (const v of vertices(plate).slice(1)) {
      const angle = Math.atan2(v.z, v.x)
      expect(Math.hypot(v.x, v.z) + 1e-6).toBeGreaterThanOrEqual(placeBoundaryRadius(bounds, angle))
    }
  })

  it('is the plain disc again where no bank cuts it', () => {
    const plain = buildGroundPlateGeometry({ radius: PLACE_RADIUS }, discEdge, 64)
    for (const v of vertices(plain).slice(1)) {
      // Float32 positions, so within a texel of a metre rather than to the bit.
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(discEdge, 4)
    }
  })
})

describe('the shore carries the ground down into the water', () => {
  const shore = buildBankShoreGeometry(bank, 20)
  const rows = vertices(shore)

  it('starts at the walkable edge, on the ground plane', () => {
    const top = rows.filter((v) => v.y === 0)
    expect(top.length).toBeGreaterThan(0)
    for (const v of top) expect(outward(v.x, v.z)).toBeCloseTo(bank.walkEdge, 4)
  })

  it('drops past the water surface, so the drawn waterline lands ON the waterline', () => {
    // The slope runs from y = 0 at `walkEdge` to y = −2·drop at `walkEdge +
    // 2·shoreHalf`; the water plane sits at −drop, which is exactly half way.
    const foot = rows.filter((v) => Math.abs(v.y + BANK_WATER_DROP * 2) < 1e-6)
    expect(foot.length).toBeGreaterThan(0)
    for (const v of foot) expect(outward(v.x, v.z)).toBeCloseTo(bank.distance + BANK_SHORE_HALF, 4)
    const cross = bank.walkEdge + (BANK_SHORE_HALF * 2) / 2
    expect(cross).toBeCloseTo(bank.distance, 6)
  })

  it('carries a bed on under the water, so the shallows are not a hole', () => {
    const deepest = Math.min(...rows.map((v) => v.y))
    expect(deepest).toBeLessThan(-BANK_WATER_DROP * 2)
    const bed = rows.filter((v) => v.y === deepest)
    for (const v of bed) expect(outward(v.x, v.z)).toBeCloseTo(bank.distance + RIVER_REACH, 4)
  })
})

describe('the water surface', () => {
  const water = buildRiverSurfaceGeometry(bank, 30, 8)

  it('lies one drop below the settlement ground, all of it', () => {
    for (const v of vertices(water)) expect(v.y).toBeCloseTo(-BANK_WATER_DROP, 9)
  })

  it('starts under the shore and reaches past the plate rim', () => {
    const outs = vertices(water).map((v) => outward(v.x, v.z))
    expect(Math.min(...outs)).toBeCloseTo(bank.walkEdge, 4)
    expect(Math.max(...outs)).toBeGreaterThan(discEdge)
  })

  it('puts METRES along the current into u and metres out of the bank into v', () => {
    const p = water.getAttribute('position')
    const uv = water.getAttribute('uv')
    for (let i = 0; i < p.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(downstream(p.getX(i), p.getZ(i)), 4)
      expect(uv.getY(i)).toBeCloseTo(outward(p.getX(i), p.getZ(i)) - bank.distance, 4)
    }
  })

  it('tessellates as the quality level asks', () => {
    const coarse = buildRiverSurfaceGeometry(bank, 30, 4)
    const fine = buildRiverSurfaceGeometry(bank, 30, 48)
    expect(fine.getAttribute('position').count).toBeGreaterThan(coarse.getAttribute('position').count * 4)
  })
})

describe('every drawn face looks UP', () => {
  // The one thing a geometry builder gets silently wrong: a triangle wound the
  // other way turns its normal into the ground, and the surface renders as an
  // unlit black band (which is exactly what the first frame at the bank showed).
  // Judged on the FACE normals the winding produces, not on the attribute.
  const faceNormalsUp = (g: THREE.BufferGeometry) => {
    const p = g.getAttribute('position')
    const index = g.getIndex()!
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    let worst = Infinity
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(p, index.getX(i))
      b.fromBufferAttribute(p, index.getX(i + 1))
      c.fromBufferAttribute(p, index.getX(i + 2))
      const n = b.sub(a).cross(c.sub(a)).normalize()
      worst = Math.min(worst, n.y)
    }
    return worst
  }

  it('the ground plate', () => {
    expect(faceNormalsUp(buildGroundPlateGeometry(bounds, discEdge, 96))).toBeGreaterThan(0.9)
  })

  it('the shore', () => {
    expect(faceNormalsUp(buildBankShoreGeometry(bank, 20))).toBeGreaterThan(0.5)
  })

  it('the water surface', () => {
    expect(faceNormalsUp(buildRiverSurfaceGeometry(bank, 30, 12))).toBeGreaterThan(0.9)
  })

  it('and the shore’s own normal attribute agrees with its faces', () => {
    const n = buildBankShoreGeometry(bank, 20).getAttribute('normal')
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.5)
  })
})

describe('the foam shows WHICH WAY the water runs', () => {
  const flecks = buildRiverFlecks(16)

  it('is the same set in every run — no seed to drift', () => {
    expect(buildRiverFlecks(16)).toEqual(flecks)
  })

  it('spreads along the current and across the channel', () => {
    expect(flecks.length).toBe(16)
    const alongs = flecks.map((f) => f.along0)
    expect(Math.min(...alongs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...alongs)).toBeLessThanOrEqual(RIVER_DRIFT_SPAN)
    for (const f of flecks) {
      expect(f.across).toBeGreaterThan(0)
      expect(f.across).toBeLessThan(RIVER_REACH)
      expect(f.size).toBeGreaterThan(0)
    }
    // Not all in one line abreast: the current has to read as a surface.
    expect(new Set(flecks.map((f) => f.across.toFixed(3))).size).toBeGreaterThan(8)
  })

  it('floats ON the water, out past the waterline', () => {
    for (const f of flecks) {
      const p = fleckPosition(bank, f, 0)
      expect(p.y).toBeGreaterThan(-BANK_WATER_DROP)
      expect(outward(p.x, p.z)).toBeGreaterThan(bank.distance)
    }
  })

  it('travels DOWNSTREAM by exactly the phase advanced, and never sideways', () => {
    const step = 2.5
    for (const f of flecks) {
      const a = fleckPosition(bank, f, 4)
      const b = fleckPosition(bank, f, 4 + step)
      const moved = downstream(b.x - a.x, b.z - a.z)
      // Either it rode the current for the whole step, or it wrapped back
      // upstream to re-enter — nothing in between, and never backwards.
      if (Math.abs(moved - step) > 1e-6) expect(moved).toBeCloseTo(step - RIVER_DRIFT_SPAN, 6)
      else expect(moved).toBeCloseTo(step, 6)
      expect(outward(b.x - a.x, b.z - a.z)).toBeCloseTo(0, 9)
    }
  })

  it('carries the group downstream over a window, wraps included', () => {
    // What a verification measures in the browser: over a short window most of
    // the foam has visibly moved with the current.
    const before = flecks.map((f) => fleckPosition(bank, f, 1))
    const after = flecks.map((f) => fleckPosition(bank, f, 3))
    const forward = before.filter((p, i) => downstream(after[i].x - p.x, after[i].z - p.z) > 0).length
    expect(forward).toBeGreaterThanOrEqual(flecks.length - 1)
  })
})
