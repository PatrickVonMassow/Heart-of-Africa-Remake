// The column driver of the driven garments (docs/garment-stage3-plan-1398.md
// sections 3.4 to 3.7): once per figure per frame, after the last writer of
// hips and leg bones, it tilts the 24 column bones outward so the cloth they
// carry clears the legs (body-only capsules), the pelvis (a skinned profile)
// and the ground, with a continuous per-figure state. It reads bone LOCALS and
// composes them in the figure frame (the skinned mesh's bind space), never
// `matrixWorld`. Mirrored step for step by scripts/villager/gamepath.py
// (`ColumnDriver`); the round trip compares the two (villagerRuntimePose.test.tsx).
import * as THREE from 'three/webgpu'
import { VILLAGER_ASSET } from '../config/balance'
import { topoOrder, type VillagerAsset } from './villagerAsset'
import type { GltfPerson } from './villagerFigureBody'

export type DriverConfig = typeof VILLAGER_ASSET.drivenGarments.driver
export type V3 = [number, number, number]

const DEG = Math.PI / 180
const ARM_BONES = ['upperArm.L', 'forearm.L', 'hand.L', 'upperArm.R', 'forearm.R', 'hand.R']
/** The eight body-only capsules: bone, and the bone whose head is its tail (null: the toe tip). */
const CAPSULE_BONES: Array<[string, string | null]> = [
  ['thigh.L', 'shin.L'],
  ['thigh.R', 'shin.R'],
  ['shin.L', 'foot.L'],
  ['shin.R', 'foot.R'],
  ['foot.L', 'toe.L'],
  ['foot.R', 'toe.R'],
  ['toe.L', null],
  ['toe.R', null],
]

// ---------- vector helpers (plain arrays, mirrored one to one in Python) ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3): number => Math.sqrt(dot(a, a))
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1))
const at = (a: ArrayLike<number>, i: number): V3 => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]

/** Rodrigues: v turned by θ about the unit axis k (right-handed). */
export function rotate(v: V3, k: V3, th: number): V3 {
  const c = Math.cos(th)
  const s = Math.sin(th)
  const kv = cross(k, v)
  const kd = dot(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]
}

/** A 4×4 column-major matrix applied to a point. */
const xform = (m: ArrayLike<number>, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]
/** A 4×4 column-major matrix applied to a direction. */
const xdir = (m: ArrayLike<number>, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
]

/** Closest distance from p to the segment ab. */
export function pointSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0
  return len(sub(p, add(a, mul(ab, t))))
}

/** A posed point's height in a capsule bone's REST frame, from the row of that frame (section 3.5). */
export function restHeight(ry: readonly number[], p: V3): number {
  return ry[0] * p[0] + ry[1] * p[1] + ry[2] * p[2] + ry[3]
}

/** Whether a capsule constrains a posed point: below the profile bottom in the capsule bone's
 *  rest frame (ry) OR in the posed hips frame (hy) (section 3.5, owner decision 03.11.2026 22:19). */
export function capsuleActive(ry: readonly number[], hy: readonly number[], p: V3, bottom: number): boolean {
  return restHeight(ry, p) < bottom || restHeight(hy, p) < bottom
}

/** The part of a triangle where a capsule is active (capsuleActive): below `bottom` in the rest
 *  frame, plus the part at or above it there that lies below it in the hips frame. */
export function clipActive(tri: readonly V3[], ry: readonly number[], hy: readonly number[], bottom: number): V3[][] {
  const out = clipBelow(tri, tri.map((p) => restHeight(ry, p)), bottom)
  for (const t of clipBelow(tri, tri.map((p) => -restHeight(ry, p)), -bottom, true)) out.push(...clipBelow(t, t.map((p) => restHeight(hy, p)), bottom))
  return out
}

/** The rest-frame height row of a bone: inverse(posed bone matrix)'s y row plus the bone's rest y. */
export function restHeightRow(m: ArrayLike<number>, restY: number): [number, number, number, number] {
  const e = new THREE.Matrix4().fromArray(Array.from(m)).invert().elements
  return [e[1], e[5], e[9], e[13] + restY]
}

/** Closest distance between the segments p1q1 and p2q2 (Ericson 5.1.9). */
export function segmentSegment(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1)
  const d2 = sub(q2, p2)
  const r = sub(p1, p2)
  const a = dot(d1, d1)
  const e = dot(d2, d2)
  const f = dot(d2, r)
  const eps = 1e-12
  let s: number
  let t: number
  if (a <= eps && e <= eps) return len(r)
  if (a <= eps) {
    s = 0
    t = Math.min(1, Math.max(0, f / e))
  } else {
    const c = dot(d1, r)
    if (e <= eps) {
      t = 0
      s = Math.min(1, Math.max(0, -c / a))
    } else {
      const b = dot(d1, d2)
      const den = a * e - b * b
      s = den > eps ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = Math.min(1, Math.max(0, -c / a))
      } else if (t > 1) {
        t = 1
        s = Math.min(1, Math.max(0, (b - c) / a))
      }
    }
  }
  return len(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t))))
}

/** Closest point on the triangle abc to p (Ericson 5.1.5). */
export function pointTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab = sub(b, a)
  const ac = sub(c, a)
  const ap = sub(p, a)
  const d1 = dot(ab, ap)
  const d2 = dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return a
  const bp = sub(p, b)
  const d3 = dot(ab, bp)
  const d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return b
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)))
  const cp = sub(p, c)
  const d5 = dot(ab, cp)
  const d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return c
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))))
  const den = 1 / (va + vb + vc)
  return add(a, add(mul(ab, vb * den), mul(ac, vc * den)))
}

/**
 * The part of triangle `pts` whose height `h` (affine over the triangle, given
 * at its corners) lies below `bottom` (or at it, `inclusive`), as 0, 1 or 2
 * triangles. The inclusive side keeps a triangle lying wholly at the height.
 */
export function clipBelow(pts: readonly V3[], h: readonly number[], bottom: number, inclusive = false): V3[][] {
  const poly: V3[] = []
  const inside = (x: number) => (inclusive ? x <= bottom : x < bottom)
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3
    const inI = inside(h[i])
    if (inI) poly.push(pts[i])
    if (inI !== inside(h[j])) {
      const u = (bottom - h[i]) / (h[j] - h[i])
      poly.push([0, 1, 2].map((e) => pts[i][e] + (pts[j][e] - pts[i][e]) * u) as V3)
    }
  }
  const out: V3[][] = []
  for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0], poly[i], poly[i + 1]])
  return out
}

/** Closest distance between the segment pq and the triangle abc (0 where they cross). */
export function segmentTriangle(p: V3, q: V3, a: V3, b: V3, c: V3): number {
  // crossing (Möller–Trumbore on the segment)
  const e1 = sub(b, a)
  const e2 = sub(c, a)
  const d = sub(q, p)
  const h = cross(d, e2)
  const det = dot(e1, h)
  if (Math.abs(det) > 1e-14) {
    const s = sub(p, a)
    const u = dot(s, h) / det
    const qv = cross(s, e1)
    const v = dot(d, qv) / det
    const t = dot(e2, qv) / det
    if (u >= 0 && v >= 0 && u + v <= 1 && t >= 0 && t <= 1) return 0
  }
  return Math.min(
    len(sub(p, pointTriangle(p, a, b, c))),
    len(sub(q, pointTriangle(q, a, b, c))),
    segmentSegment(p, q, a, b),
    segmentSegment(p, q, b, c),
    segmentSegment(p, q, c, a),
  )
}

// ---------- frames ----------

/**
 * Every bone's matrix in the figure frame (the skinned mesh's bind space),
 * composed from the bones' local position, quaternion and scale along the
 * parent chain; the root's parent is the identity (plan section 3.4, B2).
 * `out` holds 16 numbers per bone, column-major.
 */
export function composeFigureMatrices(order: readonly number[], parents: readonly number[], bones: readonly THREE.Object3D[], out: Float64Array): Float64Array {
  const m = new THREE.Matrix4()
  for (const i of order) {
    const b = bones[i]
    m.compose(b.position, b.quaternion, b.scale)
    const p = parents[i]
    if (p < 0) {
      for (let k = 0; k < 16; k++) out[i * 16 + k] = m.elements[k]
    } else {
      mat4Mul(out, p * 16, m.elements, 0, out, i * 16)
    }
  }
  return out
}

/** out[o..] = a[ao..] · b[bo..] (column-major 4×4). */
function mat4Mul(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, out: Float64Array, o: number): void {
  const r = new Array<number>(16)
  for (let c = 0; c < 4; c++) {
    for (let rr = 0; rr < 4; rr++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[ao + k * 4 + rr] * b[bo + c * 4 + k]
      r[c * 4 + rr] = s
    }
  }
  for (let k = 0; k < 16; k++) out[o + k] = r[k]
}

/** Skin a rest point with four influences by the bones' skin matrices (world · inverse bind = world · T(−rest head)). */
function skinPoint(p: V3, idx: ArrayLike<number>, w: ArrayLike<number>, o: number, M: ArrayLike<number>, rest: ArrayLike<number>, override?: (bone: number) => ArrayLike<number> | null): V3 {
  let x = 0
  let y = 0
  let z = 0
  for (let c = 0; c < 4; c++) {
    const wt = w[o + c]
    if (!(wt > 0)) continue
    const i = idx[o + c]
    const m = (override && override(i)) || sliceMat(M, i)
    const local: V3 = [p[0] - rest[i * 3], p[1] - rest[i * 3 + 1], p[2] - rest[i * 3 + 2]]
    const q = xform(m, local)
    x += q[0] * wt
    y += q[1] * wt
    z += q[2] * wt
  }
  return [x, y, z]
}

const sliceMat = (M: ArrayLike<number>, i: number): ArrayLike<number> => {
  const out = new Array<number>(16)
  for (let k = 0; k < 16; k++) out[k] = M[i * 16 + k]
  return out
}

// ---------- the static rig of one person ----------

/** A leg capsule: the bone it rides, its rest ends (figure frame) and its radius. */
export interface Capsule {
  bone: number
  a: V3
  b: V3
  radius: number
}

/** The pelvis samples (section 3.5): rest positions and four influences each. */
export interface PelvisSamples {
  pos: number[]
  idx: number[]
  w: number[]
}

/**
 * A worn driven form's runtime data (built by the driven builder, plan
 * sections 3.3 and 3.8; none is generated before that sub-step). Positions
 * in the figure frame at rest, four influences per vertex.
 */
export interface DrivenFormRig {
  /** Per column its anchor: two rest points with their influences, interpolated at t. */
  anchors: Array<{ a: V3; ia: number[]; wa: number[]; b: V3; ib: number[]; wb: number[]; t: number }>
  /** The panel: rest positions, influences, triangles, row-0 (exempt) flags, the cloth clearance and the row per vertex. */
  panel: { pos: number[]; idx: number[]; w: number[]; index: number[]; exempt: number[]; clearance: number[]; row: number[] }
  /** The cloth clearance at a segment's stations (figure units). */
  clearance: number
  /** The highest junction height (the pelvis profile's top). */
  top: number
}

export interface ColumnRig {
  bones: number
  order: number[]
  parents: number[]
  rest: number[]
  hips: number
  upper: number[]
  lower: number[]
  /** Per column its rest radial and tangential directions in the hips frame (rk, tk = rk × up). */
  radial: V3[]
  tangent: V3[]
  /** Per column: rest offset of the upper head from the hips head, upper → knee, knee → ankle. */
  headOffset: V3[]
  upperOffset: V3[]
  lowerOffset: V3[]
  capsules: Capsule[]
  pelvis: PelvisSamples
  /** Profile: rest-frame heights of its bottom and top, bin height, the margin added to its radius
   *  and the band above the bottom the margin applies in (section 3.5). */
  profile: { bottom: number; top: number; bin: number; margin: number; band: number }
  crotch: number
  clearance: number
  ground: number
  form: DrivenFormRig | null
}

const ARM_SET = (asset: VillagerAsset) => new Set(ARM_BONES.map((n) => asset.bones.indexOf(n)))

/**
 * The static rig of one hung person (sections 3.5 and 3.7): column rest data,
 * the eight body-only capsules (radius over the drawn vertices with weight
 * above 0.1 on the bone, at rest after the hang, plus the exported margin ×
 * scale), and the pelvis samples (arm weight ≤ pelvisArm between the crotch −
 * one bin and the top, thinned by farthest-point selection).
 */
export function columnRig(asset: VillagerAsset, person: Pick<GltfPerson, 'rest' | 'geometry' | 'frame' | 'p' | 'columnAnkles'>, form: DrivenFormRig | null = null, cfg: DriverConfig = VILLAGER_ASSET.drivenGarments.driver): ColumnRig {
  const cols = asset.columns
  if (!cols || !person.columnAnkles) throw new Error('columnRig: the asset carries no column bones')
  const bi = (n: string) => asset.bones.indexOf(n)
  const rest = Array.from(person.rest)
  const hips = bi('hips')
  const hipsAt = at(rest, hips)
  const upper = cols.bones.upper.map(bi)
  const lower = cols.bones.lower.map(bi)
  const scale = person.frame.scale
  const radial: V3[] = []
  const tangent: V3[] = []
  const headOffset: V3[] = []
  const upperOffset: V3[] = []
  const lowerOffset: V3[] = []
  upper.forEach((u, k) => {
    const U = at(rest, u)
    const L = at(rest, lower[k])
    const A = at(person.columnAnkles!, k)
    const h = sub(U, hipsAt)
    const r = norm([h[0], 0, h[2]])
    radial.push(r)
    tangent.push(norm(cross(r, [0, 1, 0])))
    headOffset.push(h)
    upperOffset.push(sub(L, U))
    lowerOffset.push(sub(A, L))
  })
  const g = person.geometry
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute
  const H = person.p.stature
  const crotch = hipsAt[1] - cfg.crotch * H
  const bin = cfg.pelvisBin * H
  const top = form ? form.top : Math.max(...upper.map((u) => rest[u * 3 + 1]))
  const bottom = crotch - bin
  const capsules: Capsule[] = CAPSULE_BONES.flatMap(([bone, tail]) => {
    const i = bi(bone)
    const a = at(rest, i)
    let b: V3
    const mine: V3[] = []
    // a thigh's radius only from drawn vertices below the profile bottom: above it the profile governs (section 3.5)
    const thigh = bone.startsWith('thigh.')
    for (let v = 0; v < pos.count; v++) {
      if (thigh && !(pos.getY(v) < bottom)) continue
      for (let c = 0; c < 4; c++) {
        if (si.getComponent(v, c) === i && sw.getComponent(v, c) > 0.1) {
          mine.push([pos.getX(v), pos.getY(v), pos.getZ(v)])
          break
        }
      }
    }
    if (tail) {
      b = at(rest, bi(tail))
    } else {
      // the toe tip: along the foot → toe axis, as far as the toe's vertices reach
      const side = bone.slice(-1)
      const u = norm(sub(a, at(rest, bi(`foot.${side}`))))
      let reach = 0
      for (const p of mine) reach = Math.max(reach, dot(sub(p, a), u))
      b = add(a, mul(u, reach))
    }
    const margin = (cols.capsules[bone] ?? 0) * scale
    if (!thigh) {
      let radius = 0
      for (const p of mine) radius = Math.max(radius, pointSegment(p, a, b))
      return [{ bone: i, a, b, radius: radius + margin }]
    }
    // a thigh tapers per height: slabs of thighSlab × H along the bone, each a capsule with the
    // radius of the vertices projecting into it, so the hem meets the hem's radius and not the
    // buttock's (owner decision 04.11.2026, section 3.5); an empty slab adds no capsule
    const ab = sub(b, a)
    const l2 = dot(ab, ab)
    const n = Math.max(1, Math.round(Math.sqrt(l2) / (cfg.thighSlab * H)))
    const ends = (j: number): [V3, V3] => [add(a, mul(ab, j / n)), add(a, mul(ab, (j + 1) / n))]
    const radii = new Array<number>(n).fill(-1)
    for (const p of mine) {
      const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2))
      const j = Math.min(n - 1, Math.floor(t * n))
      radii[j] = Math.max(radii[j], pointSegment(p, ...ends(j)))
    }
    return radii.flatMap((r, j) => (r < 0 ? [] : [{ bone: i, a: ends(j)[0], b: ends(j)[1], radius: r + margin }]))
  })
  const arm = ARM_SET(asset)
  const thighs = new Set([bi('thigh.L'), bi('thigh.R')])
  const cand: number[] = []
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v)
    if (y > top) continue
    let aw = 0
    let tw = 0
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(v, c)
      if (arm.has(si.getComponent(v, c))) aw += w
      if (thighs.has(si.getComponent(v, c))) tw += w
    }
    if (aw > cfg.pelvisArm) continue
    // below the profile bottom only the thigh vertices: posed at or above the bottom in the hips
    // frame (a lifted thigh) they count where they are drawn, posed below it they are dropped
    // (owner decision 04.11.2026, section 3.5)
    if (y < bottom && !(tw > 0.1)) continue
    cand.push(v)
  }
  // per profile cell (column × bin, the bins continued below the bottom for the thigh input) the
  // widest rest vertex is kept; the remainder fills the sample cap by farthest-point selection
  // (owner decision 04.11.2026, section 3.5)
  const colAngles = radial.map((r) => Math.atan2(r[2], r[0]))
  const widest = new Map<number, { v: number; r: number }>()
  for (const v of cand) {
    const x = pos.getX(v) - hipsAt[0]
    const z = pos.getZ(v) - hipsAt[2]
    const a = Math.atan2(z, x)
    let k = 0
    colAngles.forEach((c, j) => {
      if (angleDist(a, c) < angleDist(a, colAngles[k]) - 1e-12) k = j
    })
    const key = k * 4096 + Math.floor((pos.getY(v) - bottom) / bin) + 2048
    const r = Math.hypot(x, z)
    const w = widest.get(key)
    if (!w || r > w.r) widest.set(key, { v, r })
  }
  const kept = new Set([...widest.values()].map((w) => w.v))
  const rest_ = cand.filter((v) => !kept.has(v))
  const chosen = [...kept, ...farthestPoints(rest_.map((v) => [pos.getX(v), pos.getY(v), pos.getZ(v)] as V3), Math.max(0, cfg.pelvisSamples - kept.size)).map((k) => rest_[k])]
  if (chosen.length < 30) throw new Error(`columnRig: ${chosen.length} pelvis samples, at least 30 needed`)
  const pelvis: PelvisSamples = { pos: [], idx: [], w: [] }
  for (const v of chosen) {
    pelvis.pos.push(pos.getX(v), pos.getY(v), pos.getZ(v))
    for (let c = 0; c < 4; c++) {
      pelvis.idx.push(si.getComponent(v, c))
      pelvis.w.push(sw.getComponent(v, c))
    }
  }
  return {
    bones: asset.bones.length,
    order: topoOrder(asset.parents),
    parents: [...asset.parents],
    rest,
    hips,
    upper,
    lower,
    radial,
    tangent,
    headOffset,
    upperOffset,
    lowerOffset,
    capsules,
    pelvis,
    profile: { bottom, top, bin, margin: cfg.profileMargin * scale, band: cfg.profileMarginBand * H },
    crotch,
    clearance: form ? form.clearance : cfg.clearance * scale,
    ground: cfg.groundClearance * scale,
    form,
  }
}

/** Farthest-point selection of at most n of the points: the first point first, ties to the lower index. */
export function farthestPoints(pts: V3[], n: number): number[] {
  if (pts.length <= n) return pts.map((_, k) => k)
  const out = [0]
  const d = pts.map((p) => len(sub(p, pts[0])))
  while (out.length < n) {
    let best = -1
    let bd = -1
    for (let k = 0; k < pts.length; k++) {
      if (d[k] > bd) {
        bd = d[k]
        best = k
      }
    }
    out.push(best)
    for (let k = 0; k < pts.length; k++) d[k] = Math.min(d[k], len(sub(pts[k], pts[best])))
  }
  return out
}

// ---------- the pelvis profile (section 3.5, check 4 N2) ----------

/** Per column and height bin, the largest posed radius among the samples posed in it. */
export class PelvisProfile {
  readonly columns: number
  readonly bins: number
  readonly value: Float64Array
  readonly angles: readonly number[]
  readonly bottom: number
  readonly top: number
  readonly bin: number
  /** The columns sorted by wrapped angle about the circle (the angles are fixed). */
  private readonly order: ReadonlyArray<{ c: number; k: number }>
  /** Added to a query below bottom + band (the profile margin × scale, section 3.5's named response). */
  readonly margin: number
  readonly band: number
  constructor(angles: readonly number[], bottom: number, top: number, bin: number, margin = 0, band = Infinity) {
    this.margin = margin
    this.band = band
    this.angles = angles
    this.order = angles.map((c, k) => ({ c: wrap(c), k })).sort((p, q) => p.c - q.c)
    this.bottom = bottom
    this.top = top
    this.bin = bin
    this.columns = angles.length
    this.bins = Math.max(1, Math.ceil((top - bottom) / bin - 1e-9))
    this.value = new Float64Array(this.columns * this.bins)
  }

  /** The column whose window (± half the spacing) holds angle a. */
  column(a: number): number {
    let best = 0
    let bd = Infinity
    this.angles.forEach((c, k) => {
      const d = angleDist(a, c)
      if (d < bd - 1e-12) {
        bd = d
        best = k
      }
    })
    return best
  }

  binOf(y: number): number {
    return Math.min(this.bins - 1, Math.max(0, Math.floor((y - this.bottom) / this.bin)))
  }

  /** Rebuild from posed samples (angle, rest-frame height, radius), each counted where it is drawn. */
  rebuild(samples: ReadonlyArray<{ a: number; y: number; r: number }>): void {
    const n = this.columns * this.bins
    const filled = new Uint8Array(n)
    this.value.fill(0)
    for (const s of samples) {
      // a sample posed below the bottom is dropped, not clamped into the bottom bin (section 3.5)
      if (s.y < this.bottom) continue
      const i = this.column(s.a) * this.bins + this.binOf(s.y)
      if (!filled[i] || s.r > this.value[i]) this.value[i] = s.r
      filled[i] = 1
    }
    // empty bins: the nearest POPULATED bin, same column first (lower on a tie),
    // else other columns by angular, then height distance, the larger value on a tie
    const out = Float64Array.from(this.value)
    for (let k = 0; k < this.columns; k++) {
      for (let b = 0; b < this.bins; b++) {
        if (filled[k * this.bins + b]) continue
        let found = -1
        for (let d = 1; d < this.bins && found < 0; d++) {
          if (b - d >= 0 && filled[k * this.bins + b - d]) found = k * this.bins + b - d
          else if (b + d < this.bins && filled[k * this.bins + b + d]) found = k * this.bins + b + d
        }
        if (found >= 0) {
          out[k * this.bins + b] = this.value[found]
          continue
        }
        let best = -1
        let ba = Infinity
        let bh = Infinity
        for (let j = 0; j < this.columns; j++) {
          if (j === k) continue
          const da = angleDist(this.angles[j], this.angles[k])
          for (let c = 0; c < this.bins; c++) {
            const i = j * this.bins + c
            if (!filled[i]) continue
            const dh = Math.abs(c - b)
            if (da < ba - 1e-12 || (Math.abs(da - ba) <= 1e-12 && (dh < bh || (dh === bh && this.value[i] > this.value[best])))) {
              best = i
              ba = da
              bh = dh
            }
          }
        }
        if (best < 0) throw new Error('PelvisProfile: no populated bin')
        out[k * this.bins + b] = this.value[best]
      }
    }
    this.value.set(out)
  }

  /** Rp(a, y): linear between the two bin centres round y and the two columns round a. */
  query(a: number, y: number): number {
    // the two columns round a, sorted by angle about the circle
    let k0 = 0
    let k1 = 0
    let f = 0
    const n = this.columns
    const order = this.order
    const aw = wrap(a)
    for (let i = 0; i < n; i++) {
      const p = order[i]
      const q = order[(i + 1) % n]
      const span = i + 1 < n ? q.c - p.c : q.c + 2 * Math.PI - p.c
      const d = aw >= p.c ? aw - p.c : aw + 2 * Math.PI - p.c
      if (d <= span + 1e-12) {
        k0 = p.k
        k1 = q.k
        f = span > 0 ? d / span : 0
        break
      }
    }
    return (1 - f) * this.columnAt(k0, y) + f * this.columnAt(k1, y) + (y < this.bottom + this.band ? this.margin : 0)
  }

  private columnAt(k: number, y: number): number {
    const c = (y - this.bottom) / this.bin - 0.5
    if (c <= 0) return this.value[k * this.bins]
    if (c >= this.bins - 1) return this.value[k * this.bins + this.bins - 1]
    const b = Math.floor(c)
    const t = c - b
    return (1 - t) * this.value[k * this.bins + b] + t * this.value[k * this.bins + b + 1]
  }
}

const wrap = (a: number): number => {
  const t = a % (2 * Math.PI)
  return t < 0 ? t + 2 * Math.PI : t
}
const angleDist = (a: number, b: number): number => {
  const d = wrap(a - b)
  return Math.min(d, 2 * Math.PI - d)
}

// ---------- the driver ----------

/** What the final evaluation left after the repair rounds (DEV counter, mirrored in the report). */
export interface DriverCounters {
  frames: number
  residual: number
  groundFallback: number
  repairs: number
  jointSearches: number
  /** Final steps past the rate limit (only a larger step feasible, a repair, the joint search or the ground fallback). */
  rateBreaks: number
}

/** The posed frame the solve reads: everything that does not depend on a column angle. */
interface Posed {
  M: Float64Array
  hipsM: number[]
  /** hips frame: origin, up, inverse matrix, and the hips' world rotation applied to directions. */
  origin: V3
  up: V3
  hipsInv: THREE.Matrix4
  head: V3[]
  radial: V3[]
  tangent: V3[]
  /** ry: the capsule bone's rest-frame height row (restHeight); a capsule constrains a point below
   *  the profile bottom in that frame or in the hips frame (capsuleActive, section 3.5). */
  capsules: Array<{ a: V3; b: V3; radius: number; ry: [number, number, number, number] }>
  /** The posed hips frame's height row (restHeight), the frame the profile is read in. */
  hy: [number, number, number, number]
  profile: PelvisProfile
  gravity: number[]
}

/** Segment s: s < 12 the upper of column s, else the lower of column s − 12. */
export class ColumnDriver {
  /** The continuous state: per segment its tilt θs (rad), and whether the ground fallback holds it. */
  readonly theta: Float64Array
  readonly held: Uint8Array
  readonly counters: DriverCounters = { frames: 0, residual: 0, groundFallback: 0, repairs: 0, jointSearches: 0, rateBreaks: 0 }
  /** The last frame's final violations per segment (≤ 0 satisfied), for tests and the report. */
  readonly violation: Float64Array
  private fresh = true
  private readonly n: number
  private readonly M: Float64Array
  private cur: Float64Array
  /** This frame's ground-fallback holds (start: last frame's). */
  private hold: Uint8Array
  private posed: Posed | null = null
  private dt = 0
  private rated = true
  private readonly carried: Array<{ vertices: number[]; triangles: number[]; columns: number[] }>
  /** Per segment its stations on the cloth (clothStations); null without a worn form. */
  private readonly cloth: Array<{ at: Array<{ v0: number; v1: number; u: number }>; columns: number[] }> | null

  readonly rig: ColumnRig
  readonly cfg: DriverConfig
  constructor(rig: ColumnRig, cfg: DriverConfig = VILLAGER_ASSET.drivenGarments.driver) {
    this.rig = rig
    this.cfg = cfg
    this.n = rig.upper.length
    this.theta = new Float64Array(2 * this.n)
    this.held = new Uint8Array(2 * this.n)
    this.cur = new Float64Array(2 * this.n)
    this.hold = new Uint8Array(2 * this.n)
    this.violation = new Float64Array(2 * this.n)
    this.M = new Float64Array(rig.bones * 16)
    this.carried = this.carriedSets()
    this.cloth = this.clothStations()
  }

  /** Back to the gravity solution, solved without the rate limit on the next frame
   *  (figure creation, teleport or placement, a changed form, re-entry after a skip). */
  reset(): void {
    this.fresh = true
    // a replay later in the same frame restores this snapshot: it keeps the reset
    if (this.snap) this.snap.fresh = true
  }

  private frame = -1
  private snap: { theta: Float64Array; held: Uint8Array; fresh: boolean; counters: DriverCounters } | null = null

  /** One game frame, identified by `frame`: a second call in the same frame (the caller
   *  retargets after the figure's own frame) re-solves from the state before that frame. */
  stepFrame(bones: readonly THREE.Object3D[], dt: number, frame: number): void {
    if (frame === this.frame && this.snap) {
      this.theta.set(this.snap.theta)
      this.held.set(this.snap.held)
      this.fresh = this.snap.fresh
      Object.assign(this.counters, this.snap.counters)
    } else {
      this.frame = frame
      this.snap = { theta: Float64Array.from(this.theta), held: Uint8Array.from(this.held), fresh: this.fresh, counters: { ...this.counters } }
    }
    this.step(bones, dt)
  }

  /** One frame: read the posed bones, solve, write the column locals. */
  step(bones: readonly THREE.Object3D[], dt: number): void {
    this.solve(bones, dt)
    this.write(bones)
  }

  /** The solve alone (the column bones' own locals are never read). */
  solve(bones: readonly THREE.Object3D[], dt: number): Float64Array {
    const cfg = this.cfg
    const reset = this.fresh || !(dt > 0) || dt > cfg.resetDt
    this.dt = reset ? 0 : dt
    this.rated = !reset
    this.posed = this.pose(bones)
    const P = this.posed
    if (reset) {
      // the gravity solution: the relaxation starts at the target
      for (let s = 0; s < 2 * this.n; s++) {
        this.theta[s] = s < this.n ? 0 : P.gravity[s - this.n]
        this.held[s] = 0
      }
      this.fresh = false
    }
    this.cur = Float64Array.from(this.theta)
    this.hold = Uint8Array.from(this.held)
    // two passes, the second with the neighbours' final angles
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 0; s < 2 * this.n; s++) this.cur[s] = this.search(s, false)
    }
    this.finalEvaluation()
    this.counters.frames++
    const lim = cfg.omegaMax * DEG * this.dt
    for (let s = 0; s < 2 * this.n; s++) {
      if (this.rated && Math.abs(this.cur[s] - this.theta[s]) > lim + 1e-12) this.counters.rateBreaks++
      this.theta[s] = this.cur[s]
      this.held[s] = this.hold[s] && this.cur[s] > cfg.thetaMax * DEG + 1e-9 ? 1 : 0
    }
    return this.theta
  }

  /** Write the solved columns as parent-local values (section 3.4 step 3). */
  write(bones: readonly THREE.Object3D[]): void {
    const P = this.posed
    if (!P) return
    const rig = this.rig
    const q = new THREE.Quaternion()
    const axis = new THREE.Vector3()
    for (let k = 0; k < this.n; k++) {
      const u = bones[rig.upper[k]]
      const l = bones[rig.lower[k]]
      const h = new THREE.Vector3(...P.head[k]).applyMatrix4(P.hipsInv)
      u.position.copy(h)
      axis.set(...rig.tangent[k])
      u.quaternion.copy(q.setFromAxisAngle(axis, this.theta[k]))
      u.scale.set(1, 1, 1)
      l.position.set(...rig.upperOffset[k])
      l.quaternion.copy(q.setFromAxisAngle(axis, this.theta[this.n + k] - this.theta[k]))
      l.scale.set(1, 1, 1)
    }
  }

  // ----- the posed frame -----

  private pose(bones: readonly THREE.Object3D[]): Posed {
    const rig = this.rig
    const M = composeFigureMatrices(rig.order, rig.parents, bones, this.M)
    const hipsM = Array.from(M.subarray(rig.hips * 16, rig.hips * 16 + 16))
    const hipsAt = at(rig.rest, rig.hips)
    const origin = xform(hipsM, [0, 0, 0])
    const up = norm(xdir(hipsM, [0, 1, 0]))
    const hipsInv = new THREE.Matrix4().fromArray(hipsM).invert()
    const head: V3[] = []
    const radial: V3[] = []
    const tangent: V3[] = []
    const form = rig.form
    for (let k = 0; k < this.n; k++) {
      radial.push(norm(xdir(hipsM, rig.radial[k])))
      tangent.push(norm(xdir(hipsM, rig.tangent[k])))
      if (form) {
        const an = form.anchors[k]
        const pa = skinPoint(an.a, an.ia, an.wa, 0, M, rig.rest)
        const pb = skinPoint(an.b, an.ib, an.wb, 0, M, rig.rest)
        head.push(add(mul(pa, 1 - an.t), mul(pb, an.t)))
      } else {
        head.push(xform(hipsM, rig.headOffset[k]))
      }
    }
    const capsules = rig.capsules.map((c) => {
      const m = sliceMat(M, c.bone)
      const r = at(rig.rest, c.bone)
      return { a: xform(m, sub(c.a, r)), b: xform(m, sub(c.b, r)), radius: c.radius, ry: restHeightRow(m, r[1]) }
    })
    const angles = rig.radial.map((r) => Math.atan2(r[2], r[0]))
    const profile = new PelvisProfile(angles, rig.profile.bottom, rig.profile.top, rig.profile.bin, rig.profile.margin, rig.profile.band)
    const samples: Array<{ a: number; y: number; r: number }> = []
    const pv = rig.pelvis
    for (let k = 0; k < pv.pos.length / 3; k++) {
      const p = skinPoint(at(pv.pos, k), pv.idx, pv.w, k * 4, M, rig.rest)
      samples.push(this.hipsLocal(p, hipsInv, hipsAt))
    }
    profile.rebuild(samples)
    // the gravity target of each lower segment: world down's tilt in its radial plane
    const gravity = radial.map((r) => {
      const down: V3 = [0, -1, 0]
      const th = Math.atan2(dot(down, r), -dot(down, up))
      return Math.min(this.cfg.thetaMax * DEG, Math.max(0, this.cfg.gravityBlend * th))
    })
    return { M, hipsM, origin, up, hipsInv, head, radial, tangent, capsules, hy: restHeightRow(hipsM, hipsAt[1]), profile, gravity }
  }

  /** A figure-frame point as (angle, rest-frame height, radius) in the hips frame. */
  private hipsLocal(p: V3, hipsInv: THREE.Matrix4, hipsAt: V3): { a: number; y: number; r: number } {
    // Vector3.applyMatrix4 without the allocation
    const e = hipsInv.elements
    const w = 1 / (e[3] * p[0] + e[7] * p[1] + e[11] * p[2] + e[15])
    const x = (e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12]) * w
    const y = (e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13]) * w
    const z = (e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]) * w
    return { a: Math.atan2(z, x), y: y + hipsAt[1], r: Math.hypot(x, z) }
  }

  // ----- segment geometry -----

  /** The top pivot of segment s for the given angles (the lower hangs from its upper's knee point). */
  private pivot(s: number, th: ArrayLike<number>): V3 {
    const P = this.posed!
    if (s < this.n) return P.head[s]
    const k = s - this.n
    return add(P.head[k], this.direction(k, th[k], this.rig.upperOffset[k]))
  }

  /** A rest offset turned by θ about the column's hips-local tangent, then carried by the hips
   *  matrix: the order the skeleton composes the written locals in (a nonuniform hips scale acts
   *  after the column's rotation). */
  private direction(k: number, th: number, offset: V3): V3 {
    const P = this.posed!
    return xdir(P.hipsM, rotate(offset, this.rig.tangent[k], th))
  }

  /** The stations of segment s at angle θ, with the given angles for the rest: with a worn form
   *  its own skinned panel points (clothStations, possibly none), else points on its bone line. */
  private stations(s: number, theta: number, th: ArrayLike<number>): V3[] {
    if (this.cloth) {
      const own = this.cloth[s]
      if (!own.at.length) return []
      const P = this.posed!
      const rig = this.rig
      const panel = rig.form!.panel
      const trial = Float64Array.from(th)
      trial[s] = theta
      const mats = new Map<number, number[]>()
      for (const k of own.columns) {
        const m = this.columnMatrices(k, trial)
        mats.set(rig.upper[k], m.U)
        mats.set(rig.lower[k], m.L)
      }
      const skin = (v: number) => skinPoint(at(panel.pos, v), panel.idx, panel.w, v * 4, P.M, rig.rest, (i) => mats.get(i) ?? null)
      return own.at.map(({ v0, v1, u }) => add(mul(skin(v0), 1 - u), mul(skin(v1), u)))
    }
    const k = s % this.n
    const top = this.pivot(s, th)
    const off = s < this.n ? this.rig.upperOffset[k] : this.rig.lowerOffset[k]
    const d = this.direction(k, theta, off)
    return this.cfg.stations.map((f) => add(top, mul(d, f)))
  }

  // ----- constraints -----

  /** The posed obstacles of a frame (the containment test): the eight capsules, and whether a
   *  figure-frame point lies inside the skinned pelvis profile (from its bottom up; above the top
   *  bin the top bin's value holds, section 3.5). */
  obstacles(bones: readonly THREE.Object3D[]): { capsules: Posed['capsules']; hy: Posed['hy']; inProfile: (p: V3) => boolean; profileExcess: (p: V3) => number } {
    const P = this.pose(bones)
    const rig = this.rig
    const hipsAt = at(rig.rest, rig.hips)
    return {
      capsules: P.capsules,
      hy: P.hy,
      inProfile: (p: V3) => {
        const h = this.hipsLocal(p, P.hipsInv, hipsAt)
        return h.y >= rig.profile.bottom && h.r <= P.profile.query(h.a, h.y)
      },
      profileExcess: (p: V3) => {
        const h = this.hipsLocal(p, P.hipsInv, hipsAt)
        return h.y >= rig.profile.bottom ? h.r - P.profile.query(h.a, h.y) : Infinity
      },
    }
  }

  /** Segment s's stations under this frame's solution (tests, the report). */
  stationsOf(s: number): V3[] {
    return this.stations(s, this.theta[s], this.theta)
  }

  /** Segment s evaluated at θ against the current solution of this frame (tests, the report). */
  evaluateSegment(s: number, theta: number, triangles = true): { worst: number; ground: number; tri: number } {
    return this.evaluate(s, theta, this.cur, triangles)
  }

  /** Worst deficit of segment s at θ (≤ 0: every constraint met), the others at `th`. */
  private evaluate(s: number, theta: number, th: Float64Array, triangles: boolean): { worst: number; ground: number; tri: number } {
    const P = this.posed!
    const rig = this.rig
    const cfg = this.cfg
    const k = s % this.n
    const level = s < this.n ? 0 : this.n
    const trial = Float64Array.from(th)
    trial[s] = theta
    const st = this.stations(s, theta, trial)
    const nb = [level + ((k + this.n - 1) % this.n), level + ((k + 1) % this.n)]
    const nst = nb.map((o) => this.stations(o, trial[o], trial))
    const segLen = len(s < this.n ? rig.upperOffset[k] : rig.lowerOffset[k])
    let worst = -Infinity
    let ground = -Infinity
    const hipsAt = at(rig.rest, rig.hips)
    st.forEach((p, j) => {
      // the chord to the farther neighbour that has cloth stations (none: no chord)
      const chord = Math.max(0, ...nst.filter((o) => o.length).map((o) => len(sub(p, o[j]))))
      const h = this.hipsLocal(p, P.hipsInv, hipsAt)
      // the profile at or above its bottom in the hips frame; a capsule below the profile bottom
      // in its own bone's rest frame or in the hips frame (section 3.5)
      const above = h.y >= rig.profile.bottom
      P.capsules.forEach((c) => {
        if (!capsuleActive(c.ry, P.hy, p, rig.profile.bottom)) return
        const C = c.radius + rig.clearance
        const target = Math.sqrt(C * C + (chord / 2) * (chord / 2))
        worst = Math.max(worst, target - pointSegment(p, c.a, c.b))
      })
      if (above) worst = Math.max(worst, P.profile.query(h.a, h.y) + rig.clearance - h.r)
      const g = rig.ground - p[1]
      ground = Math.max(ground, g)
      worst = Math.max(worst, g)
    })
    // neighbour limit (relaxed only between two fallback segments)
    for (const o of nb) {
      if (this.hold[s] && this.hold[o]) continue
      worst = Math.max(worst, (Math.abs(theta - trial[o]) - cfg.neighbourLimit * DEG) * segLen)
    }
    // bounds
    const bound = (this.hold[s] ? cfg.thetaGround : cfg.thetaMax) * DEG
    worst = Math.max(worst, (theta - bound) * segLen, -theta * segLen)
    let tri = 0
    if (triangles && rig.form) {
      // an upper's trial carries its lower at the lower's current local rotation (B17)
      if (s < this.n) trial[this.n + k] = th[this.n + k] + (theta - th[s])
      tri = this.triangleDepth(s, trial)
      if (tri > 0) worst = Math.max(worst, tri)
    }
    return { worst, ground, tri }
  }

  /** The column bone matrices for the given angles (upper and lower of column k),
   *  composed exactly as the skeleton composes the written locals. */
  private columnMatrices(k: number, th: ArrayLike<number>): { U: number[]; L: number[] } {
    const P = this.posed!
    const rig = this.rig
    const axis = new THREE.Vector3(...rig.tangent[k])
    const one = new THREE.Vector3(1, 1, 1)
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...P.head[k]).applyMatrix4(P.hipsInv), new THREE.Quaternion().setFromAxisAngle(axis, th[k]), one)
    const U = new THREE.Matrix4().fromArray(P.hipsM).multiply(local)
    const lower = new THREE.Matrix4().compose(new THREE.Vector3(...rig.upperOffset[k]), new THREE.Quaternion().setFromAxisAngle(axis, th[this.n + k] - th[k]), one)
    const L = U.clone().multiply(lower)
    return { U: U.elements.slice(), L: L.elements.slice() }
  }

  /** The panel vertices and triangles each segment carries (nonzero weight on its bone or a descendant). */
  private carriedSets(): Array<{ vertices: number[]; triangles: number[]; columns: number[] }> {
    const rig = this.rig
    const out = Array.from({ length: 2 * this.n }, () => ({ vertices: [] as number[], triangles: [] as number[], columns: [] as number[] }))
    const panel = rig.form?.panel
    if (!panel) return out
    const owner = new Map<number, number[]>()
    for (let k = 0; k < this.n; k++) {
      owner.set(rig.upper[k], [k])
      owner.set(rig.lower[k], [k, this.n + k])
    }
    const nv = panel.pos.length / 3
    const sets = out.map(() => new Set<number>())
    for (let v = 0; v < nv; v++) {
      for (let c = 0; c < 4; c++) {
        if (!(panel.w[v * 4 + c] > 0)) continue
        for (const s of owner.get(panel.idx[v * 4 + c]) ?? []) sets[s].add(v)
      }
    }
    sets.forEach((set, s) => {
      out[s].vertices = [...set].sort((a, b) => a - b)
      for (let t = 0; t < panel.index.length / 3; t++) {
        if ([0, 1, 2].some((j) => set.has(panel.index[t * 3 + j]))) out[s].triangles.push(t)
      }
      // the columns whose bones those triangles' vertices weigh (the only matrices triangleDepth reads)
      const cols = new Set<number>()
      for (const t of out[s].triangles) {
        for (let j = 0; j < 3; j++) {
          const v = panel.index[t * 3 + j]
          for (let c = 0; c < 4; c++) {
            if (!(panel.w[v * 4 + c] > 0)) continue
            const k = owner.get(panel.idx[v * 4 + c])?.[0]
            if (k !== undefined) cols.add(k)
          }
        }
      }
      out[s].columns = [...cols].sort((a, b) => a - b)
    })
    return out
  }

  /** Per segment its stations on the cloth (section 3.4, owner decision 03.11.2026 22:19): per panel
   *  row, the point of the row's edge that crosses the column's own rest angle (two vertices and the
   *  angular parameter u between them); the upper owns the rows without col.L weight, the lower the
   *  rows with it; the stations are the owned rows (from row 0 down) at the station fractions. A
   *  segment whose column no panel crosses has no stations. */
  private clothStations(): Array<{ at: Array<{ v0: number; v1: number; u: number }>; columns: number[] }> | null {
    const rig = this.rig
    const panel = rig.form?.panel
    if (!panel) return null
    const out = Array.from({ length: 2 * this.n }, () => ({ at: [] as Array<{ v0: number; v1: number; u: number }>, columns: [] as number[] }))
    const hipsAt = at(rig.rest, rig.hips)
    const column = new Map<number, number>()
    rig.upper.forEach((u, k) => column.set(u, k))
    rig.lower.forEach((l, k) => column.set(l, k))
    const lowerSet = new Set(rig.lower)
    const lowW = (v: number) => {
      let w = 0
      for (let c = 0; c < 4; c++) if (lowerSet.has(panel.idx[v * 4 + c])) w += panel.w[v * 4 + c]
      return w
    }
    for (let k = 0; k < this.n; k++) {
      const ang = (v: number) => {
        const d: V3 = [panel.pos[v * 3] - hipsAt[0], 0, panel.pos[v * 3 + 2] - hipsAt[2]]
        return Math.atan2(dot(d, rig.tangent[k]), dot(d, rig.radial[k]))
      }
      const rows = new Map<number, { v0: number; v1: number; u: number }>()
      for (let t = 0; t < panel.index.length / 3; t++) {
        for (let e = 0; e < 3; e++) {
          const i = panel.index[t * 3 + e]
          const j = panel.index[t * 3 + ((e + 1) % 3)]
          const v0 = Math.min(i, j)
          const v1 = Math.max(i, j)
          const r = panel.row[v0]
          if (panel.row[v1] !== r || rows.has(r)) continue
          const a0 = ang(v0)
          const a1 = ang(v1)
          if (Math.abs(a0) >= Math.PI / 2 || Math.abs(a1) >= Math.PI / 2 || a0 * a1 > 0) continue
          rows.set(r, { v0, v1, u: a0 === a1 ? 0 : a0 / (a0 - a1) })
        }
      }
      for (const lower of [false, true]) {
        const list = [...rows].filter(([, x]) => lowW(x.v0) + lowW(x.v1) > 0 === lower).sort((p, q) => p[0] - q[0])
        if (!list.length) continue
        const seg = out[lower ? this.n + k : k]
        seg.at = this.cfg.stations.map((f) => list[Math.round(f * (list.length - 1))][1])
        const cols = new Set<number>()
        for (const { v0, v1 } of seg.at) {
          for (const v of [v0, v1]) {
            for (let c = 0; c < 4; c++) {
              const kk = panel.w[v * 4 + c] > 0 ? column.get(panel.idx[v * 4 + c]) : undefined
              if (kk !== undefined) cols.add(kk)
            }
          }
        }
        seg.columns = [...cols].sort((p, q) => p - q)
      }
    }
    return out
  }

  /** Summed penetration depth of the triangles segment s carries, skinned with the given angles (0: no hit). */
  private triangleDepth(s: number, th: ArrayLike<number>): number {
    const panel = this.rig.form!.panel
    const set = this.carried[s]
    if (!set.triangles.length) return 0
    const P = this.posed!
    const rig = this.rig
    const mats = new Map<number, number[]>()
    for (const k of set.columns) {
      const m = this.columnMatrices(k, th)
      mats.set(rig.upper[k], m.U)
      mats.set(rig.lower[k], m.L)
    }
    const posed = new Map<number, V3>()
    const vert = (v: number): V3 => {
      let p = posed.get(v)
      if (!p) posed.set(v, (p = skinPoint(at(panel.pos, v), panel.idx, panel.w, v * 4, P.M, rig.rest, (i) => mats.get(i) ?? null)))
      return p
    }
    const hipsAt = at(rig.rest, rig.hips)
    let depth = 0
    for (const t of set.triangles) {
      const ids = [panel.index[t * 3], panel.index[t * 3 + 1], panel.index[t * 3 + 2]]
      if (ids.every((v) => panel.exempt[v])) continue
      const [a, b, c] = ids.map(vert)
      const C = Math.max(...ids.map((v) => panel.clearance[v]))
      const centre = mul(add(add(a, b), c), 1 / 3)
      const rad = Math.max(len(sub(a, centre)), len(sub(b, centre)), len(sub(c, centre)))
      const hv = [a, b, c].map((p) => this.hipsLocal(p, P.hipsInv, hipsAt))
      // a capsule meets only the part of a triangle where it is active (section 3.5): the triangle
      // clipped at the profile bottom in its bone's rest frame and in the hips frame (both affine)
      P.capsules.forEach((cap) => {
        const mid = mul(add(cap.a, cap.b), 0.5)
        const bound = len(sub(cap.b, cap.a)) / 2 + cap.radius + C
        if (len(sub(mid, centre)) > bound + rad) return
        const below = clipActive([a, b, c], cap.ry, P.hy, rig.profile.bottom)
        if (!below.length) return
        const dist = Math.min(...below.map(([p, q, r]) => segmentTriangle(cap.a, cap.b, p, q, r)))
        const d = cap.radius + C - dist
        if (d > 0) depth += d
      })
      // row 1 is exempt from the profile test like row 0 and the band; a triangle with two
      // profile-exempt vertices skips the centroid's profile test (sections 3.5, 3.6)
      const free = ids.map((v) => panel.exempt[v] === 1 || panel.row[v] === 1)
      const bandEdge = free.filter(Boolean).length >= 2
      const pts: Array<[V3, number, { a: number; y: number; r: number }, boolean]> = ids.map((v, j) => [[a, b, c][j], panel.exempt[v], hv[j], !free[j]] as [V3, number, { a: number; y: number; r: number }, boolean])
      pts.push([centre, 0, this.hipsLocal(centre, P.hipsInv, hipsAt), !bandEdge])
      for (const [p, ex, h, prof] of pts) {
        if (ex) continue
        if (prof && h.y >= rig.profile.bottom) {
          const d = P.profile.query(h.a, h.y) + C - h.r
          if (d > 0) depth += d
        }
        const g = rig.ground - p[1]
        if (g > 0) depth += g
      }
    }
    return depth
  }

  // ----- the search (section 3.4) -----

  /** The angle chosen for segment s with the others at `cur`. */
  private search(s: number, triangles: boolean): number {
    const cfg = this.cfg
    const P = this.posed!
    const k = s % this.n
    const target = s < this.n ? 0 : P.gravity[k]
    const prev = this.theta[s]
    const held = this.hold[s] === 1
    const top = (held ? cfg.thetaGround : cfg.thetaMax) * DEG
    const rel = Math.min(top, Math.max(0, target + (prev - target) * Math.exp(-this.dt / cfg.tau)))
    const score = (th: number) => this.evaluate(s, th, this.cur, triangles).worst
    const feasible = (th: number) => score(th) <= 0
    let chosen: number
    if (feasible(rel)) {
      chosen = rel
    } else {
      const pool: number[] = []
      for (let d = 0; d <= cfg.thetaMax + 1e-9; d += cfg.coarseStep) pool.push(d * DEG)
      if (held) for (let d = cfg.thetaMax + cfg.groundStep; d <= cfg.thetaGround + 1e-9; d += cfg.groundStep) pool.push(d * DEG)
      const scored = pool.map((th) => ({ th, w: score(th) }))
      const best = pickBest(scored, rel)
      for (const r of cfg.refine) {
        for (const sg of [-1, 1]) {
          const th = best.th + sg * r * DEG
          if (th >= 0 && th <= top + 1e-12) scored.push({ th, w: score(th) })
        }
      }
      const pick = pickBest(scored, rel)
      if (pick.w <= 0) {
        // the feasibility boundary between the relaxed angle and the feasible pick
        let lo = rel
        let hi = pick.th
        while (Math.abs(hi - lo) > cfg.bisect * DEG) {
          const mid = 0.5 * (lo + hi)
          if (feasible(mid)) hi = mid
          else lo = mid
        }
        chosen = hi
      } else {
        chosen = pick.w < score(rel) ? pick.th : rel
      }
    }
    // the rate limit, unless only a larger step is feasible
    if (this.rated) {
      const lim = cfg.omegaMax * DEG * this.dt
      if (Math.abs(chosen - prev) > lim) {
        const clamped = prev + Math.sign(chosen - prev) * lim
        if (feasible(clamped) || !feasible(chosen)) chosen = clamped
      }
    }
    return chosen
  }

  // ----- final evaluation, bounded repair, ground fallback (sections 3.4, 3.6, 3.7) -----

  private finalEvaluation(): void {
    const cfg = this.cfg
    const S = 2 * this.n
    const all = () => Array.from({ length: S }, (_, s) => this.evaluate(s, this.cur[s], this.cur, true))
    let ev = all()
    for (let round = 0; round < cfg.repairRounds; round++) {
      const bad = ev.map((e, s) => (e.worst > 0 ? s : -1)).filter((s) => s >= 0)
      if (!bad.length) break
      this.counters.repairs++
      for (const s of bad) {
        const before = this.cur[s]
        const th = this.search(s, true)
        if (Math.abs(th - before) <= 1e-12 && this.evaluate(s, th, this.cur, true).tri > 0) {
          this.jointSearch(s)
        } else {
          this.cur[s] = th
        }
        if (s < this.n && this.cur[s] !== before) this.cur[this.n + s] = this.search(this.n + s, true)
      }
      ev = all()
    }
    // the ground fallback where the ground is the violated constraint: at a station, or at a
    // carried panel vertex (whose ground depth the triangle score holds, not `ground`)
    for (let s = 0; s < S; s++) {
      if (ev[s].ground > 0 || this.lowestRow(s, this.cur[s]) < this.rig.ground) {
        this.groundFallback(s)
        if (s < this.n) this.cur[this.n + s] = this.search(this.n + s, true)
      }
    }
    ev = all()
    for (let s = 0; s < S; s++) {
      this.violation[s] = ev[s].worst
      if (ev[s].worst > 0) this.counters.residual++
    }
  }

  /** The two columns owning the worst hit of segment s, searched jointly on the coarse samples. */
  private jointSearch(s: number): void {
    const cfg = this.cfg
    const k = s % this.n
    const level = s < this.n ? 0 : this.n
    // the partner: the neighbour whose own triangle score is worse
    const cand = [level + ((k + this.n - 1) % this.n), level + ((k + 1) % this.n)]
    const partner = cand.reduce((a, b) => (this.evaluate(b, this.cur[b], this.cur, true).tri > this.evaluate(a, this.cur[a], this.cur, true).tri ? b : a))
    this.counters.jointSearches++
    const samples: number[] = []
    for (let d = 0; d <= cfg.thetaMax + 1e-9; d += cfg.coarseStep) samples.push(d * DEG)
    let best = { a: this.cur[s], b: this.cur[partner], w: Infinity, d: Infinity }
    const save = Float64Array.from(this.cur)
    for (const a of samples) {
      for (const b of samples) {
        this.cur[s] = a
        this.cur[partner] = b
        const w = Math.max(this.evaluate(s, a, this.cur, true).worst, this.evaluate(partner, b, this.cur, true).worst)
        const d = Math.abs(a - save[s]) + Math.abs(b - save[partner])
        const better = (w <= 0 && best.w > 0) || (w <= 0 && best.w <= 0 && d < best.d - 1e-12) || (w > 0 && best.w > 0 && w < best.w)
        if (better) best = { a, b, w, d }
      }
    }
    this.cur.set(save)
    // no feasible pair: the rate limit holds, as in the single search (only a feasible larger step may break it)
    const limited = (th: number, seg: number) => {
      if (best.w <= 0 || !this.rated) return th
      const prev = this.theta[seg]
      const lim = cfg.omegaMax * DEG * this.dt
      return Math.abs(th - prev) > lim ? prev + Math.sign(th - prev) * lim : th
    }
    this.cur[s] = limited(best.a, s)
    this.cur[partner] = limited(best.b, partner)
  }

  /** Lift segment s outward past θmax in ground steps until its lowest carried row clears the ground. */
  private groundFallback(s: number): void {
    const cfg = this.cfg
    this.counters.groundFallback++
    let chosen = cfg.thetaGround * DEG
    for (let d = cfg.thetaMax + cfg.groundStep; d <= cfg.thetaGround + 1e-9; d += cfg.groundStep) {
      if (this.lowestRow(s, d * DEG) >= this.rig.ground) {
        chosen = d * DEG
        break
      }
    }
    this.cur[s] = Math.max(this.cur[s], chosen)
    this.hold[s] = 1
  }

  /** The lowest row segment s carries at θ: its stations (and, for an upper, its lower's carried at its
   *  current local rotation), or its skinned panel vertices where a panel is worn. */
  private lowestRow(s: number, theta: number): number {
    const trial = Float64Array.from(this.cur)
    if (s < this.n) trial[this.n + s] = this.cur[this.n + s] + (theta - this.cur[s])
    trial[s] = theta
    const panel = this.rig.form?.panel
    if (panel && this.carried[s].vertices.length) {
      const P = this.posed!
      // every column at this frame's trial angles: a vertex blended across columns sees its neighbours as drawn
      const mats = new Map<number, number[]>()
      for (let k = 0; k < this.n; k++) {
        const m = this.columnMatrices(k, trial)
        mats.set(this.rig.upper[k], m.U)
        mats.set(this.rig.lower[k], m.L)
      }
      let low = Infinity
      for (const v of this.carried[s].vertices) low = Math.min(low, skinPoint(at(panel.pos, v), panel.idx, panel.w, v * 4, P.M, this.rig.rest, (i) => mats.get(i) ?? null)[1])
      return low
    }
    let low = Math.min(...this.stations(s, theta, trial).map((p) => p[1]))
    if (s < this.n) low = Math.min(low, ...this.stations(this.n + s, trial[this.n + s], trial).map((p) => p[1]))
    return low
  }
}

/** The feasible candidate nearest to `rel` (the larger angle on a tie), else the least violating. */
function pickBest(scored: ReadonlyArray<{ th: number; w: number }>, rel: number): { th: number; w: number } {
  let best = scored[0]
  for (const c of scored) {
    const cf = c.w <= 0
    const bf = best.w <= 0
    if (cf && !bf) best = c
    else if (cf && bf) {
      const dc = Math.abs(c.th - rel)
      const db = Math.abs(best.th - rel)
      if (dc < db - 1e-12 || (Math.abs(dc - db) <= 1e-12 && c.th > best.th)) best = c
    } else if (!cf && !bf && c.w < best.w) best = c
  }
  return best
}

/** Whether a geometry carries column weight: the driver runs only for such a figure (section 3.4). */
export function carriesColumnWeight(asset: VillagerAsset, g: THREE.BufferGeometry): boolean {
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute | undefined
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute | undefined
  if (!si || !sw || !asset.columns) return false
  const cols = new Set([...asset.columns.bones.upper, ...asset.columns.bones.lower].map((n) => asset.bones.indexOf(n)))
  for (let v = 0; v < si.count; v++) for (let c = 0; c < 4; c++) if (sw.getComponent(v, c) > 0 && cols.has(si.getComponent(v, c))) return true
  return false
}
