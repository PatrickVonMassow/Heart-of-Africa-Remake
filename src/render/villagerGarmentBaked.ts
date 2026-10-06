// The villager garments' per-frame baked offsets (work-order point "villager
// garments: pose-driven correction"): the pipeline resolves every garment out
// of the body frame by frame (scripts/villager/resolve.py) — per clip frame, a
// gait's at each measured stride, per body corner, sparse over the garment's
// vertices. A person between corners takes the blend of the corners' offsets
// that is a base plus one offset per body morph (exact at every corner). The
// game adds them in the hung, baked frame (like a morph target), interpolated
// between the two frames round the clip time (as villagerRig.ts `sampleClip`
// interpolates the pose) and between the measured strides round the drawn one
// (clamped to their range).
//
// Pure: table and pose in, offsets out.

import { clipTime } from './villagerRig'
import type { VillagerClip } from './villagerAsset'

/** One clip's baked offsets: pose `frame · strides.length + s`, then body corner. */
export interface GarmentBakedClip {
  /** The strides the gait was resolved at, ascending ([1] for a non-gait). */
  strides: number[]
  /** Per pose, per corner: the vertices it moves. */
  ids: Uint32Array[][]
  /** Per pose, per corner: ids × 3 offsets. */
  off: Float32Array[][]
}

/** A garment's baked offsets for every clip. */
export interface GarmentBakedTable {
  /** The body morphs the corners span. */
  morphs: string[]
  /** (1 + morphs) × corners: row 0 the base, row 1 + i morph i, each a blend of the corners. */
  basis: number[][]
  clips: Record<string, GarmentBakedClip>
}

/** Each corner's share in a person with body morph `influences`. */
export function bakedCornerBlend(table: GarmentBakedTable, influences: Readonly<Record<string, number>>): Float64Array {
  const C = table.basis[0].length
  const out = new Float64Array(C)
  for (let c = 0; c < C; c++) {
    let s = table.basis[0][c]
    table.morphs.forEach((m, i) => {
      const w = influences[m]
      if (w) s += w * table.basis[1 + i][c]
    })
    out[c] = s
  }
  return out
}

/** The frame `k` and blend `f` toward frame k + 1 at clip time `t` (villagerRig.ts `sampleClip`). */
export function bakedFrameAt(clip: VillagerClip, t: number): { k: number; f: number } {
  const times = clip.times
  const n = times.length
  if (n < 2) return { k: 0, f: 0 }
  const tt = clipTime(clip, t)
  const step = (times[n - 1] - times[0]) / (n - 1)
  const k = Math.min(n - 2, Math.max(0, Math.floor((tt - times[0]) / Math.max(1e-9, step))))
  const f = Math.min(1, Math.max(0, (tt - times[k]) / Math.max(1e-9, times[k + 1] - times[k])))
  return { k, f }
}

function addPose(c: GarmentBakedClip, pose: number, w: number, blend: Float64Array, out: Float32Array) {
  if (!w) return
  const ids = c.ids[pose]
  const off = c.off[pose]
  if (!ids) return
  for (let k = 0; k < ids.length; k++) {
    const x = w * blend[k]
    if (!x) continue
    const id = ids[k]
    const o = off[k]
    for (let j = 0; j < id.length; j++) {
      out[id[j] * 3] += x * o[j * 3]
      out[id[j] * 3 + 1] += x * o[j * 3 + 1]
      out[id[j] * 3 + 2] += x * o[j * 3 + 2]
    }
  }
}

/**
 * The garment's baked offsets (vertices × 3, flat, the hung baked frame) in
 * clip `clip` at frame `k` blended `f` toward k + 1, drawn at stride `stride`,
 * on a person with body morph `influences`. Writes `out` (zeroed first) and
 * returns it; a clip the table lacks leaves it zero.
 */
export function garmentBakedOffsets(
  table: GarmentBakedTable,
  clip: string,
  k: number,
  f: number,
  stride: number,
  influences: Readonly<Record<string, number>>,
  out: Float32Array,
): Float32Array {
  out.fill(0)
  const c = table.clips[clip]
  if (!c) return out
  const S = c.strides.length
  // the measured strides round the drawn one, clamped to their range
  let s0 = 0
  let g = 0
  if (S > 1) {
    const x = Math.min(c.strides[S - 1], Math.max(c.strides[0], stride))
    while (s0 < S - 2 && x > c.strides[s0 + 1]) s0++
    g = (x - c.strides[s0]) / (c.strides[s0 + 1] - c.strides[s0])
  }
  const frames = c.ids.length / S
  const k1 = Math.min(frames - 1, k + 1)
  const blend = bakedCornerBlend(table, influences)
  for (const [fr, wf] of [[k, 1 - f], [k1, f]] as const) {
    addPose(c, fr * S + s0, wf * (1 - g), blend, out)
    if (S > 1) addPose(c, fr * S + s0 + 1, wf * g, blend, out)
  }
  return out
}
