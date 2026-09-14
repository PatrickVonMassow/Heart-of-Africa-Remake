import { expect, it } from 'vitest'
import { buildDigSpoilGeometry, updateDigSpoilGeometry } from './digSpoilGeometry'
import { digLocalToWorld, placeGroundHeight } from './placeGround'

it('draws the exact walking profile as work grows, at every vertex and site orientation', () => {
  for (const kind of ['pit', 'postHole', 'patch'] as const) {
    const site = { x: -13.4, z: 8.1, kind }
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
