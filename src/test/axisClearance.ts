// Test helper: how far one garment's vertices clear another's surface, read
// along rays from the trunk's vertical axis (x = z = 0) through each vertex —
// per vertex, not a bounding box, so no single vertex can pass through
// unseen while an extreme point stays clear.
import * as THREE from 'three/webgpu'

/** The farthest hit of a ray from the axis at height y toward (x, z), or null. */
function farthestHit(g: THREE.BufferGeometry, y: number, x: number, z: number): number | null {
  const ray = new THREE.Ray(new THREE.Vector3(0, y, 0), new THREE.Vector3(x, 0, z).normalize())
  const pos = g.getAttribute('position')
  const idx = g.getIndex()!
  const [a, b, c, hit] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  let far: number | null = null
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t))
    b.fromBufferAttribute(pos, idx.getX(t + 1))
    c.fromBufferAttribute(pos, idx.getX(t + 2))
    if (ray.intersectTriangle(a, b, c, false, hit)) far = Math.max(far ?? 0, hit.distanceTo(ray.origin))
  }
  return far
}

/**
 * The least clearance of `g`'s vertices from `other`'s surface: `inside`, how
 * far each vertex lies inside it (toward the axis); `outside`, how far beyond
 * it. Negative where a vertex passes through. Vertices whose ray meets no
 * part of `other` (an opening) are skipped; `count` says how many were met.
 * `band`: only `g`'s vertices between these heights.
 */
export function axisClearance(
  g: THREE.BufferGeometry,
  other: THREE.BufferGeometry,
  side: 'inside' | 'outside',
  band: [number, number] = [-Infinity, Infinity],
): { min: number; count: number } {
  const pos = g.getAttribute('position')
  let min = Infinity
  let count = 0
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    const r = Math.hypot(x, z)
    if (r < 1e-6 || y < band[0] || y > band[1]) continue
    const far = farthestHit(other, y, x, z)
    if (far === null) continue
    count++
    min = Math.min(min, side === 'inside' ? far - r : r - far)
  }
  return { min, count }
}
