// WHAT THE PLAY ROCK ACTUALLY PRESENTS, height by height (work-order 1065).
//
// The children's play rock is one collider radius and one drawn mesh, and until
// now those were the SAME number: `PLAY_ROCK_SCALE` sized the mesh so its widest
// ring measured exactly the collider's `PLAY_ROCK_RADIUS`. That is a safe
// collider and a false surface. The rock is a weathered boulder — narrow at the
// foot, widest at about two thirds of its height, tapering again to the crown —
// so at the height a child's HAND is (some 0.35-0.45 m) its drawn silhouette
// stands a good 0.2 m inside the ring the collider draws.
//
// That gap is the whole of the defect this module answers: a child kept outside
// `collider + walker radius` cannot reach the stone it is naming, however far it
// leans, because the ring it is kept behind is not where the stone is.
//
// So the surface is MEASURED from the geometry the scene draws — the same
// `buildPlayRock` mesh at the same instance scale and instance yaw — and every
// consumer asks it rather than a nominal radius. A rock built wider, narrower or
// with different weathering moves the answer with it.

import * as THREE from 'three'
import { buildPlayRock } from '../../render/flora'

/**
 * The seeds the two play rocks are built from, upstream first — the SAME two
 * the scene instances, so the silhouette measured here is the silhouette drawn
 * (points 129/378). `PlaceScene` reads them from here rather than repeating
 * them.
 */
export const PLAY_ROCK_SEEDS: readonly [number, number] = [0x504c4159, 0x524f434b]

/**
 * The instance yaw of a play rock standing at (x,z). It varies the silhouette
 * between the two stones while preserving the mesh's broad base; the surface
 * lookups take it, so a rock's measured flank is the one facing the child.
 */
export function playRockYaw(at: { x: number; z: number }): number {
  return at.x * 1.7 + at.z
}

/** Cached mesh triangles, with height bounds to skip faces outside a slice. */
interface SurfaceTriangle {
  plane: THREE.Plane
  edges: THREE.Plane[]
  low: number
  high: number
}

const cache = new Map<number, SurfaceTriangle[]>()

function surfaceTriangles(seed: number): SurfaceTriangle[] {
  const held = cache.get(seed)
  if (held) return held
  const geometry = buildPlayRock(seed)
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triangles: SurfaceTriangle[] = []
  for (let k = 0; k < (index?.count ?? position.count); k += 3) {
    const vertices = [0, 1, 2].map((offset) =>
      new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(k + offset) : k + offset))
    const [a, b, c] = vertices
    const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c)
    triangles.push({
      plane,
      edges: vertices.map((v, i) => new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3().subVectors(vertices[(i + 1) % 3], v).cross(plane.normal).normalize(), v)),
      low: Math.min(...vertices.map((v) => v.y)),
      high: Math.max(...vertices.map((v) => v.y)),
    })
  }
  geometry.dispose()
  cache.set(seed, triangles)
  return triangles
}

// Synchronous queries reuse scratch vectors; only the two immutable meshes are
// cached. No raycaster, material, scene graph or per-query allocation is needed.
const hit = new THREE.Vector3()
// Shared-edge rounding must not turn a vertex into a hole. This is one tenth
// of a nanometre in mesh units, not a contact or silhouette allowance.
const EDGE_EPSILON = 1e-10

/**
 * Exact outer flank at this world height and bearing. Intersect the mesh's
 * triangles, not a table of neighbouring edge maxima: that table overstated
 * the flank by centimetres even when the solved and drawn hand agreed exactly
 * (see docs/hand-stone-contact.md). Outside the mesh there is no surface.
 */
export function playRockSurfaceRadius(
  seed: number,
  scale: number,
  yaw: number,
  bearing: number,
  y: number,
): number {
  const height = y / scale
  const local = bearing - yaw
  const dx = Math.sin(local)
  const dz = Math.cos(local)
  let radius = 0
  for (const { plane, edges, low, high } of surfaceTriangles(seed)) {
    if (height < low - EDGE_EPSILON || height > high + EDGE_EPSILON) continue
    const denominator = plane.normal.x * dx + plane.normal.z * dz
    if (Math.abs(denominator) < 1e-12) continue
    const distance = -(plane.constant + plane.normal.y * height) / denominator
    if (distance < 0 || distance < radius) continue
    hit.set(dx * distance, height, dz * distance)
    if (edges.every((edge) => edge.distanceToPoint(hit) <= EDGE_EPSILON)) radius = distance
  }
  return radius * scale
}

/**
 * THE FLANK LOOKUP THE CHILDREN'S ROUND ASKS. Bound to one settlement's two
 * placed rocks, so caller and renderer read one stone: same seed, same instance
 * scale, same instance yaw.
 */
export function playRockFlank(rocks: {
  upstream: { x: number; z: number }
  downstream: { x: number; z: number }
  scale: number
}): (end: 'upstream' | 'downstream', bearing: number, y: number) => number {
  const at = { upstream: rocks.upstream, downstream: rocks.downstream }
  const seed = { upstream: PLAY_ROCK_SEEDS[0], downstream: PLAY_ROCK_SEEDS[1] }
  return (end, bearing, y) =>
    playRockSurfaceRadius(seed[end], rocks.scale, playRockYaw(at[end]), bearing, y)
}
