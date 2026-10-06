// The glTF villager's clips on the drawn body (work-order "villager glTF body:
// animation, dress and tool"): the retargeted walk and sprint, the authored
// dig and the shovel carry, sampled and blended here and carried onto the
// HUNG skeleton the settlement figure binds (villagerFigureBody.ts), whose
// rest differs from the file's A-pose by each limb's hang.
//
// The gait's no-slide rule is point 1295's: the phase advances by exactly the
// ground walked over the distance one blended cycle covers (villagerRig.ts
// `gaitAt`), the stride is warped to that cycle by two-bone IK on the legs, and
// a planted foot is held on its spot through a turn or a shove until it lifts.
//
// Pure: arrays and three's math types, no scene graph; the tests read it directly.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF as G } from '../config/balance'
import type { VillagerAsset, VillagerClip } from './villagerAsset'
import type { PersonFrame } from './villagerFigureBody'
import {
  blendPoses,
  contactPoints,
  forwardKinematics,
  gaitAt,
  newPose,
  newWorld,
  sampleClip,
  setWorldRotation,
  solveLimb,
  toolInHand,
  type VillagerPose,
  type WorldPose,
} from './villagerRig'

/** The figure's place on the ground: world x, z, the yaw it faces (+z local
 *  turned by yaw) and its world scale. */
export interface GroundBody {
  x: number
  z: number
  yaw: number
  unit: number
}

type Contact = 'heel' | 'ball' | 'tip'
const CONTACTS: readonly Contact[] = ['heel', 'ball', 'tip']

/** A held foot: where each of its sole's contacts touched down (world x, z),
 *  null for a contact in the air. */
export type HeldFoot = Record<Contact, { x: number; z: number } | null>

const freeFoot = (): HeldFoot => ({ heel: null, ball: null, tip: null })

/** The gait's state on one figure. */
export interface ClipGait {
  /** Cycle phase 0 … 1 (walk and sprint both start at the left foot's landing). */
  phase: number
  held: [HeldFoot, HeldFoot]
  /** Per foot, the correction (person x, z) the hold puts on the clip's foot;
   *  once the foot lifts it fades over VILLAGER_GLTF.plantFadeCycle. */
  slip: [{ x: number; z: number }, { x: number; z: number }]
  /** The phase the slip was last eased at. */
  slipPhase: number
}

export const newClipGait = (): ClipGait => ({ phase: 0, held: [freeFoot(), freeFoot()], slip: [{ x: 0, z: 0 }, { x: 0, z: 0 }], slipPhase: 0 })

/** Let both feet go (standing: nothing is held for the next walk). */
export function releaseClipGait(g: ClipGait): void {
  g.held = [freeFoot(), freeFoot()]
  g.slip = [{ x: 0, z: 0 }, { x: 0, z: 0 }]
}

/** How far a contact may lie above the ground and still carry (person units). */
export const PLANT_TOUCH = 0.02

/**
 * Advance the gait by `walked` (figure units along the facing, the same
 * distance the code-built walk steps by) at the smoothed ground `speed`: the
 * planted foot sweeps exactly that ground, so it holds its spot.
 */
export function stepClipGait(g: ClipGait, asset: VillagerAsset, frame: PersonFrame, walked: number, speed: number): void {
  // figure units → person units of the clips (the drawn body is scaled by frame.scale)
  const legs = frame.legScale
  const v = speed / frame.scale
  const gait = gaitAt(asset.clips.walk, asset.clips.sprint, v, legs)
  const p = g.phase + (walked / frame.scale) * gait.phasePerUnit
  g.phase = ((p % 1) + 1) % 1
}

const _a = newPose(0)
const _b = newPose(0)
const ensure = (pose: VillagerPose, bones: number) => {
  if (pose.rot.length !== bones * 4) {
    const fresh = newPose(bones)
    pose.rot = fresh.rot
  }
  return pose
}

/** A clip sampled at a phase of its cycle into `out`, the hips scaled onto the person. */
export function samplePhase(clip: VillagerClip, phase: number, frame: PersonFrame, out: VillagerPose): VillagerPose {
  sampleClip(clip, phase * clip.duration, out)
  out.hips.multiplyScalar(frame.legScale)
  return out
}

const _w = newWorld(0)
const ensureWorld = (w: WorldPose, bones: number) => {
  while (w.q.length < bones) {
    w.q.push(new THREE.Quaternion())
    w.p.push(new THREE.Vector3())
  }
  return w
}
const _keep = new THREE.Quaternion()
const _t = new THREE.Vector3()
const _pole = new THREE.Vector3()
const _miss = new THREE.Vector3()
const smoothstep = (x: number) => x * x * (3 - 2 * x)
const _h = new THREE.Vector3()

/** Person-unit (x, z) on the figure → world (x, z). */
function toWorld(frame: PersonFrame, body: GroundBody, p: THREE.Vector3): { x: number; z: number } {
  const lx = p.x * frame.scale * body.unit
  const lz = p.z * frame.scale * body.unit
  const c = Math.cos(body.yaw)
  const s = Math.sin(body.yaw)
  return { x: body.x + lx * c + lz * s, z: body.z - lx * s + lz * c }
}

/** World (x, z) → person-unit (x, z) on the figure (y left as it is). */
function toPerson(frame: PersonFrame, body: GroundBody, h: { x: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
  const dx = h.x - body.x
  const dz = h.z - body.z
  const c = Math.cos(body.yaw)
  const s = Math.sin(body.yaw)
  const k = 1 / (frame.scale * (body.unit || 1))
  return out.set((dx * c - dz * s) * k, out.y, (dx * s + dz * c) * k)
}

/**
 * The gait pose at the gait's phase and `speed` (figure units/s) on the
 * person's A-pose skeleton: walk and sprint blended by the sprint share, the
 * stride warped to the blended cycle, and every planted foot held at its spot
 * (`body`; null holds nothing). Writes `out` and returns it.
 */
export function clipGaitPose(
  g: ClipGait,
  asset: VillagerAsset,
  frame: PersonFrame,
  speed: number,
  body: GroundBody | null,
  out: VillagerPose,
  walkClip: VillagerClip = asset.clips.walk,
): VillagerPose {
  const n = asset.bones.length
  ensure(out, n)
  const world = ensureWorld(_w, n)
  const v = speed / frame.scale
  const gait = gaitAt(asset.clips.walk, asset.clips.sprint, v, frame.legScale)
  samplePhase(walkClip, g.phase, frame, ensure(_a, n))
  samplePhase(asset.clips.sprint, g.phase, frame, ensure(_b, n))
  blendPoses(
    [
      { pose: _a, w: 1 - gait.sprint },
      { pose: _b, w: gait.sprint },
    ],
    out,
  )
  forwardKinematics(asset, frame.rest0, out, world)
  const hips = asset.bones.indexOf('hips')
  // how far a lifted foot's correction fades this call: by the cycle walked
  const walkedPhase = (((g.phase - g.slipPhase) % 1) + 1) % 1
  g.slipPhase = g.phase
  const fade = Math.min(1, walkedPhase / Math.max(1e-6, G.plantFadeCycle))
  ;(['L', 'R'] as const).forEach((s, i) => {
    const thigh = asset.bones.indexOf(`thigh.${s}`)
    const shin = asset.bones.indexOf(`shin.${s}`)
    const foot = asset.bones.indexOf(`foot.${s}`)
    // The stride: the foot's reach fore and aft of the hips scaled to the cycle.
    const shift = (world.p[foot].z - world.p[hips].z) * (gait.stride - 1)
    _t.copy(world.p[foot])
    _t.z += shift
    // The planted foot: every sole contact on the ground stays where it
    // touched down; the ankle moves by their mean miss (a foot rolling from the
    // heel over the ball keeps each point still while it carries).
    const c = contactPoints(asset, world, frame.legScale)[s]
    const held = g.held[i]
    _miss.set(0, 0, 0)
    let down = 0
    let firm = 0
    const touch = PLANT_TOUCH * frame.legScale
    for (const k of CONTACTS) {
      const p = c[k]
      p.z += shift
      if (!body || p.y >= touch) {
        held[k] = null
        continue
      }
      if (!held[k]) continue
      // a contact rising off the ground lets go gradually, never in one frame
      const w = smoothstep(Math.min(1, (touch - p.y) / (0.5 * touch)))
      toPerson(frame, body, held[k]!, _h.set(0, 0, 0))
      _miss.x += w * (_h.x - p.x)
      _miss.z += w * (_h.z - p.z)
      down += w
      firm = Math.max(firm, w)
    }
    // the contacts' weighted mean miss, held only as firmly as the firmest
    // contact: a lone contact rising off lets the correction fade with it (the
    // mean alone divided its own weight back out, and the foot jumped the
    // whole miss when it lifted)
    if (down) _miss.multiplyScalar(firm / down)
    // Held firm, the foot sits exactly on its hold (no slide). Otherwise the
    // correction eases toward what the lifting contacts still carry (none, once
    // the foot is in the air) by the cycle walked: the contacts lift within a
    // frame or two, so their height alone could not fade it.
    const slip = g.slip[i]
    if (firm < 1) {
      _miss.x = slip.x + (_miss.x - slip.x) * fade
      _miss.z = slip.z + (_miss.z - slip.z) * fade
    }
    const far = Math.hypot(_miss.x, _miss.z)
    const limit = G.plantRelease * frame.legScale
    if (body && far > limit) {
      // Held too far from the clip's own foot (a gait blend that strides
      // otherwise than its phase, a shove): the hold gives way just enough to
      // stay within reach — a slip, never a jump.
      _miss.multiplyScalar(limit / far)
      for (const k of CONTACTS) if (held[k]) held[k] = toWorld(frame, body, _h.copy(c[k]).add(_miss))
    }
    if (body) {
      for (const k of CONTACTS) {
        const p = c[k]
        if (p.y < touch && !held[k]) held[k] = toWorld(frame, body, _h.copy(p).add(_miss))
      }
    }
    slip.x = _miss.x
    slip.z = _miss.z
    _t.x += _miss.x
    _t.z += _miss.z
    _keep.copy(world.q[foot])
    _pole.set(0, 0, 1)
    solveLimb(asset, frame.rest0, out, world, thigh, shin, foot, _t, _pole)
    setWorldRotation(asset, out, world, foot, _keep)
    forwardKinematics(asset, frame.rest0, out, world)
  })
  return out
}

/** A once/loop clip at `t` seconds (looping a loop) on the person. */
export function clipPoseAt(asset: VillagerAsset, frame: PersonFrame, clip: VillagerClip, t: number, out: VillagerPose): VillagerPose {
  ensure(out, asset.bones.length)
  sampleClip(clip, t, out)
  out.hips.multiplyScalar(frame.legScale)
  return out
}

/**
 * The pose carried onto the hung skeleton: per bone the LOCAL rotation that
 * gives the drawn bone the pose's world turn (W · hang⁻¹, the parent's taken
 * out), and the hips' place on the drawn body (figure units, body-mesh frame).
 */
export function toHung(
  asset: VillagerAsset,
  frame: PersonFrame,
  pose: VillagerPose,
  outLocal: THREE.Quaternion[],
  outHips: THREE.Vector3,
): void {
  const n = asset.bones.length
  const world = ensureWorld(_w, n)
  forwardKinematics(asset, frame.rest0, pose, world)
  while (_hung.length < n) _hung.push(new THREE.Quaternion())
  const hung = _hung
  for (let i = 0; i < n; i++) hung[i].copy(world.q[i]).multiply(_inv.copy(frame.hang[i]).invert())
  for (let i = 0; i < n; i++) {
    const p = asset.parents[i]
    if (p < 0) outLocal[i].copy(hung[i])
    else outLocal[i].copy(_inv.copy(hung[p]).invert()).multiply(hung[i])
  }
  const h = asset.parents.indexOf(-1)
  outHips.copy(world.p[h]).setY(world.p[h].y - frame.sole).multiplyScalar(frame.scale)
}
const _hung: THREE.Quaternion[] = []
const _inv = new THREE.Quaternion()

/**
 * The shovel on the drawn hand bone (figure units, that bone's frame): the
 * file's grip (villagerRig.ts `toolInHand`) carried through the hand's hang
 * and the person's scale.
 */
export function shovelOnHungHand(
  asset: VillagerAsset,
  frame: PersonFrame,
  hand: 'L' | 'R',
  grip: number,
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const t = toolInHand(asset, hand, grip)
  const h = frame.hang[asset.bones.indexOf(`hand.${hand}`)]
  return { position: t.position.applyQuaternion(h).multiplyScalar(frame.scale), quaternion: h.clone().multiply(t.quaternion) }
}

/** Where a shovel's blade tip lies for a hand bone's world transform (any
 *  frame): the tool frame's −y end at `VILLAGER_ASSET.shovel.tip`. */
export function shovelTip(
  handWorld: THREE.Matrix4,
  attach: { position: THREE.Vector3; quaternion: THREE.Quaternion },
  tip: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out.set(0, tip, 0).applyQuaternion(attach.quaternion).add(attach.position).applyMatrix4(handWorld)
}
