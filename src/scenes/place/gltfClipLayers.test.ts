// @vitest-environment node
// The glTF villager's clip layers over the code-built pose: they ease in and
// out (no jump between activities), the shovel rides the hand and its blade
// stays above the ground while carried.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF } from '../../config/balance'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { shovelOnHungHand } from '../../render/villagerClipPose'
import { createGltfSkeleton, gltfPerson, type GltfPerson } from '../../render/villagerFigureBody'
import { applyClipLayers, clipLayers, placeShovel, stepClipLayers, type ClipLayers } from './gltfClipLayers'

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
  work: { dig: boolean; tool: boolean },
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
