// The glTF villager's body from the appearance table (work-order "glTF villager
// body", final state 3): which morphs a person of a sex, age group and build
// gets, the skeleton those morphs imply, and the geometry with the fixed morphs
// baked in — a figure's sex, age and build never change while it lives, so only
// the closing hands stay live morph targets on the GPU, and the normals are the
// person's own rather than the basis body's.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF } from '../config/balance'
import type { AgeGroup, Sex } from '../systems/appearance'
import type { VillagerAsset } from './villagerAsset'

/** The morphs that stay live on a figure (the hands close round a tool). */
export const LIVE_MORPHS = ['grip.L', 'grip.R'] as const

/**
 * Morph influences for a person: the pipeline's morphs are bilinear over the
 * appearance table's corners (scripts/villager/body.py) — basis the adult man,
 * `female`, one morph per other age group and its female correction — so every
 * (sex, age) corner is exact. `build` (−1 slight … +1 stout) adds the adult
 * man's build morph, scaled for the age (a child's girth varies less).
 */
export function morphInfluences(sex: Sex, age: AgeGroup, build = 0): Record<string, number> {
  const w: Record<string, number> = {}
  const f = sex === 'female'
  if (f) w.female = 1
  if (age !== 'adult') {
    w[age] = 1
    if (f) w[`${age}_f`] = 1
  }
  const b = Math.max(-1, Math.min(1, build)) * VILLAGER_GLTF.buildByAge[age]
  if (b < 0) w.slight = -b
  if (b > 0) w.stout = b
  return w
}

/** The rest heads of the skeleton for a person (bones × 3). */
export function restHeads(asset: VillagerAsset, influences: Record<string, number>): Float32Array {
  const out = new Float32Array(asset.rest)
  for (const [m, w] of Object.entries(influences)) {
    const d = asset.jointDeltas[m]
    if (!d || !w) continue
    for (let i = 0; i < out.length; i++) out[i] += w * d[i]
  }
  return out
}

/** Hip height of a person over the basis body's: how much longer or shorter
 *  their legs are, in figure units — the clips' stride and hip travel scale by it. */
export function legScale(asset: VillagerAsset, rest: Float32Array): number {
  return rest[1] / asset.rest[1]
}

/**
 * A geometry with the fixed morphs baked into its positions and its normals
 * recomputed, keeping only the live morphs (the hands) as morph targets.
 * Shares nothing mutable with the source.
 */
export function bakeMorphs(src: THREE.BufferGeometry, influences: Record<string, number>): THREE.BufferGeometry {
  const g = src.clone()
  const names = (src.userData.targetNames as string[] | undefined) ?? []
  const morphs = src.morphAttributes.position ?? []
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const arr = new Float32Array(pos.array as ArrayLike<number>)
  names.forEach((name, k) => {
    const w = influences[name]
    if (!w) return
    const d = morphs[k].array as ArrayLike<number>
    for (let i = 0; i < arr.length; i++) arr[i] += w * d[i]
  })
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  g.morphAttributes = {}
  const live: THREE.BufferAttribute[] = []
  const liveNames: string[] = []
  names.forEach((name, k) => {
    if ((LIVE_MORPHS as readonly string[]).includes(name)) {
      live.push(morphs[k] as THREE.BufferAttribute)
      liveNames.push(name)
    }
  })
  if (live.length) g.morphAttributes.position = live
  g.morphTargetsRelative = true
  g.userData = { ...src.userData, targetNames: liveNames }
  g.deleteAttribute('normal')
  g.computeVertexNormals()
  return g
}

/** Where the body safety net applies, as shares of the body's height and
 *  half-widths over it: every chest front, and a child's pelvis midline. */
const CHEST_REGION = { y0: 0.62, y1: 0.78, halfWidth: 0.1, minFacing: 0.3 } as const
const PELVIS_REGION = { y0: 0.36, y1: 0.52, halfWidth: 0.04, minFacing: -0.2 } as const

/** How sharply a vertex peaks: its offset above its neighbours' mean along
 *  its normal, over their mean edge length (0 on a plane, > 0 on a bump). */
export function peakSharpness(p: THREE.Vector3, n: THREE.Vector3, ring: readonly THREE.Vector3[]): number {
  const m = new THREE.Vector3()
  let edge = 0
  for (const q of ring) {
    m.add(q)
    edge += q.distanceTo(p)
  }
  m.divideScalar(ring.length)
  edge /= ring.length
  return edge > 0 ? m.sub(p).dot(n) / -edge : 0
}

/** The region test of the safety net, per vertex of a standing body (+z the front). */
export function inPeakRegion(p: THREE.Vector3, n: THREE.Vector3, yMin: number, height: number, child: boolean): boolean {
  const f = (p.y - yMin) / height
  const regions = child ? [CHEST_REGION, PELVIS_REGION] : [CHEST_REGION]
  return regions.some((r) => f > r.y0 && f < r.y1 && Math.abs(p.x) < r.halfWidth * height && n.z > r.minFacing)
}

/** Each vertex's neighbours over an indexed geometry's triangles. */
export function vertexRings(g: THREE.BufferGeometry): Set<number>[] {
  const idx = g.index
  if (!idx) throw new Error('vertexRings: indexed geometry expected')
  const rings = Array.from({ length: g.getAttribute('position').count }, () => new Set<number>())
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
    for (let k = 0; k < 3; k++) {
      rings[v[k]].add(v[(k + 1) % 3])
      rings[v[(k + 1) % 3]].add(v[k])
    }
  }
  return rings
}

/**
 * The body safety net (design.md clothing rule): a stylised bust and a child's
 * smooth pelvis. Every vertex of the chest front (and a child's pelvis
 * midline) that peaks sharper than VILLAGER_GLTF.trunkPeakSharpnessMax — the
 * breast apex the MakeHuman breast target leaves as a point, the crotch apex — is pulled
 * inward along its normal until it does not. Inward only, so a dress layer
 * fitted outside the body stays outside. On the grounded body (y = 0 the
 * sole); in place, normals recomputed.
 */
export function stylisePeaks(g: THREE.BufferGeometry, child: boolean, passes = 32): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nor = g.getAttribute('normal') as THREE.BufferAttribute
  const cap = VILLAGER_GLTF.trunkPeakSharpnessMax
  const rings = vertexRings(g)
  g.computeBoundingBox()
  const yMin = g.boundingBox!.min.y
  const height = g.boundingBox!.max.y - yMin
  const P = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i))
  const N = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(nor, i).normalize())
  const region = P.map((p, i) => rings[i].size >= 3 && inPeakRegion(p, N[i], yMin, height, child))
  for (let pass = 0; pass < passes; pass++) {
    const moves: [number, number][] = []
    for (let i = 0; i < P.length; i++) {
      if (!region[i]) continue
      const ring = [...rings[i]].map((j) => P[j])
      const s = peakSharpness(P[i], N[i], ring)
      if (s <= cap) continue
      const edge = ring.reduce((a, q) => a + q.distanceTo(P[i]), 0) / ring.length
      moves.push([i, (s - cap) * edge])
    }
    if (!moves.length) break
    for (const [i, d] of moves) P[i].addScaledVector(N[i], -d)
  }
  P.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z))
  pos.needsUpdate = true
  g.deleteAttribute('normal')
  g.computeVertexNormals()
  return g
}
