// The fish of the drift net (work-order 1245): one merged geometry of unit
// length, head along +Z, deeper than wide — the proportions that read as fish.
import { describe, expect, it } from 'vitest'
import { buildFishGeometry, FISH_DEPTH, FISH_WIDTH } from './fishMesh'

describe('the fish geometry', () => {
  it('is one merged mesh of unit length, head forward, deeper than wide, with a tail', () => {
    const g = buildFishGeometry()
    g.computeBoundingBox()
    const box = g.boundingBox!
    expect(box.max.z - box.min.z).toBeGreaterThan(0.95)
    expect(box.max.z - box.min.z).toBeLessThan(1.05)
    // The tail fin spreads deeper than the body at the rear.
    expect(box.max.y - box.min.y).toBeGreaterThan(FISH_DEPTH)
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(FISH_WIDTH + 1e-6)
    expect(g.getAttribute('normal')).toBeTruthy()
    g.dispose()
  })
})
