// @vitest-environment node
// The far-shoulder slab of walking and running villagers (owner picture check
// of 01.11.2026): the cause, measured on the gait clips. The retargeted
// walk/jog/sprint/carry clips turned the shoulder (clavicle) bone 30–38° all
// through the cycle, which carried the upper-arm joint 6–7.5 cm back and 2 cm
// up against the chest; the shoulder cap, skinned mostly to the upper arm,
// went with it and stood 3.5–8.3 cm behind its place on the back — the
// hard-cornered slab behind the far shoulder in side and rear-3/4 views. Not
// the mesh silhouette, not the weights (the cap's weights sum to 1 and blend
// upper arm, shoulder and chest): the clip pose.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_GLTF } from '../config/balance'
import { restClipShoulders, parseVillager, type VillagerAsset, type VillagerClip } from './villagerAsset'
import { forwardKinematics, newPose, newWorld, sampleClip, type WorldPose } from './villagerRig'
import { bakeMorphs, morphInfluences } from './villagerBody'
import { gltfPerson } from './villagerFigureBody'

let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const GAITS = ['walk', 'jog', 'sprint', 'carry']
const PHASES = 24
const at = (n: string) => asset.bones.indexOf(n)
const v3 = (a: ArrayLike<number>, i: number) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])

/** A world pose of `clip` at a phase on the person's file rest. */
function posed(clip: VillagerClip, rest: Float32Array, phase: number, world: WorldPose): WorldPose {
  return forwardKinematics(asset, rest, sampleClip(clip, phase * clip.duration, newPose(asset.bones.length)), world)
}

/** A point of the posed body carried into the chest's rest frame. */
function inChest(p: THREE.Vector3, world: WorldPose, rest: Float32Array): THREE.Vector3 {
  const c = at('chest')
  return p.clone().sub(world.p[c]).applyQuaternion(world.q[c].clone().invert()).add(v3(rest, c))
}

describe('the gait clips keep the shoulders at the body’s own place', () => {
  it('every gait clip is listed in VILLAGER_GLTF.clipShoulderKeep and kept at its rest', () => {
    for (const g of GAITS) {
      expect(asset.clips[g], g).toBeDefined()
      expect(VILLAGER_GLTF.clipShoulderKeep[g], g).toBe(0)
    }
  })

  it('the upper-arm joint stays at its rest place against the chest through every gait (was 6–7.5 cm back)', () => {
    for (const sex of ['male', 'female'] as const)
      for (const age of ['adult', 'child'] as const) {
        const rest = gltfPerson(asset, sex, age).frame.rest0
        const world = newWorld(asset.bones.length)
        for (const g of GAITS)
          for (let k = 0; k < PHASES; k++) {
            posed(asset.clips[g], rest, k / PHASES, world)
            for (const s of ['L', 'R']) {
              const ua = at(`upperArm.${s}`)
              const off = inChest(world.p[ua], world, rest).sub(v3(rest, ua))
              expect(off.length(), `${sex} ${age} ${g} ${s} phase ${k}`).toBeLessThan(0.003)
            }
          }
      }
  })

  it('the skinned shoulder cap stays on the back at the walk and run swing extremes (was 3.5–8.3 cm behind it)', () => {
    const w = morphInfluences('male', 'adult', 0)
    const rest = gltfPerson(asset, 'male', 'adult').frame.rest0
    const body = bakeMorphs(asset.geometries.body, w)
    const pos = body.getAttribute('position') as THREE.BufferAttribute
    const si = body.getAttribute('skinIndex') as THREE.BufferAttribute
    const sw = body.getAttribute('skinWeight') as THREE.BufferAttribute
    const world = newWorld(asset.bones.length)
    const v = new THREE.Vector3()
    const t = new THREE.Vector3()
    for (const s of ['L', 'R']) {
      const ua = at(`upperArm.${s}`)
      // the cap: vertices led by the upper arm at and above its joint
      const cap: number[] = []
      for (let k = 0; k < pos.count; k++) {
        let wu = 0
        for (let c = 0; c < 4; c++) if (si.getComponent(k, c) === ua) wu += sw.getComponent(k, c)
        if (wu > 0.5 && pos.getY(k) > rest[ua * 3 + 1] - 0.02) cap.push(k)
      }
      expect(cap.length).toBeGreaterThan(50)
      for (const g of ['walk', 'jog', 'sprint']) {
        // the swing extremes: the phases where this upper arm is farthest forward and back
        const swing = Array.from({ length: PHASES }, (_, k) => {
          posed(asset.clips[g], rest, k / PHASES, world)
          const d = inChest(world.p[at(`forearm.${s}`)], world, rest).sub(inChest(world.p[ua], world, rest))
          return { k, z: d.z }
        }).sort((a, b) => a.z - b.z)
        for (const { k } of [swing[0], swing[swing.length - 1]]) {
          posed(asset.clips[g], rest, k / PHASES, world)
          let back = 0
          for (const i of cap) {
            v.fromBufferAttribute(pos, i)
            const acc = new THREE.Vector3()
            for (let c = 0; c < 4; c++) {
              const wt = sw.getComponent(i, c)
              if (wt <= 0) continue
              const b = si.getComponent(i, c)
              t.copy(v).sub(v3(rest, b)).applyQuaternion(world.q[b]).add(world.p[b])
              acc.addScaledVector(t, wt)
            }
            back = Math.min(back, inChest(acc, world, rest).z - v.z)
          }
          expect(-back, `${g} ${s} phase ${k}: the cap's farthest push behind its rest place`).toBeLessThan(0.02)
        }
      }
    }
  })

  it('restClipShoulders moves the joint only: the upper arm and the forearm keep their world rotations', () => {
    const rest = asset.rest
    const clip = asset.clips.walk
    // a copy with a 35° shoulder turn put back in, the child's local turn taking it out again
    const turned: VillagerClip = { ...clip, rot: clip.rot.map((r) => Float32Array.from(r)) }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.3, -0.35))
    const a = new THREE.Quaternion()
    for (const s of ['L', 'R']) {
      const sh = at(`shoulder.${s}`)
      const ua = at(`upperArm.${s}`)
      for (let f = 0; f * 4 < turned.rot[sh].length; f++) {
        a.fromArray(turned.rot[sh], f * 4).multiply(q).toArray(turned.rot[sh], f * 4)
        a.fromArray(turned.rot[ua], f * 4).premultiply(q.clone().invert()).toArray(turned.rot[ua], f * 4)
      }
    }
    const before = newWorld(asset.bones.length)
    const after = newWorld(asset.bones.length)
    const restored = { ...turned, rot: turned.rot.slice() }
    restClipShoulders(restored, asset.bones, asset.parents, 0)
    for (let k = 0; k < 8; k++) {
      posed(turned, rest, k / 8, before)
      posed(restored, rest, k / 8, after)
      for (const s of ['L', 'R']) {
        for (const b of [`upperArm.${s}`, `forearm.${s}`, `hand.${s}`]) expect(Math.abs(before.q[at(b)].dot(after.q[at(b)])), b).toBeGreaterThan(1 - 1e-6)
        // the shoulder at its rest: turned as its parent
        const sh = at(`shoulder.${s}`)
        expect(after.q[sh].angleTo(after.q[asset.parents[sh]])).toBeLessThan(1e-3)
      }
    }
    // the loader's arrays are never written
    expect(turned.rot[at('shoulder.L')]).not.toBe(restored.rot[at('shoulder.L')])
  })
})
