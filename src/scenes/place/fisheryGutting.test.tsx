// @vitest-environment node
// The carrier gutting at the fire (user report: "she only rocks the fish back
// and forth, and it clips in and out of her clothing"). Over the kneel down and
// several gutting strokes, on the drawn (glTF) body of a woman and of a man:
// the fish is held level and across in front of the knees; no point of it is
// inside the body or its dress, and the knife hand draws along its belly.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance, VILLAGER_MOTION } from '../../config/balance'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { approach } from '../../render/figureWalk'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { buildFishGeometry } from '../../render/fishMesh'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { carrierPose, carrierWalkPose, GUT_FISH_SCALE, holdGutFish } from './fisheryPoses'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#2a3a6a', '#8a4a2a', '#c2b090']
const DT = 1 / 30
/** How far every fish point stays outside the body's and dress's triangles (m). */
const MARGIN = 0.01
const OUT_RAYS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => new THREE.Vector3(x, y, z))

let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe('the carrier gutting at the fire', () => {
  it.each(['female', 'male'] as const)('holds the fish clear of the %s body and draws the knife hand along it', async (sex) => {
    const cfg = balance.villageLife.fishFire
    const look: FigureLook = { peopleId: 'bambara', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const outer = new THREE.Group()
    outer.rotation.y = 0.7
    outer.position.set(3, 0.2, -2)
    const geometry = buildFishGeometry()
    const fish = { current: null as THREE.Mesh | null }
    const now = { clock: 0, k: 0 }
    function Stage() {
      const pose = useRef<FigurePose | null>({ ...REST_POSE })
      const limbs = useRef<FigureLimbs | null>(null)
      const kneeling = useRef(true)
      // As RiverFishery: the arms over to the gutting with the kneel, then the fish into the hand.
      useFrame(() => {
        carrierPose(pose.current!, carrierWalkPose('gut', now.clock, cfg.liftSeconds), now.k, now.clock)
        applyFigurePose(limbs.current, pose.current!)
        if (fish.current) holdGutFish(fish.current, outer)
      })
      return (
        <primitive object={outer}>
          <SkinnedFigure
            look={look}
            cloth={PALETTE[0]}
            scale={1}
            sex={sex}
            age="adult"
            identityKey={`gutting-${sex}`}
            legs
            pose={pose}
            limbs={limbs}
            kneeling={kneeling}
            handProp={<mesh ref={(m) => void (fish.current = m)} geometry={geometry} scale={GUT_FISH_SCALE} />}
          />
        </primitive>
      )
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<Stage />))

    const mesh = outer.getObjectByName('figure-body') as THREE.SkinnedMesh
    const bones = mesh.skeleton.bones.map((b) => b.name)
    // The hands work on the fish: everything else — trunk, arms, legs, dress — stays clear.
    const handBones = new Set(['bone-hand.L', 'bone-hand.R'].map((n) => bones.indexOf(n)))
    expect(handBones.has(-1)).toBe(false)
    const pos = mesh.geometry.attributes.position
    const si = mesh.geometry.attributes.skinIndex
    const sw = mesh.geometry.attributes.skinWeight
    const isBody: boolean[] = []
    for (let i = 0; i < pos.count; i++) {
      let w = 0
      for (let c = 0; c < 4; c++) if (handBones.has(si.getComponent(i, c))) w += sw.getComponent(i, c)
      isBody.push(w < 0.5)
    }
    // The body's and its dress's triangles, the hands' own left out.
    const index = mesh.geometry.index
    const corner = (k: number) => (index ? index.getX(k) : k)
    const tris: [number, number, number][] = []
    for (let k = 0; k + 2 < (index ? index.count : pos.count); k += 3) {
      const tri: [number, number, number] = [corner(k), corner(k + 1), corner(k + 2)]
      if (tri.every((i) => isBody[i])) tris.push(tri)
    }
    expect(tris.length).toBeGreaterThan(1000)
    const at = Array.from({ length: pos.count }, () => new THREE.Vector3())
    const toWorld = new THREE.Matrix4()
    const v = new THREE.Vector3()
    const q = new THREE.Vector3()
    const local = new THREE.Matrix4()
    const fishPos = fish.current!.geometry.attributes.position
    // the fish's own triangles, three points each
    expect(fish.current!.geometry.index).toBeNull()
    const fishAt = Array.from({ length: fishPos.count }, () => new THREE.Vector3())
    const tri = new THREE.Triangle()
    const ray = new THREE.Ray()
    const hit = new THREE.Vector3()
    /** Whether the segment a→b passes through the triangle. */
    const crosses = (a: THREE.Vector3, b: THREE.Vector3, t0: THREE.Vector3, t1: THREE.Vector3, t2: THREE.Vector3) => {
      const len = a.distanceTo(b)
      if (len < 1e-9) return false
      ray.set(a, v.copy(b).sub(a).divideScalar(len))
      return ray.intersectTriangle(t0, t1, t2, false, hit) !== null && hit.distanceTo(a) <= len
    }

    let t = 0
    let worst = Infinity
    let crossings = 0
    let outside = 0
    let checked = 0
    let strokeMin = Infinity
    let strokeMax = -Infinity
    let farFromBelly = 0
    let tilt = 0
    const stroke = 3 * 1.2
    for (let clock = 0; clock < cfg.liftSeconds + stroke; clock += DT) {
      now.clock = clock
      now.k = approach(now.k, 1, 1 / VILLAGER_MOTION.kneelSeconds, DT)
      act(() => advance((t += DT)))
      // The fish shows once the basket is down (RiverFishery).
      if (clock <= cfg.liftSeconds) continue
      checked++
      outer.updateWorldMatrix(true, true)
      // A bone-transformed vertex is the bones' world place under the bind inverse.
      toWorld.copy(mesh.bindMatrixInverse).invert()
      for (let i = 0; i < pos.count; i++) {
        at[i].fromBufferAttribute(pos, i)
        mesh.applyBoneTransform(i, at[i])
        at[i].applyMatrix4(toWorld)
      }
      // The fish in the figure's own frame (+X its left, +Z ahead): level and across.
      const f = fish.current!
      f.updateWorldMatrix(true, false)
      local.copy(outer.matrixWorld).invert().multiply(f.matrixWorld)
      const axis = new THREE.Vector3(0, 0, 1).transformDirection(local)
      tilt = Math.max(tilt, Math.abs(axis.y), Math.abs(axis.z))
      const box = new THREE.Box3()
      for (let i = 0; i < fishPos.count; i++) box.expandByPoint(fishAt[i].fromBufferAttribute(fishPos, i).applyMatrix4(f.matrixWorld))
      // Every body triangle near the fish; one farther off cannot be within the margin.
      box.expandByScalar(0.1)
      const near = tris.filter(([a, b, c]) => box.intersectsBox(new THREE.Box3().setFromPoints([at[a], at[b], at[c]])))
      // Each fish point's distance to the body's surface.
      for (const p of fishAt) {
        for (const [a, b, c] of near) {
          tri.set(at[a], at[b], at[c])
          worst = Math.min(worst, p.distanceTo(tri.closestPointToPoint(p, q)))
        }
      }
      // Which side of that surface the fish is on: a ray from it that meets
      // no body triangle at all leaves from outside. (The nearest triangle's
      // own normal cannot tell: at a distance the nearest feature is an edge.)
      const from = fishAt[0]
      if (OUT_RAYS.some((d) => tris.every(([a, b, c]) => ray.set(from, d).intersectTriangle(at[a], at[b], at[c], false, hit) === null))) outside++
      // And no edge of either surface passes through the other between the points.
      for (let k = 0; k + 2 < fishAt.length; k += 3) {
        const [f0, f1, f2] = [fishAt[k], fishAt[k + 1], fishAt[k + 2]]
        for (const [a, b, c] of near) {
          const [t0, t1, t2] = [at[a], at[b], at[c]]
          if (crosses(f0, f1, t0, t1, t2) || crosses(f1, f2, t0, t1, t2) || crosses(f2, f0, t0, t1, t2)) crossings++
          if (crosses(t0, t1, f0, f1, f2) || crosses(t1, t2, f0, f1, f2) || crosses(t2, t0, f0, f1, f2)) crossings++
        }
      }
      // The knife hand, in the fish's own frame: along its length, at its belly.
      const knife = outer.getObjectByName('hand-right')!.getWorldPosition(v)
      const inFish = knife.applyMatrix4(local.copy(f.matrixWorld).invert())
      strokeMin = Math.min(strokeMin, inFish.z)
      strokeMax = Math.max(strokeMax, inFish.z)
      farFromBelly = Math.max(farFromBelly, Math.hypot(inFish.x, inFish.y) * GUT_FISH_SCALE)
    }
    await act(async () => root.unmount())
    expect(checked).toBeGreaterThan(60)
    // the fish is outside the body in every frame, never through its surface, and clear of it
    expect(outside).toBe(checked)
    expect(crossings).toBe(0)
    expect(worst).toBeGreaterThan(MARGIN)
    // level and across the front, never hanging into the lap
    expect(tilt).toBeLessThan(0.05)
    // the knife hand runs a good part of the fish's length, beside its belly
    expect((strokeMax - strokeMin) * GUT_FISH_SCALE).toBeGreaterThan(0.08)
    expect(strokeMax).toBeLessThan(0.42)
    expect(farFromBelly).toBeLessThan(0.12)
  }, 60000)
})
