// @vitest-environment node
// The glTF villager's clips on the drawn (hung) body: the carry onto the hung
// skeleton, the gait's no-slide (phase by distance, stride warped, planted foot
// held), the walk/sprint blend without a jump, and the shovel on the hand.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF } from '../config/balance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { clipGaitPose, clipPoseAt, newClipGait, shovelOnHungHand, stepClipGait, toHung, type GroundBody } from './villagerClipPose'
import { gltfPerson, type GltfPerson } from './villagerFigureBody'
import { contactPoints, forwardKinematics, newPose, newWorld, toolInHand } from './villagerRig'

let asset: VillagerAsset
let adult: GltfPerson
let child: GltfPerson

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  adult = gltfPerson(asset, 'male', 'adult', 0)
  child = gltfPerson(asset, 'female', 'child', 0)
})

const quats = (n: number) => Array.from({ length: n }, () => new THREE.Quaternion())

/** The drawn body's world joints for hung locals (as three's bones would place them). */
function hungJoints(person: GltfPerson, local: THREE.Quaternion[], hips: THREE.Vector3) {
  const n = asset.bones.length
  const q = quats(n)
  const p = Array.from({ length: n }, () => new THREE.Vector3())
  const order = [...Array(n).keys()].sort((a, b) => depth(a) - depth(b))
  function depth(i: number): number {
    return asset.parents[i] < 0 ? 0 : 1 + depth(asset.parents[i])
  }
  for (const i of order) {
    const par = asset.parents[i]
    if (par < 0) {
      q[i].copy(local[i])
      p[i].copy(hips)
    } else {
      q[i].copy(q[par]).multiply(local[i])
      const off = new THREE.Vector3(
        person.rest[i * 3] - person.rest[par * 3],
        person.rest[i * 3 + 1] - person.rest[par * 3 + 1],
        person.rest[i * 3 + 2] - person.rest[par * 3 + 2],
      )
      p[i].copy(off.applyQuaternion(q[par])).add(p[par])
    }
  }
  return p
}

describe('a clip pose on the hung skeleton', () => {
  it('the hang itself is the drawn rest: identity locals, the hips at the drawn rest', () => {
    const n = asset.bones.length
    const f = adult.frame
    const pose = newPose(n)
    asset.parents.forEach((par, i) => {
      const q = par < 0 ? f.hang[i].clone() : f.hang[par].clone().invert().multiply(f.hang[i])
      q.toArray(pose.rot, i * 4)
    })
    const h = asset.parents.indexOf(-1)
    pose.hips.set(f.rest0[h * 3], f.rest0[h * 3 + 1], f.rest0[h * 3 + 2])
    const local = quats(n)
    const hips = new THREE.Vector3()
    toHung(asset, f, pose, local, hips)
    for (const q of local) expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(2e-3)
    expect(hips.distanceTo(new THREE.Vector3(adult.rest[h * 3], adult.rest[h * 3 + 1], adult.rest[h * 3 + 2]))).toBeLessThan(1e-4)
  })

  it('every joint lands where the clip puts it, scaled onto the drawn body', () => {
    const n = asset.bones.length
    const f = child.frame
    const pose = clipPoseAt(asset, f, asset.clips.dig, 0.8, newPose(n))
    const world = forwardKinematics(asset, f.rest0, pose, newWorld(n))
    const local = quats(n)
    const hips = new THREE.Vector3()
    toHung(asset, f, pose, local, hips)
    const drawn = hungJoints(child, local, hips)
    for (let i = 0; i < n; i++) {
      const want = world.p[i].clone().setY(world.p[i].y - f.sole).multiplyScalar(f.scale)
      expect(drawn[i].distanceTo(want)).toBeLessThan(1e-4)
    }
  })
})

describe('the clip gait on the ground', () => {
  /** Walk a person straight ahead at `speed` and record each planted foot's world slide. */
  function walkStraight(person: GltfPerson, speed: number, hold = true, seconds = 4, dt = 1 / 60) {
    const n = asset.bones.length
    const g = newClipGait()
    const pose = newPose(n)
    const world = newWorld(n)
    const f = person.frame
    let slide = 0
    let lowest = Infinity
    let last: Record<string, THREE.Vector3> = {}
    let z = 0
    for (let t = 0; t < seconds; t += dt) {
      const walked = speed * dt
      z += walked
      stepClipGait(g, asset, f, walked, speed)
      const body: GroundBody = { x: 0, z, yaw: 0, unit: 1 }
      clipGaitPose(g, asset, f, speed, hold ? body : null, pose)
      forwardKinematics(asset, f.rest0, pose, world)
      const c = contactPoints(asset, world, f.legScale)
      const next: typeof last = {}
      for (const s of ['L', 'R'] as const) {
        for (const k of ['heel', 'ball', 'tip'] as const) {
          const p = c[s][k]
          lowest = Math.min(lowest, p.y)
          if (p.y > 0.01) continue
          const w = new THREE.Vector3(p.x * f.scale, 0, p.z * f.scale + z)
          const key = s + k
          if (last[key] && t > 1) slide = Math.max(slide, w.distanceTo(last[key]))
          next[key] = w
        }
      }
      last = next
    }
    return { slide, lowest }
  }

  it('with the hold, a planted foot does not slide at any pace or body size outside the walk/sprint cross-fade', () => {
    for (const person of [adult, child]) {
      const per = person.frame.legScale * person.frame.scale
      const band = [VILLAGER_GLTF.sprintThreshold - VILLAGER_GLTF.sprintBand, VILLAGER_GLTF.sprintThreshold + VILLAGER_GLTF.sprintBand].map((x) => x * per)
      for (const v of [0.4, 0.8, 1.2, 1.4, 2.6, 3.4]) {
        if (v > band[0] && v < band[1]) continue
        expect(walkStraight(person, v).slide).toBeLessThan(0.004)
      }
      // inside the cross-fade the hold may give way, by a slip and never a jump
      expect(walkStraight(person, VILLAGER_GLTF.sprintThreshold * per).slide).toBeLessThan(0.08)
    }
  })

  it('the feet never sink below the ground', () => {
    for (const v of [0.6, 1.2, 3.4]) expect(walkStraight(adult, v).lowest).toBeGreaterThan(-0.01)
  })

  it('walk → sprint is continuous: a small change of pace moves no joint by a jump', () => {
    const n = asset.bones.length
    const f = adult.frame
    const g = newClipGait()
    g.phase = 0.3
    const a = newPose(n)
    const b = newPose(n)
    const wa = newWorld(n)
    const wb = newWorld(n)
    const threshold = VILLAGER_GLTF.sprintThreshold * f.legScale * f.scale
    for (let v = threshold - 0.8; v < threshold + 0.8; v += 0.02) {
      clipGaitPose(g, asset, f, v, null, a)
      clipGaitPose(g, asset, f, v + 0.02, null, b)
      forwardKinematics(asset, f.rest0, a, wa)
      forwardKinematics(asset, f.rest0, b, wb)
      for (let i = 0; i < n; i++) expect(wa.p[i].distanceTo(wb.p[i])).toBeLessThan(0.03)
    }
  })
})

describe('the shovel on the drawn hand', () => {
  it('in the dig clip the blade stays clear of the body and the shaft runs through the hand', () => {
    const f = adult.frame
    const grip = asset.clips.dig.tool!.grip
    const at = shovelOnHungHand(asset, f, 'R', grip)
    // the fist holds the shaft: the shaft line passes within a hand's breadth of the bone
    const shaft = new THREE.Vector3(0, 1, 0).applyQuaternion(at.quaternion)
    const closest = at.position.clone().sub(shaft.clone().multiplyScalar(at.position.dot(shaft)))
    expect(closest.length()).toBeLessThan(0.12)
    expect(VILLAGER_ASSET.shovel.tip).toBeLessThan(VILLAGER_ASSET.shovel.shaftBottom)
  })
})

describe('the clips themselves', () => {
  it('the dig never turns the shovel about its own shaft: per frame, once the shaft\'s swing is taken out', () => {
    const c = asset.clips.dig
    const n = asset.bones.length
    const f = adult.frame
    const hand = asset.bones.indexOf('hand.R')
    const inHand = toolInHand(asset, 'R', c.tool!.grip).quaternion
    const pose = newPose(n)
    const world = newWorld(n)
    const tools = Array.from(c.times, (t) => {
      clipPoseAt(asset, f, c, t, pose)
      forwardKinematics(asset, f.rest0, pose, world)
      return world.q[hand].clone().multiply(inHand)
    })
    let worst = 0
    let total = 0
    for (let k = 1; k < tools.length; k++) {
      const a0 = new THREE.Vector3(0, 1, 0).applyQuaternion(tools[k - 1])
      const a1 = new THREE.Vector3(0, 1, 0).applyQuaternion(tools[k])
      // the face carried by the shortest swing of the shaft, against the face itself
      const carried = new THREE.Vector3(0, 0, 1).applyQuaternion(tools[k - 1]).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(a0, a1))
      const face = new THREE.Vector3(0, 0, 1).applyQuaternion(tools[k])
      const roll = Math.atan2(carried.clone().cross(face).dot(a1), carried.dot(face))
      worst = Math.max(worst, Math.abs(roll))
      total += roll
    }
    // the loop's leftover (holonomy, ~18°) is spread evenly: ~0.25° a frame
    expect(worst).toBeLessThan((1 * Math.PI) / 180)
    expect(Math.abs(total)).toBeLessThan((25 * Math.PI) / 180)
  })

  it('no bone jumps between two frames of any clip (an IK flip would)', () => {
    for (const [name, c] of Object.entries(asset.clips)) {
      const n = c.times.length
      c.rot.forEach((r, i) => {
        if (!r.length) return
        for (let k = 1; k < n; k++) {
          const a = new THREE.Quaternion().fromArray(r, (k - 1) * 4)
          const b = new THREE.Quaternion().fromArray(r, k * 4)
          const step = c.times[k] - c.times[k - 1]
          // 9 rad/s holds the dig's throw and the walk's swing; a sprinter's
          // thigh swings at up to ~14 (its knee snapped at ~30 before the softening)
          expect(a.angleTo(b) / step, `${name} ${asset.bones[i]} frame ${k}`).toBeLessThan(name === 'sprint' ? 16 : 9)
        }
      })
    }
  })
})
