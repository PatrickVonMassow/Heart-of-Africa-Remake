// @vitest-environment node
// The glTF villager's clip layers over the code-built pose: they ease in and
// out (no jump between activities), the shovel rides the hand and its blade
// stays above the ground while carried.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF, VILLAGER_MOTION, VILLAGER_POSE } from '../../config/balance'
import { distributeLean, gazeDirection, LEAN_BONES, newGaze, stepGaze } from '../../render/figureRig'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { clipGaitPose, clipPoseAt, gaitStance, shovelOnHungHand, toHung } from '../../render/villagerClipPose'
import { newPose } from '../../render/villagerRig'
import { groundStepped, keptPace, setOffSpeed, steerHeading } from '../../render/figureWalk'
import { createGltfSkeleton, gltfPerson, type GltfPerson } from '../../render/villagerFigureBody'
import { AGE_GROUPS, SEXES } from '../../systems/appearance'
import { applyClipLayers, clipLayers, gazeHead, gripShaft, handShapes, leanTrunk, newTrunkBase, placeShovel, poseShoulders, settleShares, stepClipLayers, takeTrunkBase, TRUNK, type ClipLayers } from './gltfClipLayers'

let asset: VillagerAsset
let person: GltfPerson

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  person = gltfPerson(asset, 'male', 'adult', 0)
})

function figure() {
  const { bones } = createGltfSkeleton(asset, person.rest)
  const tool = new THREE.Group()
  bones['hand.R'].add(tool)
  return { bones, tool, c: clipLayers(asset) }
}

/** One frame of a figure walking straight ahead at `speed` (weight 1) or standing. */
function frame(
  f: { bones: Record<string, THREE.Bone>; tool: THREE.Group; c: ClipLayers },
  z: number,
  speed: number,
  work: { dig: boolean; tool: boolean; digT?: number },
  dt: number,
  free: readonly [boolean, boolean] = [true, true],
) {
  // the code-built pose: everything at rest
  for (const b of Object.values(f.bones)) b.quaternion.identity()
  stepClipLayers(asset, person, f.c, speed * dt, speed, { x: 0, z, yaw: 0, unit: 1 }, work, dt)
  applyClipLayers(asset, person, f.bones, f.c, { speed, weight: speed > 0 ? 1 : 0, kneel: 0 }, free)
  placeShovel(asset, person, f.c, f.tool)
  f.bones.hips.updateMatrixWorld(true)
}

const tipY = (tool: THREE.Object3D) => new THREE.Vector3(0, VILLAGER_ASSET.shovel.tip, 0).applyMatrix4(tool.matrixWorld).y
const handleY = (tool: THREE.Object3D) => new THREE.Vector3(0, VILLAGER_ASSET.shovel.top, 0).applyMatrix4(tool.matrixWorld).y

describe('the clip layers on the glTF figure', () => {
  it('with zero code lean the trunk bones equal the clip\'s: the idle standing, the gait walking (one pose pipeline)', () => {
    const n = asset.bones.length
    const local = Array.from({ length: n }, () => new THREE.Quaternion())
    const hips = new THREE.Vector3()
    // per component (q and −q the same turn): an angle read through acos
    // near 1 is only good to ~1e-3 in float
    const diff = (a: THREE.Quaternion, b: THREE.Quaternion) => {
      const s = a.dot(b) < 0 ? -1 : 1
      return Math.max(Math.abs(a.x - s * b.x), Math.abs(a.y - s * b.y), Math.abs(a.z - s * b.z), Math.abs(a.w - s * b.w))
    }
    const worst = (f: ReturnType<typeof figure>) => Math.max(...TRUNK.map((b) => diff(f.bones[b].quaternion, local[asset.bones.indexOf(b)])))
    const dt = 1 / 60
    const stand = figure()
    for (let k = 0; k < 50; k++) frame(stand, 0, 0, { dig: false, tool: false }, dt)
    toHung(asset, person.frame, clipPoseAt(asset, person.frame, asset.clips.idle, stand.c.idleT % asset.clips.idle.duration, newPose(n)), local, hips)
    expect(worst(stand)).toBeLessThan(1e-4)
    const walk = figure()
    let z = 0
    for (let k = 0; k < 50; k++) frame(walk, (z += 1.1 * dt), 1.1, { dig: false, tool: false }, dt)
    toHung(asset, person.frame, clipGaitPose(structuredClone(walk.c.gait), asset, person.frame, 1.1, walk.c.ground, newPose(n)), local, hips)
    expect(worst(walk)).toBeLessThan(1e-4)
  })

  it('the dig stroke runs on the work clock the caller keeps, and freezes while it stands', () => {
    const f = figure()
    const dt = 1 / 60
    // the work clock advancing: the stroke is exactly it
    for (let k = 1; k <= 30; k++) frame(f, 0, 0, { dig: true, tool: true, digT: 0.37 + k * dt }, dt)
    expect(f.c.digT).toBeCloseTo(0.37 + 30 * dt)
    // the bout holds and fades: the clock stands, the stroke with it
    const held = f.c.digT
    for (let k = 0; k < 30; k++) frame(f, 0, 0, { dig: false, tool: true, digT: held }, dt)
    expect(f.c.digT).toBe(held)
    // without a work clock the layers keep their own (it restarts once the dig is gone)
    const g = figure()
    for (let k = 0; k < 30; k++) frame(g, 0, 0, { dig: true, tool: true }, dt)
    expect(g.c.digT).toBeCloseTo(30 * dt)
  })

  it('carry walking and standing: the shovel is in the hand and its blade never below the ground', () => {
    const f = figure()
    const dt = 1 / 60
    let z = 0
    let seen = 0
    for (let k = 0; k < 360; k++) {
      const speed = k < 180 ? 1.1 : 0
      z += speed * dt
      frame(f, z, speed, { dig: false, tool: true }, dt)
      if (!f.tool.visible) continue
      seen++
      expect(Math.min(tipY(f.tool), handleY(f.tool))).toBeGreaterThan(0)
    }
    expect(seen).toBeGreaterThan(300)
  })

  it('a change of activity blends: no bone turns by a jump when the dig starts or ends', () => {
    const f = figure()
    const dt = 1 / 60
    const prev = new Map<string, THREE.Quaternion>()
    let worst = 0
    for (let k = 0; k < 240; k++) {
      const dig = k >= 60 && k < 180
      frame(f, 0, 0, { dig, tool: true }, dt)
      for (const [n, b] of Object.entries(f.bones)) {
        const p = prev.get(n)
        if (p && k > 1) worst = Math.max(worst, p.angleTo(b.quaternion))
        prev.set(n, b.quaternion.clone())
      }
    }
    // the dig's own fastest stroke turns a bone by under ~0.25 rad a frame;
    // a cut into the dig would turn it by its whole pose at once
    expect(worst).toBeLessThan(0.25)
    expect(VILLAGER_GLTF.transitionSeconds).toBeGreaterThan(0.1)
  })

  it('an arm taken by the code (a gesture, a contact) and given back blends, never snaps', () => {
    const f = figure()
    const dt = 1 / 60
    const arm = ['shoulder.R', 'upperArm.R', 'forearm.R', 'hand.R', 'upperArm.L', 'forearm.L']
    const prev = new Map<string, THREE.Quaternion>()
    let worst = 0
    let z = 0
    for (let k = 0; k < 300; k++) {
      z += 1.1 * dt
      // carrying the shovel while walking; the right arm is the code's for a while
      const free: [boolean, boolean] = k >= 100 && k < 200 ? [k < 150, false] : [true, true]
      frame(f, z, 1.1, { dig: false, tool: true }, dt, free)
      for (const n of arm) {
        const q = f.bones[n].quaternion
        const p = prev.get(n)
        if (p && k > 1) worst = Math.max(worst, p.angleTo(q))
        prev.set(n, q.clone())
      }
    }
    expect(f.c.arms).toEqual([1, 1])
    // the carry walk's own swing turns an arm bone by up to ~0.15 rad a frame
    // with no handover at all; a snap to the code's pose turned it by ~3 rad
    expect(worst).toBeLessThan(0.2)
  })

  it('the shovel grip follows the arm pose: once the dig has the arm, it grips at the dig\'s grip while the carry still fades', () => {
    const f = figure()
    const dt = 1 / 60
    for (let k = 0; k < 60; k++) frame(f, 0, 0, { dig: false, tool: true }, dt)
    let checked = false
    for (let k = 0; k < 60; k++) {
      frame(f, 0, 0, { dig: true, tool: true }, dt)
      if (f.c.dig === 1 && f.c.carry > 0) {
        const want = shovelOnHungHand(asset, person.frame, 'R', asset.clips.dig.tool!.grip)
        expect(f.tool.position.distanceTo(want.position)).toBeLessThan(1e-6)
        checked = true
      }
    }
    expect(checked).toBe(true)
    expect(asset.clips.dig.tool!.grip).not.toBe(asset.clips.carry.tool!.grip)
  })

  it('a carry over a half-owned right arm is continuous where it reaches full weight', () => {
    const f = figure()
    const dt = 1 / 60
    let z = 0
    for (let k = 0; k < 90; k++) {
      z += 1.1 * dt
      frame(f, z, 1.1, { dig: false, tool: true }, dt)
    }
    // the same instant, the carry just short of and at full weight, the right arm half the code's
    const arm = ['upperArm.R', 'forearm.R', 'hand.R']
    const at = (carry: number) => {
      for (const b of Object.values(f.bones)) b.quaternion.identity()
      f.c.carry = carry
      f.c.arms = [1, 0.5]
      applyClipLayers(asset, person, f.bones, f.c, { speed: 1.1, weight: 1, kneel: 0 }, [true, true])
      return arm.map((n) => f.bones[n].quaternion.clone())
    }
    const below = at(0.999)
    const full = at(1)
    for (let i = 0; i < arm.length; i++) expect(below[i].angleTo(full[i])).toBeLessThan(0.01)
  })

  it('with the right arm the code\'s, the grip slides with the dig weight, never jumps at its start or end', () => {
    const f = figure()
    const dt = 1 / 60
    const code: [boolean, boolean] = [true, false]
    for (let k = 0; k < 60; k++) frame(f, 0, 0, { dig: false, tool: true }, dt, code)
    expect(f.c.arms[1]).toBe(0)
    const full = shovelOnHungHand(asset, person.frame, 'R', asset.clips.dig.tool!.grip).position.distanceTo(
      shovelOnHungHand(asset, person.frame, 'R', asset.clips.carry.tool!.grip).position,
    )
    let last = f.tool.position.clone()
    let worst = 0
    for (let k = 0; k < 120; k++) {
      frame(f, 0, 0, { dig: k < 60, tool: true }, dt, code)
      if (f.tool.visible) worst = Math.max(worst, last.distanceTo(f.tool.position))
      last = f.tool.position.clone()
    }
    expect(full).toBeGreaterThan(0)
    expect(worst).toBeLessThan(0.25 * full)
  })

  it('digging holds the shovel in the right hand with the other hand on the shaft', () => {
    const f = figure()
    for (let k = 0; k < 60; k++) frame(f, 0, 0, { dig: true, tool: true }, 1 / 60)
    expect(f.c.dig).toBe(1)
    expect(f.tool.visible).toBe(true)
    // the left hand is near the shaft line
    const a = new THREE.Vector3(0, VILLAGER_ASSET.shovel.shaftBottom, 0).applyMatrix4(f.tool.matrixWorld)
    const b = new THREE.Vector3(0, VILLAGER_ASSET.shovel.top, 0).applyMatrix4(f.tool.matrixWorld)
    const left = f.bones['hand.L'].getWorldPosition(new THREE.Vector3())
    const onLine = new THREE.Line3(a, b).closestPointToPoint(left, true, new THREE.Vector3())
    expect(onLine.distanceTo(left)).toBeLessThan(0.15)
  })
})

describe('hands land on the final body (natural-villager-motion step 7)', () => {
  it('on every person, the whole stroke through: the left fist on the shaft at the upper grip, the arm smooth', () => {
    const dig = asset.clips.dig
    const L = ['upperArm.L', 'forearm.L', 'hand.L']
    for (const sex of SEXES)
      for (const age of AGE_GROUPS)
        for (const build of [-1, 0, 1]) {
          const who = gltfPerson(asset, sex, age, build)
          const { bones } = createGltfSkeleton(asset, who.rest)
          const tool = new THREE.Group()
          bones['hand.R'].add(tool)
          const c = clipLayers(asset)
          const pose = (digT: number) => {
            for (const b of Object.values(bones)) b.quaternion.identity()
            stepClipLayers(asset, who, c, 0, 0, { x: 0, z: 0, yaw: 0, unit: 1 }, { dig: true, tool: true, digT }, 1 / 60)
            applyClipLayers(asset, who, bones, c, { speed: 0, weight: 0, kneel: 0 }, [true, true])
            placeShovel(asset, who, c, tool)
            bones.hips.updateMatrixWorld(true)
          }
          for (let k = 0; k < 120; k++) pose(0)
          let prev: THREE.Quaternion[] | null = null
          let prevClip: THREE.Quaternion[] | null = null
          for (let f = 0; f <= Math.round(dig.duration * 60); f++) {
            pose(f / 60)
            const clipQ = L.map((n) => bones[n].getWorldQuaternion(new THREE.Quaternion()))
            gripShaft(asset, who, bones, c, tool)
            const q = L.map((n) => bones[n].getWorldQuaternion(new THREE.Quaternion()))
            const at = `${sex} ${age} ${build} t=${(f / 60).toFixed(2)}`
            // the fist (the hold's offset in the hung hand) on the shaft's upper grip;
            // before the solve it missed by up to 0.055 of the stature (measured)
            const hl = asset.bones.indexOf('hand.L')
            const fist = asset.toolHold.L.offset.clone().applyQuaternion(who.frame.hang[hl]).multiplyScalar(who.frame.scale).applyMatrix4(bones['hand.L'].matrixWorld)
            const grip = new THREE.Vector3(0, dig.tool!.other!, 0).applyMatrix4(tool.matrixWorld)
            expect(fist.distanceTo(grip) / who.p.stature, at).toBeLessThan(0.002)
            // a correction, not another pose: measured at most 0.34 rad
            for (let i = 0; i < 3; i++) expect(q[i].angleTo(clipQ[i]), `${L[i]} ${at}`).toBeLessThan(0.45)
            // no flip between frames: measured 0.124 rad against the clip's own 0.113
            if (prev && prevClip) for (let i = 0; i < 3; i++) expect(prev[i].angleTo(q[i]), `${L[i]} ${at}`).toBeLessThan(prevClip[i].angleTo(clipQ[i]) + 0.05)
            prev = q
            prevClip = clipQ
          }
        }
  })

  it('fading the dig in, the left hand grips the shovel where the hand holds it, before the shovel shows', () => {
    const f = figure()
    // the tool's transform left stale from elsewhere
    f.tool.position.set(1, 2, 3)
    const dt = 1 / 60
    frame(f, 0, 0, { dig: true, tool: true, digT: 0 }, dt)
    expect(f.c.dig).toBeGreaterThan(0)
    expect(f.c.dig).toBeLessThan(0.5)
    expect(f.tool.visible).toBe(false)
    const dig = asset.clips.dig.tool!.grip
    const carry = asset.clips.carry.tool?.grip ?? dig
    const at = shovelOnHungHand(asset, person.frame, 'R', carry + (dig - carry) * f.c.dig)
    expect(f.tool.position.distanceTo(at.position)).toBeLessThan(1e-9)
    expect(f.tool.quaternion.angleTo(at.quaternion)).toBeLessThan(1e-9)
  })

  it('leaves the arm to the layers below while nothing is dug', () => {
    const f = figure()
    for (let k = 0; k < 30; k++) frame(f, 0, 0, { dig: false, tool: true }, 1 / 60)
    const before = f.bones['forearm.L'].quaternion.clone()
    gripShaft(asset, person, f.bones, f.c, f.tool)
    expect(f.bones['forearm.L'].quaternion.angleTo(before)).toBe(0)
  })
})

describe('the hands\' shapes from what the hands do (natural-villager-motion step 3)', () => {
  const sum = (w: Record<string, number>, s: 'L' | 'R') => w[`grip.${s}`] + w[`point.${s}`] + w[`relax.${s}`]
  it('idle hands are relaxed; the dig closes both, the carry the right; a point opens the aiming hand', () => {
    const idle = handShapes({ dig: 0, carry: 0, arms: [1, 1] })
    expect(idle['relax.L']).toBe(1)
    expect(idle['relax.R']).toBe(1)
    const dig = handShapes({ dig: 1, carry: 0, arms: [1, 1] })
    expect([dig['grip.L'], dig['grip.R'], dig['relax.L'], dig['relax.R']]).toEqual([1, 1, 0, 0])
    const carry = handShapes({ dig: 0, carry: 1, arms: [1, 1] })
    expect([carry['grip.L'], carry['grip.R']]).toEqual([0, 1])
    // a carry over an arm the code took (a gesture) leaves that hand to the code
    expect(handShapes({ dig: 0, carry: 1, arms: [1, 0] })['grip.R']).toBe(0)
    const point = handShapes({ dig: 0, carry: 0, arms: [1, 1] }, [0, 1])
    expect([point['point.R'], point['relax.R'], point['relax.L']]).toEqual([1, 0, 1])
  })

  it('per hand the shapes always sum to 1, through every blend', () => {
    for (const dig of [0, 0.3, 1]) for (const carry of [0, 0.6, 1]) for (const p of [0, 0.5, 1]) {
      const w = handShapes({ dig, carry, arms: [1, 0.7] }, [p, 1 - p])
      for (const s of ['L', 'R'] as const) expect(sum(w, s)).toBeCloseTo(1, 9)
      for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the distributed lean and the gaze (natural-villager-motion step 9)', () => {
  const forward = (b: THREE.Object3D) => new THREE.Vector3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()))

  it('lean is distributed', () => {
    const sh = VILLAGER_POSE.leanShares
    const d = distributeLean(0.4, -0.2, sh)
    let pitch = 0
    let yaw = 0
    for (const n of LEAN_BONES) {
      // no bone carries more than 35 % of the whole
      expect(Math.abs(d[n].pitch)).toBeLessThanOrEqual(0.35 * 0.4 + 1e-12)
      expect(Math.abs(d[n].yaw)).toBeLessThanOrEqual(0.35 * 0.2 + 1e-12)
      pitch += d[n].pitch
      yaw += d[n].yaw
    }
    expect(pitch).toBeCloseTo(0.4, 12)
    expect(yaw).toBeCloseTo(-0.2, 12)
    // on the body: the chest leans by the whole, over the three segments, on
    // top of the clip's own turn; the hips are untouched
    const f = figure()
    let z = 0
    for (let k = 0; k < 30; k++) frame(f, (z += 1.1 / 60), 1.1, { dig: false, tool: false }, 1 / 60)
    const hips = f.bones.hips.quaternion.clone()
    const before = forward(f.bones.chest)
    const base = newTrunkBase()
    takeTrunkBase(f.bones, base)
    leanTrunk(f.bones, base, 0.3, 0)
    f.bones.hips.updateMatrixWorld(true)
    expect(f.bones.hips.quaternion.equals(hips)).toBe(true)
    for (const n of LEAN_BONES) expect(f.bones[n].quaternion.angleTo(base[n])).toBeLessThan(0.35 * 0.3 + 1e-3)
    const after = forward(f.bones.chest)
    expect(before.angleTo(after)).toBeCloseTo(0.3, 2)
  })

  it('a gaze stays inside limits that tighten under it, up and down', () => {
    const lim = VILLAGER_POSE.gaze
    for (const sign of [1, -1]) {
      const g = newGaze()
      g.pitch = g.wantPitch = sign > 0 ? lim.pitchUp : -lim.pitchDown
      stepGaze(g, 1 / 60, lim, lim.headLoad)
      const max = (sign > 0 ? lim.pitchUp : lim.pitchDown) * lim.headLoad
      expect(Math.abs(g.pitch), `sign ${sign}`).toBeLessThanOrEqual(max + 1e-12)
    }
  })

  it('gaze hold', () => {
    const f = figure()
    const base = newTrunkBase()
    const g = newGaze()
    const dt = 1 / 60
    const lim = VILLAGER_POSE.gaze
    let z = 0
    /** One walking frame under a 0.3 rad lean, the head on the gaze. */
    const step = (yaw: number, pitch: number) => {
      frame(f, (z += 1.1 * dt), 1.1, { dig: false, tool: false }, dt)
      takeTrunkBase(f.bones, base)
      leanTrunk(f.bones, base, 0.3, 0)
      g.wantYaw = yaw
      g.wantPitch = pitch
      stepGaze(g, dt, lim)
      gazeHead(f.bones, g.yaw, g.pitch, 1)
      f.bones.hips.updateMatrixWorld(true)
      return forward(f.bones.head)
    }
    // settled on a target, then held through more than a whole gait cycle
    for (let k = 0; k < 90; k++) step(0.5, -0.2)
    const want = gazeDirection(0.5, -0.2)
    let worst = 0
    for (let k = 0; k < 120; k++) worst = Math.max(worst, step(0.5, -0.2).angleTo(want))
    expect(worst).toBeLessThan((3 * Math.PI) / 180)
    // the limits: a target far to the side and high above is followed only so far
    for (let k = 0; k < 120; k++) step(2.0, 1.2)
    const far = step(2.0, 1.2)
    expect(Math.atan2(far.x, far.z)).toBeLessThan(lim.yawMax + 0.05)
    expect(Math.asin(far.y)).toBeLessThan(lim.pitchUp + 0.05)
    // a target straight behind, jittering across the back: the head stays on
    // the side it was turned to, never flips over
    for (let k = 0; k < 120; k++) {
      const h = step(k % 2 ? Math.PI - 0.01 : -Math.PI + 0.01, 0)
      expect(Math.atan2(h.x, h.z)).toBeGreaterThan(0.5)
      expect(h.y).toBeLessThan(Math.sin(lim.pitchUp) + 0.05)
    }
  })
})

describe('the posable clavicles (natural-villager-motion step 11)', () => {
  it("default 0 leaves the clip's clavicle; a protraction brings the shoulder forward, an elevation up", () => {
    const f = figure()
    let z = 0
    for (let k = 0; k < 20; k++) frame(f, (z += 1.1 / 60), 1.1, { dig: false, tool: false }, 1 / 60)
    const clip = ['L', 'R'].map((s) => f.bones[`shoulder.${s}`].quaternion.clone())
    const joint = (s: string) => f.bones[`upperArm.${s}`].getWorldPosition(new THREE.Vector3())
    f.bones.hips.updateMatrixWorld(true)
    const at = ['L', 'R'].map(joint)
    poseShoulders(f.bones, undefined)
    poseShoulders(f.bones, { left: { protraction: 0, elevation: 0 }, right: { protraction: 0, elevation: 0 } })
    ;['L', 'R'].forEach((s, i) => expect(f.bones[`shoulder.${s}`].quaternion.equals(clip[i])).toBe(true))
    poseShoulders(f.bones, { left: { protraction: 0.25, elevation: 0 }, right: { protraction: 0, elevation: 0.15 } })
    f.bones.hips.updateMatrixWorld(true)
    expect(joint('L').z - at[0].z).toBeGreaterThan(0.01)
    expect(joint('R').y - at[1].y).toBeGreaterThan(0.005)
    // clamped to the range the penetration gate measures
    const g = figure()
    poseShoulders(g.bones, { left: { protraction: 5, elevation: -5 }, right: { protraction: 0, elevation: 0 } })
    expect(g.bones['shoulder.L'].quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(
      VILLAGER_POSE.shoulders.protractionMax + VILLAGER_POSE.shoulders.dropMax + 1e-6,
    )
  })
})

describe('starting and stopping on the glTF figure (point 1330)', () => {
  /** Per frame: the legs' share of the gait, each foot's world points, the
   *  shins' turns, and the start's state per foot (`ClipLayers.startState`,
   *  -1 when no start runs) with whether the walk clip swings that foot. */
  type Sole = { w: number; feet: THREE.Vector3[][]; knee: THREE.Quaternion[]; start: number[]; stance: boolean[]; swing: boolean[]; step: number; hold: number; resumed: boolean; brake: (number | null)[]; held: boolean[]; heel: boolean[]; ball: boolean[]; tip: boolean[]; starting: boolean; legs: number; anchor: number }
  /** The world points of each foot (ankle, heel, ball, toe tip), rigid on the foot bone. */
  function soleOf(bones: Record<string, THREE.Bone>) {
    const f = person.frame
    const local = (['L', 'R'] as const).map((s) => {
      const foot = bones[`foot.${s}`]
      const at = foot.getWorldPosition(new THREE.Vector3())
      return [new THREE.Vector3(), ...(['heel', 'ball', 'tip'] as const).map((k) => foot.worldToLocal(at.clone().add(asset.contactPoints[s][k].clone().multiplyScalar(f.legScale * f.scale))))]
    })
    return () => (['L', 'R'] as const).map((s, i) => local[i].map((v) => bones[`foot.${s}`].localToWorld(v.clone())))
  }
  interface Run {
    /** Seconds the walk stops (or, `start`, starts) at. */
    cut: number
    start?: boolean
    /** Starting, the seconds the walk stops again at (a start cut short): the walk weight falls from there. */
    stopAt?: number
    /** Stopping, the seconds the walk takes up again at (a walk resumed mid-stop). */
    resumeAt?: number
    /** Resumed, the seconds the walk stops once more at (a stop during the resumed start's hold). */
    /** The walk weight set at once to 1 walking and 0 standing (no fade). */
    jump?: boolean
    stopAgainAt?: number
    /** Frames a second (60 by default). */
    hz?: number
    /** Seconds run on past the last of the times above (1.5 by default). */
    tail?: number
    /** Per frame: the turn the body wants (rad/s; turned as steerHeading
     *  turns the game's walkers), its sideways drift (m/s) and the kneel, by
     *  time and walk weight. */
    turn?: (t: number) => number
    drift?: (t: number, w: number) => number
    kneel?: (t: number, w: number) => number
    /** Seconds the body is held where it stands (blocked) while it wants to walk. */
    held?: (t: number) => boolean
    /** A turn on the spot (rad/s), given whatever the body's pace. */
    spin?: (t: number) => number
  }
  /** Walk at `v`, stop (or start) with the walk weight easing as the code
   *  walk eases it, the skeleton in a figure group placed and turned as the
   *  body; per frame each foot's world points, the legs' share of the gait
   *  (`w`, the clip layers' own: it falls slower than the walk weight) and
   *  the shins' turns. */
  function settle(r: Run) {
    const { bones } = createGltfSkeleton(asset, person.rest)
    const group = new THREE.Group()
    group.add(bones.hips)
    group.updateMatrixWorld(true)
    const c = clipLayers(asset)
    const hipRest = bones.hips.position.clone()
    const sole = soleOf(bones)
    const dt = 1 / (r.hz ?? 60)
    const v = 1.48
    let x = 0
    let z = 0
    let w = r.start ? 0 : 1
    let speed = r.start ? 0 : v
    // the body's own pace, gained setting off as the game's walkers gain it
    let pace = speed
    let yaw = 0
    const frames: Sole[] = []
    for (let t = 0; t < Math.max(r.cut, r.stopAt ?? 0, r.resumeAt ?? 0, r.stopAgainAt ?? 0) + (r.tail ?? 1.5); t += dt) {
      const resumed = t >= (r.resumeAt ?? Infinity)
      pace = setOffSpeed(pace, (r.start ? t >= r.cut && (t < (r.stopAt ?? Infinity) || resumed) : t < r.cut || (t >= (r.resumeAt ?? Infinity) && t < (r.stopAgainAt ?? Infinity))) ? v : 0, dt)
      // turned as the game's walkers turn: a corner rounded at its pace no
      // tighter than VILLAGER_MOTION.turnRadius, none standing
      const from = { x, z, yaw }
      const steer = steerHeading(yaw, yaw + (r.turn?.(t) ?? 0) * dt, pace, dt)
      yaw = steer.yaw + (r.spin?.(t) ?? 0) * dt
      // held, the body gets none of its step, and keeps no pace (as the game's walkers)
      const step = r.held?.(t) ? 0 : pace * steer.pace * dt
      pace = keptPace(pace, step, pace * dt)
      x += Math.sin(yaw) * step + (r.drift?.(t, w) ?? 0) * dt
      z += Math.cos(yaw) * step
      // the ground the feet step and the speed the walk weight reads, as stepWalk measures them
      const walked = groundStepped(x - from.x, z - from.z, from.yaw, yaw)
      speed += (walked / dt - speed) * (1 - Math.exp(-dt / VILLAGER_MOTION.speedSmoothing))
      const moving = Math.abs(speed) > VILLAGER_MOTION.moveSpeed && !(r.stopAt !== undefined && t >= r.stopAt && !(r.start && resumed)) && !(r.stopAgainAt !== undefined && t >= r.stopAgainAt)
      w = r.jump ? (moving ? 1 : 0) : moving ? Math.min(1, w + VILLAGER_MOTION.walkFadeRate * dt) : Math.max(0, w - VILLAGER_MOTION.walkFadeRate * dt)
      const kneel = r.kneel?.(t, w) ?? 0
      group.position.set(x, 0, z)
      group.rotation.y = yaw
      group.updateMatrixWorld(true)
      // the code-built stand: every bone at rest
      for (const b of Object.values(bones)) b.quaternion.identity()
      bones.hips.position.copy(hipRest)
      stepClipLayers(asset, person, c, walked, speed, { x, z, yaw, unit: 1 }, null, dt)
      applyClipLayers(asset, person, bones, c, { speed, weight: w, kneel }, [true, true])
      group.updateMatrixWorld(true)
      const swing = [0, 1].map((i) => {
        const [land, lift] = gaitStance(i)
        return lift - land > 1e-6 && ((((c.gait.phase - land) % 1) + 1) % 1) >= lift - land
      })
      frames.push({ w: c.legs * (1 - kneel), feet: sole(), knee: (['L', 'R'] as const).map((s) => bones[`shin.${s}`].quaternion.clone()), start: c.starting ? [...c.startState] : [-1, -1], stance: [...c.startStance], swing, step, hold: c.stop, resumed: c.resumed, brake: c.gait.brake.map((b) => b?.share ?? null), held: c.gait.held.map((h) => !!(h.heel || h.ball || h.tip)), heel: c.gait.held.map((h) => !!h.heel), ball: c.gait.held.map((h) => !!h.ball), tip: c.gait.held.map((h) => !!h.tip), starting: c.starting, legs: c.legs, anchor: c.anchor })
    }
    return frames
  }
  /** A jostle the stand takes without walking: a body carried faster reads
   *  as walking (stepWalk measures every move) and never settles. */
  // (a 0.3 m/s carry cannot stay a stand any other way: smoothed over
  // speedSmoothing it passes moveSpeed on the 3rd frame: a shove, not a carry)
  const JOSTLE = 0.9 * VILLAGER_MOTION.moveSpeed
  const blendFrames = (frames: Sole[]) => frames.map((b, k) => (k > 0 && ((b.w > 0 && b.w < 1) || (frames[k - 1].w > 0 && frames[k - 1].w < 1)) ? k : -1)).filter((k) => k > 0)
  /** Per foot, the most any of its points moved over the ground from frame k − 1 to k. */
  /** The frames a run's motion over (from, to) seconds acts on, stepped as settle steps its clock. */
  const activeFrames = (frames: Sole[], from: number, to: number, dt = 1 / 60) => {
    const out: number[] = []
    let k = 0
    for (let t = 0; k < frames.length; t += dt, k++) if (t > from && t < to) out.push(k)
    return out
  }
  /** The first frame whose clock (settle's, accumulated) has reached `at` seconds. */
  const frameAt = (at: number, dt = 1 / 60) => {
    let k = 0
    for (let t = 0; t < at; t += dt) k++
    return k
  }
  const moved = (frames: Sole[], k: number) => frames[k].feet.map((pts, i) => Math.max(...pts.map((p, j) => Math.hypot(p.x - frames[k - 1].feet[i][j].x, p.z - frames[k - 1].feet[i][j].z))))

  it('each foot steps between the gait and the stand in turn, the other standing: never a foot slid along the ground', () => {
    // a bone blend alone moved both feet every frame of the 0.2 s blend, a
    // foot on the ground sliding up to 7 cm (measured 20.10.2026, the
    // village-walk check on WebGL 2: worstSlip 0.0704)
    const restY = settle({ cut: 0.5, start: true })[0].feet[0][0].y
    for (const start of [false, true]) {
      for (let cut = 1; cut < 1.6; cut += 0.05) {
        const frames = settle({ cut, start })
        const blend = blendFrames(frames)
        let worstStill = 0
        let worstSlide = 0
        for (const k of blend) {
          const m = moved(frames, k)
          // one foot stands each frame of the blend, heel and ball too
          worstStill = Math.max(worstStill, Math.min(...m))
          // a foot at its standing height moves nowhere along the ground
          frames[k].feet.forEach((pts, i) => {
            if (Math.abs(pts[0].y - restY) <= 0.003 && Math.abs(frames[k - 1].feet[i][0].y - restY) <= 0.003) worstSlide = Math.max(worstSlide, m[i])
          })
        }
        const where = `${start ? 'start' : 'stop'} at ${cut.toFixed(2)} s`
        expect(blend.length, where).toBeGreaterThan(5)
        expect(worstStill, where).toBeLessThan(0.002)
        expect(worstSlide, where).toBeLessThan(0.002)
      }
    }
  })

  it('a foot on the stand keeps its heel and ball where they are while the body turns and the hips blend', () => {
    // the foot's turn was the blended chain's: a turn of the body (or of the
    // blended hips) swung the planted sole about its held ankle
    for (const turn of [-1.5, 1.5]) {
      for (let cut = 1; cut < 1.4; cut += 0.1) {
        // walking off while turning (rad/s from the start)
        const frames = settle({ cut, start: true, turn: (t) => (t > cut ? turn : 0) })
        // the first half of the start: the first foot still on the stand
        const span = blendFrames(frames).filter((k) => frames[k].w < 0.45)
        expect(span.length).toBeGreaterThan(2)
        const first = moved(frames, span[span.length - 1]).indexOf(Math.min(...moved(frames, span[span.length - 1])))
        const from = frames[span[0] - 1].feet[first]
        let worst = 0
        for (const k of span) frames[k].feet[first].forEach((p, j) => (worst = Math.max(worst, Math.hypot(p.x - from[j].x, p.z - from[j].z))))
        expect(worst, `turning ${turn} rad/s from ${cut.toFixed(1)} s`).toBeLessThan(0.002)
      }
    }
  })

  it('starting, each foot leaves the stand only as the walk clip swings it: none drifts off it through the clip\'s stance', () => {
    // the second foot left the stand as soon as the first had landed and the
    // legs were on the walk, in the clip's stance too, and then took nearly a
    // whole cycle to settle, drifting over the ground while the clip stood
    // on it (cross-vendor review 24.11.2026)
    for (const turn of [0, 1.5, -1.5, 2.8, -2.8]) {
      for (let cut = 1; cut < 1.6; cut += 0.05) {
        const frames = settle({ cut, start: true, turn: (t) => (t > cut ? turn : 0) })
        const where = `turning ${turn} rad/s, start at ${cut.toFixed(2)} s`
        let left = 0
        let worst = 0
        for (let k = 1; k < frames.length; k++) {
          for (let i = 0; i < 2; i++) {
            if (frames[k - 1].start[i] <= 0 && frames[k].start[i] >= 1) {
              left++
              expect(frames[k].swing[i], `${where}: foot ${i} leaves the stand in the clip's stance`).toBe(true)
            }
            // a foot on the stand keeps its ball where it stands (its heel
            // rolls off with the clip's)
            if (frames[k].start[i] === 0 && frames[k - 1].start[i] === 0) {
              const [b, a] = [frames[k].feet[i][2], frames[k - 1].feet[i][2]]
              worst = Math.max(worst, Math.hypot(b.x - a.x, b.z - a.z))
            }
          }
        }
        expect(left, where).toBe(2)
        expect(worst, where).toBeLessThan(0.002)
      }
    }
  })

  it('starting in a corner and shoved sideways: the foot on the stand stays within the leg\'s reach, its ball where it stands', () => {
    // the pelvis came down for a foot out of reach only stopping: a body
    // turning and carried sideways as it set off dragged the standing foot
    // by up to 3.5 mm a frame (cross-vendor review 24.11.2026)
    for (const turn of [1.5, -1.5, 2.8, -2.8]) {
      for (const drift of [1, -1]) {
        for (let cut = 1; cut < 1.6; cut += 0.05) {
          const frames = settle({ cut, start: true, drift: (t) => (t > cut ? drift : 0), turn: (t) => (t > cut ? turn : 0) })
          let worst = 0
          for (let k = 1; k < frames.length; k++)
            for (let i = 0; i < 2; i++)
              if (frames[k].start[i] === 0 && frames[k - 1].start[i] === 0) {
                const [b, a] = [frames[k].feet[i][2], frames[k - 1].feet[i][2]]
                worst = Math.max(worst, Math.hypot(b.x - a.x, b.z - a.z))
              }
          expect(worst, `turning ${turn} rad/s, shoved ${drift} m/s, start at ${cut.toFixed(2)} s`).toBeLessThan(0.002)
        }
      }
    }
  })

  it('starting, the stand\'s feet stay where they stood while the body moves before the walk weight rises', () => {
    // the walk weight waits for the smoothed speed: the standing legs went
    // with the body for 5 frames, the feet sliding 11.5 mm straight and
    // 25 mm at 1.5 rad/s (cross-vendor review 24.11.2026)
    for (const turn of [0, 1.5, -1.5, 2.8, -2.8]) {
      for (let cut = 1; cut < 1.6; cut += 0.05) {
        const frames = settle({ cut, start: true, turn: (t) => (t > cut ? turn : 0) })
        const go = frames.findIndex((f) => f.step > 0)
        const blend = frames.findIndex((f) => f.w > 0)
        const where = `turning ${turn} rad/s, start at ${cut.toFixed(2)} s`
        expect(blend - go, where).toBeGreaterThan(2)
        let worst = 0
        for (let k = go; k < blend; k++)
          frames[k].feet.forEach((pts, i) => pts.forEach((p, j) => (worst = Math.max(worst, Math.hypot(p.x - frames[go - 1].feet[i][j].x, p.z - frames[go - 1].feet[i][j].z)))))
        expect(worst, where).toBeLessThan(0.0005)
      }
    }
  })

  it('a standing body jostled without walking: its feet stay, then come back under it without a step or a jump', () => {
    for (const drift of [JOSTLE, -JOSTLE]) {
      const frames = settle({ cut: 2.5, start: true, drift: (t) => (t > 0.5 && t < 1 ? drift : 0) })
      const dt = 1 / 60
      let worst = 0
      for (let k = 1; k < 140; k++) {
        expect(frames[k].w, `jostled ${drift} m/s`).toBe(0)
        worst = Math.max(worst, ...moved(frames, k))
      }
      // held while carried, eased back no faster than VILLAGER_GLTF.standHoldSettle
      expect(worst, `jostled ${drift} m/s`).toBeLessThanOrEqual(VILLAGER_GLTF.standHoldSettle * dt * 1.2)
      // through the shove (within VILLAGER_GLTF.standHoldReach) each foot where it stood before it,
      // not merely moving slowly with the body (cross-vendor review 24.11.2026)
      const shove = activeFrames(frames, 0.5, 1)
      const before = frames[shove[0] - 1].feet
      for (const k of shove)
        frames[k].feet.forEach((pts, i) => pts.forEach((p, j) => expect(Math.hypot(p.x - before[i][j].x, p.z - before[i][j].z), `jostled ${drift} m/s, frame ${k}`).toBeLessThan(1e-4)))
      // and under the body again before it walks off
      const end = frames[140].feet
      const rest = frames[20].feet
      // (the body's 0.5 s carry, to within one frame of it)
      const body = Math.abs(drift) * 0.5
      end.forEach((pts, i) => pts.forEach((p, j) => expect(Math.abs(Math.hypot(p.x - rest[i][j].x, p.z - rest[i][j].z) - body), `jostled ${drift} m/s`).toBeLessThanOrEqual(Math.abs(drift) * dt + 1e-6)))
    }
  })

  it('a standing body turned on the spot without walking: its feet stay where they stood', () => {
    // the hold read only a move over the ground: a turn on the spot (which
    // stepWalk counts as walked) swept the feet round with the body
    // (cross-vendor review 24.11.2026); 0.15 rad/s for 0.5 s stays a stand
    // and within VILLAGER_GLTF.standHoldTurn
    for (const spin of [0.15, -0.15]) {
      const frames = settle({ cut: 2.5, start: true, spin: (t) => (t > 0.5 && t < 1 ? spin : 0) })
      const turning = activeFrames(frames, 0.5, 1)
      const before = frames[turning[0] - 1].feet
      for (const k of turning) {
        expect(frames[k].w, `spun ${spin} rad/s`).toBe(0)
        frames[k].feet.forEach((pts, i) => pts.forEach((p, j) => expect(Math.hypot(p.x - before[i][j].x, p.z - before[i][j].z), `spun ${spin} rad/s, frame ${k}`).toBeLessThan(1e-4)))
      }
    }
  })

  it('a walker held where it stands while it wants to walk sets off on the ramp once let go', () => {
    // its pace was gained before its step was resolved, so a body blocked
    // (or held by its turn) built up its full pace standing and set off at
    // it (cross-vendor review 24.11.2026)
    const dt = 1 / 60
    for (const hold of [0.2, 0.5, 1]) {
      const cut = 1
      const frames = settle({ cut, start: true, held: (t) => t >= cut && t < cut + hold })
      let worst = 0
      for (let k = 1; k < frames.length; k++) worst = Math.max(worst, (frames[k].step - frames[k - 1].step) / dt)
      expect(frames.some((f) => f.step > 0), `held ${hold} s`).toBe(true)
      expect(worst / dt, `held ${hold} s`).toBeLessThanOrEqual(VILLAGER_MOTION.setOffAccel + 1e-6)
    }
  })

  it('a kneel setting in mid-blend takes the step out continuously: no foot jumps at its onset', () => {
    // any kneel above 0 switched the step off for the plain bone blend
    for (let cut = 1; cut < 1.4; cut += 0.1) {
      for (const at of [0.7, 0.4]) {
        const onset = (eps: number) => (_: number, w: number) => (w < at ? eps : 0)
        const a = settle({ cut, kneel: onset(0) })
        const b = settle({ cut, kneel: onset(1e-4) })
        let worst = 0
        a.forEach((f, k) => f.feet.forEach((pts, i) => pts.forEach((p, j) => (worst = Math.max(worst, p.distanceTo(b[k].feet[i][j]))))))
        expect(worst, `kneel from w ${at}, stop at ${cut.toFixed(1)} s`).toBeLessThan(0.001)
      }
    }
  })

  it('a body carried on through the end of the blend hands its feet to the stand without a jump', () => {
    // the stand's spots were held in the world to the end, then dropped for
    // the body's own stand: a jostled body's feet jumped by its drift
    for (const drift of [JOSTLE, -JOSTLE]) {
      for (let cut = 1; cut < 1.4; cut += 0.1) {
        const frames = settle({ cut, drift: (t) => (t > cut + 0.2 ? drift : 0) })
        const body = Math.abs(drift) / 60
        let worst = 0
        // the blend's last frames and the first standing ones after it: the
        // foot standing since mid-blend never jumps, the stepping one lands
        // slowing down and then moves with the body
        const end = frames.findIndex((f, k) => k > 0 && f.w <= 0 && frames[k - 1].w > 0)
        expect(end).toBeGreaterThan(3)
        const early = moved(frames, end - 2)
        const first = early[0] < early[1] ? 0 : 1
        for (let k = end - 3; k <= end + 3; k++) {
          const m = moved(frames, k)
          worst = Math.max(worst, m[first])
          if (k > end) worst = Math.max(worst, m[1 - first])
          if (k === end) expect(m[1 - first]).toBeLessThan(moved(frames, k - 1)[1 - first])
        }
        // a foot moves at most the body's step plus a share of the drift each frame
        expect(worst, `drift ${drift} m/s, stop at ${cut.toFixed(1)} s`).toBeLessThan(body + 0.008)
      }
    }
  })

  it('a body carried on or turning through the blend: no foot standing on the ground slides more than 4 cm in one stance', () => {
    // the stand's spot of the foot landed at mid-blend was drawn onto the
    // drifting body's stand on the ground: 4.3 cm in one stance at 0.3 m/s;
    // and its turn onto the turning body's, heel and ball swept round the
    // held ankle (cross-vendor reviews of the planted-soles walk, 20.10.2026)
    const restY = settle({ cut: 0.5, start: true })[0].feet[0][0].y
    for (const [drift, turn] of [0, 1.5, -1.5].flatMap((turn) => [JOSTLE, -JOSTLE, 0].map((drift) => [drift, turn]))) {
      if (!drift && !turn) continue
      for (let cut = 1; cut < 1.4; cut += 0.1) {
        const frames = settle({ cut, drift: (t) => (t > cut + 0.2 ? drift : 0), turn: (t) => (t > cut ? turn : 0) })
        const blend = blendFrames(frames)
        // the frame the standing legs take over: the handoff's last
        const end = frames.findIndex((f, k) => k > 0 && f.w <= 0 && frames[k - 1].w > 0)
        expect(end).toBeGreaterThan(3)
        let worst = 0
        let worstFrame = 0
        // the handover's tail: the feet set down on the body's own stand and
        // move with a drifting or turning body from there, as the standing legs
        // do after, so the per-frame bound stops there; the per-stance bound
        // runs on to the handoff (cross-vendor review 24.11.2026)
        const tail = VILLAGER_GLTF.settleRestep * VILLAGER_GLTF.settleStepSetDown
        for (let i = 0; i < 2; i++) {
          // per stance, each point's ground displacement from its touchdown
          let from: THREE.Vector3[] | null = null
          for (let k = blend[0] - 1; k <= end; k++) {
            const pts = frames[k].feet[i]
            if (Math.abs(pts[0].y - restY) > 0.003) from = null
            else if (!from) from = pts
            else {
              pts.forEach((p, j) => (worst = Math.max(worst, Math.hypot(p.x - from![j].x, p.z - from![j].z))))
              if (frames[k].w >= tail) worstFrame = Math.max(worstFrame, moved(frames, k)[i])
            }
          }
        }
        const where = `drift ${drift} m/s, turning ${turn} rad/s, stop at ${cut.toFixed(1)} s`
        // what the stand's spot or turn still has to make up is stepped over, lifted
        expect(worstFrame, where).toBeLessThan(0.002)
        expect(worst, where).toBeLessThanOrEqual(0.04)
      }
    }
  })

  /** A reference read off the gait without the heel strike's brake: the
   *  bounds stay the walk clip's own, never raised by the gait they bound
   *  (the brake raised the +2.8 rad/s reference 0.245 → 0.293 and let a
   *  0.266 start pass; cross-vendor review of point 1591). */
  const unbraked = <T,>(read: () => T): T => {
    const g = VILLAGER_GLTF as { heelBrakeCycle: number }
    const was = g.heelBrakeCycle
    g.heelBrakeCycle = 0
    try {
      return read()
    } finally {
      g.heelBrakeCycle = was
    }
  }
  const kneeStep = (frames: Sole[], k: number) => Math.max(...frames[k].knee.map((q, i) => q.angleTo(frames[k - 1].knee[i])))
  /** The clip's own range: the fastest a knee turns in a frame walking on,
   *  straight and through the same corner without stopping. */
  const clipKneeStep = (turn: number) =>
    unbraked(() => {
      // sampled at 240 Hz, so the clip's fastest phase is caught whatever phase a 60 Hz frame lands on
      const hz = 240
      let clip = 0
      for (const walk of [settle({ cut: 3, hz }), settle({ cut: 3, hz, turn: () => turn })])
        for (let k = hz / 2; k < hz * 2.8; k++) clip = Math.max(clip, kneeStep(walk, k))
      return (clip * hz) / 60
    })

  /** Whether a catch without the heel, `frames` frames and `seconds` after
   *  the foot's last contact let go, its heel `moved` per unit of leg since,
   *  is a toe caught again where it rose (no landing): its tip alone within
   *  0.2 s of the lift-off, or its ball and tip on the frame right after (as
   *  villagerClipPose.test.ts tells it; these runs measured none, 26.11.2026). */
  const toeRecatch = (h: { heel: boolean; ball: boolean; tip: boolean }, frames: number, seconds: number, moved: number) =>
    !h.heel && h.tip && moved < 0.4 && ((!h.ball && seconds <= 0.2) || (h.ball && frames <= 1))
  it('a toe caught again where it rose is no landing only on its tip alone right after the lift-off, or its ball and tip the frame after', () => {
    const tip = { heel: false, ball: false, tip: true }
    const both = { heel: false, ball: true, tip: true }
    expect(toeRecatch(tip, 3, 3 / 60, 0.1)).toBe(true)
    expect(toeRecatch(both, 1, 1 / 60, 0.1)).toBe(true)
    expect(toeRecatch({ heel: false, ball: true, tip: false }, 1, 1 / 60, 0.05)).toBe(false)
    expect(toeRecatch(both, 2, 2 / 60, 0.1)).toBe(false)
    expect(toeRecatch(tip, 18, 0.3, 0.3)).toBe(false)
    expect(toeRecatch(tip, 1, 1 / 60, 0.45)).toBe(false)
  })
  /** Per foot, each landing over a run: the frame the gait takes hold of
   *  its HEEL (`ClipGait.held[i].heel`: a ball or tip caught first is not
   *  the heel's touchdown, and a toe caught again where it rose is no
   *  landing), the frame its last contact let go before it (-1: not seen),
   *  whether it is the foot's first landing since the legs' weight set off
   *  rising (a start, a resume, a figure set walking: read from the legs'
   *  weight and the foot leaving the stand, never from the brake), and whether the foot still stood on the stand (`stand`:
   *  the gait's landing, not drawn). */
  const touchdowns = (frames: Sole[], hz = 60) =>
    [0, 1].map((i) => {
      const out: { k: number; off: number; first: boolean; stand: boolean }[] = []
      // landings whose ball or tip took hold before the heel
      let wrong = 0
      let off = -1
      let heeled = false
      let landed = false
      // (owed at each onset of a rise of the legs' weight, the run's first
      // frame's from none included)
      let owed = frames[0].legs > 0
      let rising = owed
      for (let k = 1; k < frames.length; k++) {
        if (frames[k].legs > frames[k - 1].legs && !rising) owed = true
        if (frames[k].legs !== frames[k - 1].legs) rising = frames[k].legs > frames[k - 1].legs
        const any = frames[k].held[i]
        if (frames[k - 1].held[i] && !any) {
          off = k
          heeled = false
          landed = false
        }
        if (any && !landed && off >= 0) {
          landed = true
          // (a toe caught again where it rose is no landing, `toeRecatch`;
          // any other catch without the heel is a landing on the wrong
          // contact, cross-vendor review of point 1591)
          const moved = Math.hypot(frames[k].feet[i][1].x - frames[off].feet[i][1].x, frames[k].feet[i][1].z - frames[off].feet[i][1].z) / (person.frame.legScale * person.frame.scale)
          const h = { heel: frames[k].heel[i], ball: frames[k].ball[i], tip: frames[k].tip[i] }
          if (toeRecatch(h, k - off, (k - off) / hz, moved)) heeled = true
          else if (!h.heel) wrong++
        }
        if (heeled || frames[k - 1].heel[i] || !frames[k].heel[i]) continue
        heeled = true
        const stand = frames[k].starting && frames[k].start[i] <= 0
        out.push({ k, off, first: owed && !stand, stand })
        if (!stand) owed = false
      }
      return Object.assign(out, { wrong })
    })
  /** The walk's heel strikes over a run, in the world: every landing
   *  (`touchdowns`) whose lift-off the run saw, with the body walking the
   *  whole way in, but each foot's first since a start or a resume began
   *  (OPEN: point 1594). Per strike, whether its brake ran at full share
   *  (`ClipGait.brake`) in the swing; the heel's ground pace as shares of its
   *  swing's peak — `into` the pace into the touchdown frame, `drop` its
   *  largest loss in one frame from its brake's start (or the swing's) to
   *  the frame after the touchdown, the drawn heel's own; and `slide`, how
   *  far (m) the drawn heel moves on the ground from its touchdown spot
   *  every frame its hold lasts with the legs on the gait (full weight, no
   *  start or stop drawing them), through the stance. The shin's turn alone
   *  passes a foot stopped dead (cross-vendor reviews of point 1591). */
  const heelStrikes = (frames: Sole[], hz = 60) => {
    const pace = (k: number, i: number) => Math.hypot(frames[k].feet[i][1].x - frames[k - 1].feet[i][1].x, frames[k].feet[i][1].z - frames[k - 1].feet[i][1].z) * hz
    const out: { k: number; i: number; braked: boolean; into: number; drop: number; slide: number; stance: number }[] = []
    const lands = touchdowns(frames, hz)
    // the body walking the whole way in (a stop's first frame takes the
    // body's pace, and the gait's with it: that frame is the stop's)
    const walking = (from: number, to: number) => frames.slice(from, to + 1).every((f) => f.step > 0)
    lands.forEach((list, i) => {
      for (const { k, off, first, stand } of list) {
        if (off < 1 || first || stand || k + 1 >= frames.length || !walking(off, k + 1)) continue
        const began = frames.findIndex((f, j) => j > off && j < k && f.brake[i] === 1)
        const peak = Math.max(...Array.from({ length: k - off }, (_, j) => pace(off + 1 + j, i)))
        let drop = 0
        for (let j = began > 0 ? began : off + 2; j <= k + 1; j++) drop = Math.max(drop, (pace(j - 1, i) - pace(j, i)) / peak)
        // the stance through to its toe-off, with the legs on the gait (full
        // weight, no stop drawing them; the other foot's start still running
        // included): the heel against its touchdown spot while held on the
        // ground (`slide`; rolling onto its ball, the heel rises while held),
        // then each of the ball and tip held on the ground against its spot,
        // to its toe-off (`stance`, the heel's slide included). Fewer than
        // two frames read count as
        // unmeasured (NaN) where the stop takes the legs off the gait, as a
        // slide everywhere else (cross-vendor review of point 1591)
        const at = frames[k].feet[i][1]
        let slide = 0
        let stance = 0
        let samples = 0
        // (the ball's and tip's spots, each from its first frame held on the
        // ground once the heel let go)
        const toes: (THREE.Vector3 | null)[] = [null, null]
        let rolled = false
        let j = k
        for (; j < frames.length && frames[j].held[i] && frames[j].w >= 1 && frames[j].hold <= 0; j++) {
          const f = frames[j].feet[i]
          if (frames[j].heel[i] && !rolled) {
            if (f[1].y - at.y > 0.005) continue
            samples++
            slide = Math.max(slide, Math.hypot(f[1].x - at.x, f[1].z - at.z))
            continue
          }
          rolled = true
          // each of the ball and tip held and on the ground this frame, to
          // the first frame neither is (as villagerClipPose.test.ts reads it,
          // its OPEN there: the least moved of every held point let one in the
          // air hide a sliding one on the ground)
          const down = [0, 1].filter((m) => (m ? frames[j].tip[i] : frames[j].ball[i]) && f[2 + m].y - at.y <= 0.005)
          if (down.length < 1) break
          for (const m of down) toes[m] ??= f[2 + m]
          samples++
          stance = Math.max(stance, ...down.map((m) => Math.hypot(f[2 + m].x - toes[m]!.x, f[2 + m].z - toes[m]!.z)))
        }
        stance = Math.max(stance, slide)
        if (samples < 2) {
          const cut = j < frames.length && frames[j].held[i]
          slide = stance = cut ? NaN : Infinity
        }
        out.push({ k, i, braked: began > 0, into: pace(k, i) / peak, drop, slide, stance })
      }
    })
    // the strikes owed, read off the walk clip's own swing (`Sole.swing`),
    // never off the holds: each end of a swing seen whole, the body walking
    // through it, past the foot's first landing since the legs' weight set
    // off rising (OPEN: point 1594) and off the stand, owes a touchdown of
    // that foot from the swing's middle to three frames past its end (a
    // strike skipped, its catch lost, fails here: cross-vendor review of
    // point 1591)
    let missed = 0
    let owed = 0
    const matched = new Set<(typeof lands)[number][number]>()
    for (const i of [0, 1]) {
      let rising = frames[0].legs > 0
      let first = rising
      let s0 = -1
      for (let k = 1; k < frames.length; k++) {
        if (frames[k].legs > frames[k - 1].legs && !rising) first = true
        if (frames[k].legs !== frames[k - 1].legs) rising = frames[k].legs > frames[k - 1].legs
        if (frames[k].swing[i] && !frames[k - 1].swing[i]) s0 = k
        if (!(frames[k - 1].swing[i] && !frames[k].swing[i])) continue
        const stand = frames[k].starting && frames[k].start[i] <= 0
        if (stand) continue
        // (a swing under way as the run opens ends in the foot's first
        // landing: it spends the exemption, never the next whole swing's,
        // as `touchdowns` reads its touchdown; cross-vendor review of point
        // 1591)
        if (first) {
          first = false
          continue
        }
        if (s0 < 1) continue
        if (k + 4 >= frames.length || !walking(s0, k + 1)) continue
        owed++
        // (each touchdown matched to one owed at most: villagerClipPose.test.ts)
        const land = lands[i].find((t) => !matched.has(t) && t.k >= (s0 + k) / 2 && t.k <= k + 3)
        if (land) matched.add(land)
        else missed++
      }
    }
    return Object.assign(out, { missed, owed, wrong: lands[0].wrong + lands[1].wrong })
  }
  /** The worst of `heelStrikes` over many runs, with where it was: in every
   *  run each foot strikes its heel at least once, and every strike is
   *  braked (`add`). */
  const strikes = () => {
    const all = { n: [0, 0], into: 0, intoAt: '', drop: 0, dropAt: '', slide: 0, slideAt: '', stance: 0, stanceAt: '' }
    const add = (run: Run, where: string, eachFoot = false, frames = settle(run)) => {
      const s = heelStrikes(frames)
      // (the same run with the brake off: the ball and tip drift up to 1.6
      // cm through a stance in a 2.8 rad/s corner with the brake off too,
      // measured 26.11.2026; the brake adds at most the no-slide bound)
      const ref = unbraked(() => Math.max(0, ...heelStrikes(settle(run)).map((t) => t.stance).filter(Number.isFinite)))
      // (`eachFoot`: each foot strikes past its first landing since a start
      // or resume began, read from that begin on)
      const begin = frames.findIndex((f, k) => k > 0 && f.starting && !frames[k - 1].starting)
      if (eachFoot) for (const i of [0, 1]) expect(s.filter((t) => t.i === i && t.k > begin).length, `${where}: foot ${i} strikes its heel past its first landing`).toBeGreaterThan(0)
      for (const t of s) all.n[t.i]++
      expect(s.wrong, `${where}: landings on the ball or a tip away from its lift-off first`).toBe(0)
      expect(s.missed, `${where}: owed strikes (of ${s.owed}) never read`).toBe(0)
      for (const t of s) {
        const at = `${where}, frame ${t.k}, foot ${t.i}`
        expect(t.braked, `${at}: its brake ran at full share`).toBe(true)
        expect(Number.isNaN(t.slide) || t.slide < Infinity, `${at}: its stance read`).toBe(true)
        expect(Number.isNaN(t.stance) || t.stance <= ref + 0.004, `${at}: its stance's drift ${t.stance.toFixed(4)} (brake off ${ref.toFixed(4)})`).toBe(true)
        if (t.stance - ref > all.stance) [all.stance, all.stanceAt] = [t.stance - ref, at]
        if (t.into > all.into) [all.into, all.intoAt] = [t.into, at]
        if (t.drop > all.drop) [all.drop, all.dropAt] = [t.drop, at]
        if (t.slide > all.slide) [all.slide, all.slideAt] = [t.slide, at]
      }
    }
    /** Every run's braked heel strikes slow the heel over frames into its
     *  touchdown and plant it there: into it at most 0.08 of its swing's pace
     *  and at most 0.5 of it lost in a frame (as villagerClipPose.test.ts
     *  bounds a 60 Hz walk; a dead stop loses 0.6-0.76 of it in its catch
     *  frame), and moved at most 4 mm from its touchdown spot through its
     *  stance (the no-slide case's 0.004 a frame). */
    const check = () => {
      expect(all.n[0] + all.n[1], 'heel strikes read').toBeGreaterThan(0)
      expect(all.into, `${all.intoAt}: the heel's pace into its touchdown, of its swing's`).toBeLessThan(0.08)
      expect(all.drop, `${all.dropAt}: the heel's largest loss of pace in a frame, of its swing's`).toBeLessThan(0.5)
      expect(all.slide, `${all.slideAt}: the heel's slide from its touchdown spot`).toBeLessThan(0.004)
      return all
    }
    return { add, check }
  }

  it('a run read from partway through a swing owes the next whole swing\'s heel strike: the swing under way spends the first landing', () => {
    // cross-vendor review of point 1591: the inventory spent the first
    // landing's exemption on the first swing seen whole, so a run opening
    // mid-swing let that swing's catch go missing unflagged
    const walk = settle({ cut: 4 })
    for (const i of [0, 1]) {
      // from the middle of a swing of foot i, well into the walk
      const from = walk.findIndex((f, k) => k > 60 && f.swing[i] && walk[k - 3].swing[i])
      const frames = walk.slice(from)
      expect(frames[0].legs).toBeGreaterThan(0)
      expect(frames[0].held[i], 'the foot in the air as the run opens').toBe(false)
      const s = heelStrikes(frames)
      expect(s.missed, `foot ${i}: owed strikes (of ${s.owed}) never read`).toBe(0)
      // the next whole swing is owed and struck, braked
      const lands = touchdowns(frames)[i]
      expect(lands[0].off, `foot ${i}: the swing under way lands first`).toBeLessThan(0)
      const next = s.find((t) => t.i === i && t.k === lands[1].k)
      expect(next?.braked, `foot ${i}: the next whole swing's strike, braked`).toBe(true)
      // that swing's catch lost: flagged
      const lost = frames.map((f) => ({ ...f, held: [...f.held], heel: [...f.heel], ball: [...f.ball], tip: [...f.tip] }))
      for (let j = lands[1].k; j < lost.length && frames[j].held[i]; j++) lost[j].held[i] = lost[j].heel[i] = lost[j].ball[i] = lost[j].tip[i] = false
      expect(heelStrikes(lost).missed, `foot ${i}: the next whole swing's catch lost`).toBeGreaterThan(0)
    }
  })

  it('a start or resumed walk brakes the heel strike per foot: a foot landed is braked while the other still steps off the stand, each brake keeps the share it began with', () => {
    // the brake was off for both feet until both had landed and a resumed
    // start's hold had run out, so a foot already back on the clip struck its
    // heel unbraked (cross-vendor review of point 1591). At the hold's own
    // length a landed foot is not yet swinging again when the start ends, so
    // the hold here lasts 1.5 s: the landed feet walk on within the start
    const g = VILLAGER_GLTF as { resumeHoldSeconds: number }
    const was = g.resumeHoldSeconds
    let landed = 0
    let stepping = 0
    let handed = 0
    // and the strikes past each foot's first landing within their bounds
    const heel = strikes()
    try {
      g.resumeHoldSeconds = 1.5
      for (const turn of [0, 2.8, -2.8]) {
        // (run on until each foot has landed twice since the start)
        const runs = [settle({ cut: 1, start: true, turn: (t) => (t > 1 ? turn : 0), tail: 2.5 }), ...[0.4, 0.6].map((pause) => settle({ cut: 1.2, resumeAt: 1.2 + pause, turn: (t) => (t > 0.9 ? turn : 0), tail: 2.5 }))]
        runs.forEach((frames, r) => {
          const lands = touchdowns(frames)
          // per foot, braked landings after the start or resume began
          const later = [0, 0]
          const begin = frames.findIndex((f, k) => k > 0 && f.starting && !frames[k - 1].starting)
          for (let k = 1; k < frames.length; k++) {
            for (const i of [0, 1]) {
              const [before, now] = [frames[k - 1].brake[i], frames[k].brake[i]]
              const where = `turning ${turn} rad/s, run ${r}, frame ${k}, foot ${i}`
              // latched: a share never changes within its brake
              if (before !== null && now !== null) expect(now, `${where}: the share its brake began with`).toBe(before)
              if (before !== null || now === null) continue
              // a brake begun: unbraked only into the foot's first landing
              // since the start or resume began (or the gait's landing of a
              // foot still on the stand), read from the landing it brakes
              // OPEN: point 1594: that first landing of each foot after a
              // start or resume still stops dead (braked there it slid 3.6 cm
              // and passed the start and resume knee bounds); this case holds
              // it unbraked until 1594 brakes it
              const land = lands[i].find((t) => t.k >= k)
              if (!land) continue
              const first = land.first || land.stand
              expect(now, `${where}: into the landing at frame ${land.k}${land.first ? ', its first since the start' : land.stand ? ', on the stand' : ''} (start state ${frames[k].start[i]})`).toBe(first ? 0 : 1)
              if (first) {
                stepping++
                // handed to the clip before its first landing (a resumed foot
                // lifted in the clip's stance): still unbraked
                if (frames[k].start[i] === 2) handed++
              } else {
                if (frames[k].starting) landed++
                if (k > begin) later[i]++
              }
            }
          }
          for (const i of [0, 1]) expect(later[i], `turning ${turn} rad/s, run ${r}, foot ${i}: braked landings after its first since the start`).toBeGreaterThan(0)
        })
      }
    } finally {
      g.resumeHoldSeconds = was
    }
    // the same runs at the hold's own length: the strikes past each foot's
    // first landing since the start within their bounds (at 1.5 s the hold
    // still draws the legs toward the stop's as they land)
    for (const turn of [0, 2.8, -2.8]) {
      heel.add({ cut: 1, start: true, turn: (t) => (t > 1 ? turn : 0), tail: 2.5 }, `turning ${turn} rad/s, started`, true)
      for (const pause of [0.4, 0.6]) heel.add({ cut: 1.2, resumeAt: 1.2 + pause, turn: (t) => (t > 0.9 ? turn : 0), tail: 2.5 }, `turning ${turn} rad/s, resumed after ${pause} s`, true)
    }
    expect(landed, 'brakes begun on a landed foot while the start still runs').toBeGreaterThan(0)
    expect(stepping, 'brakes begun into a foot\'s first landing since the start').toBeGreaterThan(0)
    expect(handed, 'unbraked brakes of a foot handed to the clip before its first landing').toBeGreaterThan(0)
    heel.check()
  })

  it('each foot\'s first landing after the legs\' weight sets off rising lands unbraked: a walk taken up past a start a stop cut short, and a weight from 0 to 1 at once', () => {
    // cross-vendor review of point 1591: the first landing was owed again
    // only by the start's two branches; a walk taken up while the stop that
    // cut a start short still anchored its feet, or a weight set from 0 to 1
    // at once, began no start and braked a foot's first landing after it
    // (OPEN: point 1594 brakes that landing; until then it lands unbraked)
    let cutShort = 0
    let jumped = 0
    for (const turn of [0, 2.8]) {
      const runs = [
        ...[0.35, 0.45, 0.55].map((stop) => ({ kind: 'cut short', frames: settle({ cut: 1, start: true, stopAt: 1 + stop, resumeAt: 1 + stop + 0.15, turn: (t) => (t > 1 ? turn : 0), tail: 2.5 }) })),
        { kind: 'jump', frames: settle({ cut: 1, start: true, jump: true, turn: (t) => (t > 1 ? turn : 0), tail: 2.5 }) },
      ]
      for (const { kind, frames } of runs) {
        // the onsets of a rise of the legs' weight, read off the frames
        const onsets: number[] = []
        let rising = false
        for (let k = 1; k < frames.length; k++) {
          if (frames[k].legs > frames[k - 1].legs && !rising) onsets.push(k)
          if (frames[k].legs !== frames[k - 1].legs) rising = frames[k].legs > frames[k - 1].legs
        }
        const last = onsets[onsets.length - 1]
        const where = `${kind}, turning ${turn} rad/s`
        if (kind === 'jump') {
          expect(frames.some((f) => f.starting), `${where}: no start runs`).toBe(false)
          expect(onsets.length, `${where}: one rise`).toBe(1)
          jumped++
        } else {
          // the path read: the start cut short anchored its feet to the stop
          // as the walk was taken up, and that began no resumed start
          expect(onsets.length, `${where}: a start, then a rise again`).toBe(2)
          if (!(frames[last - 1].anchor > 0) || frames.slice(last).some((f) => f.resumed)) continue
          cutShort++
        }
        // per foot, the first brake begun after the last rise's onset is
        // unbraked (into its first landing), the next one braked
        for (const i of [0, 1]) {
          const begun: (number | null)[] = []
          for (let k = last + 1; k < frames.length; k++) if (frames[k - 1].brake[i] === null && frames[k].brake[i] !== null) begun.push(frames[k].brake[i])
          expect(begun.length, `${where}, foot ${i}: brakes begun after the rise`).toBeGreaterThan(1)
          expect(begun[0], `${where}, foot ${i}: its first landing after the rise`).toBe(0)
          expect(begun[1], `${where}, foot ${i}: its next landing`).toBe(1)
        }
      }
    }
    expect(cutShort, 'walks taken up past a start a stop cut short, its anchor held').toBeGreaterThan(0)
    expect(jumped).toBeGreaterThan(0)
  })

  it('stopping in a corner: the knee bends no faster through the blend than the walk clip itself bends it', () => {
    // a walker leaving the gait in a ~2.8 rad/s corner snapped its knee by
    // 0.49-0.66 rad a frame into a deep bend (finding 22.10.2026, seed 42 walker 0)
    const heel = strikes()
    for (const turn of [2.8, -2.8, 1.5, -1.5, 0]) {
      const clip = clipKneeStep(turn)
      for (let cut = 1; cut < 1.6; cut += 0.05) {
        // turning into the corner from shortly before the stop, on through it
        const run: Run = { cut, turn: (t) => (t > cut - 0.3 ? turn : 0) }
        const frames = settle(run)
        heel.add(run, `turning ${turn} rad/s, stop at ${cut.toFixed(2)} s`, false, frames)
        let worst = 0
        // from before the blend to the run's end: the legs settle on past the walk's fade
        for (let k = Math.max(1, blendFrames(frames)[0] - 5); k < frames.length; k++) worst = Math.max(worst, kneeStep(frames, k))
        expect(worst, `turning ${turn} rad/s, stop at ${cut.toFixed(2)} s (clip ${clip.toFixed(3)})`).toBeLessThanOrEqual(clip)
      }
    }
    // the heel strikes walking into the stop
    heel.check()
  })

  /** The worst knee step over a whole run, from its first frame. */
  const worstKnee = (frames: Sole[]) => {
    let worst = 0
    for (let k = 1; k < frames.length; k++) worst = Math.max(worst, kneeStep(frames, k))
    return worst
  }

  it('starting, straight or into a corner: the knee bends no faster through the blend than the walk clip bends it', () => {
    // setting off straight turned the shin 0.656 rad on the first blend frame,
    // then by 0.24-0.42 rad steps (finding 24.11.2026 from point 1422)
    const heel = strikes()
    for (const turn of [0, 2.8, -2.8, 1.5, -1.5]) {
      const clip = clipKneeStep(turn)
      // past the start's handoff the walk alone bends the knee: at +2.8 rad/s
      // it passes the clip's range at landing walking into that corner without
      // any start (0.266 against 0.245, read without the heel strike's brake:
      // measured 25.11.2026); the run past the handoff adds nothing over that
      let after = clip
      if (turn === 2.8) {
        after = unbraked(() => {
          let worst = clip
          for (let cut = 1; cut < 1.6; cut += 0.05) {
            const walk = settle({ cut: 3, turn: (t) => (t > cut ? turn : 0) })
            for (let k = 1; k < 170; k++) worst = Math.max(worst, kneeStep(walk, k))
          }
          return worst
        })
      }
      for (let cut = 1; cut < 1.6; cut += 0.05) {
        const run: Run = { cut, start: true, turn: (t) => (t > cut ? turn : 0) }
        const frames = settle(run)
        // the start itself (from the stand to its handoff, both feet on the
        // clip) within the clip's own range at every corner, the raised bound
        // only past it, where the walk alone draws the knee (cross-vendor
        // reviews 24.11.2026 and of point 1591: past full weight the start
        // still runs until its second foot has landed)
        const blend = frames.findIndex((f) => f.w > 0)
        const full = frames.findIndex((f, k) => k > blend && f.w >= 1)
        const where = `turning ${turn} rad/s, start at ${cut.toFixed(2)} s`
        heel.add(run, where, false, frames)
        expect(blend > 0 && full > blend, where).toBe(true)
        // the blend itself (from the stand to full weight) strictly at the
        // clip's own range (cross-vendor review 24.11.2026)
        let start = 0
        for (let k = 1; k <= full; k++) start = Math.max(start, kneeStep(frames, k))
        expect(start, `${where} (clip ${clip.toFixed(3)})`).toBeLessThanOrEqual(clip)
        // (the start runs on past full weight until both feet are on the clip:
        // its whole run, to its handoff, at the clip's own range)
        const ended = frames.findIndex((f, k) => k > full && f.start[0] < 0)
        expect(ended, `${where}: the start hands over`).toBeGreaterThan(full)
        for (let k = full + 1; k <= ended; k++) {
          frames[k].knee.forEach((q, i) => {
            const step = q.angleTo(frames[k - 1].knee[i])
            if (step <= clip) return
            // OPEN: point 1594: a foot's first landing off the stand, unbraked,
            // passes the clip's range at +2.8 rad/s (0.266 against 0.245 at
            // +27 frames past full weight, three before the handoff, the
            // other foot already on the clip: measured 25.11.2026); allowed
            // only past full weight, on that foot still stepping off the
            // stand, and within the walk's own range in that corner
            const at = `${where}, frame ${k}, shin ${i}: ${step.toFixed(3)} (clip ${clip.toFixed(3)})`
            expect(frames[k].start[i], `${at}: past the clip only on a foot's first landing off the stand`).toBe(1)
            expect(step, `${at}: within the walk's own range in this corner`).toBeLessThanOrEqual(after)
          })
        }
        expect(worstKnee(frames), `${where} (bound ${after.toFixed(3)})`).toBeLessThanOrEqual(after)
      }
    }
    // the heel strikes past the start (OPEN: point 1594: each foot's first
    // landing off the stand lands unbraked, see applyClipLayers; a later
    // strike within the start is braked and read here)
    heel.check()
  })

  const RESUME_LANDING_BOUND = 0.22 // rad a frame; measured 0.215 (point 1587), owned by point 1589
  const RESUME_LANDING_FRAMES = 2 // frames before the landing the excess may fall on; measured 2 (point 1587)
  const RESUME_KNEE_STEP_BOUND = 0.25 // rad a frame; measured 0.224 (point 1587), main before it 0.62
  it('a walk taken up again mid-stop: over its first 30 frames the knee bends no faster than the walk clip bends it', () => {
    // resuming while the legs still left the gait bent the knee by 0.3-0.5 rad a
    // frame (finding 24.11.2026 from point 1422); the take-over at +11 and the
    // first landing at +26-28 then still stepped it 0.24-0.38 rad (point 1587)
    // only a stop begun: a pause shorter than 0.35 s never takes the legs off
    // the walk
    const heel = strikes()
    for (const turn of [0, 2.8, -2.8]) {
      const clip = clipKneeStep(turn)
      for (let pause = 0.35; pause < 0.8; pause += 0.05) {
        const cut = 1.2
        const run: Run = { cut, resumeAt: cut + pause, turn: (t) => (t > cut - 0.3 ? turn : 0) }
        const frames = settle(run)
        expect(Math.min(...frames.map((f) => f.w)), `the stop has begun, resumed after ${pause.toFixed(2)} s`).toBeLessThan(1)
        const r0 = frameAt(cut + pause) // the frame the resume acts on, on settle's own clock
        // the resumed walk's own heel strikes, from the resume on (OPEN: point
        // 1594: each foot's first landing after it lands unbraked)
        heel.add(run, `turning ${turn} rad/s, resumed after ${pause.toFixed(2)} s`, false, frames)
        // the first resumed frame of the whole run: none before the resume acts
        const began = frames.findIndex((f) => f.resumed)
        expect(began, `resumed after ${pause.toFixed(2)} s: a resumed start begins, not before the resume`).toBeGreaterThanOrEqual(r0)
        expect(began - r0, `resumed after ${pause.toFixed(2)} s: the resumed start begins within its first frames`).toBeLessThan(15)
        // the first foot's landing, located rather than assumed inside the 30 frames
        const landing = frames.findIndex((f, k) => k >= began && f.start.includes(2))
        expect(landing, `resumed after ${pause.toFixed(2)} s: the first foot lands`).toBeGreaterThanOrEqual(began)
        const landed = frames[landing].start.indexOf(2)
        for (let k = r0; k <= Math.max(r0 + 29, landing); k++) {
          frames[k].knee.forEach((q, i) => {
            const where = `turning ${turn} rad/s, resumed after ${pause.toFixed(2)} s, +${k - r0}, shin ${i} (clip ${clip.toFixed(3)})`
            const step = q.angleTo(frames[k - 1].knee[i])
            if (step <= clip) return
            // OPEN: point 1589: the first foot's landing while the hold is not yet
            // released steps past the clip's range (measured once: turning 0,
            // resumed after 0.40 s, +28, 0.215 drawn, the hold still 0.167;
            // hold or heel strike (point 1423) is 1589's to measure)
            expect(i === landed && k >= landing - RESUME_LANDING_FRAMES && k <= landing, `${where}: past the clip only on the first foot's landing step (lands +${landing - r0})`).toBe(true)
            expect(frames[k - 1].w, `${where}: past the clip only at full weight`).toBeGreaterThanOrEqual(1)
            expect(frames[k].hold, `${where}: only while the hold is still released`).toBeGreaterThan(0)
            expect(step, `${where}: within the measured landing excess`).toBeLessThanOrEqual(RESUME_LANDING_BOUND)
          })
        }
        // OPEN: past the first 30 frames, turning -2.8 rad/s and resumed after
        // 0.50-0.60 s, the landed foot's knee steps 0.220-0.224 at +36/37 with
        // the hips dropping 35-41 mm in the frame (as on main before point 1587)
        expect(worstKnee(frames), `turning ${turn} rad/s, resumed after ${pause.toFixed(2)} s`).toBeLessThanOrEqual(RESUME_KNEE_STEP_BOUND)
      }
    }
    // the heel strikes of the resumed walk
    heel.check()
  })

  it('a walk taken up again mid-stop: the hold outlives the legs\' weight, ends on its own clock, and the start lasts until it is released', () => {
    const holdFrames = Math.ceil(VILLAGER_GLTF.resumeHoldSeconds * 60) + 1
    let heldAtFullWeight = 0
    for (const turn of [0, 2.8, -2.8]) {
      for (let pause = 0.35; pause < 0.8; pause += 0.05) {
        const cut = 1.2
        const frames = settle({ cut, resumeAt: cut + pause, turn: (t) => (t > cut - 0.3 ? turn : 0) })
        const where = `turning ${turn} rad/s, resumed after ${pause.toFixed(2)} s`
        const began = frames.findIndex((f, k) => k >= Math.round((cut + pause) * 60) - 1 && f.resumed)
        expect(began, `${where}: a resumed start begins`).toBeGreaterThan(0)
        const released = frames.findIndex((f, k) => k > began && f.hold === 0)
        expect(released, `${where}: the hold is released`).toBeGreaterThan(began)
        expect(released - began, `${where}: the hold is released on its own clock`).toBeLessThanOrEqual(holdFrames)
        for (let k = began; k < released; k++) {
          expect(frames[k].start[0], `${where}, +${k - began}: still starting while the hold lasts`).toBeGreaterThanOrEqual(0)
          if (frames[k].w >= 1 && frames[k].hold > 0) heldAtFullWeight++
        }
      }
    }
    // the hold released with the legs' weight ended by a jump at full weight
    expect(heldAtFullWeight, 'frames the hold outlives the legs\' full weight').toBeGreaterThan(0)
  })

  it('a walk stopped again during a resumed start\'s hold: the knee stays within a fixed 0.4 rad a frame (main before point 1587: 0.33-0.39)', () => {
    // OPEN: stopped again 0.15 s (or 0.35 s) into a resumed start, the knee
    // steps 0.33-0.39 rad a frame against the clip's 0.20-0.23, measured
    // alike on main before point 1587 (filed as its own finding); this case
    // only keeps the hold release from making it worse
    let duringHold = 0
    for (const turn of [0, 2.8, -2.8]) {
      for (const pause of [0.4, 0.55, 0.7]) {
        for (const again of [0.08, 0.15, 0.25, 0.35]) {
          const cut = 1.2
          const frames = settle({ cut, resumeAt: cut + pause, stopAgainAt: cut + pause + again, turn: (t) => (t > cut - 0.3 ? turn : 0) })
          const at = `turning ${turn} rad/s, resumed after ${pause.toFixed(2)} s, stopped again after ${again.toFixed(2)} s`
          // stopped before the resumed start began, a run checks only the bound
          const began = frames.findIndex((f) => f.resumed)
          // the frame the second stop acts on, on settle's own clock
          const s2 = frameAt(cut + pause + again)
          if (began > 0 && began < s2 && frames[s2 - 1].hold > 0) duringHold++
          expect(worstKnee(frames), at).toBeLessThanOrEqual(0.4)
        }
      }
    }
    expect(duringHold, 'runs stopped again while the resumed start\'s hold lasts').toBeGreaterThanOrEqual(6)
  })

  it('a walk taken up again mid-stop: past the first foot\'s landing, the waiting stand foot\'s knee bends no faster than the walk clip bends it', () => {
    // the clip's lift of the waiting stand foot 40-44 frames on met the start's
    // own step and bent its knee by 0.39-0.49 rad a frame (point 1586)
    for (const turn of [0, 2.8, -2.8]) {
      const clip = clipKneeStep(turn)
      for (let pause = 0.35; pause < 0.8; pause += 0.05) {
        const cut = 1.2
        const frames = settle({ cut, resumeAt: cut + pause, turn: (t) => (t > cut - 0.3 ? turn : 0) })
        const r0 = Math.round((cut + pause) * 60)
        let first = -1
        let foot = -1
        for (let k = r0; k < frames.length && first < 0; k++) {
          foot = frames[k].start.indexOf(2)
          if (foot >= 0) first = k
        }
        const where = `turning ${turn} rad/s, resumed after ${pause.toFixed(2)} s (clip ${clip.toFixed(3)})`
        expect(first, `${where}: the first foot lands`).toBeGreaterThan(r0)
        const waiting = 1 - foot
        // the waiting stand foot took its step in the clip's stance and handed
        // it over as the clip lifted it (cross-vendor review of point 1586)
        const lifted = frames.findIndex((f, k) => k > r0 && f.start[waiting] === 1 && f.stance[waiting])
        expect(lifted, `${where}: the waiting foot steps in the clip's stance`).toBeGreaterThan(r0)
        const done = frames.findIndex((f, k) => k > lifted && f.start[waiting] !== 1)
        expect(done, `${where}: the waiting foot's step ends`).toBeGreaterThan(lifted)
        expect(frames[done].start[waiting], `${where}: ended by its own landing`).toBe(2)
        expect(frames[done].swing[waiting], `${where}: handed over on the clip's lift`).toBe(true)
        let worst = 0
        for (let k = first + 1; k < frames.length; k++) worst = Math.max(worst, frames[k].knee[waiting].angleTo(frames[k - 1].knee[waiting]))
        expect(worst, where).toBeLessThanOrEqual(clip)
      }
    }
  })

  it('a start cut short by a stop hands each foot on from where it was drawn: none jumps at the handoff', () => {
    // the first falling frame dropped the start's feet for the stop's step
    // targets, anchored where the gait stood as the start began: the foot on
    // the stand jumped 6-14 cm and the swinging one 4-11 cm in that frame
    // (cross-vendor review 24.11.2026)
    // the walk clip's own fastest foot, walking on (60 Hz)
    const walk = settle({ cut: 3 })
    let clip = 0
    for (let k = 30; k < 168; k++) clip = Math.max(clip, ...moved(walk, k))
    for (const turn of [0, 1.5, -1.5, 2.8, -2.8]) {
      for (let run = 0.125; run < 0.3; run += 0.025) {
        const cut = 0.5
        const frames = settle({ cut, start: true, stopAt: cut + run, turn: (t) => (t > cut ? turn : 0) })
        const at = frames.findIndex((f, k) => k > 0 && f.w < frames[k - 1].w)
        const where = `turning ${turn} rad/s, walking ${run.toFixed(3)} s`
        expect(frames[at - 1].w, where).toBeGreaterThan(0)
        expect(frames[at - 1].w, where).toBeLessThan(1)
        // at the handoff and the frame after, each foot goes on at the pace it
        // had (one standing stays where it stands) …
        for (let k = at; k <= at + 1; k++) {
          const now = moved(frames, k)
          const was = moved(frames, k - 1)
          for (let i = 0; i < 2; i++) expect(now[i], `${where}, foot ${i} ${k - at} frames after the handoff`).toBeLessThan(was[i] + 0.005)
        }
        // … and from there to the stand none moves faster than the walk clip moves a foot
        for (let k = at; k < frames.length; k++) expect(Math.max(...moved(frames, k)), `${where}, ${k - at} frames after the handoff (clip ${clip.toFixed(3)})`).toBeLessThanOrEqual(clip)
      }
    }
  })

  it('a start cut short by a stop, straight or in a corner: the knee bends no faster than the walk clip bends it, the reversal included', () => {
    // a stop reversing a start still in its blend jumped 0.32-0.60 rad in the
    // frame after the reversal as the step shares flipped (finding 24.11.2026
    // from point 1422), and kept sampling the live gait through the turn
    // (cross-vendor review 24.11.2026); handing each foot on from where it was
    // drawn took the jump out (measured 25.11.2026: at most 0.202 rad the frame
    // after the reversal against the clip's 0.234 at 2.8 rad/s)
    for (const turn of [0, 2.8, -2.8]) {
      const clip = clipKneeStep(turn)
      // the stop inside the start blend: the walk weight takes up once the
      // body, gaining its pace (VILLAGER_MOTION.setOffAccel), has a stride
      for (let run = 0.125; run < 0.3; run += 0.025) {
        const cut = 0.5
        const frames = settle({ cut, start: true, stopAt: cut + run, turn: (t) => (t > cut ? turn : 0) })
        const where = `turning ${turn} rad/s, walking ${run.toFixed(2)} s`
        // the reversal: the first frame the legs' share falls, the start still in its blend
        const at = frames.findIndex((f, k) => k > 0 && f.w < frames[k - 1].w)
        expect(at, `${where}: the legs' share reverses`).toBeGreaterThan(0)
        expect(frames[at - 1].w, `${where}: the stop falls inside the start blend`).toBeGreaterThan(0)
        expect(frames[at - 1].w, `${where}: the stop falls inside the start blend`).toBeLessThan(1)
        // the legs come back to the stand, so the bound covers the whole way there
        expect(frames[frames.length - 1].w, `${where}: back on the stand`).toBe(0)
        const worst = worstKnee(frames)
        expect(worst, `${where} (clip ${clip.toFixed(3)})`).toBeLessThanOrEqual(clip)
      }
    }
  })

  it('the step shares: the first foot over the first half of the way to the stand, the other over the second', () => {
    expect(settleShares(1, 0)).toEqual([0, 0])
    expect(settleShares(0, 0)).toEqual([1, 1])
    expect(settleShares(0.5, 0)).toEqual([1, 0])
    expect(settleShares(0.5, 1)).toEqual([0, 1])
    expect(settleShares(0.75, 1)).toEqual([0, 0.5])
  })
})
