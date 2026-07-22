// Tessellation floors for the close-range settlement primitives (CLAUDE.md
// §7.1 pt. 15, TASKS point 85): the figure bodies/heads and the hut/prop
// primitives the eye gets near must be round enough that neither lighting
// facets nor the polygonal silhouette read at first-person range. Pinned via
// the shared constants AND the geometry actually built from them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three/webgpu'
import { TESSELLATION } from './figures'

describe('TESSELLATION floors', () => {
  it('figure bodies and heads are visibly round (old: 8-cone, 10x8 sphere)', () => {
    expect(TESSELLATION.figureBody).toBeGreaterThanOrEqual(24)
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
})
