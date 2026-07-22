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
import { FLORA_COLOR_LIFT, seasonTintCpu } from './seasonTint'

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

// Point 206 (Central reopen): the jungle crown hexes pass through THREE.Color's
// sRGB->linear conversion and had landed at linear luminance 0.066-0.092 —
// 2-2.7x darker than every other crown — so after the global FLORA_COLOR_LIFT
// they still read near-black in the always-lush, sun-dimmed Congo while savanna
// crowns lit fine. This gate evaluates the SHADER's own colour path purely
// (linear vertex colour -> seasonTintCpu, the lock-step mirror of
// seasonTintNode -> the shared lift) and floors the Central-jungle crown
// luminance at max greenness, while pinning the savanna acacia unchanged.
describe('crown albedo luminance floor (point 206 — Central jungle reads lit, savanna unchanged)', () => {
  // Rec.709 luminance of a linear rgb triple.
  const luminance = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

  // Mean linear crown colour as the flora material sees it (the vertex 'color'
  // attribute of the splitFoliage crown part — jitter is mean-1 by construction).
  const meanCrownColor = (geo: THREE.BufferGeometry): [number, number, number] => {
    const { base, crown } = splitFoliage(geo)
    base.dispose()
    const col = crown.attributes.color.array as Float32Array
    const mean: [number, number, number] = [0, 0, 0]
    const n = col.length / 3
    for (let i = 0; i < n; i++) {
      mean[0] += col[i * 3]
      mean[1] += col[i * 3 + 1]
      mean[2] += col[i * 3 + 2]
    }
    crown.dispose()
    return [mean[0] / n, mean[1] / n, mean[2] / n]
  }

  const lift = (c: [number, number, number]): [number, number, number] => [
    c[0] * FLORA_COLOR_LIFT,
    c[1] * FLORA_COLOR_LIFT,
    c[2] * FLORA_COLOR_LIFT,
  ]

  it('the jungle crown stays clearly above near-black at max greenness (the Congo state)', () => {
    // The Congo's season field is pinned at full lush (tint 1) year round —
    // the exact state the user saw near-black. The old hexes evaluated to
    // ~0.13 here; the floor at 0.18 fails them and passes the lifted palette
    // (~0.25) with margin on both sides.
    const jungle = meanCrownColor(buildJungleTree())
    const lit = lift(seasonTintCpu(jungle, 1))
    expect(luminance(lit)).toBeGreaterThan(0.18)
  })

  it('the jungle crown keeps a green-dominant, deep hue (lit foliage, not a lime-bright lift)', () => {
    const jungle = meanCrownColor(buildJungleTree())
    const lit = lift(seasonTintCpu(jungle, 1))
    // Green stays the dominant channel by a wide margin…
    expect(lit[1]).toBeGreaterThan(lit[0] * 2)
    expect(lit[1]).toBeGreaterThan(lit[2] * 2)
    // …and the crown stays darker than the savanna acacia at ITS ordinary
    // neutral tint — the jungle remains the deeper green of the two.
    const acacia = meanCrownColor(buildAcacia())
    const acaciaLit = lift(seasonTintCpu(acacia, 0.5))
    expect(luminance(lit)).toBeLessThan(luminance(acaciaLit))
  })

  it('the savanna acacia crown is unchanged by the Central fix (regression pin)', () => {
    // The acacia's authored pair #6e7c2f/#5f6e28 means a linear crown
    // luminance of ~0.17; at the neutral mid-year tint the seasonTint returns
    // the colour untouched, so lifted luminance sits at ~0.32. A drift out of
    // this band means the savanna look moved — which point 206 must not do.
    const acacia = meanCrownColor(buildAcacia())
    expect(luminance(seasonTintCpu(acacia, 0.5))).toBeCloseTo(luminance(acacia), 10) // neutral = untouched
    const lum = luminance(lift(acacia))
    expect(lum).toBeGreaterThan(0.28)
    expect(lum).toBeLessThan(0.37)
  })

  it('seasonTintCpu max-lush never collapses a green crown toward black (the recolour is luma-preserving-ish)', () => {
    // The lush recolour is luma-keyed (seasonTint.ts): for a green-dominant
    // crown it deepens the hue but must keep at least ~80% of the luminance —
    // the tint can never be the thing that blackens a crown.
    for (const build of [buildJungleTree, buildAcacia, () => buildPalm(false)]) {
      const c = meanCrownColor(build())
      expect(luminance(seasonTintCpu(c, 1))).toBeGreaterThan(luminance(c) * 0.8)
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
