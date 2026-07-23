// The per-chunk flora placement cache (docs/perf-driving-hitches.md): the
// every-16-wu rescan used to re-decide all ~841 chunks via placedFloraAt; it
// now reads cached per-chunk arrays and computes only the genuinely new
// chunks. Pinned here: the cached path is bit-identical to the uncached pure
// decision (the point-129 render/collider lockstep rides on ONE shared
// storage), only new chunks are recomputed, and a seed change resets the
// cache without breaking determinism.
import { beforeAll, describe, expect, it } from 'vitest'
import { floraPlacementComputes, placedFloraAt, placedFloraChunk } from './TravelScene'
import { setupGeodata } from '../../test/geodata'

beforeAll(async () => {
  await setupGeodata()
})

// Chunk of a lat/lon point: cx = floor(lon * 10 / 24), cz = floor(-lat * 10 / 24).
const chunkOf = (lat: number, lon: number): [number, number] => [
  Math.floor((lon * 10) / 24),
  Math.floor((-lat * 10) / 24),
]
const CANDIDATES_PER_CHUNK = 22 // TravelScene's candidate count per chunk
const SEED = 1

describe('placedFloraChunk (cached placement equals the pure per-candidate decision)', () => {
  it('matches placedFloraAt exactly, in candidate order, over a savanna square', () => {
    const [cx, cz] = chunkOf(-2, 34.8) // Serengeti savanna
    let anyPlaced = 0
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const direct: unknown[] = []
        for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
          const p = placedFloraAt(cx + dx, cz + dz, i, SEED)
          if (p) direct.push(p)
        }
        const cached = placedFloraChunk(cx + dx, cz + dz, SEED)
        expect(cached).toEqual(direct)
        anyPlaced += cached.length
      }
    }
    // The square is not trivially empty — the equality proved real content.
    expect(anyPlaced).toBeGreaterThan(0)
  })

  it('returns the identical cached array on a re-read without recomputing', () => {
    const [cx, cz] = chunkOf(-2, 34.8)
    const first = placedFloraChunk(cx, cz, SEED)
    const before = floraPlacementComputes()
    const second = placedFloraChunk(cx, cz, SEED)
    expect(second).toBe(first) // same reference — a lookup, not a rebuild
    expect(floraPlacementComputes()).toBe(before)
  })

  it('a shifted rescan recomputes ONLY the genuinely new chunks', () => {
    const [cx, cz] = chunkOf(12, 2) // a fresh area (not touched above)
    // Prime a 5×5 square.
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) placedFloraChunk(cx + dx, cz + dz, SEED)
    const before = floraPlacementComputes()
    // The same square shifted one chunk east: 20 chunks overlap (cached), the
    // 5 chunks of the new east column are the only computations left.
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -1; dx <= 3; dx++) placedFloraChunk(cx + dx, cz + dz, SEED)
    expect(floraPlacementComputes() - before).toBe(5)
  })

  it('a seed change resets the cache and stays deterministic per seed', () => {
    const [cx, cz] = chunkOf(-2, 34.8)
    const seedA = structuredClone(placedFloraChunk(cx, cz, SEED))
    // Another seed re-decides (the cache is seed-keyed, like the terrain's).
    placedFloraChunk(cx, cz, 2)
    // Back on the first seed: same content as before — pure per (chunk, seed).
    expect(structuredClone(placedFloraChunk(cx, cz, SEED))).toEqual(seedA)
  })
})
