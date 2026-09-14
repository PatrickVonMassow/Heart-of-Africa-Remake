import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { DigSite, DigSiteProgress } from './adultWork'
import { digLocalToWorld, spoilOffset, spoilHeightAt, SPOIL_RADIUS_X, SPOIL_RADIUS_Z } from './placeGround'

/** Local-space grid. Its heights are sampled from the walking surface itself. */
export function buildDigSpoilGeometry(site: DigSite, progress?: DigSiteProgress): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const segments = 32
  const offset = spoilOffset(site)
  for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
    positions.push(offset + (x / segments * 2 - 1) * SPOIL_RADIUS_X, 0, (z / segments * 2 - 1) * SPOIL_RADIUS_Z)
    if (x < segments && z < segments) {
      const i = z * (segments + 1) + x
      indices.push(i, i + segments + 1, i + 1, i + 1, i + segments + 1, i + segments + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  updateDigSpoilGeometry(geometry, site, progress)
  return geometry
}

export function updateDigSpoilGeometry(geometry: BufferGeometry, site: DigSite, progress?: DigSiteProgress): void {
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const p = digLocalToWorld(site, positions.getX(i), positions.getZ(i))
    positions.setY(i, spoilHeightAt(site, progress, p.x, p.z) + 0.004)
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}
