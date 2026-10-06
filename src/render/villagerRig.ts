// The glTF villager's pose arithmetic, without a scene graph (work-order "glTF
// villager body"): sampling and blending the clips, forward kinematics on the
// villager skeleton (identity rest rotations — a bone's rest is its offset),
// the feet's contact heights, and the two-bone IK that warps a stride and puts
// a hand where a contact wants it. The figure (scenes/place/gltfFigure.tsx)
// writes the result onto its bones; the tests read it directly.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF as G } from '../config/balance'
import type { VillagerAsset, VillagerClip } from './villagerAsset'
import { topoOrder } from './villagerAsset'

/** One pose of the skeleton: local rotations (bones × 4) and the hips' place. */
export interface VillagerPose {
  rot: Float32Array
  hips: THREE.Vector3
}

export const newPose = (bones: number): VillagerPose => {
  const rot = new Float32Array(bones * 4)
  for (let i = 0; i < bones; i++) rot[i * 4 + 3] = 1
  return { rot, hips: new THREE.Vector3() }
}

/** Clip time for a phase (0 … 1) or a time in seconds: loops wrap, the rest clamp. */
export function clipTime(clip: VillagerClip, t: number): number {
  if (clip.kind === 'gait' || clip.kind === 'loop') {
    const d = clip.duration
    return ((t % d) + d) % d
  }
  return Math.min(Math.max(t, 0), clip.duration)
}

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()

/** Sample a clip at time t (seconds) into `out` (linear keys, slerped). */
export function sampleClip(clip: VillagerClip, t: number, out: VillagerPose): VillagerPose {
  const times = clip.times
  const n = times.length
  const tt = clipTime(clip, t)
  let k = 0
  // keys are evenly spaced (the pipeline resamples at a fixed rate)
  if (n > 1) {
    const step = (times[n - 1] - times[0]) / (n - 1)
    k = Math.min(n - 2, Math.max(0, Math.floor((tt - times[0]) / Math.max(1e-9, step))))
  }
  const f = n > 1 ? Math.min(1, Math.max(0, (tt - times[k]) / Math.max(1e-9, times[k + 1] - times[k]))) : 0
  const k1 = Math.min(n - 1, k + 1)
  clip.rot.forEach((r, i) => {
    if (r.length === 0) return
    _qa.fromArray(r, k * 4)
    _qb.fromArray(r, k1 * 4)
    _qa.slerp(_qb, f)
    _qa.toArray(out.rot, i * 4)
  })
  const h = clip.hips
  if (h.length) {
    out.hips.set(h[k * 3] + (h[k1 * 3] - h[k * 3]) * f, h[k * 3 + 1] + (h[k1 * 3 + 1] - h[k * 3 + 1]) * f, h[k * 3 + 2] + (h[k1 * 3 + 2] - h[k * 3 + 2]) * f)
  }
  return out
}

/**
 * Blend poses: `into` = Σ wᵢ·poseᵢ / Σ wᵢ, rotations by normalized weighted
 * sum with every quaternion turned into the first one's hemisphere (exact for
 * two poses, smooth for more), the hips linearly.
 */
export function blendPoses(parts: ReadonlyArray<{ pose: VillagerPose; w: number }>, into: VillagerPose): VillagerPose {
  const total = parts.reduce((s, p) => s + Math.max(0, p.w), 0)
  if (total <= 1e-9) return into
  const bones = into.rot.length / 4
  const ref = parts.find((p) => p.w > 0)!.pose
  into.hips.set(0, 0, 0)
  for (let i = 0; i < bones; i++) {
    let x = 0
    let y = 0
    let z = 0
    let w = 0
    const rx = ref.rot[i * 4]
    const ry = ref.rot[i * 4 + 1]
    const rz = ref.rot[i * 4 + 2]
    const rw = ref.rot[i * 4 + 3]
    for (const p of parts) {
      if (p.w <= 0) continue
      const q = p.pose.rot
      const s = q[i * 4] * rx + q[i * 4 + 1] * ry + q[i * 4 + 2] * rz + q[i * 4 + 3] * rw < 0 ? -p.w : p.w
      x += s * q[i * 4]
      y += s * q[i * 4 + 1]
      z += s * q[i * 4 + 2]
      w += s * q[i * 4 + 3]
    }
    const l = Math.hypot(x, y, z, w) || 1
    into.rot[i * 4] = x / l
    into.rot[i * 4 + 1] = y / l
    into.rot[i * 4 + 2] = z / l
    into.rot[i * 4 + 3] = w / l
  }
  for (const p of parts) if (p.w > 0) into.hips.addScaledVector(p.pose.hips, p.w / total)
  return into
}

export interface WorldPose {
  q: THREE.Quaternion[]
  p: THREE.Vector3[]
}

const orderCache = new WeakMap<VillagerAsset, number[]>()
const orderOf = (a: VillagerAsset) => {
  let o = orderCache.get(a)
  if (!o) {
    o = topoOrder(a.parents)
    orderCache.set(a, o)
  }
  return o
}

export const newWorld = (bones: number): WorldPose => ({
  q: Array.from({ length: bones }, () => new THREE.Quaternion()),
  p: Array.from({ length: bones }, () => new THREE.Vector3()),
})

const _off = new THREE.Vector3()

/** World rotations and joint positions of a pose on a skeleton with `rest`
 *  heads (the hips take the pose's position). */
export function forwardKinematics(asset: VillagerAsset, rest: Float32Array, pose: VillagerPose, out: WorldPose): WorldPose {
  for (const i of orderOf(asset)) {
    const p = asset.parents[i]
    const q = out.q[i].fromArray(pose.rot, i * 4)
    if (p < 0) {
      out.p[i].copy(pose.hips)
    } else {
      _off.set(rest[i * 3] - rest[p * 3], rest[i * 3 + 1] - rest[p * 3 + 1], rest[i * 3 + 2] - rest[p * 3 + 2])
      out.p[i].copy(_off.applyQuaternion(out.q[p])).add(out.p[p])
      q.premultiply(out.q[p])
    }
  }
  return out
}

export type ContactName = 'heel' | 'ball' | 'tip' | 'knee'

/** World positions of the feet's contact points (heel, ball on the foot, tip
 *  on the toe, the knee's front on the shin), scaled to this body's size. */
export function contactPoints(
  asset: VillagerAsset,
  world: WorldPose,
  scale = 1,
): Record<'L' | 'R', Record<ContactName, THREE.Vector3>> {
  const at = (bone: string, local: THREE.Vector3) => {
    const i = asset.bones.indexOf(bone)
    return local.clone().multiplyScalar(scale).applyQuaternion(world.q[i]).add(world.p[i])
  }
  const side = (s: 'L' | 'R') => ({
    heel: at(`foot.${s}`, asset.contactPoints[s].heel),
    ball: at(`foot.${s}`, asset.contactPoints[s].ball),
    tip: at(`toe.${s}`, asset.contactPoints[s].tip),
    knee: at(`shin.${s}`, asset.contactPoints[s].knee),
  })
  return { L: side('L'), R: side('R') }
}

/** The lowest contact point (y) of a pose — feet, and the knees when asked. */
export function lowestContact(c: Record<'L' | 'R', Record<ContactName, THREE.Vector3>>, knees = false): number {
  let low = Infinity
  for (const s of ['L', 'R'] as const) {
    for (const k of ['heel', 'ball', 'tip', 'knee'] as const) {
      if (k === 'knee' && !knees) continue
      low = Math.min(low, c[s][k].y)
    }
  }
  return low
}

// ---- gait --------------------------------------------------------------------------

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** How much of the sprint a figure moving at `speed` (figure units/s) with
 *  legs `legScale` × the basis body's runs: 0 walking … 1 sprinting, crossing
 *  over `sprintBand` either side of `sprintThreshold` per unit of leg. */
export function sprintWeight(speed: number, legScale: number): number {
  const v = Math.abs(speed) / Math.max(1e-6, legScale)
  return smooth(G.sprintThreshold - G.sprintBand, G.sprintThreshold + G.sprintBand, v)
}

/** The stride factor of a gait at `speed` over its natural speed `natural`
 *  (both for this body): speed^exponent, bounded. The cadence makes up the rest. */
export function strideFactor(speed: number, natural: number): number {
  if (natural <= 1e-6) return 1
  const r = Math.abs(speed) / natural
  return Math.min(G.strideMax, Math.max(G.strideMin, Math.pow(Math.max(r, 1e-6), G.strideExponent)))
}

/**
 * The gait at a ground speed: the sprint's share, each gait's stride factor,
 * the distance one cycle covers (blended) and so the phase advance per unit
 * walked — the planted foot sweeps exactly the distance walked, so it holds
 * its spot (point 1295's no-slide) at every speed and body size.
 */
export function gaitAt(walk: VillagerClip, sprint: VillagerClip, speed: number, legScale: number) {
  const s = sprintWeight(speed, legScale)
  const vw = walk.speed * legScale
  const vs = sprint.speed * legScale
  const kw = strideFactor(speed, vw)
  const ks = strideFactor(speed, vs)
  const cycle = (1 - s) * vw * walk.duration * kw + s * vs * sprint.duration * ks
  return { sprint: s, strideWalk: kw, strideSprint: ks, stride: (1 - s) * kw + s * ks, cycle, phasePerUnit: cycle > 1e-6 ? 1 / cycle : 0 }
}

// ---- two-bone IK on the villager skeleton -------------------------------------------

const _u0 = new THREE.Vector3()
const _f0 = new THREE.Vector3()
const _n0 = new THREE.Vector3()
const _u1 = new THREE.Vector3()
const _f1 = new THREE.Vector3()
const _n1 = new THREE.Vector3()
const _d = new THREE.Vector3()
const _side = new THREE.Vector3()
const _m0 = new THREE.Matrix4()
const _m1 = new THREE.Matrix4()
const _qw = new THREE.Quaternion()
const _qp = new THREE.Quaternion()

function frameMatrix(d: THREE.Vector3, n: THREE.Vector3, out: THREE.Matrix4) {
  const b = new THREE.Vector3().crossVectors(d, n)
  return out.makeBasis(d, n, b)
}

/** Set bone i's local rotation so its WORLD rotation is `W` (parents fixed). */
export function setWorldRotation(asset: VillagerAsset, pose: VillagerPose, world: WorldPose, i: number, W: THREE.Quaternion): void {
  const p = asset.parents[i]
  if (p < 0) W.toArray(pose.rot, i * 4)
  else _qp.copy(world.q[p]).invert().multiply(W).toArray(pose.rot, i * 4)
}

/**
 * Two-bone IK: turn `upper` and `lower` so that the head of `end` (the wrist,
 * the ankle) reaches `target`, the middle joint bent toward `pole`; the hinge
 * keeps its rest plane, so the limb never twists. Out of reach the limb points
 * straight at the target. Returns the miss (0 when reached). Mutates `pose`
 * and recomputes `world`.
 */
export function solveLimb(
  asset: VillagerAsset,
  rest: Float32Array,
  pose: VillagerPose,
  world: WorldPose,
  upper: number,
  lower: number,
  end: number,
  target: THREE.Vector3,
  pole: THREE.Vector3,
): number {
  const h = (i: number, v: THREE.Vector3) => v.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2])
  h(lower, _u0).sub(h(upper, _d))
  h(end, _f0).sub(h(lower, _d))
  const a = _u0.length()
  const b = _f0.length()
  _u0.normalize()
  _f0.normalize()
  _n0.crossVectors(_u0, _f0)
  if (_n0.lengthSq() < 1e-10) _n0.set(1, 0, 0).cross(_u0)
  _n0.normalize()
  const S = world.p[upper]
  _d.copy(target).sub(S)
  const want = _d.length()
  const dist = Math.min(a + b - 1e-5, Math.max(Math.abs(a - b) + 1e-5, want))
  _d.normalize()
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist)
  _side.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_side.lengthSq() < 1e-10) _side.set(0, 0, 1).addScaledVector(_d, -_d.z)
  _side.normalize()
  _u1.copy(_d).multiplyScalar(cosA).addScaledVector(_side, Math.sqrt(Math.max(0, 1 - cosA * cosA))).normalize()
  // elbow E = S + u1·a; the reached end T = S + d·dist; f1 = (T − E)/|…|
  _f1.copy(_d).multiplyScalar(dist).addScaledVector(_u1, -a).normalize()
  _n1.crossVectors(_u1, _f1).normalize()
  _qw.setFromRotationMatrix(_m1.copy(frameMatrix(_u1, _n1, _m1)).multiply(frameMatrix(_u0, _n0, _m0).transpose()))
  setWorldRotation(asset, pose, world, upper, _qw)
  forwardKinematics(asset, rest, pose, world)
  _qw.setFromRotationMatrix(_m1.copy(frameMatrix(_f1, _n1, _m1)).multiply(frameMatrix(_f0, _n0, _m0).transpose()))
  setWorldRotation(asset, pose, world, lower, _qw)
  forwardKinematics(asset, rest, pose, world)
  return Math.max(0, want - dist, Math.abs(a - b) - want)
}

// ---- the tool in the hand ------------------------------------------------------------

/**
 * Where a held tool sits in its hand bone's frame (final state 10): the tool's
 * own frame (+y along the shaft to the handle, the blade at −y) turned by the
 * grip rotation, its shaft through the closed fist at `grip` along the shaft.
 * The tool is a child of the hand bone with exactly this transform, so it moves
 * with the hand and never with the forearm alone.
 */
export function toolInHand(asset: VillagerAsset, hand: 'L' | 'R', grip: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const h = asset.toolHold[hand]
  const position = new THREE.Vector3(0, -grip, 0).applyQuaternion(h.rotation).add(h.offset)
  return { position, quaternion: h.rotation.clone() }
}
