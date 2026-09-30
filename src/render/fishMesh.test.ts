// The fish of the drift net (work-order 1245): one merged geometry of unit
// length, head along +Z, deeper than wide — the proportions that read as fish —
// its forked tail at the −Z end, and its body wound outward.
import { describe, expect, it } from 'vitest'
import { buildFishGeometry, FISH_DEPTH, FISH_WIDTH } from './fishMesh'

describe('the fish geometry', () => {
  const g = buildFishGeometry()
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')

  it('is one merged mesh of unit length, deeper than wide', () => {
    g.computeBoundingBox()
    const box = g.boundingBox!
    expect(box.max.z - box.min.z).toBeGreaterThan(0.95)
    expect(box.max.z - box.min.z).toBeLessThan(1.05)
    expect(box.max.y - box.min.y).toBeGreaterThan(FISH_DEPTH)
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(FISH_WIDTH + 1e-6)
    expect(nrm).toBeTruthy()
  })

  it('carries its forked tail at the −Z end and a blunt head at +Z', () => {
    // The depth at each end: the tail fin spreads deeper near −Z than the body
    // is anywhere near +Z, and the tail's two lobes lie above AND below.
    let tailUp = 0
    let tailDown = 0
    let headDepth = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (z < -0.5) {
        tailUp = Math.max(tailUp, y)
        tailDown = Math.min(tailDown, y)
      }
      if (z > 0.35) headDepth = Math.max(headDepth, Math.abs(y))
    }
    expect(tailUp).toBeGreaterThan(0.1)
    expect(tailDown).toBeLessThan(-0.1)
    expect(headDepth).toBeLessThan(0.06)
  })

  it('winds the body outward: its normals point away from the axis', () => {
    let outward = 0
    let inward = 0
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z < -0.4 || z > 0.4) continue
      const r = Math.hypot(pos.getX(i), pos.getY(i))
      if (r < 0.03) continue
      const dot = pos.getX(i) * nrm.getX(i) + pos.getY(i) * nrm.getY(i)
      if (dot > 0) outward++
      else inward++
    }
    expect(outward).toBeGreaterThan(inward * 10)
  })
})
