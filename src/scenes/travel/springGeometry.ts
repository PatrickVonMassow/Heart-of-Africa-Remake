// Spring body geometry (design.md §11.3): a river rising in open land wells up
// as a small 3D water feature — a low upwelling dome at the centre, a wet pool
// around it and a damp apron that runs out onto the terrain, stretched into a
// short outflow lobe toward the river. One radial mesh, built in the spring's
// local frame (centre at the origin, y relative to the water level), so the
// whole feature is ONE draw call. Every apron vertex is laid on the sampled
// ground, so the rim meets the terrain — no floating disc, no clipped edge.
//
// Pure: the ground is a callback, so the shape is unit-testable without a scene.

import * as THREE from 'three/webgpu'

export interface SpringShape {
  /** Outer apron radius in world units (the wet ground the spring soaks). */
  radius: number
  /** Pool radius as a fraction of `radius`; the water sheet ends here. */
  poolFraction: number
  /** Upwelling dome radius as a fraction of `radius`. */
  domeFraction: number
  /** Height of the welling dome above the pool level, world units. */
  domeHeight: number
  /** How far the apron stretches downstream (0 = round), as a fraction of `radius`. */
  outflow: number
  /** Lift of the apron above the sampled ground, world units (no z-fight, no gap). */
  rimLift: number
}

export interface SpringBuildInput {
  shape: SpringShape
  /** Water level at the source, absolute world y. */
  waterY: number
  /** Downstream heading in the xz plane, radians (atan2(dz, dx)). */
  outflowAngle: number
  /** Radial segments around the centre (quality lever). */
  segments: number
  /** Rings from the centre to the outer rim (quality lever). */
  rings: number
  /** Absolute rendered ground height at a LOCAL offset from the centre. */
  groundAt: (dx: number, dz: number) => number
}

export interface SpringBuild {
  geometry: THREE.BufferGeometry
  /** Absolute y of the dome peak. */
  peakY: number
  /** Absolute y of the pool sheet at its edge (minimum over the pool rim). */
  poolY: number
  /** The outer rim in local xz with absolute y — what the terrain check reads. */
  rim: Array<{ dx: number; dz: number; y: number }>
}

/** The spring's fixed proportions (the size and the dome height are the
 *  calibratable balance values, balance.spring). */
export const SPRING_FORM = {
  poolFraction: 0.62,
  domeFraction: 0.32,
  outflow: 0.45,
  rimLift: 0.03,
} as const

/** The full shape from the calibratable size and dome height. */
export function springShape(radius: number, domeHeight: number): SpringShape {
  return { radius, domeHeight, ...SPRING_FORM }
}

/** The dome's height profile over normalised radius u = r / domeRadius:
 *  a smooth bump, 1 at the centre, 0 with zero slope at u = 1. */
export function domeProfile(u: number): number {
  if (u >= 1) return 0
  const k = 1 - u * u
  return k * k
}

/** Radius of the outer rim at polar angle `theta`: round, with a smooth lobe
 *  of length `outflow·radius` toward the downstream heading. */
export function rimRadius(shape: SpringShape, theta: number, outflowAngle: number): number {
  const c = Math.max(0, Math.cos(theta - outflowAngle))
  return shape.radius * (1 + shape.outflow * c * c)
}

/**
 * Build the spring body. Attributes beyond position/normal/uv:
 * - `springZone`: r / poolRadius along each spoke (0 centre, 1 pool edge, >1 apron),
 * - `springWet`: 1 on the water, falling to 0 at the outer rim (water → damp ground).
 */
export function buildSpringGeometry(input: SpringBuildInput): SpringBuild {
  const { shape, waterY, outflowAngle, groundAt } = input
  const segs = Math.max(6, Math.floor(input.segments))
  const rings = Math.max(4, Math.floor(input.rings))
  const poolR = shape.radius * shape.poolFraction
  const domeR = shape.radius * shape.domeFraction
  // Ring layout: the first ~60 % of the rings cover the pool (where the dome
  // and the ripples need the vertices), the rest the apron.
  const poolRings = Math.max(2, Math.round(rings * 0.6))
  const apronRings = Math.max(2, rings - poolRings)

  const pos: number[] = [0, 0, 0]
  const zone: number[] = [0]
  const wet: number[] = [1]
  const uvs: number[] = [0.5, 0.5]
  const centreGround = groundAt(0, 0)
  // The pool never sinks into the ground: at least `rimLift` above it.
  const level = (dx: number, dz: number) => Math.max(waterY, groundAt(dx, dz) + shape.rimLift)
  const peakY = Math.max(waterY, centreGround + shape.rimLift) + shape.domeHeight
  pos[1] = peakY - waterY
  let poolY = Infinity
  const rim: SpringBuild['rim'] = []

  for (let s = 0; s < segs; s++) {
    const theta = (s / segs) * Math.PI * 2
    const cx = Math.cos(theta)
    const sz = Math.sin(theta)
    const outerR = rimRadius(shape, theta, outflowAngle)
    let edgeY = waterY
    // Pool rings (k = 1 .. poolRings): water level plus the dome.
    for (let k = 1; k <= poolRings; k++) {
      const r = (k / poolRings) * poolR
      const dx = cx * r
      const dz = sz * r
      const y = level(dx, dz) + shape.domeHeight * domeProfile(domeR > 0 ? r / domeR : 1)
      pos.push(dx, y - waterY, dz)
      zone.push(r / poolR)
      wet.push(1)
      uvs.push(0.5 + dx / (2 * outerR), 0.5 + dz / (2 * outerR))
      if (k === poolRings) {
        edgeY = y
        poolY = Math.min(poolY, y)
      }
    }
    // Apron rings (k = 1 .. apronRings): from the pool edge out to the rim,
    // easing down onto the ground and never below it.
    for (let k = 1; k <= apronRings; k++) {
      const t = k / apronRings
      const r = poolR + (outerR - poolR) * t
      const dx = cx * r
      const dz = sz * r
      const ground = groundAt(dx, dz) + shape.rimLift
      const ease = t * t * (3 - 2 * t)
      const y = k === apronRings ? ground : Math.max(ground, edgeY + (ground - edgeY) * ease)
      pos.push(dx, y - waterY, dz)
      zone.push(r / poolR)
      wet.push(1 - ease)
      uvs.push(0.5 + dx / (2 * outerR), 0.5 + dz / (2 * outerR))
      if (k === apronRings) rim.push({ dx, dz, y })
    }
  }

  // Indices: a fan from the centre to ring 1, then quads between rings.
  const per = poolRings + apronRings
  const idx = (s: number, k: number) => 1 + (s % segs) * per + (k - 1)
  const indices: number[] = []
  for (let s = 0; s < segs; s++) {
    // Counter-clockwise seen from above (+y), so the face normals point up.
    indices.push(0, idx(s + 1, 1), idx(s, 1))
    for (let k = 1; k < per; k++) {
      const a = idx(s, k)
      const b = idx(s + 1, k)
      const c = idx(s, k + 1)
      const d = idx(s + 1, k + 1)
      indices.push(a, b, c, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('springZone', new THREE.Float32BufferAttribute(zone, 1))
  geometry.setAttribute('springWet', new THREE.Float32BufferAttribute(wet, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return { geometry, peakY, poolY: Number.isFinite(poolY) ? poolY : waterY, rim }
}
