// Per-pass GPU breakdown of the F8 benchmark (point 1549): UID parsing, pass
// labels, the per-frame fold, the per-row aggregation and the digest lines.
// The live capture (three's timestamp pool on WebGPU) is scripts/verify/benchmark.mjs.

import { describe, it, expect } from 'vitest'
import {
  aggregatePasses,
  createPassIdentity,
  createPassRecorder,
  formatPass,
  framePasses,
  gpuPassSummaryLines,
  latestFrame,
  parseRenderUid,
  passBreakdown,
  passLabel,
  type BenchPassSample,
} from './benchmarkPasses'

describe('three timestamp UIDs', () => {
  it('parses a render pass UID into call order, context and frame', () => {
    expect(parseRenderUid('r:3:7:f120')).toEqual({ call: 3, context: 7, frame: 120 })
  })

  it('rejects compute and foreign UIDs', () => {
    expect(parseRenderUid('c:1:4:f120')).toBeNull()
    expect(parseRenderUid('r:3:7')).toBeNull()
    expect(parseRenderUid('')).toBeNull()
  })

  it('takes the last frame of a resolve, none for an empty one', () => {
    expect(latestFrame([118, 119, 120])).toBe(120)
    expect(latestFrame([])).toBeNull()
  })
})

describe('pass labels', () => {
  it('names a pass by its target texture, the target, or the canvas', () => {
    expect(passLabel({ texture: { name: 'ShadowMap' } })).toBe('ShadowMap')
    expect(passLabel({ name: 'rt', texture: { name: '' } })).toBe('rt')
    expect(passLabel({ texture: null })).toBe('target')
    expect(passLabel(null)).toBe('canvas')
    expect(passLabel(undefined)).toBe('canvas')
  })
})

describe('one frame of passes', () => {
  const labels = new Map([
    ['r:1:2:f10', 'ShadowMap'],
    ['r:2:3:f10', 'output'],
    ['r:3:3:f10', 'output'],
    ['r:4:1:f10', 'canvas'],
  ])

  it('keeps only the asked frame, in call order without submissions, suffixing a repeat within the frame', () => {
    const timestamps = new Map([
      ['r:4:1:f10', 0.5],
      ['r:2:3:f10', 8],
      ['r:1:2:f10', 3],
      ['r:3:3:f10', 1.5],
      ['r:1:2:f9', 99], // an older frame of the same resolve
      ['c:1:5:f10', 42], // a compute pass
    ])
    expect(framePasses(timestamps, labels, 10)).toEqual([
      { pass: 'ShadowMap', call: 1, ms: 3 },
      { pass: 'output', call: 2, ms: 8 },
      { pass: 'output@2', call: 3, ms: 1.5 },
      { pass: 'canvas', call: 4, ms: 0.5 },
    ])
  })

  it('orders by GPU submission, not by the order the passes began', () => {
    // The scene pass (call 1) begins first; the shadow map it samples is
    // rendered nested (call 2) and submitted BEFORE it.
    const ts = new Map([
      ['r:1:3:f10', 8],
      ['r:2:2:f10', 3],
    ])
    const submitted = new Map([
      ['r:2:2:f10', 1],
      ['r:1:3:f10', 2],
    ])
    const l = new Map([
      ['r:1:3:f10', 'output'],
      ['r:2:2:f10', 'ShadowMap'],
    ])
    expect(framePasses(ts, l, 10, submitted)).toEqual([
      { pass: 'ShadowMap', call: 1, ms: 3 },
      { pass: 'output', call: 2, ms: 8 },
    ])
  })

  it('falls back to the call index when no label was recorded', () => {
    expect(framePasses([['r:5:9:f10', 2]], new Map(), 10)).toEqual([{ pass: 'pass 5', call: 1, ms: 2 }])
  })

  it('returns nothing for a frame without entries', () => {
    expect(framePasses([['r:1:2:f9', 2]], labels, 10)).toEqual([])
  })
})

describe('per-row aggregation', () => {
  const frame = (shadow: number | null, output: number): BenchPassSample[] => [
    ...(shadow === null ? [] : [{ pass: 'ShadowMap', call: 1, ms: shadow }]),
    { pass: 'output', call: shadow === null ? 1 : 2, ms: output },
  ]

  it('orders passes by pass order and counts the frames each ran in', () => {
    const passes = aggregatePasses([frame(2, 10), frame(4, 12), frame(null, 11), frame(3, 13)])
    expect(passes.map((p) => p.pass)).toEqual(['ShadowMap', 'output'])
    const [shadow, output] = passes
    expect(shadow.frames).toBe(3)
    expect(output.frames).toBe(4)
  })

  it('takes the median over the frames a pass ran in and the mean per MEASURED frame', () => {
    const [shadow, output] = aggregatePasses([frame(2, 10), frame(4, 12), frame(null, 11), frame(3, 13)])
    expect(shadow.median).toBe(3)
    // An intermittent pass costs its share per measured frame: (2+4+3)/4.
    expect(shadow.mean).toBeCloseTo(2.25)
    expect(output.mean).toBeCloseTo(11.5)
    // The means add up to the mean whole-frame GPU time.
    const frameMeans = (12 + 16 + 11 + 16) / 4
    expect(shadow.mean + output.mean).toBeCloseTo(frameMeans)
  })

  it('keeps the order two passes always ran in, however often one of them skipped', () => {
    // The reviewer's case: the shadow at position 3 before output at 4 in one
    // frame, output alone at position 1 in three more. A mean position would
    // put output (1.75) before the shadow (3).
    const passes = aggregatePasses([
      [
        { pass: 'TRAANode.resolve', call: 1, ms: 1 },
        { pass: 'GTAONode.AO', call: 2, ms: 1 },
        { pass: 'ShadowMap', call: 3, ms: 2 },
        { pass: 'output', call: 4, ms: 10 },
      ],
      [{ pass: 'output', call: 1, ms: 10 }],
      [{ pass: 'output', call: 1, ms: 10 }],
      [{ pass: 'output', call: 1, ms: 10 }],
    ])
    expect(passes.map((p) => p.pass)).toEqual(['TRAANode.resolve', 'GTAONode.AO', 'ShadowMap', 'output'])
    expect(passes.map((p) => p.order)).toEqual([1, 2, 3, 4])
  })

  it('follows the majority of the frames two passes shared and survives a precedence cycle', () => {
    const ab = (a: string, b: string): BenchPassSample[] => [
      { pass: a, call: 1, ms: 1 },
      { pass: b, call: 2, ms: 1 },
    ]
    expect(aggregatePasses([ab('x', 'y'), ab('x', 'y'), ab('y', 'x')]).map((p) => p.pass)).toEqual(['x', 'y'])
    // x<y, y<z, z<x: no pass is free; the cycle breaks at the lowest mean
    // position (x 1.5, y 1.5, z 1.5 → by name), then follows its edges.
    const cycle = aggregatePasses([ab('x', 'y'), ab('y', 'z'), ab('z', 'x')])
    expect(cycle.map((p) => p.pass)).toEqual(['x', 'y', 'z'])
    expect(cycle.map((p) => p.order)).toEqual([1, 2, 3])
    // The reviewer's case: a pass outside the cycle that x always preceded
    // must not jump ahead of it on a lower mean position (a ran alone often,
    // mean 1.2). The cycle breaks at x, its own source; a is bound only to x.
    const alone: BenchPassSample[] = [{ pass: 'a', call: 1, ms: 1 }]
    const outside = aggregatePasses([ab('x', 'y'), ab('y', 'z'), ab('z', 'x'), ab('x', 'a'), alone, alone, alone, alone])
    expect(outside.map((p) => p.pass)).toEqual(['x', 'a', 'y', 'z'])
  })

  it('counts measured frames that resolved no pass at all', () => {
    const b = passBreakdown([frame(2, 10), [], frame(null, 11)])
    expect(b?.frames).toBe(3)
    expect(b?.emptyFrames).toBe(1)
    expect(gpuPassSummaryLines({ available: true, reason: '' }, [{ config: 'baseline', phase: 'desert-standing', gpuPasses: b }])[2]).toBe(
      '  baseline / desert-standing: ShadowMap 0.67 (1/3) | output 7.00 (2/3) — 1/3 frames without passes',
    )
  })

  it('builds no breakdown without measured frames', () => {
    expect(aggregatePasses([])).toEqual([])
    expect(passBreakdown([])).toBeNull()
    expect(passBreakdown([frame(2, 10)])).toEqual({
      frames: 1,
      emptyFrames: 0,
      passes: [
        { pass: 'ShadowMap', order: 1, frames: 1, median: 2, mean: 2 },
        { pass: 'output', order: 2, frames: 1, median: 10, mean: 10 },
      ],
    })
  })
})

describe('breakdown digest', () => {
  const breakdown = passBreakdown([
    [
      { pass: 'ShadowMap', call: 1, ms: 3.2 },
      { pass: 'output', call: 2, ms: 20 },
    ],
    [{ pass: 'output', call: 1, ms: 22 }],
  ])

  it('formats a pass as mean ms, with its frame share where it skipped frames', () => {
    expect(formatPass({ pass: 'output', order: 2, frames: 4, median: 9, mean: 8.5 }, 4)).toBe('output 8.50')
    expect(formatPass({ pass: 'ShadowMap', order: 1, frames: 2, median: 3, mean: 1.5 }, 4)).toBe('ShadowMap 1.50 (2/4)')
  })

  it('prints one line per row with the passes in pass order', () => {
    const lines = gpuPassSummaryLines({ available: true, reason: '' }, [
      { config: 'baseline', phase: 'savanna-standing', gpuPasses: breakdown },
      { config: 'shadows-off', phase: 'savanna-standing', gpuPasses: null },
    ])
    expect(lines[0]).toBe('')
    expect(lines[1]).toContain('GPU PASS BREAKDOWN')
    expect(lines[2]).toBe('  baseline / savanna-standing: ShadowMap 1.60 (1/2) | output 21.00')
    expect(lines[3]).toBe('  shadows-off / savanna-standing: n/a')
  })

  it('states why the breakdown is unavailable instead of printing rows', () => {
    expect(gpuPassSummaryLines({ available: false, reason: 'adapter without the timestamp-query feature' }, [])).toEqual([
      '',
      'GPU PASS BREAKDOWN: unavailable — adapter without the timestamp-query feature',
    ])
  })

  it('prints nothing for an older report without the field', () => {
    expect(gpuPassSummaryLines(undefined, [{ config: 'baseline', phase: 'savanna-standing' }])).toEqual([])
  })
})

describe('run-wide pass identity', () => {
  it('keeps two targets of the same label apart, whichever runs in a frame', () => {
    const id = createPassIdentity()
    const sun = { texture: { name: 'ShadowMap' } }
    const fire = { texture: { name: 'ShadowMap' } }
    expect(id(sun)).toBe('ShadowMap')
    expect(id(fire)).toBe('ShadowMap#2')
    // A later frame with only the second target keeps its identity.
    expect(id(fire)).toBe('ShadowMap#2')
    expect(id(sun)).toBe('ShadowMap')
    expect(id(null)).toBe('canvas')
  })
})

describe('pass recorder (the live capture, without three)', () => {
  const sun = { texture: { name: 'ShadowMap' } }
  const fire = { texture: { name: 'ShadowMap' } }
  const out = { texture: { name: 'output' } }

  /** One frame as three 0.185 runs it: the scene pass begins, the shadow maps
   *  render nested inside it and are submitted first, the scene pass last. */
  const frame = (rec: ReturnType<typeof createPassRecorder>, f: number, shadows: Array<[object, number]>, sceneMs: number) => {
    const timestamps = new Map<string, number>()
    const sceneUid = `r:1:3:f${f}`
    rec.begin(sceneUid, out)
    shadows.forEach(([target, ms], i) => {
      const uid = `r:${i + 2}:2:f${f}`
      rec.begin(uid, target)
      rec.submit(uid)
      timestamps.set(uid, ms)
    })
    rec.submit(sceneUid)
    timestamps.set(sceneUid, sceneMs)
    return timestamps
  }

  it('reports shadow passes before the scene pass that samples them', () => {
    const rec = createPassRecorder()
    const timestamps = frame(rec, 1, [[sun, 2]], 9)
    const take = rec.take({ timestamps, frames: [1] })
    expect(take).toEqual({
      fresh: true,
      frame: 1,
      passes: [
        { pass: 'ShadowMap', call: 1, ms: 2 },
        { pass: 'output', call: 2, ms: 9 },
      ],
    })
  })

  it('keeps an intermittent second shadow under its own identity across frames', () => {
    const rec = createPassRecorder()
    const t1 = frame(rec, 1, [[sun, 2], [fire, 1]], 9)
    const a = rec.take({ timestamps: t1, frames: [1] })
    const t2 = frame(rec, 2, [[fire, 1.2]], 9)
    const b = rec.take({ timestamps: t2, frames: [2] })
    if (!a.fresh || !b.fresh) throw new Error('expected fresh takes')
    const passes = aggregatePasses([a.passes, b.passes])
    const fireRow = passes.find((p) => p.pass === 'ShadowMap#2')
    const sunRow = passes.find((p) => p.pass === 'ShadowMap')
    expect(fireRow?.frames).toBe(2)
    expect(sunRow?.frames).toBe(1)
    expect(sunRow?.mean).toBeCloseTo(1)
    expect(fireRow?.mean).toBeCloseTo(1.1)
  })

  it('marks a resolve that reported no new frame stale, so totals and passes stay paired', () => {
    const rec = createPassRecorder()
    const timestamps = frame(rec, 5, [[sun, 2]], 9)
    expect(rec.take({ timestamps, frames: [5] }).fresh).toBe(true)
    // three's cached lastValue: same frames, map already drained.
    expect(rec.take({ timestamps, frames: [5] })).toEqual({ fresh: false, reason: 'stale' })
    expect(rec.take({ timestamps, frames: [] })).toEqual({ fresh: false, reason: 'stale' })
    expect(rec.take(undefined)).toEqual({ fresh: false, reason: 'no-pool' })
    // The pool map is drained after a fresh take, so the run does not grow it.
    expect(timestamps.size).toBe(0)
  })
})
