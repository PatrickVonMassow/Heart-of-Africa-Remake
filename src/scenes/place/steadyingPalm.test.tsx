// @vitest-environment node
// The steadying hand on a head load holds it with the PALM (user report
// 19.10.2026: villagers held the jar with the back of the hand). The real
// SkinnedFigure is mounted through react-three-fiber's reconciler and run
// frame by frame, on the glTF body and on the code-built one, with each hand
// steadying in turn: the palm normal of the posed hand bone must point toward
// the load's axis. The wrist roll itself (render/figureRig.ts palmRoll) and
// the palm constants it reads are pinned beside it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { FOREARM_ROLL_SHARE, hangToward, palmNormal, palmRoll, palmRollAngle } from '../../render/figureRig'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { dominantBones, gltfFigureGeometry, gltfPerson } from '../../render/villagerFigureBody'
import { JAR_HEIGHT } from './fillJar'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The village jar's outline (PlaceLife.tsx JAR_WAIST_R / JAR_RIM_R). */
const JAR = { bottom: 0.16, top: 0.155, height: JAR_HEIGHT }

let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

/** Mount a figure carrying a jar it steadies, run it, and return how each
 *  steadying hand's palm faces the load's axis (cosine), how far the hand is
 *  off that axis, and the roll its wrist alone takes (rad). */
async function steadied(gltf: boolean, side: 'L' | 'R') {
  const look: FigureLook = {
    peopleId: null,
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: ['#3a5a8a'],
    radial: 16,
    villager: gltf ? asset : null,
  }
  // the right hand steadies when the left one is busy (raised, off its rest)
  const pose: FigurePose = side === 'L' ? { ...REST_POSE } : { ...REST_POSE, left: { pitch: -1.2, yaw: 0, roll: 0.3 } }
  const root = new THREE.Group()
  function Stage() {
    const poseRef = useRef<FigurePose | null>(pose)
    const limbs = useRef<FigureLimbs | null>(null)
    useFrame(() => applyFigurePose(limbs.current, poseRef.current!))
    return (
      <primitive object={root}>
        <SkinnedFigure
          look={look}
          cloth="#3a5a8a"
          sex="female"
          age="adult"
          identityKey={`steady-${gltf}-${side}`}
          pose={poseRef}
          limbs={limbs}
          headSteady={JAR}
          headProp={<mesh name="test-jar" />}
        />
      </primitive>
    )
  }
  const r3f = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await r3f.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => r3f.render(<Stage />))
  for (let k = 1; k <= 90; k++) await act(async () => advance(k / 60, true))
  root.updateWorldMatrix(true, true)
  const crown = root.getObjectByName('figure-crown')!
  const axisAt = crown.getWorldPosition(new THREE.Vector3())
  const axisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(crown.getWorldQuaternion(new THREE.Quaternion()))
  const facing = (s: 'L' | 'R') => {
    const hand = root.getObjectByName(`bone-hand.${s}`)!
    const at = hand.getWorldPosition(new THREE.Vector3())
    const foot = axisAt.clone().addScaledVector(axisUp, at.clone().sub(axisAt).dot(axisUp))
    const toAxis = foot.clone().sub(at).normalize()
    const palm = palmNormal(gltf ? 'gltf' : 'code', s === 'L' ? 1 : -1).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()))
    // the wrist's own share of the roll (the forearm takes the rest)
    const wrist = 2 * Math.acos(Math.min(1, Math.abs(hand.quaternion.w)))
    return { cos: palm.dot(toAxis), reach: at.distanceTo(foot.copy(axisAt).addScaledVector(axisUp, at.clone().sub(axisAt).dot(axisUp))), wrist }
  }
  const out = facing(side)
  await act(async () => r3f.unmount())
  return out
}

describe('the steadying hand holds the head load with its palm', () => {
  for (const gltf of [true, false]) {
    for (const side of ['L', 'R'] as const) {
      it(`${gltf ? 'glTF' : 'code-built'} body, ${side === 'L' ? 'left' : 'right'} hand: the palm faces the load's axis`, async () => {
        const { cos, reach, wrist } = await steadied(gltf, side)
        // the hand is on the jar's side, not hanging (the steadying solve ran)
        expect(reach).toBeLessThan(JAR.bottom * 1.6)
        // well toward the axis, not merely not away from it
        expect(cos).toBeGreaterThan(0.7)
        // the roll is spread along the forearm: the wrist alone never wrings
        expect(wrist).toBeLessThanOrEqual((Math.PI / 2) * (1 - FOREARM_ROLL_SHARE) * 2 + 1e-6)
      })
    }
  }
})

describe('palmRoll: the wrist rolled about its own axis', () => {
  const forearms = [
    new THREE.Quaternion(),
    hangToward(new THREE.Vector3(0.3, 0.9, -0.2).normalize(), new THREE.Quaternion()),
    hangToward(new THREE.Vector3(-0.5, 0.7, 0.4).normalize(), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.7, 0.2))),
  ]
  const towards = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0.2, -0.1, 1), new THREE.Vector3(1, 0.3, -0.6)]
  it('turns the palm toward the target for either hand and leaves the hand axis where it was', () => {
    for (const parent of forearms) {
      for (const toward of towards) {
        for (const side of [1, -1] as const) {
          for (const body of ['gltf', 'code'] as const) {
            const palm = palmNormal(body, side)
            const q = palmRoll(parent, palm, toward)
            const world = parent.clone().multiply(q)
            const axis = new THREE.Vector3(0, -1, 0)
            // the bone's axis does not move: only a roll
            expect(axis.clone().applyQuaternion(world).distanceTo(axis.clone().applyQuaternion(parent))).toBeLessThan(1e-9)
            // the palm's part across the hand axis points along the target's
            const along = axis.clone().applyQuaternion(world)
            const p = palm.clone().applyQuaternion(world).projectOnPlane(along).normalize()
            const d = toward.clone().projectOnPlane(along).normalize()
            expect(p.dot(d)).toBeGreaterThan(1 - 1e-9)
          }
        }
      }
    }
  })
  it('takes the short way round: the roll stays within half a turn', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const roll = palmRollAngle(forearms[2], palmNormal('code', -1), new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)))
      expect(Math.abs(roll)).toBeLessThanOrEqual(Math.PI)
    }
  })
  it('is continuous: a small turn of the target is a small roll', () => {
    const palm = palmNormal('gltf', 1)
    const parent = forearms[1]
    let prev = palmRoll(parent, palm, new THREE.Vector3(1, 0, 0))
    for (let a = 0.01; a < Math.PI * 2; a += 0.01) {
      const q = palmRoll(parent, palm, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
      expect(q.angleTo(prev)).toBeLessThan(0.05)
      prev = q
    }
  })
})

describe('the palm constants match the bodies', () => {
  it("the glTF hand's palm is its flattest axis, on the side its grip curls the fingers to", () => {
    const person = gltfPerson(asset, 'male', 'adult')
    const fig = gltfFigureGeometry(asset, person, [], '#5c3317', null, 16)
    const dom = dominantBones(fig)
    const pos = fig.getAttribute('position')
    const names = fig.userData.targetNames as string[]
    for (const [s, side] of [['L', 1], ['R', -1]] as const) {
      const bone = asset.bones.indexOf(`hand.${s}`)
      const pts: THREE.Vector3[] = []
      const ids: number[] = []
      for (let k = 0; k < pos.count; k++) {
        if (dom[k] !== bone) continue
        ids.push(k)
        pts.push(new THREE.Vector3().fromBufferAttribute(pos, k))
      }
      const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length)
      const palm = palmNormal('gltf', side)
      // the spread across the palm normal is the smallest of any direction
      const spread = (n: THREE.Vector3) => pts.reduce((a, p) => a + p.clone().sub(c).dot(n) ** 2, 0) / pts.length
      const across = spread(palm)
      for (const n of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)]) expect(across).toBeLessThanOrEqual(spread(n.projectOnPlane(palm).normalize()))
      // the closing hand's fingertips travel toward the palm side
      const grip = fig.morphAttributes.position![names.indexOf(`grip.${s}`)]
      const tips = ids.filter((k) => pos.getY(k) < c.y - 0.03)
      const travel = tips.reduce((a, k) => a.add(new THREE.Vector3(grip.getX(k), grip.getY(k), grip.getZ(k))), new THREE.Vector3())
      expect(travel.dot(palm)).toBeGreaterThan(0)
    }
  })
})
