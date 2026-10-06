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
// What stays the code's: the kneel, the work crouch, every contact and
// steadying hand, the head's correction, the trunk's lean and stoop.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF as G } from '../../config/balance'
import type { VillagerAsset } from '../../render/villagerAsset'
import { clipGaitPose, clipPoseAt, newClipGait, releaseClipGait, samplePhase, shovelOnHungHand, stepClipGait, toHung, type ClipGait, type GroundBody } from '../../render/villagerClipPose'
import type { GltfPerson } from '../../render/villagerFigureBody'
import { blendPoses, newPose, type VillagerPose } from '../../render/villagerRig'
import type { FigureWork } from './placeFigureContext'

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
}

export function clipLayers(asset: VillagerAsset): ClipLayers {
  const n = asset.bones.length
  return {
    gait: newClipGait(),
    ground: null,
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
  c.ground = { ...ground }
  c.dig = ease(c.dig, work?.dig ? 1 : 0, dt)
  // the carry stays under the dig while it eases in, and is there again after
  c.carry = ease(c.carry, work?.tool && (!work.dig || c.dig < 1) ? 1 : 0, dt)
  // the stroke starts from its top when the dig begins, and runs on while it fades
  c.digT = c.dig > 0 ? c.digT + dt : 0
  c.arms = [ease(c.arms[0], c.free[0] ? 1 : 0, dt), ease(c.arms[1], c.free[1] ? 1 : 0, dt)]
  c.idleT += dt
}

const LEGS = ['hips', 'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R']
const ARM = (s: 'L' | 'R') => [`shoulder.${s}`, `upperArm.${s}`, `forearm.${s}`, `hand.${s}`]
/** Bones the code-built pose never writes: they return to rest before a blend. */
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
  // THE GAIT
  if (walking > 1e-3 && under) {
    clipGaitPose(c.gait, asset, f, m.speed, c.ground, c.pose)
    toHung(asset, f, c.pose, c.local, c.hips)
    const w = walking
    blendInto(asset, bones, LEGS, c.local, w)
    blendHips(bones, c.hips, w)
    blendInto(asset, bones, ARM('L'), c.local, w * c.arms[0])
    // under a carry too, so a carry partly overriding the arm stays continuous
    blendInto(asset, bones, ARM('R'), c.local, w * c.arms[1])
  } else {
    // standing: the feet are where they stand, nothing held for the next walk
    releaseClipGait(c.gait)
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

/**
 * The shovel on the right hand bone: shown while the hands hold it, gripped
 * where the dig's or the carry's clip grips it, by each clip's share of the
 * arm's pose as applyClipLayers layers it (the dig over the carry over the
 * code), so the shaft slides through the fist with the arm, never jumping and
 * never sliding on once the dig has the arm to itself.
 */
export function placeShovel(asset: VillagerAsset, person: GltfPerson, c: ClipLayers, tool: THREE.Object3D | null): void {
  if (!tool) return
  const held = Math.max(c.dig, c.carry)
  tool.visible = held > 0.5
  if (!tool.visible) return
  const dig = asset.clips.dig.tool?.grip ?? 0
  const carry = asset.clips.carry.tool?.grip ?? dig
  // the dig layers over everything below it, so its share of the arm is c.dig;
  // the rest (carry, gait or code) holds the shovel at the carry's grip
  const at = shovelOnHungHand(asset, person.frame, 'R', carry + (dig - carry) * c.dig)
  tool.position.copy(at.position)
  tool.quaternion.copy(at.quaternion)
  tool.scale.setScalar(person.frame.scale)
}
