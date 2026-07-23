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
  chunkIsCoastal,
  chunkIsMountainous,
  chunkNeedsRefine,
  getTerrainRefine,
  lodSegments,
  refinedSegments,
  resetTerrainRefine,
  setTerrainRefine,
  REFINE_RING_MAX,
  REFINE_SEGMENT_CAP,
} from './terrainLod'
import { buildChunkGeometry, stitchedEdgeHeights } from './TravelScene'
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
    // The refine gate rides through the memoised probe (terrainLod.ts) — the
    // OR of the coastal and mountain gates, cached per chunk so a crossing
    // never re-probes known ground (docs/perf-driving-hitches.md).
    expect(src).toMatch(/chunkNeedsRefine\(ccx \+ dx, ccz \+ dz\)/)
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

  it('the coastal gate marks a shoreline chunk and leaves the deep inland alone', () => {
    // Moved to terrainLod.ts with the memoised refine probe — re-pinned here.
    const [ax, az] = chunkOf(31.2, 29.9) // Alexandria: the Mediterranean coast
    expect(chunkIsCoastal(ax, az)).toBe(true)
    const [sx, sz] = chunkOf(23, 10) // central Sahara, no coast for hundreds of km
    expect(chunkIsCoastal(sx, sz)).toBe(false)
  })

  it('chunkNeedsRefine equals the OR of the pure gates and is stable across reads (memo)', () => {
    for (const [lat, lon] of [
      [-3.07, 37.35], // mountainous (kilimanjaro)
      [31.2, 29.9], // coastal (alexandria)
      [15, 5], // neither (sahel plain)
      [0, -15], // open ocean
    ] as const) {
      const [cx, cz] = chunkOf(lat, lon)
      const expected = chunkIsCoastal(cx, cz) || chunkIsMountainous(cx, cz)
      expect(chunkNeedsRefine(cx, cz)).toBe(expected)
      // The memoised second read must return the identical decision.
      expect(chunkNeedsRefine(cx, cz)).toBe(expected)
    }
  })

  // The in-game benchmark (design.md §21.1, F8) prices point 209's refinement
  // on the player's own hardware, so both levers are switchable at runtime.
  // Not player-facing: the benchmark sets them for one config and restores.
  it('the runtime override can switch the refinement off and cap its segments', () => {
    try {
      setTerrainRefine({ enabled: false })
      expect(getTerrainRefine().enabled).toBe(false)
      // Refine off reproduces the pre-209 histogram: every ring at base cost.
      for (const ring of [0, 1, 2, 3, 4]) expect(refinedSegments(ring, true)).toBe(lodSegments(ring))

      resetTerrainRefine()
      setTerrainRefine({ segmentCap: 84 })
      expect(getTerrainRefine().segmentCap).toBe(84)
      for (const ring of [0, 1, 2]) expect(refinedSegments(ring, true)).toBe(84)
      // Below the ring's base resolution the cap must not COARSEN the chunk.
      setTerrainRefine({ segmentCap: 8 })
      expect(refinedSegments(0, true)).toBe(lodSegments(0))
    } finally {
      resetTerrainRefine()
    }
  })

  it('resetting restores the shipped defaults exactly', () => {
    setTerrainRefine({ enabled: false, segmentCap: 40 })
    resetTerrainRefine()
    expect(getTerrainRefine()).toEqual({ enabled: true, segmentCap: REFINE_SEGMENT_CAP })
    for (const ring of [0, 1, 2]) expect(refinedSegments(ring, true)).toBe(112)
  })
})

describe('seam stitch: shared-edge height morph (no T-junction crack, point 220)', () => {
  const chunkOf = (lat: number, lon: number): [number, number] => [
    Math.floor((lon * 10) / 24),
    Math.floor((-lat * 10) / 24),
  ]

  it('morphs a fine edge onto the coarse neighbour chord (identity when equal)', () => {
    // edgeSeg === segments: every vertex is its own anchor -> unchanged.
    const anchors = Float32Array.from([1, 2, 5, 3, 4])
    const id = stitchedEdgeHeights(anchors, 4)
    expect(Array.from(id)).toEqual([1, 2, 5, 3, 4])

    // A finer 4-seg edge stitched onto a 2-seg (coarse) neighbour: the two
    // coincident vertices keep the anchor heights, the in-between ones land on
    // the straight chord — exactly what the coarse chunk's linear edge draws.
    const coarse = Float32Array.from([1, 5, 3]) // edgeSeg = 2
    const s = stitchedEdgeHeights(coarse, 4)
    expect(s[0]).toBeCloseTo(1, 12) // corner
    expect(s[2]).toBeCloseTo(5, 12) // shared mid vertex
    expect(s[4]).toBeCloseTo(3, 12) // corner
    expect(s[1]).toBeCloseTo(3, 12) // chord midpoint of (1,5)
    expect(s[3]).toBeCloseTo(4, 12) // chord midpoint of (5,3)
  })

  it('preserves the two edge corners under any morph', () => {
    const coarse = Float32Array.from([7, -2, 9]) // edgeSeg 2
    const s = stitchedEdgeHeights(coarse, 8)
    expect(s[0]).toBeCloseTo(7, 12)
    expect(s[8]).toBeCloseTo(9, 12)
  })

  it('two adjacent chunks at different LOD agree on every shared-edge vertex', async () => {
    // A fine mountain chunk (112 seg) east of which sits a coarse chunk (56).
    const [cx, cz] = chunkOf(-3.07, 37.35) // kilimanjaro relief
    // A meshes fine; its east edge is stitched down to the neighbour's 56.
    const A = buildChunkGeometry(cx, cz, 1, 112, [112, 112, 112, 56])
    // B (east neighbour) meshes coarse; its west edge stays its own 56.
    const B = buildChunkGeometry(cx + 1, cz, 1, 56, [56, 56, 56, 56])
    const pa = A.getAttribute('position').array as Float32Array
    const pb = B.getAttribute('position').array as Float32Array
    const nA = 113
    const nB = 57
    // A east edge vertex i -> i*nA + (nA-1); B west edge vertex k -> k*nB.
    // A vertex 2k coincides with B vertex k along the shared boundary line.
    let maxGap = 0
    for (let k = 0; k <= 56; k++) {
      const ya = pa[(2 * k * nA + (nA - 1)) * 3 + 1]
      const yb = pb[(k * nB) * 3 + 1]
      maxGap = Math.max(maxGap, Math.abs(ya - yb))
    }
    expect(maxGap).toBeLessThan(1e-6)
    A.dispose()
    B.dispose()
  })

  it('the stitch is doing real work: the unstitched fine edge would gap the coarse chord', async () => {
    // Same boundary, but A's east edge left at its own 112 (no morph). Its
    // odd (in-between) vertices follow the true curved terrain, which departs
    // from the coarse neighbour's straight chord — the T-junction the skirt
    // could not always hide once a 112-seg chunk met a 56-seg one.
    const [cx, cz] = chunkOf(-3.07, 37.35)
    const A = buildChunkGeometry(cx, cz, 1, 112, [112, 112, 112, 112]) // unstitched east
    const B = buildChunkGeometry(cx + 1, cz, 1, 56, [56, 56, 56, 56])
    const pa = A.getAttribute('position').array as Float32Array
    const pb = B.getAttribute('position').array as Float32Array
    const nA = 113
    const nB = 57
    let maxOddGap = 0
    for (let k = 0; k < 56; k++) {
      // A odd vertex 2k+1 sits between B vertices k and k+1: compare to the
      // chord the coarse chunk actually renders there (its linear midpoint).
      const yaOdd = pa[((2 * k + 1) * nA + (nA - 1)) * 3 + 1]
      const chord = (pb[(k * nB) * 3 + 1] + pb[((k + 1) * nB) * 3 + 1]) / 2
      maxOddGap = Math.max(maxOddGap, Math.abs(yaOdd - chord))
    }
    // A real, human-visible deviation exists without the stitch (the crack),
    // far exceeding the epsilon the stitched edges meet within.
    expect(maxOddGap).toBeGreaterThan(1e-3)
    A.dispose()
    B.dispose()
  })
})
