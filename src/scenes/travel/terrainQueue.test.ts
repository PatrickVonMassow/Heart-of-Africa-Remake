// The budgeted terrain build queue (docs/perf-driving-hitches.md): pure
// scheduling rules that split the chunk-crossing build burst across frames.
// Pinned here: the planned window matches the old synchronous loop's LOD/
// stitch assignment and key format, the ordering is holes-then-nearest, the
// budgeted drain covers every job over several frames and drops none, and the
// heading prefetch predicts the next window without false triggers.
import { describe, expect, it } from 'vitest'
import {
  drainSlicedQueue,
  MAX_PARKED_BUILDS,
  newSlicedDrainState,
  type SliceBuild,
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

// Sliced drain (docs/perf-1543-driving-hitches.md): a fake build of `units`
// steps, each costing `unitMs` on a fake clock.
interface Job {
  key: string
  units: number
  hole?: boolean
}
function fakeWorld(unitMs: number) {
  let t = 0
  const log: string[] = []
  const begin = (job: Job): SliceBuild => {
    let left = job.units
    return {
      step(deadline: number) {
        do {
          t += unitMs
          left -= 1
          log.push(job.key)
        } while (left > 0 && t < deadline)
        return left === 0
      },
    }
  }
  return { now: () => t, begin, log }
}

describe('drainSlicedQueue (per-frame budget across sliced builds)', () => {
  it('spreads one oversized build over frames, never past budget + one unit', () => {
    const w = fakeWorld(1)
    const queue: Job[] = [{ key: 'big', units: 12 }]
    const state = newSlicedDrainState<Job>()
    const done: string[] = []
    const perFrame: number[] = []
    for (let f = 0; f < 10 && (queue.length > 0 || state.current); f++) {
      const t0 = w.now()
      drainSlicedQueue(queue, state, 4, w.now, w.begin, (j) => done.push(j.key), () => false)
      perFrame.push(w.now() - t0)
    }
    expect(done).toEqual(['big'])
    expect(perFrame).toEqual([4, 4, 4])
  })

  it('completes several small builds inside one budget and skips cached jobs', () => {
    const w = fakeWorld(1)
    const queue: Job[] = [{ key: 'a', units: 1 }, { key: 'cached', units: 1 }, { key: 'b', units: 1 }, { key: 'c', units: 5 }]
    const state = newSlicedDrainState<Job>()
    const done: string[] = []
    const begin = (j: Job) => (j.key === 'cached' ? null : w.begin(j))
    const n = drainSlicedQueue(queue, state, 4, w.now, begin, (j) => done.push(j.key), () => false)
    expect(n).toBe(2)
    expect(done).toEqual(['a', 'b'])
    expect(state.current?.job.key).toBe('c')
    expect(w.now()).toBe(4)
  })

  it('always makes progress, even with a zero budget', () => {
    const w = fakeWorld(1)
    const queue: Job[] = [{ key: 'a', units: 3 }]
    const state = newSlicedDrainState<Job>()
    drainSlicedQueue(queue, state, 0, w.now, w.begin, () => {}, () => false)
    expect(w.log).toEqual(['a'])
  })

  it('an urgent hole preempts a non-urgent build, which resumes where it stopped', () => {
    const w = fakeWorld(1)
    const queue: Job[] = [{ key: 'lod', units: 6 }]
    const state = newSlicedDrainState<Job>()
    const done: string[] = []
    const urgent = (j: Job) => j.hole === true
    const complete = (j: Job) => done.push(j.key)
    drainSlicedQueue(queue, state, 2, w.now, w.begin, complete, urgent)
    expect(w.log).toEqual(['lod', 'lod'])
    // A crossing requeues: a hole first, the in-flight LOD job behind it.
    queue.push({ key: 'hole', units: 2, hole: true }, { key: 'lod', units: 6 })
    drainSlicedQueue(queue, state, 2, w.now, w.begin, complete, urgent)
    expect(done).toEqual(['hole'])
    expect(state.parked.has('lod')).toBe(true)
    while (queue.length > 0 || state.current) drainSlicedQueue(queue, state, 2, w.now, w.begin, complete, urgent)
    expect(done).toEqual(['hole', 'lod'])
    // Resumed, not restarted: 6 units of lod in total.
    expect(w.log.filter((k) => k === 'lod').length).toBe(6)
  })

  it('an urgent build is not preempted by another urgent job', () => {
    const w = fakeWorld(1)
    const queue: Job[] = [{ key: 'h1', units: 4, hole: true }]
    const state = newSlicedDrainState<Job>()
    const urgent = (j: Job) => j.hole === true
    drainSlicedQueue(queue, state, 2, w.now, w.begin, () => {}, urgent)
    queue.push({ key: 'h2', units: 1, hole: true })
    drainSlicedQueue(queue, state, 2, w.now, w.begin, () => {}, urgent)
    expect(w.log.slice(0, 4)).toEqual(['h1', 'h1', 'h1', 'h1'])
  })

  it('keeps at most MAX_PARKED_BUILDS parked builds, dropping the oldest', () => {
    const w = fakeWorld(1)
    const state = newSlicedDrainState<Job>()
    const urgent = (j: Job) => j.hole === true
    for (let i = 0; i <= MAX_PARKED_BUILDS; i++) {
      const queue: Job[] = [{ key: `lod${i}`, units: 10 }]
      drainSlicedQueue(queue, state, 1, w.now, w.begin, () => {}, urgent)
      queue.push({ key: `hole${i}`, units: 100, hole: true })
      drainSlicedQueue(queue, state, 1, w.now, w.begin, () => {}, urgent)
      state.current = null // the hole is abandoned (window moved on)
    }
    expect(state.parked.size).toBe(MAX_PARKED_BUILDS)
    expect(state.parked.has('lod0')).toBe(false)
  })
})

describe('drainSlicedQueue with whole (unsliced) builds — the low level', () => {
  it('builds whole jobs and stops once the budget is crossed, like the old atomic drain', () => {
    const w = fakeWorld(1)
    const whole = (j: Job): SliceBuild => {
      const b = w.begin(j)
      return { step: () => b.step(Infinity) }
    }
    const queue: Job[] = [{ key: 'a', units: 3 }, { key: 'b', units: 4 }, { key: 'c', units: 1 }]
    const state = newSlicedDrainState<Job>()
    const done: string[] = []
    drainSlicedQueue(queue, state, 5, w.now, whole, (j) => done.push(j.key), () => false)
    // a (3) fits, b (4) runs whole and overshoots to 7, then the drain stops.
    expect(done).toEqual(['a', 'b'])
    expect(w.now()).toBe(7)
    expect(state.current).toBeNull()
  })
})

