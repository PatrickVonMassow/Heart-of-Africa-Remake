// Per-pass GPU breakdown of the F8 benchmark (point 1549): UID parsing, pass
// labels, the per-frame fold, the per-row aggregation and the digest lines.
// The live capture (three's timestamp pool on WebGPU) is scripts/verify/benchmark.mjs.

import { describe, it, expect } from 'vitest'
import {
  aggregatePasses,
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

  it('keeps only the asked frame, in call order, suffixing repeated labels', () => {
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
      { pass: 'output#2', call: 3, ms: 1.5 },
      { pass: 'canvas', call: 4, ms: 0.5 },
    ])
  })

  it('falls back to the call index when no label was recorded', () => {
    expect(framePasses([['r:5:9:f10', 2]], new Map(), 10)).toEqual([{ pass: 'pass 5', call: 5, ms: 2 }])
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

  it('builds no breakdown without measured frames', () => {
    expect(aggregatePasses([])).toEqual([])
    expect(passBreakdown([])).toBeNull()
    expect(passBreakdown([frame(2, 10)])).toEqual({
      frames: 1,
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
