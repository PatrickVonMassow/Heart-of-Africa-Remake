// The villager's code-built skinned body (work-order "villager dress", body 2a):
// swept surfaces along a skeleton of 17 bones, with age, sex and build as
// proportion parameters — children with a child's head-to-body ratio. No asset.
//
// Units are the figure's own: an adult man stands FIGURE_STATURE tall, the
// crown height of the primitive figure (body cone 1.0 + head), so every caller
// that sizes, labels or collides a figure by its scale keeps working. A child
// is built to the same stature with a child's proportions and is drawn small by
// its caller's scale, exactly as the primitive child is. +x is the figure's
// LEFT, +z its front, y up (render/figures.ts).

import * as THREE from 'three/webgpu'
import type { AgeGroup, Sex } from '../systems/appearance'
import { merge, sweepTube, type SweepStation } from './faunaGeometry'

/** Crown height of an adult man, in figure units (= primitive cone 1 + head). */
export const FIGURE_STATURE = 1.34

/** The 17 bones, parents before children. Index = skinIndex. */
export const BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'upperArm.L',
  'forearm.L',
  'hand.L',
  'upperArm.R',
  'forearm.R',
  'hand.R',
  'thigh.L',
  'shin.L',
  'foot.L',
  'thigh.R',
  'shin.R',
  'foot.R',
] as const
export type BoneName = (typeof BONE_NAMES)[number]
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  'upperArm.L': 'chest',
  'forearm.L': 'upperArm.L',
  'hand.L': 'forearm.L',
  'upperArm.R': 'chest',
  'forearm.R': 'upperArm.R',
  'hand.R': 'forearm.R',
  'thigh.L': 'hips',
  'shin.L': 'thigh.L',
  'foot.L': 'shin.L',
  'thigh.R': 'hips',
  'shin.R': 'thigh.R',
  'foot.R': 'shin.R',
}
export const boneIndex = (n: BoneName): number => BONE_NAMES.indexOf(n)

/** Everything the skeleton and the surfaces are built from, in figure units. */
export interface BodyProportions {
  stature: number
  crownY: number
  chinY: number
  /** Head half-height and half-width (an ellipsoid skull). */
  headHalfH: number
  headHalfW: number
  neckY: number
  neckR: number
  shoulderY: number
  shoulderX: number
  chestY: number
  chestHalfW: number
  chestHalfD: number
  waistY: number
  waistHalfW: number
  pelvisHalfW: number
  hipY: number
  hipX: number
  kneeY: number
  ankleY: number
  upperArm: number
  forearm: number
  hand: number
  armR: number
  thighR: number
  calfR: number
  footLen: number
  /** Forward bend of the chest and neck at rest (rad): the elder's stoop. */
  stoop: number
  /** Hair colour (grey for the elder). */
  hair: string
  /** Standing knee bend (rad): the elder's give at the knees. */
  kneeFlex: number
  /** A short beard on the jaw (the old man's grey one). */
  beard: boolean
}

/** Stature against an adult man's, by sex and age (anthropometric means). */
const STATURE: Record<AgeGroup, Record<Sex, number>> = {
  child: { male: 1, female: 1 }, // drawn small by the caller's scale
  youth: { male: 0.98, female: 0.94 },
  adult: { male: 1, female: 0.94 },
  elder: { male: 0.97, female: 0.91 },
}

/**
 * The proportions of a body. Fractions of stature are standard anthropometric
 * means (adult: head 1/7.6 of stature, shoulder at 0.82, hip joint at 0.52,
 * knee at 0.285; a child of about seven: head 1/5.6, hip at 0.47). `build` runs
 * from −1 (slight) to +1 (stout) and scales the girth only.
 */
export function bodyProportions(sex: Sex, age: AgeGroup, build = 0): BodyProportions {
  const H = FIGURE_STATURE * STATURE[age][sex]
  const child = age === 'child'
  const f = sex === 'female'
  const girth = (1 + 0.12 * build) * (age === 'elder' ? 0.9 : age === 'youth' ? 0.95 : 1)
  const limb = age === 'elder' ? 0.85 : 1
  // The young man's square shoulders against the old man's narrow, sloping
  // ones — the age read from the FRONT, where a stoop barely shows.
  const span = child ? 1 : age === 'youth' && !f ? 1.06 : age === 'elder' ? 0.92 : 1
  const headH = child ? 0.178 : 0.132
  const chinY = 1 - headH
  return {
    stature: H,
    crownY: H,
    chinY: H * chinY,
    headHalfH: (H * headH) / 2,
    headHalfW: H * (child ? 0.074 : 0.055),
    neckY: H * (chinY - (child ? 0.035 : 0.045)),
    neckR: H * (child ? 0.03 : 0.028) * girth,
    shoulderY: H * (child ? 0.77 : 0.815),
    shoulderX: H * (child ? 0.105 : f ? 0.112 : 0.128) * (0.9 + 0.1 * girth) * span,
    chestY: H * (child ? 0.68 : 0.72),
    chestHalfW: H * (child ? 0.095 : f ? 0.094 : 0.104) * girth * span,
    chestHalfD: H * (child ? 0.065 : f ? 0.07 : 0.066) * girth,
    waistY: H * (child ? 0.58 : 0.61),
    waistHalfW: H * (child ? 0.085 : f ? 0.072 : 0.078) * girth,
    pelvisHalfW: H * (child ? 0.085 : f ? 0.1 : 0.088) * girth,
    hipY: H * (child ? 0.47 : 0.52),
    hipX: H * (child ? 0.045 : f ? 0.054 : 0.05),
    kneeY: H * (child ? 0.255 : 0.285),
    ankleY: H * 0.04,
    upperArm: H * (child ? 0.16 : 0.175),
    forearm: H * (child ? 0.13 : 0.15),
    hand: H * (child ? 0.05 : 0.055),
    armR: H * (child ? 0.028 : 0.029) * girth * limb,
    thighR: H * (child ? 0.046 : f ? 0.055 : 0.05) * girth * limb,
    calfR: H * (child ? 0.032 : 0.033) * girth * limb,
    footLen: H * (child ? 0.12 : 0.13),
    // The age read at a distance is the posture (work-order "villager dress",
    // final state 6): the elder bent at the chest and giving at the knees.
    stoop: age === 'elder' ? 0.42 : 0,
    hair: age === 'elder' ? '#bcb7ad' : '#1c1814',
    kneeFlex: age === 'elder' ? 0.16 : 0,
    beard: age === 'elder' && !f,
  }
}

/** The bind-pose position of each bone's head (its joint), in figure units. */
export function jointPositions(p: BodyProportions): Record<BoneName, THREE.Vector3> {
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)
  const arm = (s: number) => {
    const x = s * p.shoulderX
    return {
      up: v(x, p.shoulderY),
      fore: v(x, p.shoulderY - p.upperArm),
      hand: v(x, p.shoulderY - p.upperArm - p.forearm),
    }
  }
  const L = arm(1)
  const R = arm(-1)
  return {
    hips: v(0, p.hipY),
    spine: v(0, p.hipY),
    chest: v(0, p.waistY),
    neck: v(0, p.neckY),
    head: v(0, p.chinY),
    'upperArm.L': L.up,
    'forearm.L': L.fore,
    'hand.L': L.hand,
    'upperArm.R': R.up,
    'forearm.R': R.fore,
    'hand.R': R.hand,
    'thigh.L': v(p.hipX, p.hipY),
    'shin.L': v(p.hipX, p.kneeY),
    'foot.L': v(p.hipX, p.ankleY),
    'thigh.R': v(-p.hipX, p.hipY),
    'shin.R': v(-p.hipX, p.kneeY),
    'foot.R': v(-p.hipX, p.ankleY),
  }
}

/** Each bone's segment in bind pose — the line its weights are measured to. */
export function boneSegments(p: BodyProportions): Record<BoneName, [THREE.Vector3, THREE.Vector3]> {
  const j = jointPositions(p)
  const down = (a: THREE.Vector3, d: number) => a.clone().add(new THREE.Vector3(0, -d, 0))
  return {
    hips: [down(j.hips, 0.08 * p.stature), j.hips.clone()],
    spine: [j.spine, j.chest],
    chest: [j.chest, j.neck],
    neck: [j.neck, j.head],
    head: [j.head, new THREE.Vector3(0, p.crownY, 0)],
    'upperArm.L': [j['upperArm.L'], j['forearm.L']],
    'forearm.L': [j['forearm.L'], j['hand.L']],
    'hand.L': [j['hand.L'], down(j['hand.L'], p.hand * 2)],
    'upperArm.R': [j['upperArm.R'], j['forearm.R']],
    'forearm.R': [j['forearm.R'], j['hand.R']],
    'hand.R': [j['hand.R'], down(j['hand.R'], p.hand * 2)],
    'thigh.L': [j['thigh.L'], j['shin.L']],
    'shin.L': [j['shin.L'], j['foot.L']],
    'foot.L': [j['foot.L'], new THREE.Vector3(p.hipX, 0.01, p.footLen * 0.75)],
    'thigh.R': [j['thigh.R'], j['shin.R']],
    'shin.R': [j['shin.R'], j['foot.R']],
    'foot.R': [j['foot.R'], new THREE.Vector3(-p.hipX, 0.01, p.footLen * 0.75)],
  }
}

/**
 * A skeleton of `BONE_NAMES` in bind pose, the root (hips) unparented. Its
 * inverses are taken here, while the root is still at the origin, so a mesh
 * bound to it may then be placed anywhere.
 */
export function createSkeleton(p: BodyProportions): { skeleton: THREE.Skeleton; bones: Record<BoneName, THREE.Bone> } {
  const j = jointPositions(p)
  const bones = {} as Record<BoneName, THREE.Bone>
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone()
    b.name = `bone-${name}`
    const parent = PARENT[name]
    b.position.copy(j[name])
    if (parent) {
      b.position.sub(j[parent])
      bones[parent].add(b)
    }
    bones[name] = b
  }
  bones.hips.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(BONE_NAMES.map((n) => bones[n]))
  return { skeleton, bones }
}

const seg = new THREE.Vector3()
const rel = new THREE.Vector3()
function distanceToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  seg.subVectors(b, a)
  rel.subVectors(p, a)
  const len2 = seg.lengthSq()
  const t = len2 > 0 ? Math.min(1, Math.max(0, rel.dot(seg) / len2)) : 0
  return rel.addScaledVector(seg, -t).length()
}

/**
 * The bone weighting of one surface vertex: up to four of `candidates`, by
 * inverse distance to their bind-pose segments (power 4 keeps a joint's blend
 * a few centimetres wide). `extra` adds a fixed share of a further bone — the
 * shoulder cap's upper arm — before normalising.
 */
export function vertexWeights(
  v: THREE.Vector3,
  segs: Record<BoneName, [THREE.Vector3, THREE.Vector3]>,
  candidates: readonly BoneName[],
  extra?: { bone: BoneName; share: number },
): Array<[number, number]> {
  const out = candidates.map((n) => {
    const d = distanceToSegment(v, segs[n][0], segs[n][1])
    return [boneIndex(n), 1 / (d * d * d * d + 1e-7)] as [number, number]
  })
  out.sort((a, b) => b[1] - a[1])
  let top = out.slice(0, 4)
  let sum = top.reduce((s, w) => s + w[1], 0)
  top = top.map(([i, w]) => [i, w / sum])
  if (extra && extra.share > 0) {
    top = top.map(([i, w]) => [i, w * (1 - extra.share)] as [number, number])
    const k = boneIndex(extra.bone)
    const at = top.findIndex(([i]) => i === k)
    if (at >= 0) top[at][1] += extra.share
    else {
      if (top.length === 4) top.pop()
      top.push([k, extra.share])
    }
    sum = top.reduce((s, w) => s + w[1], 0)
    top = top.map(([i, w]) => [i, w / sum])
  }
  return top
}

/** Give `geo` skinIndex/skinWeight by a per-vertex weighting function. */
export function skinGeometry(
  geo: THREE.BufferGeometry,
  weigh: (v: THREE.Vector3) => Array<[number, number]>,
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position')
  const idx = new Uint16Array(pos.count * 4)
  const wts = new Float32Array(pos.count * 4)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    weigh(v).forEach(([b, w], k) => {
      idx[i * 4 + k] = b
      wts[i * 4 + k] = w
    })
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4))
  return geo
}

/** Name of the per-vertex surface attribute: [pattern kind, a, b, roughness]. */
export const SURFACE_ATTRIBUTE = 'figureSurface'
/** Name of the per-vertex second colour a pattern mixes towards. */
export const SECOND_COLOUR_ATTRIBUTE = 'figureColour2'

/** Colour a part and give it a surface: one pattern kind + params + roughness. */
export function paint(
  geo: THREE.BufferGeometry,
  hex: string,
  surface: [number, number, number, number] = [0, 0, 0, 0.85],
  hex2: string = hex,
): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count
  const a = new THREE.Color(hex)
  const b = new THREE.Color(hex2)
  const col = new Float32Array(n * 3)
  const col2 = new Float32Array(n * 3)
  const surf = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    col.set([a.r, a.g, a.b], i * 3)
    col2.set([b.r, b.g, b.b], i * 3)
    surf.set(surface, i * 4)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setAttribute(SECOND_COLOUR_ATTRIBUTE, new THREE.BufferAttribute(col2, 3))
  geo.setAttribute(SURFACE_ATTRIBUTE, new THREE.BufferAttribute(surf, 4))
  return geo
}

/** Keep only the attributes the figure material reads, so parts merge. */
export function tidy(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo : geo
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight', SURFACE_ATTRIBUTE, SECOND_COLOUR_ATTRIBUTE].includes(name)) {
      g.deleteAttribute(name)
    }
  }
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
  return g
}

const st = (x: number, y: number, z: number, rx: number, ry: number): SweepStation => ({ p: [x, y, z], rx, ry })

const TORSO_BONES: readonly BoneName[] = ['hips', 'spine', 'chest', 'neck']
const armBones = (s: 'L' | 'R'): BoneName[] => [`upperArm.${s}`, `forearm.${s}`, `hand.${s}`]
const legBones = (s: 'L' | 'R'): BoneName[] => ['hips', `thigh.${s}`, `shin.${s}`, `foot.${s}`]

export interface BodyLook {
  skin: string
  /** Body paint over the skin (ochre, camwood), or null. */
  paint: string | null
}

/**
 * The body surface of `p`, skinned to the 17 bones: torso, neck, head with a
 * nose and a hair cap, arms with hands, legs with feet — one geometry.
 * `radial` is the ring resolution of the trunk and head; limbs take two thirds.
 */
export function buildBodyGeometry(p: BodyProportions, look: BodyLook, radial = 16): THREE.BufferGeometry {
  const segs = boneSegments(p)
  const skin = look.paint ? mixHex(look.skin, look.paint, 0.55) : look.skin
  const limbRadial = Math.max(6, Math.round((radial * 2) / 3))
  const parts: THREE.BufferGeometry[] = []
  const add = (geo: THREE.BufferGeometry, weigh: (v: THREE.Vector3) => Array<[number, number]>, hex: string, surface?: [number, number, number, number]) => {
    parts.push(tidy(skinGeometry(paint(geo, hex, surface), weigh)))
  }

  // TORSO: crotch → pelvis → waist → chest → shoulders → neck base. The
  // shoulder cap blends into the upper arms so a raised arm lifts it.
  const torso = sweepTube(
    trunkProfile(p).map(([y, rx, rz]) => st(0, y, 0, rx, rz)),
    { radial, rings: 18, capStart: true },
  )
  add(torso, (v) => {
    const cap = (v.y - (p.shoulderY - 0.07 * p.stature)) / (0.07 * p.stature)
    const side = Math.abs(v.x) / (p.shoulderX + p.armR)
    const share = Math.max(0, Math.min(1, cap)) * Math.max(0, Math.min(1, (side - 0.45) / 0.45)) * 0.7
    return vertexWeights(v, segs, TORSO_BONES, { bone: v.x > 0 ? 'upperArm.L' : 'upperArm.R', share })
  }, skin)

  // NECK and HEAD: the skull an ellipsoid, a nose so the face has a front.
  const neck = sweepTube(
    [st(0, p.neckY - 0.01 * p.stature, 0, p.neckR, p.neckR), st(0, p.chinY + 0.02 * p.stature, 0.005, p.neckR * 0.95, p.neckR)],
    { radial: limbRadial, rings: 4 },
  )
  add(neck, (v) => vertexWeights(v, segs, ['chest', 'neck', 'head']), skin)
  const hc = p.chinY + p.headHalfH
  const head = sweepTube(
    [
      st(0, p.chinY, 0.012 * p.stature, p.headHalfW * 0.45, p.headHalfW * 0.5),
      st(0, p.chinY + p.headHalfH * 0.45, 0.006 * p.stature, p.headHalfW * 0.88, p.headHalfW * 1.0),
      st(0, hc + p.headHalfH * 0.2, 0, p.headHalfW, p.headHalfW * 1.14),
      st(0, hc + p.headHalfH * 0.75, -0.004 * p.stature, p.headHalfW * 0.78, p.headHalfW * 0.95),
      st(0, p.crownY - 0.004 * p.stature, -0.006 * p.stature, p.headHalfW * 0.2, p.headHalfW * 0.25),
    ],
    { radial, rings: 12, capStart: true, capEnd: true },
  )
  add(head, () => [[boneIndex('head'), 1]], skin)
  const noseY = p.chinY + p.headHalfH * 0.75
  const nose = sweepTube(
    [st(0, noseY + 0.012 * p.stature, p.headHalfW * 1.02, 0.006 * p.stature, 0.006 * p.stature), st(0, noseY - 0.004 * p.stature, p.headHalfW * 1.16, 0.009 * p.stature, 0.007 * p.stature)],
    { radial: 6, rings: 3, capEnd: true },
  )
  add(nose, () => [[boneIndex('head'), 1]], skin)
  // HAIR: a close cap over the back and top of the skull (grey for the elder).
  const hair = sweepTube(
    [
      st(0, hc - p.headHalfH * 0.15, -0.01 * p.stature, p.headHalfW * 1.04, p.headHalfW * 1.12),
      st(0, hc + p.headHalfH * 0.45, -0.006 * p.stature, p.headHalfW * 0.98, p.headHalfW * 1.12),
      st(0, p.crownY + 0.006 * p.stature, -0.006 * p.stature, p.headHalfW * 0.3, p.headHalfW * 0.34),
    ],
    { radial, rings: 6, capEnd: true },
  )
  cutTriangles(hair, (c) => c.z > p.headHalfW * 0.35 && c.y < hc + p.headHalfH * 0.5)
  add(hair, () => [[boneIndex('head'), 1]], p.hair, [4, 90, 0.25, 0.95])
  // BEARD: the front half of a short sleeve round the jaw, ending under the chin.
  if (p.beard) {
    const beard = sweepTube(
      [
        st(0, p.chinY + p.headHalfH * 0.5, 0.003 * p.stature, p.headHalfW * 0.97, p.headHalfW * 1.04),
        st(0, p.chinY + p.headHalfH * 0.12, 0.011 * p.stature, p.headHalfW * 0.72, p.headHalfW * 0.92),
        st(0, p.chinY - 0.03 * p.stature, 0.022 * p.stature, p.headHalfW * 0.3, p.headHalfW * 0.38),
      ],
      { radial, rings: 5, capEnd: true },
    )
    cutTriangles(beard, (c) => c.z < p.headHalfW * 0.15)
    add(beard, () => [[boneIndex('head'), 1]], p.hair, [4, 90, 0.25, 0.95])
  }

  // ARMS hang down their bones; the hand is a flattened end.
  for (const s of ['L', 'R'] as const) {
    const x = (s === 'L' ? 1 : -1) * p.shoulderX
    const top = p.shoulderY
    const elbow = top - p.upperArm
    const wrist = elbow - p.forearm
    const arm = sweepTube(
      [
        st(x, top + p.armR * 0.15, 0, p.armR * 1.2, p.armR * 1.25),
        st(x, top - p.upperArm * 0.4, 0, p.armR * 1.05, p.armR * 1.1),
        st(x, elbow, 0, p.armR * 0.85, p.armR * 0.9),
        st(x, elbow - p.forearm * 0.35, 0.002, p.armR * 0.9, p.armR * 0.95),
        st(x, wrist + 0.005 * p.stature, 0, p.armR * 0.62, p.armR * 0.55),
        st(x, wrist - p.hand * 0.9, 0.004, p.armR * 0.75, p.armR * 0.42),
        st(x, wrist - p.hand * 1.7, 0.006, p.armR * 0.45, p.armR * 0.3),
      ],
      { radial: limbRadial, rings: 16, capStart: true, capEnd: true },
    )
    add(arm, (v) => vertexWeights(v, segs, armBones(s)), skin)
  }

  // LEGS down their bones to a foot running forward along the ground.
  for (const s of ['L', 'R'] as const) {
    const x = (s === 'L' ? 1 : -1) * p.hipX
    const leg = sweepTube(
      [
        st(x, p.hipY + 0.02 * p.stature, 0, p.thighR * 1.1, p.thighR * 1.15),
        st(x, (p.hipY + p.kneeY) / 2, 0.003, p.thighR * 0.92, p.thighR * 0.98),
        st(x, p.kneeY, 0.004, p.calfR * 1.05, p.calfR * 1.1),
        st(x, p.kneeY - (p.kneeY - p.ankleY) * 0.3, -0.004, p.calfR * 1.12, p.calfR * 1.2),
        st(x, p.ankleY + 0.015 * p.stature, 0, p.calfR * 0.62, p.calfR * 0.66),
      ],
      { radial: limbRadial, rings: 14, capStart: true },
    )
    add(leg, (v) => vertexWeights(v, segs, legBones(s)), skin)
    const foot = sweepTube(
      [
        st(x, p.ankleY + 0.012 * p.stature, -0.02 * p.stature, p.calfR * 0.7, p.calfR * 0.6),
        st(x, p.ankleY * 0.6, p.footLen * 0.25, p.calfR * 0.85, p.ankleY * 0.55),
        st(x, p.ankleY * 0.4, p.footLen * 0.75, p.calfR * 0.8, p.ankleY * 0.35),
      ],
      { radial: limbRadial, rings: 6, capStart: true, capEnd: true },
    )
    add(foot, () => [[boneIndex(`foot.${s}`), 1]], skin)
  }
  const body = merge(parts)
  body.computeBoundingSphere()
  return body
}

/**
 * The trunk's cross-sections, bottom to top, as [y, half-width, half-depth]:
 * crotch → pelvis → waist → chest → shoulders → neck base. The shoulders
 * ROUND and slope up to the neck (the trapezius) — one flat shelf from the
 * shoulder width to the neck read as a coat hanger. The dress is fitted to
 * the same profile (figureDress.ts `trunkAt`).
 */
export function trunkProfile(p: BodyProportions): Array<[number, number, number]> {
  const H = p.stature
  return [
    [p.hipY - 0.07 * H, p.pelvisHalfW * 0.7, p.chestHalfD * 0.8],
    [p.hipY + 0.01 * H, p.pelvisHalfW, p.chestHalfD * 1.05],
    [p.waistY, p.waistHalfW, p.chestHalfD * 0.92],
    [p.chestY, p.chestHalfW, p.chestHalfD],
    [p.shoulderY - 0.03 * H, p.shoulderX + p.armR * 0.55, p.chestHalfD * 0.88],
    [p.shoulderY + 0.002 * H, p.shoulderX * 0.85, p.chestHalfD * 0.8],
    [p.shoulderY + 0.014 * H, p.shoulderX * 0.5, p.chestHalfD * 0.68],
    [p.neckY + 0.014 * H, p.neckR * 1.25, p.neckR * 1.15],
  ]
}

/** Drop the triangles whose centroid passes `drop` (a cut-out: the face of a
 *  hair cap, a hood's opening, the bare shoulder of a toga). */
export function cutTriangles(geo: THREE.BufferGeometry, drop: (centroid: THREE.Vector3) => boolean): THREE.BufferGeometry {
  const index = geo.getIndex()
  if (!index) return geo
  const pos = geo.getAttribute('position')
  const keep: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i))
    b.fromBufferAttribute(pos, index.getX(i + 1))
    c.fromBufferAttribute(pos, index.getX(i + 2))
    const centroid = a.add(b).add(c).multiplyScalar(1 / 3)
    if (!drop(centroid)) keep.push(index.getX(i), index.getX(i + 1), index.getX(i + 2))
  }
  geo.setIndex(keep)
  return geo
}

/** `a` mixed `t` of the way to `b`, as hex. */
export function mixHex(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
}
