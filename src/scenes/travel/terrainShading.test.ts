// Travel-terrain smooth-shading contract (design.md §3.3, CLAUDE.md §7.1
// pt. 11 "smoothing the geometry of the continent"): the bird's-eye DEM
// relief must shade smooth — per-vertex normals interpolated across faces,
// never per-face facets. The chunk builder and its material live unexported
// inside TravelScene.tsx, so the contract is pinned as a source witness (the
// figures.test.ts precedent): the height-gradient normal derivation and the
// shared indexed vertices must stay, and nothing may opt into flat shading.
// The height field those normals sample is proven C1-smooth in
// src/world/terrain.test.ts — together: smooth field, smooth normals.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/scenes/travel/TravelScene.tsx'), 'utf8')

describe('travel terrain shading (source witness on the unexported chunk builder)', () => {
  it('no travel-scene material ever opts into flat shading', () => {
    // three.js defaults to smooth (interpolated per-vertex) shading; the pure
    // guard is that the scene never turns flatShading on — which would
    // collapse the central-difference normals below back into hard facets.
    expect(src.includes('flatShading')).toBe(false)
  })

  it('chunk geometry carries explicit smooth normals from the height gradient', () => {
    // Central differences over the margin height grid: one normal per shared
    // vertex, derived from the terrain gradient — interpolated across every
    // face that shares the vertex (the opposite of per-face normals).
    expect(src).toMatch(/const nx = hl - hr/)
    expect(src).toMatch(/const ny = 2 \* step/)
    expect(src).toMatch(/geo\.setAttribute\('normal', new THREE\.BufferAttribute\(normals, 3\)\)/)
  })

  it('keeps the indexed, vertex-sharing mesh (never split into per-face vertices)', () => {
    // toNonIndexed() would duplicate vertices per triangle; with recomputed
    // normals that renders as flat facets even without the flatShading flag.
    expect(src.includes('toNonIndexed')).toBe(false)
    expect(src).toMatch(/geo\.setIndex\(indices\)/)
  })

  it('the far-terrain sheet computes smooth vertex normals on its indexed grid', () => {
    // computeVertexNormals() on an INDEXED grid averages face normals per
    // shared vertex — smooth; on a non-indexed mesh it would be per-face.
    expect(src).toMatch(/geo\.setIndex\(indices\)\s*\n\s*geo\.computeVertexNormals\(\)/)
  })
})
