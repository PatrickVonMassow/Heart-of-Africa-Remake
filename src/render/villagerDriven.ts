/**
 * Driven garments at run time (docs/garment-stage3-plan-1398.md sections 3.2,
 * 3.3, 3.9 and 3.12; built by scripts/villager/driven.py): a worn driven form
 * draws its band as a shell and its panel as a skinned mesh on the column
 * bones. Here the panel's row 0 is written from the band's recipe function,
 * the runtime clearance increment opens the panel over worn shells below the
 * junction, and the column rest heads move onto the form's anchors so the
 * driver (render/villagerSkirtDriver.ts) poses the panel from its built shape.
 */
import type * as THREE from 'three/webgpu'
import type { DrivenRecord, VillagerAsset } from './villagerAsset'
import type { DrivenFormRig, V3 } from './villagerSkirtDriver'

/** The hung, scaled body a driven panel attaches to (a GltfPerson's own parts). */
export interface DrivenBody {
  geometry: THREE.BufferGeometry
  rest: Float32Array
  region: Uint32Array | null
  scale: number
}

/** The driven record of a garment mesh name, or null for a legacy or shell garment. */
export function drivenRecordOf(asset: Pick<VillagerAsset, 'driven'>, mesh: string): DrivenRecord | null {
  for (const r of Object.values(asset.driven ?? {})) if (r.panel === mesh) return r
  return null
}

/** A junction source's offset point on the hung body: position + band offset × scale along its normal (section 3.3, B5). */
export function offsetPoint(rec: DrivenRecord, body: DrivenBody, v: number): V3 {
  const pos = body.geometry.getAttribute('position')
  const nor = body.geometry.getAttribute('normal')
  const o = rec.offset * body.scale
  return [pos.getX(v) + o * nor.getX(v), pos.getY(v) + o * nor.getY(v), pos.getZ(v) + o * nor.getZ(v)]
}

/** Row 0 of the panel from the recipe function, with its source's skin (section 3.3, B4/B5). */
export function attachRowZero(panel: THREE.BufferGeometry, rec: DrivenRecord, body: DrivenBody): void {
  const pos = panel.getAttribute('position') as THREE.BufferAttribute
  const si = panel.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = panel.getAttribute('skinWeight') as THREE.BufferAttribute
  const bsi = body.geometry.getAttribute('skinIndex') as THREE.BufferAttribute
  const bsw = body.geometry.getAttribute('skinWeight') as THREE.BufferAttribute
  rec.src.forEach((s, k) => {
    if (s < 0) return
    const p = offsetPoint(rec, body, s)
    pos.setXYZ(k, p[0], p[1], p[2])
    for (let c = 0; c < 4; c++) {
      si.setComponent(k, c, bsi.getComponent(s, c))
      sw.setComponent(k, c, bsw.getComponent(s, c))
    }
  })
  pos.needsUpdate = si.needsUpdate = sw.needsUpdate = true
}

/** The junction height on the hung body: the mean rest height of the row-0 sources. */
export function junctionHeight(rec: DrivenRecord, body: DrivenBody): number {
  const pos = body.geometry.getAttribute('position')
  let sum = 0
  let n = 0
  for (const s of rec.src) {
    if (s < 0) continue
    sum += pos.getY(s)
    n++
  }
  return sum / n
}

/** A worn shell below the junction: its full increment ΔS and the top of its region (section 3.9, B12/E1). */
export interface ClearanceIncrement {
  shell: string
  delta: number
  top: number
}

/**
 * Per worn shell other than the form's band whose region lies below the
 * junction: ΔS = max(0, offset(S) + step − band offset) × scale and its
 * region's top on the hung body.
 */
export function clearanceIncrements(asset: Pick<VillagerAsset, 'shells'>, rec: DrivenRecord, worn: readonly string[], body: DrivenBody, yj: number): ClearanceIncrement[] {
  const set = asset.shells
  if (!set || !body.region) return []
  const pos = body.geometry.getAttribute('position')
  const out: ClearanceIncrement[] = []
  for (const n of worn) {
    const s = set.garments[n]
    if (!s || n === rec.band) continue
    const bit = 1 << s.bit
    let top = -Infinity
    for (let v = 0; v < body.region.length; v++) if (body.region[v] & bit) top = Math.max(top, pos.getY(v))
    if (!(top < yj)) continue
    const delta = Math.max(0, s.base + s.rank * set.step + set.step - rec.offset) * body.scale
    if (delta > 0) out.push({ shell: n, delta, top })
  }
  return out
}

/** Δ(y) = max over S of ΔS · clamp((yj − y) / (yj − ytop(S)), 0, 1); row 0 is never displaced. */
export function clearanceAt(y: number, yj: number, inc: readonly ClearanceIncrement[]): number {
  let d = 0
  for (const s of inc) d = Math.max(d, s.delta * Math.min(1, Math.max(0, (yj - y) / (yj - s.top))))
  return d
}

/** Rows ≥ 1 moved by Δ(y) along their rest radial direction from the hips axis. */
export function applyClearance(panel: THREE.BufferGeometry, rec: DrivenRecord, yj: number, inc: readonly ClearanceIncrement[], hips: V3): void {
  if (!inc.length) return
  const pos = panel.getAttribute('position') as THREE.BufferAttribute
  rec.row.forEach((r, k) => {
    if (r < 1) return
    const d = clearanceAt(pos.getY(k), yj, inc)
    if (!d) return
    const x = pos.getX(k) - hips[0]
    const z = pos.getZ(k) - hips[2]
    const l = Math.hypot(x, z) || 1
    pos.setX(k, pos.getX(k) + (d * x) / l)
    pos.setZ(k, pos.getZ(k) + (d * z) / l)
  })
  pos.needsUpdate = true
}

/** The hips head of a rest array. */
export const hipsHead = (asset: Pick<VillagerAsset, 'bones'>, rest: Float32Array): V3 => {
  const h = asset.bones.indexOf('hips')
  return [rest[h * 3], rest[h * 3 + 1], rest[h * 3 + 2]]
}

/** Per column its anchor on the hung body: the t-interpolation of its two junction offset points (section 3.3). */
export function anchorPoints(rec: DrivenRecord, body: DrivenBody): V3[] {
  return rec.anchors.map(([a, b, t]) => {
    const A = offsetPoint(rec, body, a)
    const B = offsetPoint(rec, body, b)
    return [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), A[2] + t * (B[2] - A[2])]
  })
}

/**
 * The per-form rest heads (section 3.2): the upper column heads on the
 * form's hung anchors, the knee pivots below them at their hung height.
 * Returns a copy of `rest`.
 */
export function drivenRestHeads(asset: Pick<VillagerAsset, 'bones' | 'columns'>, rec: DrivenRecord, body: DrivenBody): Float32Array {
  const out = Float32Array.from(body.rest)
  const cols = asset.columns
  if (!cols) return out
  anchorPoints(rec, body).forEach((a, k) => {
    const u = asset.bones.indexOf(cols.bones.upper[k])
    const l = asset.bones.indexOf(cols.bones.lower[k])
    out.set(a, u * 3)
    out[l * 3] = a[0]
    out[l * 3 + 2] = a[2]
  })
  return out
}

/** The driver's form data from the finished panel (positions in the hung rest, its skin and triangles). */
export function drivenFormRig(rec: DrivenRecord, panel: THREE.BufferGeometry, body: DrivenBody): DrivenFormRig {
  const pos = panel.getAttribute('position') as THREE.BufferAttribute
  const si = panel.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = panel.getAttribute('skinWeight') as THREE.BufferAttribute
  const bsi = body.geometry.getAttribute('skinIndex') as THREE.BufferAttribute
  const bsw = body.geometry.getAttribute('skinWeight') as THREE.BufferAttribute
  const skin = (v: number) => {
    const ia: number[] = []
    const wa: number[] = []
    for (let c = 0; c < 4; c++) {
      ia.push(bsi.getComponent(v, c))
      wa.push(bsw.getComponent(v, c))
    }
    return { i: ia, w: wa }
  }
  const anchors = rec.anchors.map(([a, b, t]) => {
    const sa = skin(a)
    const sb = skin(b)
    return { a: offsetPoint(rec, body, a), ia: sa.i, wa: sa.w, b: offsetPoint(rec, body, b), ib: sb.i, wb: sb.w, t }
  })
  const clear = rec.offset * body.scale
  const p: DrivenFormRig['panel'] = { pos: [], idx: [], w: [], index: Array.from(panel.getIndex()!.array as ArrayLike<number>), exempt: [], clearance: [] }
  for (let v = 0; v < pos.count; v++) {
    p.pos.push(pos.getX(v), pos.getY(v), pos.getZ(v))
    for (let c = 0; c < 4; c++) {
      p.idx.push(si.getComponent(v, c))
      p.w.push(sw.getComponent(v, c))
    }
    p.exempt.push(rec.row[v] === 0 ? 1 : 0)
    p.clearance.push(clear)
  }
  return { anchors, panel: p, clearance: clear, top: Math.max(...anchors.map((a) => Math.max(a.a[1], a.b[1]))) }
}
