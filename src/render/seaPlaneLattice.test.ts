import { describe, expect, it } from 'vitest'
import { SEA_PLANE_SEGMENTS, SEA_PLANE_SIZE, seaPlaneOrigin } from './seaPlaneLattice'

// The vertices of the plane laid at `origin`, as world x positions of one row.
const rowXs = (originX: number, scale = 1) => {
  const cell = (SEA_PLANE_SIZE / SEA_PLANE_SEGMENTS) * scale
  const half = (SEA_PLANE_SIZE * scale) / 2
  return Array.from({ length: SEA_PLANE_SEGMENTS + 1 }, (_, i) => originX - half + i * cell)
}
const onLattice = (v: number, cell: number) => Math.abs(v / cell - Math.round(v / cell)) < 1e-9

describe('sea plane lattice (point 314)', () => {
  it('keeps every vertex on world-fixed positions while the traveller walks', () => {
    const cell = SEA_PLANE_SIZE / SEA_PLANE_SEGMENTS
    for (let step = 0; step < 40; step++) {
      const x = 123.37 + step * 0.73
      const z = -311.9 - step * 0.41
      const o = seaPlaneOrigin(x, z)
      for (const vx of rowXs(o.x)) expect(onLattice(vx, cell)).toBe(true)
      expect(onLattice(o.z - SEA_PLANE_SIZE / 2, cell)).toBe(true)
      // Never farther from him than half a cell: the plane still covers the view.
      expect(Math.abs(o.x - x)).toBeLessThanOrEqual(cell / 2 + 1e-9)
      expect(Math.abs(o.z - z)).toBeLessThanOrEqual(cell / 2 + 1e-9)
    }
  })

  it('the old continuous follow put the vertices somewhere new on each step', () => {
    const cell = SEA_PLANE_SIZE / SEA_PLANE_SEGMENTS
    expect(rowXs(123.37).some((vx) => !onLattice(vx, cell))).toBe(true)
  })

  it('holds the lattice of a scaled plane too', () => {
    const cell = (SEA_PLANE_SIZE / SEA_PLANE_SEGMENTS) * 3
    const o = seaPlaneOrigin(55.5, 17.25, 3)
    for (const vx of rowXs(o.x, 3)) expect(onLattice(vx, cell)).toBe(true)
  })
})
