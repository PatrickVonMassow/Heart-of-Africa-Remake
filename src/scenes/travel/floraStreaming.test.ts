// Flora streaming rules (points 164 + 171 — plants no longer jump while
// driving). The streaming edge is a circle sized to the SCENE FOG far (the
// definitive visible limit), gated by a hysteresis step, and the per-chunk
// fill runs nearest-first so a full instance buffer drops the FARTHEST plants.
// These pure rules are pinned here.
import { describe, expect, it } from 'vitest'
import {
  FLORA_REBUILD_STEP,
  FLORA_SPAWN_HARD_CAP,
  FLORA_SPAWN_MARGIN,
  chunkOffsetsByDistance,
  floraChunkRange,
  floraInSpawnCircle,
  floraShouldRebuild,
  floraSpawnRadius,
} from './floraStreaming'

const CHUNK_SIZE = 24
// The region fog-far presets (Climate.tsx REGION table) that size the circle.
const FOG_FARS = [165, 200, 250, 280, 330]

describe('floraSpawnRadius (point 171 — the edge sits in the fog, beyond the visible ground)', () => {
  it('is the fog far plus a positive margin, so the edge is beyond everything the fog shows', () => {
    for (const fogFar of [165, 200, 250, 280]) {
      expect(floraSpawnRadius(fogFar)).toBe(fogFar + FLORA_SPAWN_MARGIN)
      // The drawn edge is strictly beyond the visible limit, so its pop is fogged.
      expect(floraSpawnRadius(fogFar)).toBeGreaterThan(fogFar)
    }
  })

  it('caps the radius in the widest-fog regions to bound the rebuild cost', () => {
    // At fog far 330 the uncapped radius would be 360; the cap holds it at 320,
    // where the fog is already >90% opaque so the edge is still out of sight.
    expect(floraSpawnRadius(330)).toBe(FLORA_SPAWN_HARD_CAP)
    expect(FLORA_SPAWN_HARD_CAP).toBeLessThan(330 + FLORA_SPAWN_MARGIN)
  })

  it('the recession over one hysteresis step never crosses back inside the visible circle (uncapped regions)', () => {
    // Between rebuilds the frozen edge recedes by at most FLORA_REBUILD_STEP; for
    // the uncapped regions it must still clear the fog far, or a pop would enter
    // the clear view mid-window.
    for (const fogFar of [165, 200, 250, 280]) {
      expect(floraSpawnRadius(fogFar) - FLORA_REBUILD_STEP).toBeGreaterThan(fogFar)
    }
    expect(FLORA_REBUILD_STEP).toBeLessThan(FLORA_SPAWN_MARGIN)
  })
})

describe('floraInSpawnCircle (points 164/171 — the circular edge)', () => {
  it('draws a plant within the spawn radius and drops one beyond it', () => {
    const spawnR = floraSpawnRadius(200) // 230
    expect(floraInSpawnCircle(100, 0, 0, 0, spawnR)).toBe(true) // inside
    expect(floraInSpawnCircle(300, 0, 0, 0, spawnR)).toBe(false) // beyond
    // A plant right at the fog far is still drawn (fogFar < spawnR).
    expect(floraInSpawnCircle(200, 0, 0, 0, spawnR)).toBe(true)
  })
})

describe('floraShouldRebuild (point 164 — hysteresis kills the back-and-forth)', () => {
  const last = { x: 100, z: 100, fogFar: 200 }

  it('always rebuilds when there is no prior build', () => {
    expect(floraShouldRebuild({ x: 0, z: 0 }, null, 200)).toBe(true)
  })

  it('does NOT rebuild for a move shorter than the step at the same fog far', () => {
    // A back-and-forth of a few units — the flicker the user saw — no longer
    // rebuilds, so the frozen edge cannot re-pop.
    expect(floraShouldRebuild({ x: 100 + FLORA_REBUILD_STEP - 1, z: 100 }, last, 200)).toBe(false)
    expect(floraShouldRebuild({ x: 108, z: 100 }, last, 200)).toBe(false)
  })

  it('rebuilds once the move reaches the step', () => {
    expect(floraShouldRebuild({ x: 100 + FLORA_REBUILD_STEP, z: 100 }, last, 200)).toBe(true)
  })

  it('rebuilds on a fog-far change (a new region) even without moving', () => {
    expect(floraShouldRebuild({ x: 100, z: 100 }, last, 250)).toBe(true)
    expect(floraShouldRebuild({ x: 100, z: 100 }, last, 200.5)).toBe(false) // within the 1-unit dead-band
  })

  it('does NOT rebuild when clearView lerps the fog past the hard cap (no rebuild storm)', () => {
    // Above ~290 the spawn radius is pinned at the cap, so the huge fog swings a
    // wide-zoom clearView produces (fog far → thousands) move the radius zero and
    // must not trigger a rebuild every frame during the zoom transition.
    const capped = { x: 100, z: 100, fogFar: 300 }
    expect(floraShouldRebuild({ x: 100, z: 100 }, capped, 8603)).toBe(false)
    expect(floraShouldRebuild({ x: 100, z: 100 }, capped, 500)).toBe(false)
  })
})

describe('floraChunkRange (bounded iteration covering the circle)', () => {
  it('covers the spawn circle and is capped', () => {
    for (const fogFar of FOG_FARS) {
      const range = floraChunkRange(fogFar, CHUNK_SIZE)
      // The iterated square reaches at least the spawn radius (so no plant
      // inside the circle is skipped).
      expect(range * CHUNK_SIZE).toBeGreaterThanOrEqual(floraSpawnRadius(fogFar))
      expect(range).toBeLessThanOrEqual(15)
    }
  })
})

describe('chunkOffsetsByDistance (point 171 — nearest-first so a full buffer drops the farthest)', () => {
  it('returns every offset in the ±range square', () => {
    const range = 3
    const offs = chunkOffsetsByDistance(range)
    expect(offs.length).toBe((2 * range + 1) ** 2)
    // No duplicates.
    const keys = new Set(offs.map(([dx, dz]) => `${dx},${dz}`))
    expect(keys.size).toBe(offs.length)
  })

  it('is ordered by ascending distance from the player chunk (the origin first)', () => {
    const offs = chunkOffsetsByDistance(4)
    expect(offs[0]).toEqual([0, 0])
    let prev = -1
    for (const [dx, dz] of offs) {
      const d2 = dx * dx + dz * dz
      // Monotonic non-decreasing: a farther chunk is never processed before a
      // nearer one, so the instance-buffer cap drops the farthest plants.
      expect(d2).toBeGreaterThanOrEqual(prev)
      prev = d2
    }
  })

  it('memoises the ordering per range (same reference)', () => {
    expect(chunkOffsetsByDistance(5)).toBe(chunkOffsetsByDistance(5))
  })
})
