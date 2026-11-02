// @vitest-environment node
// The column driver (docs/garment-stage3-plan-1398.md sections 3.4 to 3.7 and
// the Vitest list of section 5): figure-frame matrices, determinism, bounds,
// the sign of θ, triangle scoring through a carried lower segment, the
// neighbour limit, the final evaluation and bounded repair, the ground
// fallback, continuity and the frame-rate rule, and the pelvis profile bins.
// Toy rigs mirror scripts/villager/gamepath.py toy_column_rig.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import { applyClipLayers, clipLayers, stepClipLayers } from '../scenes/place/gltfClipLayers'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { createGltfSkeleton, gltfPerson } from './villagerFigureBody'
import { carriesColumnWeight, ColumnDriver, columnRig, composeFigureMatrices, PelvisProfile, segmentTriangle, type ColumnRig, type DrivenFormRig } from './villagerSkirtDriver'
import { ROUND_TRIP_SEQUENCES, runSequence } from './villagerSkirtDriverSequences'

const CFG = VILLAGER_ASSET.drivenGarments.driver
const DEG = Math.PI / 180
const SCALE_ONE = [1, 1, 1]

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

type V3 = [number, number, number]
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** scripts/villager/gamepath.py toy_column_rig, one to one. */
function toyRig(n = 4, capsules: Array<[V3, V3, number]> = [], form: DrivenFormRig | null = null): ColumnRig {
  const rest = [0, 1, 0, 0.1, 1, 0]
  const upper = Array.from({ length: n }, (_, k) => 2 + k)
  const lower = Array.from({ length: n }, (_, k) => 2 + n + k)
  const radial: V3[] = []
  const tangent: V3[] = []
  const headOffset: V3[] = []
  const heads: V3[] = []
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n
    const r: V3 = [Math.cos(a), 0, Math.sin(a)]
    radial.push(r)
    // rk × up, up = (0, 1, 0)
    tangent.push(norm([-r[2], 0, r[0]]))
    const h: V3 = [0.15 * r[0], 1.05, 0.15 * r[2]]
    heads.push(h)
    headOffset.push([h[0], h[1] - 1, h[2]])
  }
  for (const h of heads) rest.push(...h)
  for (const h of heads) rest.push(h[0], h[1] - 0.4, h[2])
  const pos: number[] = []
  const idx: number[] = []
  const w: number[] = []
  for (const y of [0.95, 1.0, 1.05]) {
    for (let j = 0; j < 16; j++) {
      const a = (2 * Math.PI * j) / 16
      pos.push(0.1 * Math.cos(a), y, 0.1 * Math.sin(a))
      idx.push(0, 0, 0, 0)
      w.push(1, 0, 0, 0)
    }
  }
  return {
    bones: 2 + 2 * n,
    order: Array.from({ length: 2 + 2 * n }, (_, i) => i),
    parents: [-1, 0, ...upper.map(() => 0), ...upper],
    rest,
    hips: 0,
    upper,
    lower,
    radial,
    tangent,
    headOffset,
    upperOffset: upper.map(() => [0, -0.4, 0] as V3),
    lowerOffset: upper.map(() => [0, -0.4, 0] as V3),
    capsules: capsules.map(([a, b, radius]) => ({ bone: 1, a, b, radius })),
    pelvis: { pos, idx, w },
    profile: { bottom: 0.9, top: 1.1, bin: 0.05 },
    crotch: 0.92,
    clearance: 0.006,
    ground: 0.002,
    form,
  }
}

/** The toy rig's bone locals: hips and thigh as given, the columns at rest. */
function toyBones(rig: ColumnRig, hips: V3 = [0, 1, 0], thigh: V3 = [0.1, 0, 0]): THREE.Object3D[] {
  return Array.from({ length: rig.bones }, (_, i) => {
    const o = new THREE.Object3D()
    if (i === 0) o.position.set(...hips)
    if (i === 1) o.position.set(...thigh)
    return o
  })
}

const legCapsule: Array<[V3, V3, number]> = [[[0.1, 1, 0], [0.1, 0.5, 0], 0.04]]

describe('the column driver', () => {
  it('composes the figure-frame matrices exactly as updateMatrixWorld does', () => {
    const person = gltfPerson(asset, 'male', 'adult', 0)
    const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
    const c = clipLayers(asset)
    for (let k = 0; k < 20; k++) {
      stepClipLayers(asset, person, c, 1.1 / 60, 1.1, { x: 0, z: k * 0.02, yaw: 0, unit: 1 }, null, 1 / 60)
      applyClipLayers(asset, person, bones, c, { speed: 1.1, weight: 1, kneel: 0 }, [true, true])
    }
    bones.hips.position.x += 0.03
    bones.hips.scale.set(1, 1.02, 1)
    const rig = columnRig(asset, person)
    const M = composeFigureMatrices(rig.order, rig.parents, skeleton.bones, new Float64Array(rig.bones * 16))
    skeleton.bones[rig.order[0]].updateMatrixWorld(true)
    skeleton.bones.forEach((b, i) => {
      for (let e = 0; e < 16; e++) expect(Math.abs(M[i * 16 + e] - b.matrixWorld.elements[e]), `${asset.bones[i]}[${e}]`).toBeLessThan(1e-9)
    })
  })

  it('replays deterministically, keeps θ in its bounds, every column unscaled, within the rate limit unless only a larger step is feasible', () => {
    for (const s of ROUND_TRIP_SEQUENCES) {
      const trace: number[][] = []
      const viol: number[][] = []
      let repairs = 0
      let breaks = 0
      const d = runSequence(asset, s, (f) => {
        const prev = trace.at(-1)
        trace.push(Array.from(f.driver.theta))
        viol.push(Array.from(f.driver.violation))
        expect(f.driver.counters.repairs - repairs, `${s.id} repairs per frame`).toBeLessThanOrEqual(CFG.repairRounds)
        repairs = f.driver.counters.repairs
        for (const i of [...f.driver.rig.upper, ...f.driver.rig.lower]) expect(f.bones[i].scale.toArray()).toEqual(SCALE_ONE)
        if (prev && f.dt <= CFG.resetDt) {
          const lim = CFG.omegaMax * DEG * f.dt
          breaks += trace.at(-1)!.filter((x, k) => Math.abs(x - prev[k]) > lim + 1e-12).length
        }
        for (const [k, x] of trace.at(-1)!.entries()) {
          expect(x, `${s.id} segment ${k}`).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual((f.driver.held[k] ? CFG.thetaGround : CFG.thetaMax) * DEG + 1e-12)
          expect(Number.isFinite(f.driver.violation[k])).toBe(true)
        }
      })
      expect(breaks, `${s.id} rate breaks`).toBe(d.counters.rateBreaks)
      // the residual counter is the count of violated segments after the final evaluation
      expect(d.counters.residual).toBe(viol.flat().filter((v) => v > 0).length)
      const again: number[][] = []
      const d2 = runSequence(asset, s, (f) => again.push(Array.from(f.driver.theta)))
      expect(again, s.id).toEqual(trace)
      expect(d2.counters).toEqual(d.counters)
    }
  })

  it('holds neighbouring satisfied segments within the neighbour limit', () => {
    const s = ROUND_TRIP_SEQUENCES[0]
    runSequence(asset, s, (f) => {
      const d = f.driver
      const n = d.rig.upper.length
      for (let seg = 0; seg < 2 * n; seg++) {
        if (d.violation[seg] > 0) continue
        const k = seg % n
        const level = seg < n ? 0 : n
        for (const o of [level + ((k + n - 1) % n), level + ((k + 1) % n)]) {
          if (d.held[seg] && d.held[o]) continue
          expect(Math.abs(d.theta[seg] - d.theta[o])).toBeLessThanOrEqual(CFG.neighbourLimit * DEG + 1e-9)
        }
      }
    })
  })

  it('swings a hanging segment outward for a positive θ (section 3.15 axes)', () => {
    const person = gltfPerson(asset, 'female', 'adult', 0)
    const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
    const rig = columnRig(asset, person)
    const d = new ColumnDriver(rig)
    d.step(skeleton.bones, 1 / 60)
    const hips = new THREE.Vector3()
    const tip = (k: number, lower: boolean) => {
      skeleton.bones[rig.order[0]].updateMatrixWorld(true)
      bones.hips.getWorldPosition(hips)
      const b = skeleton.bones[lower ? rig.lower[k] : rig.upper[k]]
      const off = new THREE.Vector3(...(lower ? rig.lowerOffset[k] : rig.upperOffset[k]))
      const p = off.applyMatrix4(b.matrixWorld)
      return Math.hypot(p.x - hips.x, p.z - hips.z)
    }
    for (let k = 0; k < rig.upper.length; k++) {
      let last = -Infinity
      for (const th of [0, 15, 30, 60]) {
        d.theta.fill(0)
        d.theta[k] = th * DEG
        d.write(skeleton.bones)
        const r = tip(k, false)
        expect(r, `col.U.${k} at ${th}°`).toBeGreaterThan(last)
        last = r
      }
      last = -Infinity
      for (const th of [0, 15, 30, 60]) {
        d.theta.fill(0)
        d.theta[rig.upper.length + k] = th * DEG
        d.write(skeleton.bones)
        const r = tip(k, true)
        expect(r, `col.L.${k} at ${th}°`).toBeGreaterThan(last)
        last = r
      }
    }
  })

  it('scores an upper trial on the triangles its lower carries: swinging them into a capsule is infeasible (B17)', () => {
    const n = 4
    const form: DrivenFormRig = {
      anchors: [],
      clearance: 0.006,
      top: 1.1,
      panel: { pos: [0.15, 0.4, -0.05, 0.15, 0.4, 0.05, 0.15, 0.3, 0], idx: Array(3).fill([2 + n, 0, 0, 0]).flat(), w: Array(3).fill([1, 0, 0, 0]).flat(), index: [0, 1, 2], exempt: [0, 0, 0], clearance: [0.006, 0.006, 0.006] },
    }
    const rig = toyRig(n, [[[0.6, 0.51, -0.2], [0.6, 0.51, 0.2], 0.03]], form)
    form.anchors = rig.upper.map((u) => {
      const h: V3 = [rig.rest[u * 3], rig.rest[u * 3 + 1], rig.rest[u * 3 + 2]]
      return { a: h, ia: [0, 0, 0, 0], wa: [1, 0, 0, 0], b: h, ib: [0, 0, 0, 0], wb: [1, 0, 0, 0], t: 0 }
    })
    const d = new ColumnDriver(rig)
    d.step(toyBones(rig), 1 / 60)
    const clear = d.evaluateSegment(0, 0)
    const hit = d.evaluateSegment(0, 40 * DEG)
    const plain = d.evaluateSegment(0, 40 * DEG, false)
    expect(clear.tri).toBe(0)
    expect(hit.tri).toBeGreaterThan(0)
    expect(hit.worst).toBeGreaterThan(0)
    expect(plain.tri).toBe(0)
  })

  it('repairs in bounded rounds and searches two columns jointly when a segment repeats its angle', () => {
    const n = 4
    const form: DrivenFormRig = {
      anchors: [],
      clearance: 0.006,
      top: 1.1,
      panel: { pos: [0.15, 0.4, -0.05, 0.15, 0.4, 0.05, 0.15, 0.3, 0], idx: Array(3).fill([2 + n, 0, 0, 0]).flat(), w: Array(3).fill([1, 0, 0, 0]).flat(), index: [0, 1, 2], exempt: [0, 0, 0], clearance: [0.006, 0.006, 0.006] },
    }
    const rig = toyRig(n, [[[0.13, 0.35, -0.3], [0.13, 0.35, 0.3], 0.02]], form)
    form.anchors = rig.upper.map((u) => {
      const h: V3 = [rig.rest[u * 3], rig.rest[u * 3 + 1], rig.rest[u * 3 + 2]]
      return { a: h, ia: [0, 0, 0, 0], wa: [1, 0, 0, 0], b: h, ib: [0, 0, 0, 0], wb: [1, 0, 0, 0], t: 0 }
    })
    const d = new ColumnDriver(rig)
    d.step(toyBones(rig, [0, 1, 0], [-0.5, 0, 0]), 1 / 60)
    d.step(toyBones(rig), 1e-3)
    expect(d.counters.repairs).toBeGreaterThanOrEqual(1)
    expect(d.counters.repairs).toBeLessThanOrEqual(2 * CFG.repairRounds)
    rig.capsules = [{ bone: 1, a: [0.15, 0.35, -0.01], b: [0.15, 0.35, 0.01], radius: 1 }]
    const j = new ColumnDriver(rig)
    j.step(toyBones(rig, [0, 1, 0], [-5, 0, 0]), 1 / 60)
    j.step(toyBones(rig), 1e-3)
    expect(j.counters.jointSearches).toBeGreaterThanOrEqual(1)
    expect(j.counters.residual).toBeGreaterThan(0)
    expect(Array.from(j.violation).some((v) => v > 0)).toBe(true)
  })

  it('reaches θmax as a bound and lifts past it to at most θground only under the ground fallback', () => {
    // an obstacle no tilt clears: the least violating angle is the bound
    const big = toyRig(4, [[[0, 1.2, 0], [0, 0, 0], 2]])
    const d = new ColumnDriver(big)
    d.step(toyBones(big), 1 / 60)
    expect(Math.max(...d.theta)).toBeCloseTo(CFG.thetaMax * DEG, 9)
    expect(d.counters.groundFallback).toBe(0)
    // the tips below the ground: lifted past θmax, the carried rows cleared
    const low = toyRig()
    const g = new ColumnDriver(low)
    g.step(toyBones(low, [0, 0.05, 0]), 1 / 60)
    expect(g.counters.groundFallback).toBeGreaterThan(0)
    expect(Math.max(...g.theta)).toBeGreaterThan(CFG.thetaMax * DEG)
    expect(Math.max(...g.theta)).toBeLessThanOrEqual(CFG.thetaGround * DEG + 1e-12)
    expect(Array.from(g.held).some((h) => h === 1)).toBe(true)
    // pivots under the ground: θground itself, the residual counted
    const under = new ColumnDriver(low)
    under.step(toyBones(low, [0, -0.2, 0]), 1 / 60)
    expect(Math.max(...under.theta)).toBeCloseTo(CFG.thetaGround * DEG, 9)
    expect(under.counters.residual).toBeGreaterThan(0)
  })

  it('relaxes a released hem continuously to its gravity target at every frame rate', () => {
    // a leg capsule holds column 0 out until 0.5 s, then leaves
    const rig = toyRig(4, legCapsule)
    const rates = [30, 60, 120, 144]
    for (const fps of rates) {
      const d = new ColumnDriver(rig)
      const tr: Array<[number, number]> = []
      for (let f = 0; f <= 2.5 * fps; f++) {
        const t = f / fps
        d.step(toyBones(rig, [0, 1, 0], t < 0.5 ? [0.1, 0, 0] : [-5, 0, 0]), 1 / fps)
        tr.push([t, d.theta[0]])
      }
      expect(tr.find(([t]) => t >= 0.45)![1], `${fps} fps held`).toBeGreaterThan(5 * DEG)
      // within 0.5° of the target inside 1.5 s of the release
      expect(tr.find(([t]) => t >= 2.0 - 1e-9)![1], `${fps} fps released`).toBeLessThan(0.5 * DEG)
      // no sticking to a sample: strictly falling while free and above the target
      const free = tr.filter(([t, a]) => t >= 0.5 && a > 1e-6)
      for (let i = 1; i < free.length; i++) expect(free[i][1]).toBeLessThan(free[i - 1][1])
    }
    // matching times from one released state: θs = 30° released at t = 0 at every rate
    const traces = rates.map((fps) => {
      const free = toyRig()
      const d = new ColumnDriver(free)
      d.step(toyBones(free), 1 / fps)
      d.theta[0] = 30 * DEG
      const out: Array<[number, number]> = [[0, d.theta[0]]]
      for (let f = 1; f <= 1.5 * fps; f++) {
        d.step(toyBones(free), 1 / fps)
        out.push([f / fps, d.theta[0]])
      }
      return out
    })
    const at = (tr: Array<[number, number]>, t: number) => {
      const i = tr.findIndex(([x]) => x >= t - 1e-9)
      if (Math.abs(tr[i][0] - t) < 1e-9) return tr[i][1]
      const [t0, a0] = tr[i - 1]
      const [t1, a1] = tr[i]
      return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0)
    }
    for (const tr of traces) expect(tr.at(-1)![1]).toBeLessThan(0.5 * DEG)
    for (let t = 0; t <= 1.5 + 1e-9; t += 1 / 30) {
      const ref = at(traces[0], t)
      for (const tr of traces.slice(1)) expect(Math.abs(at(tr, t) - ref), `t ${t.toFixed(3)}`).toBeLessThan(1 * DEG)
    }
  })

  it('resets to the gravity solution after a gap, a reset() or at creation', () => {
    const rig = toyRig()
    const d = new ColumnDriver(rig)
    d.step(toyBones(rig), 1 / 60)
    expect(Array.from(d.theta).every((x) => x === 0)).toBe(true)
    d.theta[0] = 30 * DEG
    d.step(toyBones(rig), 1 / 60)
    expect(d.theta[0]).toBeGreaterThan(20 * DEG)
    d.step(toyBones(rig), 1)
    expect(d.theta[0]).toBe(0)
    d.theta[0] = 30 * DEG
    d.reset()
    d.step(toyBones(rig), 1 / 60)
    expect(d.theta[0]).toBe(0)
  })
})

describe('the driver in the figure', () => {
  it('runs only for a body carrying column weight: none does before the driven builder', () => {
    const person = gltfPerson(asset, 'female', 'adult', 0)
    expect(carriesColumnWeight(asset, person.geometry)).toBe(false)
    for (const [name, g] of Object.entries(asset.geometries)) expect(carriesColumnWeight(asset, g), name).toBe(false)
    const g = person.geometry.clone()
    const si = g.getAttribute('skinIndex') as THREE.BufferAttribute
    const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute
    si.setX(0, asset.bones.indexOf('col.L.3'))
    sw.setX(0, 0.5)
    expect(carriesColumnWeight(asset, g)).toBe(true)
  })

  it('re-solves a second retarget in one frame from the state before that frame', () => {
    const rig = toyRig(4, legCapsule)
    const once = new ColumnDriver(rig)
    const twice = new ColumnDriver(rig)
    for (let f = 0; f < 30; f++) {
      const thigh: V3 = [0.1 + 0.003 * f, 0, 0]
      once.stepFrame(toyBones(rig, [0, 1, 0], thigh), 1 / 60, f)
      // the figure's own frame on a stale pose, then the caller's retarget on the final one
      twice.stepFrame(toyBones(rig, [0, 1, 0], [0.1, 0, 0]), 1 / 60, f)
      twice.stepFrame(toyBones(rig, [0, 1, 0], thigh), 1 / 60, f)
    }
    expect(Array.from(twice.theta)).toEqual(Array.from(once.theta))
    expect(twice.counters).toEqual(once.counters)
  })
})

describe('the pelvis profile bins (B14, N2)', () => {
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
  it('counts a sample in the bin of its POSED location, not its rest bin', () => {
    const p = new PelvisProfile(angles, 0, 1, 0.25)
    p.rebuild([{ a: 0, y: 0.1, r: 0.5 }])
    expect(p.value[0]).toBe(0.5)
    // posed across the bin boundary: it counts above, and its rest bin takes the nearest populated value only
    p.rebuild([
      { a: 0, y: 0.3, r: 0.5 },
      { a: 0, y: 0.05, r: 0.2 },
    ])
    expect(p.value[1]).toBe(0.5)
    expect(p.value[0]).toBe(0.2)
  })

  it('fills an internal empty bin from the nearest populated bin of its column (the lower on a tie)', () => {
    const p = new PelvisProfile(angles, 0, 1, 0.25)
    p.rebuild([
      { a: 0, y: 0.1, r: 0.3 },
      { a: 0, y: 0.6, r: 0.7 },
      { a: Math.PI / 2, y: 0.1, r: 0.1 },
      { a: Math.PI, y: 0.1, r: 0.1 },
      { a: 3 * Math.PI / 2, y: 0.1, r: 0.1 },
    ])
    // bin 1 lies between bin 0 (0.3) and bin 2 (0.7) at equal distance: the lower one
    expect(p.value[1]).toBe(0.3)
    expect(p.value[3]).toBe(0.7)
  })

  it('resolves two adjacent wholly empty columns from populated bins of other columns, without a cycle', () => {
    const p = new PelvisProfile(angles, 0, 1, 0.25)
    p.rebuild([
      { a: 0, y: 0.1, r: 0.3 },
      { a: Math.PI, y: 0.9, r: 0.9 },
    ])
    // column 1 (π/2) is as far from column 0 as from column 2: same angle, the nearer height wins
    expect(p.value[1 * 4 + 0]).toBe(0.3)
    expect(p.value[1 * 4 + 3]).toBe(0.9)
    // column 3 likewise
    expect(p.value[3 * 4 + 0]).toBe(0.3)
    expect(Array.from(p.value).every((v) => v > 0)).toBe(true)
  })

  it('returns the top bin above the top bin centre and interpolates between columns', () => {
    const p = new PelvisProfile(angles, 0, 1, 0.25)
    p.rebuild(angles.flatMap((a, k) => [0.1, 0.4, 0.6, 0.9].map((y, b) => ({ a, y, r: 0.1 * (k + 1) + 0.01 * b }))))
    expect(p.query(0, 5)).toBeCloseTo(0.13, 12)
    expect(p.query(0, 0.875)).toBeCloseTo(0.13, 12)
    expect(p.query(Math.PI / 4, 0.875)).toBeCloseTo(0.5 * (0.13 + 0.23), 12)
    expect(p.query(0, 0.25)).toBeCloseTo(0.105, 12)
  })
})

describe('the segment–triangle distance', () => {
  it('is zero through the triangle and the true gap beside it', () => {
    const a: V3 = [0, 0, 0]
    const b: V3 = [1, 0, 0]
    const c: V3 = [0, 1, 0]
    expect(segmentTriangle([0.2, 0.2, -1], [0.2, 0.2, 1], a, b, c)).toBe(0)
    expect(segmentTriangle([0.2, 0.2, 0.5], [0.2, 0.2, 1], a, b, c)).toBeCloseTo(0.5, 12)
    expect(segmentTriangle([2, -1, 0.3], [2, 1, 0.3], a, b, c)).toBeCloseTo(Math.hypot(1, 0.3), 12)
  })
})
