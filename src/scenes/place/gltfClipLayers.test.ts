// @vitest-environment node
// The glTF villager's clip layers over the code-built pose: they ease in and
// out (no jump between activities), the shovel rides the hand and its blade
// stays above the ground while carried.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF, VILLAGER_POSE } from '../../config/balance'
import { distributeLean, gazeDirection, LEAN_BONES, newGaze, stepGaze } from '../../render/figureRig'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { clipGaitPose, clipPoseAt, shovelOnHungHand, toHung } from '../../render/villagerClipPose'
import { newPose } from '../../render/villagerRig'
import { createGltfSkeleton, gltfPerson, type GltfPerson } from '../../render/villagerFigureBody'
import { AGE_GROUPS, SEXES } from '../../systems/appearance'
import { applyClipLayers, clipLayers, gazeHead, gripShaft, handShapes, leanTrunk, newTrunkBase, placeShovel, poseShoulders, stepClipLayers, takeTrunkBase, TRUNK, type ClipLayers } from './gltfClipLayers'

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
    console.log("WORST", worst); expect(worst).toBeLessThan(0.2)
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
