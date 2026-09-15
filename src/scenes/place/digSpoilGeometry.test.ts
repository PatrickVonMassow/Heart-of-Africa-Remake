import { expect, it } from 'vitest'
import { buildDigSpoilGeometry, updateDigSpoilGeometry } from './digSpoilGeometry'
import { digLocalToWorld, placeGroundHeight, spoilOffset, SPOIL_RADIUS_X, SPOIL_RADIUS_Z } from './placeGround'

it('draws the exact walking profile as work grows, at every vertex and site orientation', () => {
  for (const kind of ['pit', 'postHole', 'patch'] as const) {
    const site = { x: -13.4, z: 8.1, kind, rotation: Math.PI / 3 }
    const geometry = buildDigSpoilGeometry(site)
    for (const dug of [0, 3, 9, 18, 100]) {
      const progress = { dug, strikes: 0 }
      updateDigSpoilGeometry(geometry, site, progress)
      const positions = geometry.getAttribute('position')
      let peak = 0
      for (let i = 0; i < positions.count; i++) {
        const p = digLocalToWorld(site, positions.getX(i), positions.getZ(i))
        const height = placeGroundHeight({ bank: null, sites: [site], progress: [progress] }, p.x, p.z)
        expect(positions.getY(i) - 0.004).toBeCloseTo(height, 6)
        peak = Math.max(peak, height)
      }
      expect(peak).toBeGreaterThanOrEqual(0.119)
      expect(geometry.boundingSphere!.radius).toBeGreaterThan(1)
      const normals = geometry.getAttribute('normal')
      for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeGreaterThan(0)
    }
    geometry.dispose()
  }
})

// THE EARTH ENDS WHERE THE MOUND ENDS. A rectangular sheet reaches past the
// ellipse and lays earth-coloured corners on the sand around the heap; the
// first village frame of this point showed that diamond under both sites.
it('lays no earth outside the mound, and closes its seam', () => {
  for (const kind of ['pit', 'postHole', 'patch'] as const) {
    const site = { x: 4.2, z: -7.9, kind, rotation: 1.1 }
    const geometry = buildDigSpoilGeometry(site)
    const positions = geometry.getAttribute('position')
    const offset = spoilOffset(site)
    let rim = 0
    for (let i = 0; i < positions.count; i++) {
      const u = (positions.getX(i) - offset) / SPOIL_RADIUS_X
      const v = positions.getZ(i) / SPOIL_RADIUS_Z
      const r = Math.hypot(u, v)
      expect(r).toBeLessThanOrEqual(1 + 1e-6)
      rim = Math.max(rim, r)
      // Everything drawn beyond the mound's foot would be a flat earth skirt.
      if (r > 0.999) expect(positions.getY(i) - 0.004).toBeCloseTo(0, 6)
    }
    // The outer ring really reaches the foot, so the mesh covers the whole mound.
    expect(rim).toBeCloseTo(1, 6)
    // A CLOSED SEAM IS A CLAIM ABOUT TRIANGLES, NOT ABOUT POSITIONS. Unique
    // vertex positions still hold with the wraparound triangles deleted, and
    // that leaves an open wedge down one side. So count edge incidence: every
    // interior edge carries two triangles, and the only boundary edges are the
    // rim's own closed loop.
    const index = geometry.getIndex()!
    const edges = new Map<string, number>()
    for (let t = 0; t < index.count; t += 3) {
      const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
      for (let e = 0; e < 3; e++) {
        const a = tri[e]
        const b = tri[(e + 1) % 3]
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }
    const radius = (i: number) =>
      Math.hypot((positions.getX(i) - offset) / SPOIL_RADIUS_X, positions.getZ(i) / SPOIL_RADIUS_Z)
    for (const [, count] of edges) expect(count).toBeLessThanOrEqual(2)
    const boundary = [...edges].filter(([, count]) => count === 1).map(([key]) => key)
    let rimCount = 0
    for (let i = 0; i < positions.count; i++) if (radius(i) > 0.999) rimCount++
    expect(rimCount).toBeGreaterThan(8)
    // The rim loop is closed, so it contributes exactly one edge per rim vertex
    // — and nothing else in the mesh is left open.
    expect(boundary.length).toBe(rimCount)
    for (const key of boundary) {
      for (const v of key.split('|')) expect(radius(Number(v))).toBeCloseTo(1, 6)
    }
    // And no vertex is duplicated, so lighting has no crease at the seam.
    const seen = new Set<string>()
    for (let i = 0; i < positions.count; i++) {
      seen.add(`${positions.getX(i).toFixed(6)}|${positions.getZ(i).toFixed(6)}`)
    }
    expect(seen.size).toBe(positions.count)
    geometry.dispose()
  }
})
