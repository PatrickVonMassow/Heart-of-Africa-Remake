// Travel-terrain smooth-shading contract (design.md §3.3, CLAUDE.md §7.1
// pt. 11 "smoothing the geometry of the continent"): the bird's-eye DEM
// relief must shade smooth — per-vertex normals interpolated across faces,
// never per-face facets. The chunk builder and its material live unexported
// inside TravelScene.tsx, so the contract is pinned as a source witness (the
// figures.test.ts precedent): the height-gradient normal derivation and the
// shared indexed vertices must stay, and nothing may opt into flat shading.
// The height field those normals sample is proven C1-smooth in
// src/world/terrain.test.ts — together: smooth field, smooth normals.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  chunkIsMountainous,
  lodSegments,
  refinedSegments,
  REFINE_RING_MAX,
  REFINE_SEGMENT_CAP,
} from './terrainLod'
import { setupGeodata } from '../../test/geodata'

const src = readFileSync(resolve(process.cwd(), 'src/scenes/travel/TravelScene.tsx'), 'utf8')

beforeAll(async () => {
  await setupGeodata()
})

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

  it('the chunk loop applies the testable LOD rules (gate wired through, not forked)', () => {
    expect(src).toMatch(/chunkIsCoastal\(cx \+ dx, cz \+ dz\) \|\| chunkIsMountainous\(cx \+ dx, cz \+ dz\)/)
    expect(src).toMatch(/refinedSegments\(ring, refine\)/)
  })
})

describe('mountain-chunk tessellation gate (silhouette smoothness)', () => {
  // Chunk of a lat/lon point: cx = floor(lon * 10 / 24), cz = floor(-lat * 10 / 24).
  const chunkOf = (lat: number, lon: number): [number, number] => [
    Math.floor((lon * 10) / 24),
    Math.floor((-lat * 10) / 24),
  ]

  it('marks the great massifs and highland scarps as mountainous', () => {
    for (const [name, lat, lon] of [
      ['kilimanjaro', -3.07, 37.35],
      ['ethiopian highlands', 9.5, 38.5],
      ['high atlas', 31.06, -7.91],
    ] as const) {
      const [cx, cz] = chunkOf(lat, lon)
      expect(chunkIsMountainous(cx, cz), name).toBe(true)
    }
  })

  it('leaves the flat basins at base cost', () => {
    for (const [name, lat, lon] of [
      ['sahel plain', 15, 5],
      ['congo basin', -1, 22],
      ['kalahari', -23, 22],
    ] as const) {
      const [cx, cz] = chunkOf(lat, lon)
      expect(chunkIsMountainous(cx, cz), name).toBe(false)
    }
  })

  it('never marks open ocean (bathymetry spans are not mountains)', () => {
    // Deep Atlantic off the west coast: huge sea-floor relief, zero land.
    const [cx, cz] = chunkOf(0, -15)
    expect(chunkIsMountainous(cx, cz)).toBe(false)
  })

  it('doubles a refined near chunk to the pinned floors and never refines far rings', () => {
    // Base LOD unchanged.
    expect(lodSegments(0)).toBe(56)
    expect(lodSegments(3)).toBe(28)
    expect(lodSegments(5)).toBe(20)
    // Refined near rings: 56 -> 112 (one DEM texel ~ 0.21 wu per vertex) and
    // 28 -> 56; the doubling caps at 112 and stops past ring 4.
    expect(REFINE_SEGMENT_CAP).toBe(112)
    expect(REFINE_RING_MAX).toBe(4)
    for (const ring of [0, 1, 2]) expect(refinedSegments(ring, true)).toBe(112)
    for (const ring of [3, 4]) expect(refinedSegments(ring, true)).toBe(56)
    for (const ring of [5, 6]) expect(refinedSegments(ring, true)).toBe(lodSegments(ring))
    // Without a gate the base resolution holds on every ring.
    for (const ring of [0, 3, 5]) expect(refinedSegments(ring, false)).toBe(lodSegments(ring))
  })

  it('a mountainous near chunk gets the doubled segment count end to end', () => {
    const [cx, cz] = chunkOf(-3.07, 37.35) // kilimanjaro at ring 0
    expect(refinedSegments(0, chunkIsMountainous(cx, cz))).toBe(112)
    const [fx, fz] = chunkOf(15, 5) // flat sahel at ring 0
    expect(refinedSegments(0, chunkIsMountainous(fx, fz))).toBe(56)
  })
})
