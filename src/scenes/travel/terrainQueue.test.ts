// The budgeted terrain build queue (docs/perf-driving-hitches.md): pure
// scheduling rules that split the chunk-crossing build burst across frames.
// Pinned here: the planned window matches the old synchronous loop's LOD/
// stitch assignment and key format, the ordering is holes-then-nearest, the
// budgeted drain covers every job over several frames and drops none, and the
// heading prefetch predicts the next window without false triggers.
import { describe, expect, it } from 'vitest'
import {
  drainChunkQueue,
  orderChunkJobs,
  planChunkWindow,
  predictedNextCenter,
  type ChunkJob,
} from './terrainQueue'

// A deterministic fake LOD probe: ring-based base resolution plus a refine
// stripe (every chunk with world cx === 3 doubles), mirroring the real gates'
// shape without geodata.
function makeSegsAt(ccx: number) {
  return (dx: number, dz: number): number => {
    const ring = Math.max(Math.abs(dx), Math.abs(dz))
    const base = ring <= 2 ? 56 : ring <= 4 ? 28 : 20
    return ccx + dx === 3 && ring <= 4 ? Math.min(112, base * 2) : base
  }
}

describe('planChunkWindow (the synchronous loop expressed as data)', () => {
  it('covers the full window once per chunk with centre-relative distances', () => {
    const jobs = planChunkWindow(10, -4, 2, makeSegsAt(10))
    expect(jobs.length).toBe(25)
    const chunks = new Set(jobs.map((j) => j.chunk))
    expect(chunks.size).toBe(25)
    expect(chunks.has('10,-4')).toBe(true) // centre
    expect(chunks.has('12,-2')).toBe(true) // corner
    const centre = jobs.find((j) => j.chunk === '10,-4')
    expect(centre?.dist2).toBe(0)
    const corner = jobs.find((j) => j.chunk === '12,-2')
    expect(corner?.dist2).toBe(8)
  })

  it('stitches each edge to the coarser neighbour and keys chunk:segments:edges', () => {
    const segsAt = makeSegsAt(0)
    const jobs = planChunkWindow(0, 0, 6, segsAt)
    for (const job of jobs) {
      const dx = job.cx
      const dz = job.cz
      const own = segsAt(dx, dz)
      expect(job.segments).toBe(own)
      // Each edge is the min of this chunk's and that neighbour's resolution
      // (point 220), in buildChunkGeometry's edge order: N, S, W, E.
      expect(job.edgeSegs).toEqual([
        Math.min(own, segsAt(dx, dz - 1)),
        Math.min(own, segsAt(dx, dz + 1)),
        Math.min(own, segsAt(dx - 1, dz)),
        Math.min(own, segsAt(dx + 1, dz)),
      ])
      // The key format matches the module geometry cache's existing keys.
      expect(job.key).toBe(`${job.cx},${job.cz}:${job.segments}:${job.edgeSegs.join(',')}`)
    }
    // The refine stripe actually shows up (the fake gate does real work):
    // chunk (3,0) sits at ring 3 (base 28) and doubles to 56, its unrefined
    // ring-4 neighbour (4,0) stays at 28, and past REFINE_RING_MAX (3,5) the
    // stripe no longer refines.
    expect(jobs.find((j) => j.chunk === '3,0')?.segments).toBe(56)
    expect(jobs.find((j) => j.chunk === '4,0')?.segments).toBe(28)
    expect(jobs.find((j) => j.chunk === '3,5')?.segments).toBe(20)
  })

  it('is deterministic: two plans of the same window are identical', () => {
    const a = planChunkWindow(5, 7, 3, makeSegsAt(5))
    const b = planChunkWindow(5, 7, 3, makeSegsAt(5))
    expect(a).toEqual(b)
  })
})

describe('orderChunkJobs (holes first, then nearest — a hole would be visible)', () => {
  const job = (chunk: string, dist2: number): ChunkJob => ({
    cx: 0, cz: 0, segments: 56, edgeSegs: [56, 56, 56, 56], key: `${chunk}:56`, chunk, dist2,
  })

  it('puts chunks without a drawable stand-in ahead of covered re-keys, nearest first within each class', () => {
    const jobs = [job('a', 9), job('b', 1), job('c', 4), job('d', 0)]
    const covered = new Set(['b', 'd'])
    const ordered = orderChunkJobs(jobs, (c) => covered.has(c))
    expect(ordered.map((j) => j.chunk)).toEqual(['c', 'a', 'd', 'b'])
  })

  it('drops no job and keeps ties stable', () => {
    const jobs = [job('a', 2), job('b', 2), job('c', 2)]
    const ordered = orderChunkJobs(jobs, () => false)
    expect(ordered.map((j) => j.chunk)).toEqual(['a', 'b', 'c'])
    expect(ordered.length).toBe(jobs.length)
  })
})

describe('drainChunkQueue (per-frame budget, guaranteed progress, none dropped)', () => {
  it('builds all queued jobs across several frames under the budget, in order, exactly once', () => {
    const queue = Array.from({ length: 10 }, (_, i) => i)
    const built: number[] = []
    // Fake clock: each build advances time by 2 ms; the 5 ms budget admits 3
    // builds per frame (2, 4, then 6 ≥ 5 stops the frame).
    let t = 0
    const now = () => t
    const build = (j: number) => {
      built.push(j)
      t += 2
    }
    const perFrame: number[] = []
    let frames = 0
    while (queue.length > 0) {
      perFrame.push(drainChunkQueue(queue, 5, now, build))
      frames += 1
      expect(frames).toBeLessThan(100) // never stalls
    }
    expect(built).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) // all, in order, once
    expect(perFrame).toEqual([3, 3, 3, 1])
  })

  it('always builds at least one job even when a single build exceeds the budget', () => {
    const queue = [1, 2]
    let t = 0
    const built: number[] = []
    const n = drainChunkQueue(queue, 5, () => t, (j) => {
      built.push(j)
      t += 40 // one refined chunk blows the whole budget
    })
    expect(n).toBe(1) // progressed, but did not drag the second job in too
    expect(queue).toEqual([2])
  })

  it('returns 0 on an empty queue without reading the clock', () => {
    expect(drainChunkQueue([], 5, () => { throw new Error('clock read') }, () => {})).toBe(0)
  })
})

describe('predictedNextCenter (heading prefetch trigger)', () => {
  const CHUNK = 24

  it('predicts the chunk ahead once the lookahead point crosses the boundary', () => {
    // Driving north (-z) at z = 2 inside chunk (0,0): 12 wu ahead is z = -10,
    // chunk (0,-1).
    const p = predictedNextCenter({ x: 12, z: 2 }, { x: 12, z: 2.5 }, CHUNK, 12)
    expect(p).toEqual({ cx: 0, cz: -1 })
  })

  it('stays null well inside the chunk and while idle', () => {
    // Deep in the chunk (z = 20, northbound): 12 wu ahead is z = 8, still (0,0).
    expect(predictedNextCenter({ x: 12, z: 20 }, { x: 12, z: 21 }, CHUNK, 12)).toBeNull()
    // No movement: no heading to predict from.
    expect(predictedNextCenter({ x: 12, z: 2 }, { x: 12, z: 2 }, CHUNK, 12)).toBeNull()
  })

  it('follows the actual heading, including diagonals', () => {
    const inv = Math.SQRT1_2
    const p = predictedNextCenter(
      { x: 23, z: 23 },
      { x: 23 - inv, z: 23 - inv },
      CHUNK,
      12,
    )
    expect(p).toEqual({ cx: 1, cz: 1 }) // south-east into the diagonal chunk
  })
})
