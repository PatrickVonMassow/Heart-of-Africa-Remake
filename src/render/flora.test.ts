import { describe, expect, it } from 'vitest'
import {
  buildAcacia,
  buildBush,
  buildDeadTree,
  buildGrassTuft,
  buildJungleTree,
  buildKopje,
  buildPalm,
  buildPapyrus,
  buildRock,
  buildTermiteMound,
  buildBaobab,
  splitFoliage,
} from './flora'
import type * as THREE from 'three/webgpu'

// The baked foliage attribute (point 144 retry). The 16.07 critical bug: the
// dry-season collapse keyed on the per-vertex JITTERED colour, so neighbouring
// vertices of one crown moved by different amounts and the trees tore into
// screen-wide shards. The fix is this attribute — set per PART at build time,
// identical across a part by construction, so a part moves as one.
const foliageOf = (geo: THREE.BufferGeometry) => {
  const attr = geo.attributes.foliage
  expect(attr, 'every flora geometry must carry the foliage attribute').toBeDefined()
  const arr = attr.array as Float32Array
  let ones = 0
  let twos = 0
  for (const v of arr) {
    // The attribute holds whole CLASSES (0 never moves, 1 crown collapse,
    // 2 ground sprout — point 151) — any in-between value would mean a
    // vertex-level mask again, which is the exact thing that tore.
    expect(v === 0 || v === 1 || v === 2).toBe(true)
    if (v === 1) ones++
    if (v === 2) twos++
  }
  return { ones, twos, total: arr.length }
}

describe('the baked foliage attribute (point 144 — per part, binary, never colour-derived)', () => {
  it('every builder carries it, so one shared material can rely on it', () => {
    for (const build of [
      buildAcacia, buildJungleTree, () => buildPalm(false), () => buildPalm(true),
      buildBush, buildRock, buildBaobab, buildTermiteMound, buildDeadTree,
      buildPapyrus, buildKopje, buildGrassTuft,
    ]) {
      foliageOf(build())
    }
  })

  it('trees split trunk from crown: both classes present, nothing sprouts', () => {
    // buildPalm(true) is the taller "detailed" variant (point 173): it still
    // carries the same trunk/crown split as the default palm, not a third class.
    for (const build of [buildAcacia, buildJungleTree, buildBaobab, () => buildPalm(false), () => buildPalm(true)]) {
      const { ones, twos, total } = foliageOf(build())
      expect(ones).toBeGreaterThan(0) // there is foliage to collapse
      expect(ones).toBeLessThan(total) // and a trunk that never moves
      expect(twos).toBe(0) // a crown bares — it never sinks into the soil
    }
  })

  it('ground flora is all sprout class, dead wood and stone never move', () => {
    // Bush, grass and papyrus are anchored at the soil and sprout/withdraw
    // there (point 151) — every vertex carries class 2.
    for (const build of [buildBush, buildGrassTuft, buildPapyrus]) {
      const g = foliageOf(build())
      expect(g.twos).toBe(g.total)
    }
    for (const build of [buildRock, buildTermiteMound, buildDeadTree, buildKopje]) {
      const g = foliageOf(build())
      expect(g.ones + g.twos).toBe(0) // dead wood and stone never collapse
    }
  })
})

describe('splitFoliage — crown/trunk split for the matrix-borne collapse (point 175)', () => {
  it('splits a tree into an all-crown part and a no-crown remainder, conserving every triangle', () => {
    for (const build of [buildAcacia, buildJungleTree, buildBaobab, () => buildPalm(false)]) {
      const geo = build()
      // The flora geometries are indexed (mergeGeometries of primitives); the
      // split is non-indexed, so its total vertex count equals the source's
      // index count — no triangle lost or duplicated.
      const srcVerts = geo.index ? geo.index.count : geo.attributes.position.count
      const { base, crown } = splitFoliage(geo)
      const bc = base.attributes.position.count
      const cc = crown.attributes.position.count
      expect(bc + cc).toBe(srcVerts)
      expect(cc).toBeGreaterThan(0) // there is a crown to collapse
      expect(bc).toBeGreaterThan(0) // and a trunk that stays put
      // Every crown vertex is foliage class 1; the remainder carries none.
      for (const v of crown.attributes.foliage.array as Float32Array) expect(v).toBe(1)
      for (const v of base.attributes.foliage.array as Float32Array) expect(v).not.toBe(1)
      // Both parts keep the attributes the shared material needs.
      for (const g of [base, crown]) {
        expect(g.attributes.position).toBeDefined()
        expect(g.attributes.normal).toBeDefined()
        expect(g.attributes.color).toBeDefined()
        expect(g.attributes.color.count).toBe(g.attributes.position.count)
      }
    }
  })
})
