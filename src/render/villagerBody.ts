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
