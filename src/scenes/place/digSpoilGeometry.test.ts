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
    // A closed seam: no two vertices share a position, so lighting has no crease.
    const seen = new Set<string>()
    for (let i = 0; i < positions.count; i++) {
      seen.add(`${positions.getX(i).toFixed(6)}|${positions.getZ(i).toFixed(6)}`)
    }
    expect(seen.size).toBe(positions.count)
    geometry.dispose()
  }
})
