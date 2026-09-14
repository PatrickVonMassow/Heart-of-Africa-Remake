import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { DigSite, DigSiteProgress } from './adultWork'
import { digLocalToWorld, spoilOffset, spoilHeightAt, SPOIL_RADIUS_X, SPOIL_RADIUS_Z } from './placeGround'

/** Radial resolution of the mound. The seam closes on itself (indices wrap),
 * so no vertex is duplicated and no lit crease runs down one side. */
const SPOIL_RINGS = 20
const SPOIL_RADIALS = 40

/**
 * A POLAR grid whose outer rim IS the mound's own edge. A rectangular sheet
 * covers the corners outside the ellipse too, and since it carries the earth
 * material at ground level, those corners read as a hard brown diamond laid on
 * the sand around the heap — visible in the first village frame of this point.
 * Here the last ring sits exactly where the height reaches zero, so the earth
 * simply ends where the mound does. Heights come from the walking surface.
 */
export function buildDigSpoilGeometry(site: DigSite, progress?: DigSiteProgress): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const offset = spoilOffset(site)
  positions.push(offset, 0, 0)
  for (let ring = 1; ring <= SPOIL_RINGS; ring++) for (let k = 0; k < SPOIL_RADIALS; k++) {
    const a = (k / SPOIL_RADIALS) * Math.PI * 2
    const t = ring / SPOIL_RINGS
    positions.push(offset + Math.cos(a) * t * SPOIL_RADIUS_X, 0, Math.sin(a) * t * SPOIL_RADIUS_Z)
  }
  for (let k = 0; k < SPOIL_RADIALS; k++) indices.push(0, 1 + (k + 1) % SPOIL_RADIALS, 1 + k)
  for (let ring = 1; ring < SPOIL_RINGS; ring++) {
    const inner = 1 + (ring - 1) * SPOIL_RADIALS
    const outer = 1 + ring * SPOIL_RADIALS
    for (let k = 0; k < SPOIL_RADIALS; k++) {
      const j = (k + 1) % SPOIL_RADIALS
      indices.push(inner + k, inner + j, outer + k, inner + j, outer + j, outer + k)
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
