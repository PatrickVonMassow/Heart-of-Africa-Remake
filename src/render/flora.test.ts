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
    for (const build of [buildAcacia, buildJungleTree, buildBaobab, () => buildPalm(false)]) {
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
