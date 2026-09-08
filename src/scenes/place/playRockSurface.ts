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

/** Bearing bins of one profile ring. 32 bins is 11.25° — finer than the mesh's
 *  own facets at detail 1, so the ring resolves every face rather than
 *  averaging neighbouring ones into a bulge that is not drawn. */
export const PROFILE_BINS = 32

/** Height rings sampled per rock, from the foot to the crown. The rock is
 *  1.05 mesh units tall; 22 rings put one every ~5 cm of drawn height, which is
 *  finer than the 6 cm a hand is wide. */
export const PROFILE_RINGS = 22

/** One rock's measured silhouette: `rings[i][bin]` is the mesh-unit radius of
 *  the surface at height `i / (PROFILE_RINGS - 1) * height`, on that bearing. */
export interface RockProfile {
  /** Mesh height the rings span. */
  height: number
  rings: readonly (readonly number[])[]
}

const cache = new Map<number, RockProfile>()

/** The silhouette of the play rock built from `seed`, measured once per seed. */
export function playRockProfile(seed: number): RockProfile {
  const held = cache.get(seed)
  if (held) return held
  const built = measure(buildPlayRock(seed))
  cache.set(seed, built)
  return built
}

function measure(geometry: THREE.BufferGeometry): RockProfile {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  let height = 0
  for (let i = 0; i < position.count; i++) height = Math.max(height, position.getY(i))
  const rings: number[][] = Array.from({ length: PROFILE_RINGS }, () => new Array<number>(PROFILE_BINS).fill(0))
  const at = (k: number): [number, number, number] => [position.getX(k), position.getY(k), position.getZ(k)]

  for (let t = 0; t < count; t += 3) {
    const vs = [0, 1, 2].map((o) => at(index ? index.getX(t + o) : t + o))
    for (let r = 0; r < PROFILE_RINGS; r++) {
      const y = (r / (PROFILE_RINGS - 1)) * height
      for (let e = 0; e < 3; e++) {
        const a = vs[e]
        const b = vs[(e + 1) % 3]
        // The edge has to CROSS this height for the ring to see it; an edge
        // lying exactly in the plane is taken at its own end points.
        if ((a[1] - y) * (b[1] - y) > 0) continue
        const span = b[1] - a[1]
        const f = Math.abs(span) < 1e-9 ? 0 : (y - a[1]) / span
        const x = a[0] + (b[0] - a[0]) * f
        const z = a[2] + (b[2] - a[2]) * f
        let bin = Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * PROFILE_BINS)
        bin = ((bin % PROFILE_BINS) + PROFILE_BINS) % PROFILE_BINS
        rings[r][bin] = Math.max(rings[r][bin], Math.hypot(x, z))
      }
    }
  }
  // A bin no edge crossed at this height takes its neighbours' answer rather
  // than zero: a gap in the sampling is not a hole in the stone.
  for (const ring of rings) fillGaps(ring)
  return { height, rings }
}

function fillGaps(ring: number[]): void {
  const known = ring.filter((r) => r > 0)
  if (known.length === 0) return
  for (let i = 0; i < ring.length; i++) {
    if (ring[i] > 0) continue
    for (let step = 1; step <= ring.length; step++) {
      const left = ring[(i - step + ring.length * 2) % ring.length]
      const right = ring[(i + step) % ring.length]
      const found = Math.max(left, right)
      if (found > 0) {
        ring[i] = found
        break
      }
    }
  }
}

/**
 * The world radius of a play rock's drawn surface at world height `y`, on the
 * WORLD bearing `bearing` measured from the rock's own axis (`atan2(dx, dz)`,
 * the codebase's own convention).
 *
 * `scale` is the instance scale and `yaw` the instance rotation, so the answer
 * is the silhouette the picture shows, not the mesh's unrotated one. Heights
 * outside the rock take the nearest ring — below the foot that is the foot,
 * above the crown the crown, and neither is a surface a hand can meet.
 */
export function playRockSurfaceRadius(
  seed: number,
  scale: number,
  yaw: number,
  bearing: number,
  y: number,
): number {
  const profile = playRockProfile(seed)
  const local = bearing - yaw
  const bin = ((Math.round(((local + Math.PI) / (2 * Math.PI)) * PROFILE_BINS) % PROFILE_BINS) + PROFILE_BINS) % PROFILE_BINS
  const at = Math.max(0, Math.min(PROFILE_RINGS - 1, ((y / scale) / profile.height) * (PROFILE_RINGS - 1)))
  const lo = Math.floor(at)
  const hi = Math.min(PROFILE_RINGS - 1, lo + 1)
  const f = at - lo
  const r = profile.rings[lo][bin] * (1 - f) + profile.rings[hi][bin] * f
  return r * scale
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
