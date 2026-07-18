// Zoom-aware flora streaming rules (point 164 — plants no longer jump while
// driving). The visible fix is that the streaming edge is a circle strictly
// beyond the view and the rebuild is gated by a hysteresis step; these pure
// rules are pinned here.
import { describe, expect, it } from 'vitest'
import {
  FLORA_REBUILD_STEP,
  FLORA_SPAWN_MARGIN,
  FLORA_VIEW_AT_ZOOM1,
  floraChunkRange,
  floraInSpawnCircle,
  floraShouldRebuild,
  floraSpawnRadius,
} from './floraStreaming'

const CHUNK_SIZE = 24

describe('floraSpawnRadius (point 164 — the edge sits beyond the view)', () => {
  it('is always the view radius plus a positive margin', () => {
    for (const zoom of [0.25, 0.5, 1, 1.5, 2, 2.5]) {
      const viewR = FLORA_VIEW_AT_ZOOM1 * zoom
      expect(floraSpawnRadius(zoom)).toBe(viewR + FLORA_SPAWN_MARGIN)
      // The drawn edge is strictly beyond the view, so its pop is off-screen.
      expect(floraSpawnRadius(zoom)).toBeGreaterThan(viewR)
    }
  })

  it('the edge stays beyond the view even after the player drifts a full hysteresis step', () => {
    // Between rebuilds the frozen edge recedes by at most FLORA_REBUILD_STEP;
    // it must still clear the view, or a pop would enter sight mid-window.
    for (const zoom of [0.5, 1, 2, 2.5]) {
      const viewR = FLORA_VIEW_AT_ZOOM1 * zoom
      expect(floraSpawnRadius(zoom) - FLORA_REBUILD_STEP).toBeGreaterThan(viewR)
    }
    expect(FLORA_REBUILD_STEP).toBeLessThan(FLORA_SPAWN_MARGIN)
  })
})

describe('floraInSpawnCircle (point 164 — the circular edge)', () => {
  it('draws a plant within the spawn radius and drops one beyond it', () => {
    const spawnR = floraSpawnRadius(1) // 130
    expect(floraInSpawnCircle(100, 0, 0, 0, spawnR)).toBe(true) // inside
    expect(floraInSpawnCircle(200, 0, 0, 0, spawnR)).toBe(false) // beyond
    // A plant right at the view edge (viewR) is always drawn (viewR < spawnR).
    expect(floraInSpawnCircle(FLORA_VIEW_AT_ZOOM1, 0, 0, 0, spawnR)).toBe(true)
  })
})

describe('floraShouldRebuild (point 164 — hysteresis kills the back-and-forth)', () => {
  const last = { x: 100, z: 100, zoom: 1 }

  it('always rebuilds when there is no prior build', () => {
    expect(floraShouldRebuild({ x: 0, z: 0 }, null, 1)).toBe(true)
  })

  it('does NOT rebuild for a move shorter than the step at the same zoom', () => {
    // A back-and-forth of a few units — the flicker the user saw — no longer
    // rebuilds, so the frozen edge cannot re-pop.
    expect(floraShouldRebuild({ x: 100 + FLORA_REBUILD_STEP - 1, z: 100 }, last, 1)).toBe(false)
    expect(floraShouldRebuild({ x: 108, z: 100 }, last, 1)).toBe(false)
  })

  it('rebuilds once the move reaches the step', () => {
    expect(floraShouldRebuild({ x: 100 + FLORA_REBUILD_STEP, z: 100 }, last, 1)).toBe(true)
  })

  it('rebuilds on a zoom change even without moving', () => {
    expect(floraShouldRebuild({ x: 100, z: 100 }, last, 1.2)).toBe(true)
    expect(floraShouldRebuild({ x: 100, z: 100 }, last, 1.02)).toBe(false) // within the dead-band
  })
})

describe('floraChunkRange (point 164 — bounded iteration covering the circle)', () => {
  it('covers the spawn circle and is capped', () => {
    for (const zoom of [0.5, 1, 2, 2.5]) {
      const range = floraChunkRange(zoom, CHUNK_SIZE)
      // The iterated square reaches at least the spawn radius (so no plant
      // inside the circle is skipped).
      expect(range * CHUNK_SIZE).toBeGreaterThanOrEqual(floraSpawnRadius(zoom))
      expect(range).toBeLessThanOrEqual(12)
    }
  })
})
