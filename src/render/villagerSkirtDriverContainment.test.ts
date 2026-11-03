// @vitest-environment node
// Containment on the rendered surface (docs/garment-stage3-plan-1398.md
// section 3.5, B13): every vertex of every leg and pelvis triangle, plus a
// barycentric grid at most 1 cm apart inside each, lies in the union of the
// eight body-only capsules and the skinned pelvis profile (a capsule holds a
// sample below the profile bottom in its bone's rest frame or in the posed hips
// frame, the profile only at or above it in the posed hips frame; owner
// decisions 03.11.2026 20:56 and 22:19), over the clip
// domain the game draws (walk, jog and sprint at three speeds with stride
// warp, carry, dig, and the game's start and stop ramps frame by frame) and the builds
// −1, 0 and +1 of every sex and age group. Named response for a sample
// outside: raise that bone's capsule margin (VILLAGER_ASSET.drivenGarments).
// The leg surface is asserted strictly; the pelvis band within
// VILLAGER_ASSET.drivenGarments.driver.pelvisBandTolerance × the person's scale,
// a regression guard and no acceptance threshold (point 1339; owner decision
// 03.11.2026). OPEN: the pelvis band exceeds the profile by up to ~7 mm at the
// waist top (≤ 240 thinned samples, linear between columns, both as the plan
// states); the plan names no response for a profile shortfall. Not covered here: the
// kneel (posed by SkinnedFigure, not the clip layers) and the ten morph
// corners (gltfPerson takes sex, age and build only).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_MOTION } from '../config/balance'
import { applyClipLayers, clipLayers, stepClipLayers } from '../scenes/place/gltfClipLayers'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { approach, legDims, phasePerDistance, rephase, strideReach, walkPose } from './figureWalk'
import { createGltfSkeleton, gltfPerson } from './villagerFigureBody'
import { capsuleActive, ColumnDriver, columnRig, pointSegment, restHeight } from './villagerSkirtDriver'

type V3 = [number, number, number]
const LEG = ['thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R']
const ARM = ['upperArm.L', 'forearm.L', 'hand.L', 'upperArm.R', 'forearm.R', 'hand.R']
/** The grid spacing, metres in the figure frame (statures are metres there). */
const GRID = 0.01

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

/** The motions: body speed, settled walk weight, work, frames to settle, frames
 *  sampled. Speed and weight follow the game's own motion state throughout
 *  (figureWalk.stepWalk): the ground speed smoothed over `speedSmoothing`, the
 *  walk weight `approach`ed at `walkFadeRate` once that speed passes
 *  `moveSpeed` — neither a part-weight held while the body walks on nor a
 *  speed jump (sprint → walk left a held foot at hip height) is drawn by the
 *  game. A `ramp` (start, stop) is sampled every frame from where the
 *  previous motion left off until it settles. */
type Motion = { id: string; speed: number; weight: number; work: { dig: boolean; tool: boolean } | null; settle: number; sample: number; ramp?: boolean }
const MOTIONS: Motion[] = [
  ...[0.8, 1.1, 1.4].map((speed) => ({ id: `walk ${speed}`, speed, weight: 1, work: null, settle: 20, sample: 6 })),
  ...[2.2, 2.8, 3.4].map((speed) => ({ id: `jog ${speed}`, speed, weight: 1, work: null, settle: 20, sample: 6 })),
  ...[4.2, 5.0, 5.8].map((speed) => ({ id: `sprint ${speed}`, speed, weight: 1, work: null, settle: 20, sample: 6 })),
  { id: 'carry', speed: 1.1, weight: 1, work: { dig: false, tool: true }, settle: 20, sample: 6 },
  // walk 1.1 → rest: the body halts, its smoothed speed decays, the weight fades out
  { id: 'stop', speed: 0, weight: 0, work: null, settle: 0, sample: 0, ramp: true },
  { id: 'dig', speed: 0, weight: 0, work: { dig: true, tool: true }, settle: 40, sample: 8 },
  // rest (the dig easing out) → walk 1.1: the weight fades in as the speed builds
  { id: 'start', speed: 1.1, weight: 1, work: null, settle: 0, sample: 0, ramp: true },
]
/** Frames a ramp is sampled past its settling (weight at its target, speed within 1 %). */
const RAMP_TAIL = 6

describe('containment of the rendered legs and pelvis', () => {
  it('holds the legs in the union of the leg capsules and the skinned pelvis profile', () => {
    const worst: Record<string, { d: number; where: string }> = {}
    const band: { d: number; where: string } = { d: 0, where: '' }
    let samples = 0
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        for (const build of [-1, 0, 1]) {
          const person = gltfPerson(asset, sex, age, build)
          const rig = columnRig(asset, person)
          const driver = new ColumnDriver(rig)
          const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
          const g = person.geometry
          const pos = g.getAttribute('position') as THREE.BufferAttribute
          const si = g.getAttribute('skinIndex') as THREE.BufferAttribute
          const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute
          const index = g.getIndex()!
          const legSet = new Set(LEG.map((n) => asset.bones.indexOf(n)))
          const armSet = new Set(ARM.map((n) => asset.bones.indexOf(n)))
          const leg = new Float64Array(pos.count)
          const arm = new Float64Array(pos.count)
          for (let v = 0; v < pos.count; v++) {
            for (let c = 0; c < 4; c++) {
              if (legSet.has(si.getComponent(v, c))) leg[v] += sw.getComponent(v, c)
              if (armSet.has(si.getComponent(v, c))) arm[v] += sw.getComponent(v, c)
            }
          }
          const inBand = (v: number) => pos.getY(v) >= rig.profile.bottom && pos.getY(v) <= rig.profile.top && arm[v] <= 0.2
          const counted = (v: number) => leg[v] > 0.5 || inBand(v)
          const legTri = (ids: number[]) => ids.every((v) => leg[v] > 0.5)
          // the surface: the legs, and the pelvis band; per triangle its vertices and a ≤ 1 cm barycentric grid
          const tris: number[] = []
          for (let t = 0; t < index.count / 3; t++) {
            const ids = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)]
            if (ids.every(counted)) tris.push(...ids)
          }
          const weights: number[][] = []
          for (let t = 0; t < tris.length / 3; t++) {
            const p = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, tris[t * 3 + j]))
            const edge = Math.max(p[0].distanceTo(p[1]), p[1].distanceTo(p[2]), p[2].distanceTo(p[0]))
            const m = Math.max(1, Math.ceil(edge / GRID))
            const w: number[] = []
            for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) w.push(i / m, j / m)
            weights.push(w)
          }
          const c = clipLayers(asset)
          let z = 0
          const dt = 1 / 60
          const skinned = new Float64Array(pos.count * 3)
          const mats = skeleton.boneMatrices!
          // the game's motion state (figureWalk.stepWalk): smoothed ground speed and walk weight, carried across motions
          // ...and its stride (figureWalk.stepWalk: reach and phase, no kneel, no crouch, free plants)
          const ms = { speed: 0, weight: 0, reach: 0, phase: 0 }
          const dims = legDims(person.p)
          const smooth = 1 - Math.exp(-dt / VILLAGER_MOTION.speedSmoothing)
          for (const mo of MOTIONS) {
            let tail = mo.ramp ? RAMP_TAIL : 0
            for (let f = 0; mo.ramp ? tail > 0 && f < 600 : f < mo.settle + mo.sample; f++) {
              ms.speed += (mo.speed - ms.speed) * smooth
              const moving = Math.abs(ms.speed) > VILLAGER_MOTION.moveSpeed
              const placed = ms.reach * ms.weight
              ms.weight = approach(ms.weight, moving ? 1 : 0, VILLAGER_MOTION.walkFadeRate, dt)
              if (moving) ms.reach = strideReach(dims, ms.speed, age)
              ms.phase = rephase(ms.phase, placed, ms.reach * ms.weight)
              ms.phase += mo.speed * dt * phasePerDistance(Math.max(ms.reach * ms.weight, ms.reach * 0.3))
              if (mo.ramp && ms.weight === mo.weight && Math.abs(ms.speed - mo.speed) <= 0.01 * Math.max(1, mo.speed)) tail--
              stepClipLayers(asset, person, c, mo.speed * dt, ms.speed, { x: 0, z: (z += mo.speed * dt), yaw: 0, unit: 1 }, mo.work, dt)
              // the code-built legs first, as the figure's poseLegs writes them before the layers (a
              // stand↔walk ramp takes the code's legs; left unwritten, it would take the last frame's output)
              const walk = walkPose(dims, ms.phase, ms.reach, ms.weight, age, 0)
              const h = asset.bones.indexOf('hips')
              bones.hips.position.set(person.rest[h * 3], walk.hipHeight, person.rest[h * 3 + 2])
              bones.hips.rotation.set(0, walk.hipYaw, 0)
              ;(['L', 'R'] as const).forEach((sd, i) => {
                const roll = walk.legs[i].roll ?? 0
                bones[`thigh.${sd}`].rotation.set(walk.legs[i].thigh, -walk.hipYaw, roll, 'YZX')
                bones[`shin.${sd}`].rotation.set(walk.legs[i].shin, 0, 0)
                bones[`foot.${sd}`].rotation.set(walk.legs[i].foot, 0, -roll)
              })
              bones['toe.L'].quaternion.identity()
              bones['toe.R'].quaternion.identity()
              applyClipLayers(asset, person, bones, c, { speed: ms.speed, weight: ms.weight, kneel: 0 }, [true, true])
              if (f < mo.settle) continue
              skeleton.bones[asset.parents.indexOf(-1)].updateMatrixWorld(true)
              skeleton.update()
              // linear blend skinning, as the game's skinned mesh draws it (bind matrix identity)
              const used = new Set(tris)
              for (const v of used) {
                let x = 0
                let y = 0
                let zz = 0
                const px = pos.getX(v)
                const py = pos.getY(v)
                const pz = pos.getZ(v)
                for (let k = 0; k < 4; k++) {
                  const wt = sw.getComponent(v, k)
                  if (!(wt > 0)) continue
                  const o = si.getComponent(v, k) * 16
                  x += (mats[o] * px + mats[o + 4] * py + mats[o + 8] * pz + mats[o + 12]) * wt
                  y += (mats[o + 1] * px + mats[o + 5] * py + mats[o + 9] * pz + mats[o + 13]) * wt
                  zz += (mats[o + 2] * px + mats[o + 6] * py + mats[o + 10] * pz + mats[o + 14]) * wt
                }
                skinned[v * 3] = x
                skinned[v * 3 + 1] = y
                skinned[v * 3 + 2] = zz
              }
              const ob = driver.obstacles(skeleton.bones)
              for (let t = 0; t < tris.length / 3; t++) {
                const a = tris[t * 3]
                const b = tris[t * 3 + 1]
                const cc = tris[t * 3 + 2]
                // a capsule is convex: three corners inside one capsule hold the whole triangle
                const corner = (v: number): V3 => [skinned[v * 3], skinned[v * 3 + 1], skinned[v * 3 + 2]]
                // both heights are affine, so three corners below the profile bottom in the capsule
                // bone's rest frame (or all three in the hips frame) hold the interior there too
                const holds = (cap: (typeof ob.capsules)[number], p: V3) => pointSegment(p, cap.a, cap.b) <= cap.radius
                const activeAll = (cap: (typeof ob.capsules)[number]) => [a, b, cc].every((v) => restHeight(cap.ry, corner(v)) < rig.profile.bottom) || [a, b, cc].every((v) => restHeight(ob.hy, corner(v)) < rig.profile.bottom)
                if (ob.capsules.some((cap) => activeAll(cap) && [a, b, cc].every((v) => holds(cap, corner(v))))) {
                  samples += weights[t].length / 2
                  continue
                }
                const w = weights[t]
                for (let q = 0; q < w.length; q += 2) {
                  const u = w[q]
                  const vv = w[q + 1]
                  const s = 1 - u - vv
                  const p: V3 = [0, 1, 2].map((e) => skinned[a * 3 + e] * s + skinned[b * 3 + e] * u + skinned[cc * 3 + e] * vv) as V3
                  samples++
                  if (ob.inProfile(p)) continue
                  const pe = ob.profileExcess(p)
                  let best = Infinity
                  // no envelope at all (none expected: below the hips-frame bottom every capsule is active)
                  let bone = 'no envelope'
                  for (const cap of ob.capsules) {
                    if (!capsuleActive(cap.ry, ob.hy, p, rig.profile.bottom)) continue
                    const d = pointSegment(p, cap.a, cap.b) - cap.radius
                    if (d < best) {
                      best = d
                      bone = asset.bones[rig.capsules[ob.capsules.indexOf(cap)].bone]
                    }
                  }
                  if (pe < best) {
                    best = pe
                    bone = 'profile'
                  }
                  if (!(best > 0)) continue
                  const where = `${sex} ${age} ${build} ${mo.id} f${f} w${ms.weight.toFixed(2)} v${ms.speed.toFixed(2)}, rest y ${[a, b, cc].map((v) => pos.getY(v).toFixed(3)).join('/')}`
                  if (!legTri([a, b, cc])) {
                    // judged relative to this person's scale (the tolerance is in pipeline units)
                    const rel = best / person.frame.scale
                    if (rel > band.d) Object.assign(band, { d: rel, where })
                  } else if (best > (worst[bone]?.d ?? 0)) worst[bone] = { d: best, where }
                }
              }
            }
          }
        }
      }
    }
    console.log(`containment: ${samples} samples; legs outside: ${JSON.stringify(worst)}; pelvis band worst outside: ${band.d.toFixed(4)} × scale (${band.where})`)
    expect(samples).toBeGreaterThan(1e6)
    expect(worst).toEqual({})
    expect(band.d, `pelvis band outside the profile: ${band.where}`).toBeLessThanOrEqual(VILLAGER_ASSET.drivenGarments.driver.pelvisBandTolerance)
  }, 600_000)
})
