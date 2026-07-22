// Tessellation floors for the close-range settlement primitives (CLAUDE.md
// §7.1 pt. 15, TASKS point 85): the figure bodies/heads and the hut/prop
// primitives the eye gets near must be round enough that neither lighting
// facets nor the polygonal silhouette read at first-person range. Pinned via
// the shared constants AND the geometry actually built from them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three/webgpu'
import { TESSELLATION, TRAVELLER_PACK } from './figures'

describe('TESSELLATION floors', () => {
  it('figure bodies and heads are visibly round (old: 8-cone, 10x8 sphere)', () => {
    // 48 radials (point 214 close-zoom report): at 24 the body cone still
    // showed panels at conversation range — a tessellation limit (the normals
    // were already smooth, see the smooth-shading suite below).
    expect(TESSELLATION.figureBody).toBeGreaterThanOrEqual(48)
    // Head/cap/hand floors raised with the organic smoothing pass (point 214).
    expect(TESSELLATION.figureHead[0]).toBeGreaterThanOrEqual(24)
    expect(TESSELLATION.figureHead[1]).toBeGreaterThanOrEqual(16)
    expect(TESSELLATION.figureCap[0]).toBeGreaterThanOrEqual(20)
    expect(TESSELLATION.figureCap[1]).toBeGreaterThanOrEqual(14)
    expect(TESSELLATION.figureHand[0]).toBeGreaterThanOrEqual(12)
    expect(TESSELLATION.figureHand[1]).toBeGreaterThanOrEqual(9)
  })

  it('hut roofs, domes and near props hold their floors', () => {
    expect(TESSELLATION.hutRoof).toBeGreaterThanOrEqual(20)
    expect(TESSELLATION.hutDome[0]).toBeGreaterThanOrEqual(20)
    expect(TESSELLATION.hutDome[1]).toBeGreaterThanOrEqual(10)
    expect(TESSELLATION.granary).toBeGreaterThanOrEqual(16)
    expect(TESSELLATION.mortar).toBeGreaterThanOrEqual(12)
    expect(TESSELLATION.pestle).toBeGreaterThanOrEqual(8)
    expect(TESSELLATION.goods[0]).toBeGreaterThanOrEqual(14)
  })

  it('the built geometry carries the vertex floor (not just the constant)', () => {
    const body = new THREE.ConeGeometry(0.32, 1.0, TESSELLATION.figureBody)
    const oldBody = new THREE.ConeGeometry(0.32, 1.0, 8)
    expect(body.attributes.position.count).toBeGreaterThan(oldBody.attributes.position.count * 2.5)

    const head = new THREE.SphereGeometry(0.16, ...TESSELLATION.figureHead)
    const oldHead = new THREE.SphereGeometry(0.16, 10, 8)
    expect(head.attributes.position.count).toBeGreaterThan(oldHead.attributes.position.count * 2)

    for (const g of [body, oldBody, head, oldHead]) g.dispose()
  })
})

describe("traveller's backpack rides the BACK (user report 22.07.2026)", () => {
  // Forward-axis convention (see TRAVELLER_PACK in figures.ts): the traveller
  // group yaws with rotation.y = atan2(dx, dz), which maps local +Z onto the
  // travel direction — so the figure's BACK is local NEGATIVE z. The pack once
  // sat at z = +0.2 and hung on the chest.
  it('the pack offset lies on the back side of the forward axis (z < 0, sign pinned)', () => {
    expect(TRAVELLER_PACK.offset[2]).toBeLessThan(0)
  })

  it('the whole crate sits behind the torso mid-plane, not just its centre', () => {
    // Back face of the crate deeper than its front face, and even the front
    // face at or behind the figure's z = 0 mid-plane: no part of the pack can
    // read as chest-mounted from the travel direction.
    const front = TRAVELLER_PACK.offset[2] + TRAVELLER_PACK.size[2] / 2
    expect(front).toBeLessThanOrEqual(0)
  })

  it('the crate keeps its original size (only the side changed)', () => {
    expect(TRAVELLER_PACK.size).toEqual([0.32, 0.38, 0.16])
  })

  it('the travel scene consumes the shared constant (no stray literal offset)', () => {
    // Same pure-guard technique as the flatShading check below: the constant
    // being green means nothing if the scene hardcodes its own position. The
    // path goes through a variable so Vite's asset rewrite of literal
    // `new URL(..., import.meta.url)` does not swallow the file scheme.
    const rel = '../scenes/travel/TravelScene.tsx'
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    expect(src.includes('TRAVELLER_PACK.offset')).toBe(true)
    expect(src.includes('TRAVELLER_PACK.size')).toBe(true)
  })
})

describe('smooth shading (point 214 — the shading half of the same goal)', () => {
  it('no settlement figure/prop material ever turns flat shading on', () => {
    // The figure materials are inline <meshStandardMaterial> props in the
    // settlement scenes; three.js defaults to smooth (per-vertex) shading, so
    // the pure guard is that no organic-scene material opts INTO flat shading
    // — which would collapse the tessellation floors above back into facets.
    for (const rel of ['../scenes/place/PlaceScene.tsx', '../scenes/place/PlaceLife.tsx']) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
      expect(src.includes('flatShading'), `${rel} must stay smooth-shaded`).toBe(false)
    }
  })

  it('the body cone geometry carries smooth (non-per-face) lateral normals', () => {
    // The point-214 diagnosis witness: the figure cone's facets were NOT a
    // flat-normal bug — ConeGeometry's lateral surface must interpolate one
    // shared normal per column (a per-face build would duplicate corners with
    // face normals). Pinned so a refactor can never regress the cone to flat.
    const cone = new THREE.ConeGeometry(0.32, 1.0, TESSELLATION.figureBody)
    expect(cone.index).not.toBeNull()
    const pos = cone.attributes.position
    const nor = cone.attributes.normal
    // Torso vertices come first: (radial+1) columns x 2 rows (apex, base).
    const torsoCount = (TESSELLATION.figureBody + 1) * 2

    // Every normal is unit length (interpolation-ready).
    for (let i = 0; i < nor.count; i++) {
      expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)), `normal ${i}`).toBeCloseTo(1, 3)
    }

    // Coincident lateral vertices (the theta seam) share ONE smooth normal —
    // apex columns (radius ~0) and the hard cap seam are excluded by design.
    const seen = new Map<string, [number, number, number]>()
    let seamPairs = 0
    for (let i = 0; i < torsoCount; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      if (r < 0.01) continue // apex: per-column normals are the cone's nature
      // Normalize -0 and float dust so the theta-seam duplicate keys match.
      const q = (v: number) => (Math.round(v * 1e5) / 1e5 + 0).toFixed(5)
      const key = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`
      const n: [number, number, number] = [nor.getX(i), nor.getY(i), nor.getZ(i)]
      const prev = seen.get(key)
      if (prev) {
        seamPairs++
        const dot = prev[0] * n[0] + prev[1] * n[1] + prev[2] * n[2]
        expect(dot, `seam normal at ${key}`).toBeGreaterThan(0.9999)
      } else seen.set(key, n)
    }
    expect(seamPairs).toBeGreaterThan(0)

    // Curvature witness on the lateral surface (group 0): the corner normals
    // of every torso triangle differ — the surface bends across each face
    // instead of shading as a flat panel.
    const idx = cone.index!
    const torso = cone.groups[0]
    let curved = 0
    let torsoTris = 0
    for (let t = torso.start / 3; t < (torso.start + torso.count) / 3; t++) {
      const [a, b, c] = [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)]
      const flat =
        nor.getX(a) === nor.getX(b) && nor.getY(a) === nor.getY(b) && nor.getZ(a) === nor.getZ(b) &&
        nor.getX(a) === nor.getX(c) && nor.getY(a) === nor.getY(c) && nor.getZ(a) === nor.getZ(c)
      torsoTris++
      if (!flat) curved++
    }
    expect(torsoTris).toBeGreaterThan(0)
    expect(curved).toBe(torsoTris)
    cone.dispose()
  })
})
