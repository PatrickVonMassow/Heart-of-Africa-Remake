// @vitest-environment node
// The garments' per-frame baked offsets: interpolated between frames and
// strides like the pose, following the body morphs, and the same values the
// pipeline measured penetration with (verification/villager-body/
// garment-baked-check.json, written by scripts/villager/resolve.py).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { VillagerClip } from './villagerAsset'
import { morphInfluences } from './villagerBody'
import { bakedFrameAt, garmentBakedOffsets, type GarmentBakedTable } from './villagerGarmentBaked'

const u32 = (...x: number[]) => new Uint32Array(x)
const f32 = (...x: number[]) => new Float32Array(x)

// two vertices; two corners (the second = base + female); gait at strides
// 0.75, 1 and 1.35, two frames
const TABLE: GarmentBakedTable = {
  morphs: ['female'],
  basis: [
    [1, 0],
    [-1, 1],
  ],
  clips: {
    walk: {
      strides: [0.75, 1, 1.35],
      ids: [[u32(0), u32()], [u32(0), u32()], [u32(0), u32()], [u32(1), u32()], [u32(), u32()], [u32(1), u32(1)]],
      off: [[f32(1, 0, 0), f32()], [f32(2, 0, 0), f32()], [f32(4, 0, 0), f32()], [f32(0, 1, 0), f32()], [f32(), f32()], [f32(0, 3, 0), f32(0, 3, 1)]],
    },
    kneel: { strides: [1], ids: [[u32(1), u32(1)], [u32(1), u32(1)]], off: [[f32(0, 0, 2), f32(0, 0, 2)], [f32(0, 0, 4), f32(0, 0, 4)]] },
  },
}

describe('garment baked offsets', () => {
  const out = new Float32Array(6)

  it('take a measured pose as it is', () => {
    garmentBakedOffsets(TABLE, 'walk', 0, 0, 1, {}, out)
    expect(Array.from(out)).toEqual([2, 0, 0, 0, 0, 0])
  })

  it('blend between the frames round the clip time', () => {
    garmentBakedOffsets(TABLE, 'kneel', 0, 0.25, 1, {}, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 2.5])
  })

  it('blend between the strides round the drawn one and clamp outside them', () => {
    garmentBakedOffsets(TABLE, 'walk', 0, 0, 0.875, {}, out)
    expect(out[0]).toBeCloseTo(1.5, 6)
    garmentBakedOffsets(TABLE, 'walk', 0, 0, 2, {}, out)
    expect(out[0]).toBeCloseTo(4, 6)
    garmentBakedOffsets(TABLE, 'walk', 1, 0, 0.5, {}, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('blend the body corners by the body morphs, exact at each corner', () => {
    garmentBakedOffsets(TABLE, 'walk', 1, 0, 1.35, { female: 0.5 }, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 3, 0.5])
    garmentBakedOffsets(TABLE, 'walk', 1, 0, 1.35, { female: 1 }, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 3, 1])
    garmentBakedOffsets(TABLE, 'walk', 0, 0, 1, { female: 1 }, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('are zero for a clip the table lacks', () => {
    out.fill(7)
    garmentBakedOffsets(TABLE, 'dig', 3, 0.5, 1, {}, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('find the frame round a clip time as the pose sampling does', () => {
    const clip = { kind: 'once', duration: 1, times: f32(0, 0.5, 1) } as unknown as VillagerClip
    expect(bakedFrameAt(clip, 0.75)).toEqual({ k: 1, f: 0.5 })
    expect(bakedFrameAt(clip, 2)).toEqual({ k: 1, f: 1 })
    const loop = { ...clip, kind: 'loop' } as VillagerClip
    expect(bakedFrameAt(loop, 1.25)).toEqual({ k: 0, f: 0.5 })
  })
})

const CHECK = resolve(__dirname, '../../verification/villager-body/garment-baked-check.json')

describe('garment baked offsets against the pipeline', () => {
  it("reproduce the pipeline's offsets at clip times between frames and strides", () => {
    expect(existsSync(CHECK)).toBe(true)
    type Clip = { strides: number[]; ids: number[][][]; off: number[][][] }
    type Sample = { sex: 'male' | 'female'; age: 'child' | 'youth' | 'adult' | 'elder'; clip: string; t: number; stride: number; vertices: number[]; offsets: number[][] }
    const check = JSON.parse(readFileSync(CHECK, 'utf8')) as {
      vertices: number
      table: { morphs: string[]; basis: number[][]; clips: Record<string, Clip> }
      times: Record<string, { kind: string; duration: number; times: number[] }>
      samples: Sample[]
    }
    const table: GarmentBakedTable = {
      morphs: check.table.morphs,
      basis: check.table.basis,
      clips: Object.fromEntries(
        Object.entries(check.table.clips).map(([n, c]) => [
          n,
          { strides: c.strides, ids: c.ids.map((p) => p.map((x) => new Uint32Array(x))), off: c.off.map((p) => p.map((x) => new Float32Array(x))) },
        ]),
      ),
    }
    expect(check.samples.length).toBeGreaterThan(0)
    const out = new Float32Array(check.vertices * 3)
    let moved = 0
    for (const s of check.samples) {
      const tc = check.times[s.clip]
      const clip = { kind: tc.kind, duration: tc.duration, times: new Float32Array(tc.times) } as unknown as VillagerClip
      const { k, f } = bakedFrameAt(clip, s.t)
      garmentBakedOffsets(table, s.clip, k, f, s.stride, morphInfluences(s.sex, s.age, 0), out)
      s.vertices.forEach((v, j) =>
        s.offsets[j].forEach((x, a) => {
          if (x) moved++
          expect(out[v * 3 + a], `${s.sex} ${s.age} ${s.clip} ${s.t} ${s.stride} v${v}[${a}]`).toBeCloseTo(x, 4)
        }),
      )
    }
    expect(moved, 'the sample moves no vertex').toBeGreaterThan(0)
  })
})
