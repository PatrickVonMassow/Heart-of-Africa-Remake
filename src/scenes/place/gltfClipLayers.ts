// The glTF villager's clips layered over the settlement's code-built pose
// (work-order "villager glTF body: animation, dress and tool"; the figure is
// skinnedFigure.tsx). Three layers, each with a weight that eases in and out
// over VILLAGER_GLTF.transitionSeconds — a change of activity is a blend,
// never a cut:
//
//   gait   the walk and sprint on legs, hips and the free arms, by the code
//          walk's own weight (0 standing … 1 walking), feet held where they
//          stand (render/villagerClipPose.ts)
//   carry  the right arm shouldering the shovel (walking: `carry` in step with
//          the gait; standing: `carryIdle`)
//   dig    the authored dig on the whole body
//
// Under them all the idle is the standing base of the trunk, neck, head and
// the free arms with their clavicles (natural-villager-motion step 8: one pose pipeline).
// What stays the code's: the standing legs, the kneel, the work crouch, and —
// added after the layers (skinnedFigure.tsx) — the trunk's lean and stoop, the
// gaze, every contact and steadying hand, the head's squat correction.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF as G, VILLAGER_POSE } from '../../config/balance'
import type { VillagerAsset } from '../../render/villagerAsset'
import { LIVE_MORPHS, type LiveMorph } from '../../render/villagerBody'
import { clipGaitPose, clipPoseAt, newClipGait, releaseClipGait, samplePhase, shovelOnHungHand, stepClipGait, toHung, type ClipGait, type GroundBody } from '../../render/villagerClipPose'
import type { GltfPerson } from '../../render/villagerFigureBody'
import { aimHead, distributeLean, gazeDirection, LEAN_BONES, solveTwoBone, type LeanBone } from '../../render/figureRig'
import { blendPoses, newPose, type VillagerPose } from '../../render/villagerRig'
import type { FigureWork } from './placeFigureContext'
import type { ShoulderPose } from '../../render/gesture'

/** The motion a figure's clip layers read from its code-built walk. */
export interface LayerMotion {
  speed: number
  /** The walk's weight, 0 standing … 1 walking. */
  weight: number
  /** 0 standing … 1 kneeling. */
  kneel: number
}

export interface ClipLayers {
  gait: ClipGait
  ground: GroundBody | null
  /** The body's place the frame before (`ground` of the last step). */
  lastGround: GroundBody | null
  /** Layer weights, eased toward the work. */
  dig: number
  carry: number
  /** Per arm (left, right), how far the clips own it: eased toward `free`
   *  as the last applyClipLayers found it, so a hand taken for a gesture or a
   *  contact (or given back) blends between the clip and the code. */
  arms: [number, number]
  free: [boolean, boolean]
  /** Seconds into the dig clip (a loop), and the carry-idle clip. */
  digT: number
  idleT: number
  pose: VillagerPose
  pose2: VillagerPose
  pose3: VillagerPose
  local: THREE.Quaternion[]
  hips: THREE.Vector3
  /** While the walk weight blends the legs between the code's stand and the
   *  gait, the foot that steps first (0 left, 1 right; -1 none chosen yet). */
  settleFirst: number
  /** Per foot, the stand's spot (world x, z) and the foot's world turn,
   *  taken as that blend began: the stand's feet stay there while the body
   *  walks off, turns or jostles. */
  settleStand: [{ x: number; z: number }, { x: number; z: number }]
  settleTurn: [THREE.Quaternion, THREE.Quaternion]
  /** The walk weight the settle last ran at: as it falls, the stand's spots
   *  are drawn onto the body's own stand (the miss kept as the square of
   *  the weight's share), met at weight 0. */
  settleW: number
}

export function clipLayers(asset: VillagerAsset): ClipLayers {
  const n = asset.bones.length
  return {
    gait: newClipGait(),
    ground: null,
    lastGround: null,
    dig: 0,
    carry: 0,
    arms: [1, 1],
    free: [true, true],
    digT: 0,
    idleT: 0,
    pose: newPose(n),
    pose2: newPose(n),
    pose3: newPose(n),
    local: Array.from({ length: n }, () => new THREE.Quaternion()),
    hips: new THREE.Vector3(),
    settleFirst: -1,
    settleStand: [{ x: 0, z: 0 }, { x: 0, z: 0 }],
    settleTurn: [new THREE.Quaternion(), new THREE.Quaternion()],
    settleW: 1,
  }
}

const ease = (v: number, to: number, dt: number) => {
  const step = dt / Math.max(1e-6, G.transitionSeconds)
  return to > v ? Math.min(to, v + step) : Math.max(to, v - step)
}

/** One frame: the gait's phase by the ground walked, the layers' weights
 *  toward the hands' work, the clips' clocks. */
export function stepClipLayers(
  asset: VillagerAsset,
  person: GltfPerson,
  c: ClipLayers,
  walked: number,
  speed: number,
  ground: GroundBody,
  work: FigureWork | null,
  dt: number,
): void {
  stepClipGait(c.gait, asset, person.frame, walked, speed)
  c.lastGround = c.ground
  c.ground = { ...ground }
  c.dig = ease(c.dig, work?.dig ? 1 : 0, dt)
  // the carry stays under the dig while it eases in, and is there again after
  c.carry = ease(c.carry, work?.tool && (!work.dig || c.dig < 1) ? 1 : 0, dt)
  // the stroke on the work's clock where the caller keeps one (it stops, and the
  // pose freezes, while the bout holds or fades); else it starts from its top
  // when the dig begins and runs on while it fades
  if (work?.digT !== undefined) c.digT = work.digT
  else c.digT = c.dig > 0 ? c.digT + dt : 0
  c.arms = [ease(c.arms[0], c.free[0] ? 1 : 0, dt), ease(c.arms[1], c.free[1] ? 1 : 0, dt)]
  c.idleT += dt
}

const LEGS = ['hips', 'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R']
const ARM = (s: 'L' | 'R') => [`shoulder.${s}`, `upperArm.${s}`, `forearm.${s}`, `hand.${s}`]
/** The trunk, neck and head: the clips' own on the glTF body
 *  (natural-villager-motion step 8), the code's lean and gaze added after.
 *  The clavicles go with the arms (`ARM`): an arm the code takes for a
 *  contact reaches from the clavicle at rest, as its solve assumes (the
 *  idle's lowered clavicle left a pointing hand out of reach and the body
 *  sank into a full crouch for it). */
export const TRUNK = ['spine', 'spine1', 'chest', 'neck', 'head']
/** Bones the code-built pose never writes and no base layer writes in full:
 *  they return to rest before a blend. */
const UNWRITTEN = ['toe.L', 'toe.R', 'shoulder.L', 'shoulder.R']

function blendInto(asset: VillagerAsset, bones: Record<string, THREE.Bone>, names: readonly string[], local: THREE.Quaternion[], w: number) {
  if (w <= 0) return
  for (const n of names) {
    const b = bones[n]
    const i = asset.bones.indexOf(n)
    if (b && i >= 0) b.quaternion.slerp(local[i], Math.min(1, w))
  }
}

function blendHips(bones: Record<string, THREE.Bone>, hips: THREE.Vector3, w: number) {
  if (w <= 0) return
  bones.hips.position.lerp(hips, Math.min(1, w))
}

/**
 * Write the layers onto the bones, after the code-built pose has been written
 * (so each layer blends from it). `free` says which arm (left, right) the code
 * left hanging — those take the gait's swing and the carry, eased in and out
 * over the transition as an arm is taken or given back (`ClipLayers.arms`).
 */
export function applyClipLayers(
  asset: VillagerAsset,
  person: GltfPerson,
  bones: Record<string, THREE.Bone>,
  c: ClipLayers,
  m: LayerMotion,
  free: readonly [boolean, boolean],
): void {
  for (const n of UNWRITTEN) bones[n]?.quaternion.identity()
  // the code writes the hips' height only: their sway returns to rest first
  const h = asset.parents.indexOf(-1)
  bones.hips.position.x = person.rest[h * 3]
  bones.hips.position.z = person.rest[h * 3 + 2]
  c.free = [free[0], free[1]]
  const f = person.frame
  const walking = m.weight * (1 - m.kneel)
  // Each layer blends from what the one below left, so the dig eases in from
  // the carry (or the walk) and out to it again — never from the rest pose.
  const under = c.dig < 1
  // THE STANDING BASE (step 8): the idle on the trunk, neck and head in
  // full, and on each arm (clavicle included) the clips own; the legs stay the
  // code's (its stance, work crouch and kneel), the walk layers over it
  const idle = asset.clips.idle
  if (idle) {
    clipPoseAt(asset, f, idle, c.idleT % idle.duration, c.pose)
    toHung(asset, f, c.pose, c.local, c.hips)
    blendInto(asset, bones, TRUNK, c.local, 1)
    blendInto(asset, bones, ARM('L'), c.local, c.arms[0])
    blendInto(asset, bones, ARM('R'), c.local, c.arms[1])
  }
  // THE GAIT
  if (walking > 1e-3 && under) {
    clipGaitPose(c.gait, asset, f, m.speed, c.ground, c.pose)
    // the gait grounds its contacts at 0 (the rest A-pose's sole), not at the hung rest's
    toHung(asset, f, c.pose, c.local, c.hips, 0)
    const w = walking
    // starting or stopping, the feet step between the stand and the gait
    // (a bone blend alone slid a foot on the ground from one to the other);
    // a kneel setting in takes the step's correction out as it folds the legs
    const settle = w < 1 ? Math.max(0, 1 - m.kneel) : 0
    if (settle > 0) takeCodeLegs(bones)
    else c.settleFirst = -1
    blendInto(asset, bones, LEGS, c.local, w)
    blendHips(bones, c.hips, w)
    if (settle > 0) settleFeet(asset, bones, c, w, settle)
    blendInto(asset, bones, TRUNK, c.local, w)
    blendInto(asset, bones, ARM('L'), c.local, w * c.arms[0])
    // under a carry too, so a carry partly overriding the arm stays continuous
    blendInto(asset, bones, ARM('R'), c.local, w * c.arms[1])
  } else {
    // standing: the feet are where they stand, nothing held for the next walk
    releaseClipGait(c.gait)
    c.settleFirst = -1
  }
  // THE SHOVEL CARRIED: the right arm from the carry, in step with the gait
  if (c.carry > 0 && under && c.arms[1] > 0) {
    samplePhase(asset.clips.carry, c.gait.phase, f, c.pose2)
    clipPoseAt(asset, f, asset.clips.carryIdle, c.idleT % asset.clips.carryIdle.duration, c.pose3)
    blendPoses(
      [
        { pose: c.pose2, w: walking },
        { pose: c.pose3, w: 1 - walking },
      ],
      c.pose,
    )
    toHung(asset, f, c.pose, c.local, c.hips)
    blendInto(asset, bones, ARM('R'), c.local, c.carry * c.arms[1])
  }
  // THE DIG, on the whole body
  if (c.dig > 0) {
    clipPoseAt(asset, f, asset.clips.dig, c.digT % asset.clips.dig.duration, c.pose)
    toHung(asset, f, c.pose, c.local, c.hips)
    blendInto(asset, bones, asset.bones, c.local, c.dig)
    blendHips(bones, c.hips, c.dig)
  }
}

const LEG_SIDES = ['L', 'R'] as const
const legNames = (s: 'L' | 'R') => [`thigh.${s}`, `shin.${s}`, `foot.${s}`, `toe.${s}`]
const legChain = (bones: Record<string, THREE.Bone>, s: 'L' | 'R') => legNames(s).map((n) => bones[n])
/** The gait's local turn of leg bone `k` (legNames order) on side `s`. */
const gaitLocal = (asset: VillagerAsset, c: ClipLayers, s: 'L' | 'R', k: number) => c.local[asset.bones.indexOf(legNames(s)[k])]
const _codeLeg = LEG_SIDES.map(() => [0, 1, 2, 3].map(() => new THREE.Quaternion()))
const _codeHipsQ = new THREE.Quaternion()
const _codeHipsP = new THREE.Vector3()
const _blendHipsQ = new THREE.Quaternion()
const _blendHipsP = new THREE.Vector3()
const _stand = [new THREE.Vector3(), new THREE.Vector3()]
const _gait = [new THREE.Vector3(), new THREE.Vector3()]
const _standQ = [new THREE.Quaternion(), new THREE.Quaternion()]
const _gaitQ = [new THREE.Quaternion(), new THREE.Quaternion()]
const _footQ = new THREE.Quaternion()
const _yawQ = new THREE.Quaternion()
const _liveW = { x: 0, z: 0 }
const _liveQ = new THREE.Quaternion()
/** Per foot, a landed foot's lift (world) as it steps the stand's miss over. */
const _lift = [0, 0]
const _plain = LEG_SIDES.map(() => [0, 1, 2, 3].map(() => new THREE.Quaternion()))
const _yAxis = new THREE.Vector3(0, 1, 0)
const _ik = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]

/** The code-built legs and hips, before the gait blends over them. */
function takeCodeLegs(bones: Record<string, THREE.Bone>): void {
  LEG_SIDES.forEach((s, i) => legChain(bones, s).forEach((b, k) => _codeLeg[i][k].copy(b.quaternion)))
  _codeHipsQ.copy(bones.hips.quaternion)
  _codeHipsP.copy(bones.hips.position)
}

/**
 * Each foot's share of its settling step as the walk weight `w` blends the
 * legs between the stand (w = 0) and the gait (w = 1): the `first` foot steps
 * over the first half of the way from the gait to the stand, the other over
 * the second, so one foot always stands. 0 = on the gait's spot, 1 = on the
 * stand's.
 */
export function settleShares(w: number, first: number): [number, number] {
  const u = 1 - Math.min(1, Math.max(0, w))
  const a = Math.min(1, Math.max(0, 2 * u))
  const b = Math.min(1, Math.max(0, 2 * u - 1))
  return first === 1 ? [b, a] : [a, b]
}

/** Body-frame (the hips' parent: figure units, facing +z) x, z → world x, z (as the gait's hold maps them). */
function bodyToWorld(b: GroundBody, p: THREE.Vector3, out: { x: number; z: number }): void {
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const lx = p.x * b.unit
  const lz = p.z * b.unit
  out.x = b.x + lx * c + lz * s
  out.z = b.z - lx * s + lz * c
}

/** World x, z → body frame x, z (y left as it is). */
function worldToBody(b: GroundBody, h: { x: number; z: number }, out: THREE.Vector3): void {
  const dx = h.x - b.x
  const dz = h.z - b.z
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const k = 1 / (b.unit || 1)
  out.x = (dx * c - dz * s) * k
  out.z = (dx * s + dz * c) * k
}

/** The ankle's place and the foot's turn (body frame) with the legs and hips as given. */
function ankleAt(bones: Record<string, THREE.Bone>, s: 'L' | 'R', out: THREE.Vector3, turn: THREE.Quaternion): THREE.Vector3 {
  bones.hips.updateMatrixWorld(true)
  inBody(bones[`foot.${s}`], out, turn)
  return out
}

/**
 * THE SETTLING STEP (point 1330): while the walk weight blends the legs
 * between the code's stand and the gait, each foot steps from the gait's
 * spot to the stand's (or back) instead of sliding there on the ground — one
 * foot at a time (the one off the ground first, so the other stands), lifted
 * on an arc of G.settleStepLift of its travel, the leg solved onto it and the
 * foot turned between the gait's turn and the stand's; a foot on the stand
 * keeps its world place and turn whatever the blended hips or the body's
 * heading do. As the weight falls those spots are drawn onto the body's own
 * stand (met at 0, where the standing legs take over without a jump): a foot
 * in the air as it goes, a landed one by a lifted re-step at the end. `share` (0 … 1): how much of this correction is drawn over the plain
 * bone blend (a kneel setting in takes it out).
 */
function settleFeet(asset: VillagerAsset, bones: Record<string, THREE.Bone>, c: ClipLayers, w: number, share: number): void {
  const hips = bones.hips
  if (hips.parent) _base.copy(hips.parent.matrixWorld).invert()
  else _base.identity()
  LEG_SIDES.forEach((s, i) => legChain(bones, s).forEach((b, k) => _plain[i][k].copy(b.quaternion)))
  _blendHipsQ.copy(hips.quaternion)
  _blendHipsP.copy(hips.position)
  const hi = asset.bones.indexOf('hips')
  // each foot's two spots and turns: the stand's (code legs and hips) and the gait's
  hips.quaternion.copy(_codeHipsQ)
  hips.position.copy(_codeHipsP)
  LEG_SIDES.forEach((s, i) => legChain(bones, s).forEach((b, k) => b.quaternion.copy(_codeLeg[i][k])))
  LEG_SIDES.forEach((s, i) => ankleAt(bones, s, _stand[i], _standQ[i]))
  hips.quaternion.copy(c.local[hi])
  hips.position.copy(c.hips)
  LEG_SIDES.forEach((s) => legChain(bones, s).forEach((b, k) => b.quaternion.copy(gaitLocal(asset, c, s, k))))
  LEG_SIDES.forEach((s, i) => ankleAt(bones, s, _gait[i], _gaitQ[i]))
  hips.quaternion.copy(_blendHipsQ)
  hips.position.copy(_blendHipsP)
  const body = c.ground
  if (c.settleFirst < 0) {
    // the foot the gait holds off the ground steps first; else the further one
    const air = LEG_SIDES.map((_, i) => _gait[i].y - _stand[i].y)
    const far = LEG_SIDES.map((_, i) => Math.hypot(_gait[i].x - _stand[i].x, _gait[i].z - _stand[i].z))
    const tol = 0.01 * (hips.position.y || 1)
    c.settleFirst = Math.abs(air[0] - air[1]) > tol ? (air[0] > air[1] ? 0 : 1) : far[0] >= far[1] ? 0 : 1
    // where the stand stood last frame: a body walking off has left it this one
    const was = c.lastGround ?? body
    LEG_SIDES.forEach((_, i) => {
      if (was) bodyToWorld(was, _stand[i], c.settleStand[i])
      c.settleTurn[i].copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, was?.yaw ?? 0))
    })
    c.settleW = w
  }
  // the stand's feet where and as they stood as the blend began, drawn onto
  // the body's own stand as the weight falls (the miss by the square of the
  // weight's share: met at 0, the last frames' share of it small) — a foot
  // in the air only: one landed on the stand holds its spot and turn until
  // the last G.settleRestep of the weight, then steps the miss over, lifted
  // (a smooth share of it, met at 0)
  const shares = settleShares(w, c.settleFirst)
  const falling = w < c.settleW && c.settleW > 0
  const keep = falling ? (w / c.settleW) ** 2 : 1
  const R = G.settleRestep
  const held = (x: number) => {
    const u = Math.min(1, x / R)
    return u * u * (3 - 2 * u)
  }
  const restep = falling && w < R ? held(w) / held(c.settleW) : 1
  LEG_SIDES.forEach((_, i) => {
    const yaw = body?.yaw ?? 0
    const k = shares[i] >= 1 ? restep : keep
    _lift[i] = 0
    if (body && k < 1) {
      bodyToWorld(body, _stand[i], _liveW)
      const dx = c.settleStand[i].x - _liveW.x
      const dz = c.settleStand[i].z - _liveW.z
      if (shares[i] >= 1) _lift[i] = G.settleStepLift * Math.hypot(dx, dz) * Math.sin(Math.PI * (1 - w / R))
      c.settleStand[i].x = _liveW.x + dx * k
      c.settleStand[i].z = _liveW.z + dz * k
    }
    if (k < 1) c.settleTurn[i].slerp(_liveQ.copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, yaw)), 1 - k)
    if (body) worldToBody(body, c.settleStand[i], _stand[i])
    _standQ[i].copy(c.settleTurn[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, -yaw))
  })
  c.settleW = w
  LEG_SIDES.forEach((s, i) => {
    const step = shares[i]
    const p = step * step * (3 - 2 * step)
    const chain = legChain(bones, s)
    chain.forEach((b, k) => b.quaternion.copy(_codeLeg[i][k]).slerp(gaitLocal(asset, c, s, k), 1 - p))
    const [H, K, A, T, pole] = _ik
    T.copy(_gait[i]).lerp(_stand[i], p)
    T.y += G.settleStepLift * Math.hypot(_gait[i].x - _stand[i].x, _gait[i].z - _stand[i].z) * Math.sin(Math.PI * step) + _lift[i] / (body?.unit || 1)
    // the foot turned from the gait's turn to the stand's with its step
    _footQ.copy(_gaitQ[i]).slerp(_standQ[i], p)
    hips.updateMatrixWorld(true)
    inBody(chain[0], H, _q)
    inBody(chain[1], K, _q)
    inBody(chain[2], A, _q)
    const a = H.distanceTo(K)
    const b = K.distanceTo(A)
    // the knee bends where it bends now (forward where the leg is straight)
    const line = _p[0].copy(A).sub(H).normalize()
    pole.copy(K).sub(H)
    pole.addScaledVector(line, -pole.dot(line))
    if (pole.lengthSq() < 1e-10) pole.set(0, 0, 1)
    const sol = solveTwoBone(H, T, a, b, pole)
    swing(chain[0], K.clone().sub(H), sol.upper)
    inBody(chain[1], K, _q)
    inBody(chain[2], A, _q)
    swing(chain[1], A.clone().sub(K), sol.fore)
    inBody(chain[1], _s, _q)
    chain[2].quaternion.copy(_q.invert().multiply(_footQ))
    // drawn over the plain blend by `share`
    if (share < 1) chain.forEach((bn, k) => bn.quaternion.copy(_plain[i][k].clone().slerp(bn.quaternion, share)))
    chain[0].updateMatrixWorld(true)
  })
}

/**
 * The hands' shapes (the glTF body's live morphs, render/villagerBody.ts
 * LIVE_MORPHS) from what the hands do: closed round the shovel by the dig's
 * share (both hands) and the carry's (the right), the pointing shape where a
 * gesture aims a hand (`point`, left and right), and relaxed — a hand at rest
 * is softly curled, never a flat board — wherever neither holds. Per hand the
 * three weights sum to 1, so no shape stacks on another.
 */
export function handShapes(c: Pick<ClipLayers, 'dig' | 'carry' | 'arms'>, point: readonly [number, number] = [0, 0]): Record<LiveMorph, number> {
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  const gripL = clamp(c.dig)
  // the carry is the right arm's only while the clips own that arm
  const gripR = clamp(Math.max(c.dig, c.carry * c.arms[1]))
  const pointL = clamp(point[0]) * (1 - gripL)
  const pointR = clamp(point[1]) * (1 - gripR)
  return {
    'grip.L': gripL,
    'grip.R': gripR,
    'point.L': pointL,
    'point.R': pointR,
    'relax.L': clamp(1 - gripL - pointL),
    'relax.R': clamp(1 - gripR - pointR),
  }
}

/** Write hand-shape weights onto a mesh's morph influences (the targets it carries). */
export function applyHandShapes(mesh: THREE.Mesh, w: Record<LiveMorph, number>): void {
  const dict = mesh.morphTargetDictionary
  const inf = mesh.morphTargetInfluences
  if (!dict || !inf) return
  for (const n of LIVE_MORPHS) {
    const i = dict[n]
    if (i !== undefined) inf[i] = w[n]
  }
}

/**
 * The shovel on the right hand bone: shown while the hands hold it, gripped
 * where the dig's or the carry's clip grips it, by each clip's share of the
 * arm's pose as applyClipLayers layers it (the dig over the carry over the
 * code), so the shaft slides through the fist with the arm, never jumping and
 * never sliding on once the dig has the arm to itself.
 */
export function placeShovel(asset: VillagerAsset, person: GltfPerson, c: ClipLayers, tool: THREE.Object3D | null): void {
  if (!tool) return
  tool.visible = Math.max(c.dig, c.carry) > 0.5
  // placed even while hidden: gripShaft solves the left hand onto it from the
  // dig's first frame, before the shovel shows
  const dig = asset.clips.dig.tool?.grip ?? 0
  const carry = asset.clips.carry.tool?.grip ?? dig
  // the dig layers over everything below it, so its share of the arm is c.dig;
  // the rest (carry, gait or code) holds the shovel at the carry's grip
  const at = shovelOnHungHand(asset, person.frame, 'R', carry + (dig - carry) * c.dig)
  tool.position.copy(at.position)
  tool.quaternion.copy(at.quaternion)
  tool.scale.setScalar(person.frame.scale)
}

const _base = new THREE.Matrix4()
const _m = new THREE.Matrix4()
const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _held = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]

/** `o`'s position and turn in the body's frame (the hips' parent): free of a
 *  squash the figure group may carry, so directions and turns stay rigid. */
function inBody(o: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion): void {
  _m.multiplyMatrices(_base, o.matrixWorld).decompose(pos, quat, _s)
}

/** Turn bone `b` (body frame) by the shortest turn taking `from` to `to`. */
function swing(b: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  inBody(b, _s, _q)
  _q.premultiply(_q2.setFromUnitVectors(from.normalize(), to.clone().normalize()))
  inBody(b.parent!, _s, _q2)
  b.quaternion.copy(_q2.invert().multiply(_q))
  b.updateMatrixWorld(true)
}

/**
 * Both hands on the shaft on the FINAL body (natural-villager-motion step 7).
 * The right hand holds the shovel by attachment (placeShovel); the dig clip
 * puts the left on the shaft for the neutral body it was solved on only — on
 * another person its fist missed the shaft by up to 0.055 of the stature
 * (measured 14.10.2026). After the layers and the shovel: the left arm solved
 * so the left hand holds the shaft at the dig's upper grip with the hold the
 * pipeline authors (asset.toolHold.L), the elbow kept in the clip's own plane,
 * by the dig's share of the body.
 */
export function gripShaft(asset: VillagerAsset, person: GltfPerson, bones: Record<string, THREE.Bone>, c: ClipLayers, tool: THREE.Object3D | null): void {
  const other = asset.clips.dig.tool?.other
  if (!tool || c.dig <= 0 || other === undefined) return
  const chain = [bones['upperArm.L'], bones['forearm.L'], bones['hand.L']]
  chain.forEach((b, i) => _held[i].copy(b.quaternion))
  bones.hips.updateMatrixWorld(true)
  if (bones.hips.parent) _base.copy(bones.hips.parent.matrixWorld).invert()
  else _base.identity()
  const [sh, el, wr, target] = _p
  // the hand's turn and place that hold the tool where it is, at the upper grip
  const hold = shovelOnHungHand(asset, person.frame, 'L', other)
  inBody(tool, target, _q)
  const want = _q.clone().multiply(hold.quaternion.clone().invert())
  target.sub(hold.position.clone().applyQuaternion(want))
  inBody(chain[0], sh, _q)
  inBody(chain[1], el, _q)
  inBody(chain[2], wr, _q)
  const a = sh.distanceTo(el)
  const b = el.distanceTo(wr)
  // the clip's own bend: the elbow off the shoulder–wrist line
  const line = wr.clone().sub(sh).normalize()
  const pole = el.clone().sub(sh)
  pole.addScaledVector(line, -pole.dot(line))
  const sol = solveTwoBone(sh, target, a, b, pole)
  swing(chain[0], el.clone().sub(sh), sol.upper)
  inBody(chain[1], el, _q)
  inBody(chain[2], wr, _q)
  swing(chain[1], wr.clone().sub(el), sol.fore)
  inBody(chain[1], _s, _q)
  chain[2].quaternion.copy(_q.invert().multiply(want))
  // eased in and out with the dig, from what the layers below left
  if (c.dig < 1) chain.forEach((bn, i) => bn.quaternion.copy(_held[i].clone().slerp(bn.quaternion, c.dig)))
  chain[0].updateMatrixWorld(true)
}

/** The spine segments' turns the clips left, before the additive lean. */
export type TrunkBase = Record<LeanBone, THREE.Quaternion>
export const newTrunkBase = (): TrunkBase => ({ spine: new THREE.Quaternion(), spine1: new THREE.Quaternion(), chest: new THREE.Quaternion() })

/** Take the spine segments' current turns as the base the lean adds to. */
export function takeTrunkBase(bones: Record<string, THREE.Bone>, base: TrunkBase): void {
  for (const n of LEAN_BONES) base[n].copy(bones[n]?.quaternion ?? base[n].identity())
}

const _le = new THREE.Euler()
const _lq = new THREE.Quaternion()

/**
 * The trunk's additive lean on the glTF body (natural-villager-motion step 9):
 * `pitch` (rad, + leaning in) and `turn` (rad) distributed over spine, spine1
 * and chest (VILLAGER_POSE.leanShares), each on top of its clip turn `base`.
 * Every lean of the game goes through here: the pose's (gesture, tag, caught
 * slump), the elder's stoop and the contact lean.
 */
export function leanTrunk(bones: Record<string, THREE.Bone>, base: TrunkBase, pitch: number, turn: number): void {
  const d = distributeLean(pitch, turn, VILLAGER_POSE.leanShares)
  for (const n of LEAN_BONES) {
    const b = bones[n]
    if (b) b.quaternion.copy(base[n]).multiply(_lq.setFromEuler(_le.set(d[n].pitch, d[n].yaw, 0, 'XYZ')))
  }
}

const _cw = new THREE.Quaternion()
const _gd = new THREE.Vector3()

/**
 * Hold the head on a gaze (yaw, pitch relative to the heading, body frame)
 * over neck 0.4 → head 0.6 (VILLAGER_POSE.gaze), by `weight`: after every
 * trunk layer, so the face stays on its target through the lean and the gait.
 */
export function gazeHead(bones: Record<string, THREE.Bone>, yaw: number, pitch: number, weight: number): void {
  _cw.identity()
  for (const n of ['hips', 'spine', 'spine1', 'chest']) if (bones[n]) _cw.multiply(bones[n].quaternion)
  aimHead(_cw, bones.neck.quaternion, bones.head.quaternion, gazeDirection(yaw, pitch, _gd), VILLAGER_POSE.gaze.neck, weight)
}

const _sq = new THREE.Quaternion()
const _se = new THREE.Euler()

/**
 * The posable clavicles (natural-villager-motion step 11): each shoulder's
 * protraction (forward) and elevation (up) added on top of what the clips
 * left, clamped to VILLAGER_POSE.shoulders; none (absent or 0) leaves the
 * clip's clavicle exactly as it is. The bones' frames are the body's at rest
 * (the hung skeleton's locals are identity there): forward is +z, up +y, the
 * left shoulder at +x.
 */
export function poseShoulders(bones: Record<string, THREE.Bone>, shoulders: { left: ShoulderPose; right: ShoulderPose } | undefined): void {
  if (!shoulders) return
  const lim = VILLAGER_POSE.shoulders
  ;(['L', 'R'] as const).forEach((s) => {
    const p = s === 'L' ? shoulders.left : shoulders.right
    const b = bones[`shoulder.${s}`]
    if (!b || (!p.protraction && !p.elevation)) return
    const pro = Math.min(lim.protractionMax, Math.max(0, p.protraction))
    const up = Math.min(lim.elevationMax, Math.max(-lim.dropMax, p.elevation))
    const side = s === 'L' ? 1 : -1
    // forward: a turn about y carrying the outer end (±x) toward +z; up: about z toward +y
    b.quaternion.multiply(_sq.setFromEuler(_se.set(0, -side * pro, side * up, 'YZX')))
  })
}
