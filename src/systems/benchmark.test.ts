// In-game render benchmark (design.md §21.1, F8, CLAUDE.md §7.1 pt. 20): the
// pure layer — the sweep plan, the fixed-step route, the fixed-timestep clock,
// the statistics, the scene-graph breakdown and the report shaping. The live
// half (F8 driving the real scene) is scripts/verify/benchmark.mjs.

import { describe, it, expect } from 'vitest'
import {
  BENCH_APP,
  BENCH_CONFIGS,
  BENCH_DAY,
  BENCH_DT,
  BENCH_PHASES,
  BENCH_SEED,
  BENCH_ZOOM,
  benchFilename,
  benchFrameCounts,
  benchRemainingMs,
  benchReportJson,
  benchShortMode,
  benchSummaryLines,
  benchTotalFrames,
  formatDuration,
  frameStats,
  headlineNote,
  headlineSeries,
  installFixedClock,
  sceneTriangleBreakdown,
  vsyncLikely,
  type BenchReport,
  type BenchSceneNode,
} from './benchmark'

describe('benchmark sweep plan (design.md §21.1)', () => {
  it('sweeps every lever of the point-276 findings, baseline first', () => {
    expect(BENCH_CONFIGS[0].name).toBe('baseline')
    expect(BENCH_CONFIGS[0].flags).toEqual({})
    const names = BENCH_CONFIGS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const want of [
      'traa-off',
      'ssao-off',
      'shadows-off',
      'shadow-half',
      'post-off',
      'dpr-1',
      'terrain-refine-off',
      'terrain-cap-84',
      'all-off',
    ]) {
      expect(names).toContain(want)
    }
  })

  it('the terrain levers carry the runtime overrides the runner applies', () => {
    const refineOff = BENCH_CONFIGS.find((c) => c.name === 'terrain-refine-off')
    expect(refineOff?.terrain).toEqual({ enabled: false })
    const cap = BENCH_CONFIGS.find((c) => c.name === 'terrain-cap-84')
    expect(cap?.terrain).toEqual({ segmentCap: 84 })
    expect(BENCH_CONFIGS.find((c) => c.name === 'dpr-1')?.pixelRatio).toBe(1)
  })

  it('"all-off" is every lever at its cheapest — the floor of the sweep', () => {
    const all = BENCH_CONFIGS.find((c) => c.name === 'all-off')
    expect(all?.flags).toEqual({
      traaEnabled: false,
      ssaoEnabled: false,
      shadowsEnabled: false,
      shadowMapHalf: true,
    })
    expect(all?.pixelRatio).toBe(1)
    expect(all?.terrain).toEqual({ enabled: false })
  })
})

describe('benchmark route (the three point-276 states)', () => {
  it('visits dense savanna, empty desert and the savanna drive, in order', () => {
    expect(BENCH_PHASES.map((p) => p.name)).toEqual(['savanna-standing', 'desert-standing', 'savanna-driving'])
    // The same anchors scripts/perf-bench.mjs measures, so both agree.
    expect(BENCH_PHASES[0]).toMatchObject({ lat: -2.5, lon: 34.0, drive: false })
    expect(BENCH_PHASES[1]).toMatchObject({ lat: 23.0, lon: 15.0, drive: false })
    expect(BENCH_PHASES[2]).toMatchObject({ lat: -2.5, lon: 34.0, drive: true })
  })

  it('pins the deterministic run state (seed, date, reachable zoom, timestep)', () => {
    expect(BENCH_SEED).toBeGreaterThan(0)
    expect(BENCH_DAY).toBe(181) // 1 July 1890 — a fixed season for every config
    expect(BENCH_ZOOM).toBe(0.5) // the reachable default, never a debug wide zoom
    expect(BENCH_DT).toBeCloseTo(1 / 60, 10)
  })

  it('runs a FIXED frame count per phase; short mode only shrinks it', () => {
    const full = benchFrameCounts(false)
    const short = benchFrameCounts(true)
    expect(short.sample).toBeLessThan(full.sample)
    expect(short.settle).toBeLessThan(full.settle)
    for (const c of [full, short]) {
      expect(c.settle).toBeGreaterThan(0)
      expect(c.sample).toBeGreaterThan(0)
    }
  })

  it('counts the discarded warm-up pass into the total, and stays under ~3 min at 60 Hz', () => {
    const c = benchFrameCounts(false)
    const total = benchTotalFrames(false)
    expect(total).toBe((BENCH_CONFIGS.length + 1) * BENCH_PHASES.length * (c.settle + c.sample))
    expect(total / 60).toBeLessThan(180)
    expect(benchTotalFrames(true)).toBeLessThan(total)
  })

  it('reads the short-mode query parameter', () => {
    expect(benchShortMode('?bench=short')).toBe(true)
    expect(benchShortMode('?lang=de&bench=short')).toBe(true)
    expect(benchShortMode('?bench=short&lang=de')).toBe(true)
    expect(benchShortMode('')).toBe(false)
    expect(benchShortMode('?bench=long')).toBe(false)
    expect(benchShortMode('?nobench=short')).toBe(false)
  })
})

describe('fixed-timestep clock (the determinism device)', () => {
  // A stand-in for THREE.Clock, whose getElapsedTime() advances via getDelta()
  // — the very behaviour the fixed clock has to neutralise.
  const makeClock = () => ({
    elapsedTime: 0,
    getDelta(): number {
      this.elapsedTime += 0.037
      return 0.037
    },
    getElapsedTime(): number {
      this.getDelta()
      return this.elapsedTime
    },
  })

  it('hands every frame the same dt however long it really took', () => {
    const clock = makeClock()
    const restore = installFixedClock(clock, 1 / 60)
    const deltas = [clock.getDelta(), clock.getDelta(), clock.getDelta()]
    expect(deltas).toEqual([1 / 60, 1 / 60, 1 / 60])
    restore()
  })

  it('advances the elapsed time once per frame — readers never move it', () => {
    const clock = makeClock()
    const restore = installFixedClock(clock, 1 / 60)
    clock.getDelta()
    // Many systems read clock.elapsedTime / getElapsedTime() per frame; none
    // of those reads may advance the simulation.
    for (let i = 0; i < 20; i++) expect(clock.getElapsedTime()).toBeCloseTo(1 / 60, 10)
    expect(clock.elapsedTime).toBeCloseTo(1 / 60, 10)
    clock.getDelta()
    expect(clock.getElapsedTime()).toBeCloseTo(2 / 60, 10)
    restore()
  })

  it('two runs of the same frame count reach the identical simulated time', () => {
    const run = (): number => {
      const clock = makeClock()
      const restore = installFixedClock(clock, 1 / 60)
      for (let i = 0; i < 150; i++) clock.getDelta()
      const t = clock.getElapsedTime()
      restore()
      return t
    }
    expect(run()).toBe(run())
    expect(run()).toBeCloseTo(150 / 60, 10)
  })

  it('restores the original clock methods and time', () => {
    const clock = makeClock()
    const originalDelta = clock.getDelta
    const originalElapsed = clock.getElapsedTime
    clock.elapsedTime = 4.2
    const restore = installFixedClock(clock, 1 / 60)
    clock.getDelta()
    restore()
    expect(clock.getDelta).toBe(originalDelta)
    expect(clock.getElapsedTime).toBe(originalElapsed)
    expect(clock.elapsedTime).toBe(4.2)
  })
})

describe('frame statistics', () => {
  it('reports median, p95, p99, max and the implied fps', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100 ms
    const s = frameStats(samples)
    expect(s.n).toBe(100)
    expect(s.median).toBe(51)
    expect(s.p95).toBe(96)
    expect(s.p99).toBe(100)
    expect(s.max).toBe(100)
    expect(s.fps).toBeCloseTo(1000 / 51, 6)
  })

  it('is order-independent and survives an empty sample', () => {
    expect(frameStats([9, 1, 5]).median).toBe(frameStats([5, 9, 1]).median)
    expect(frameStats([])).toEqual({ n: 0, median: 0, p95: 0, p99: 0, max: 0, fps: 0 })
  })

  it('flags a vsync-capped sample so the analysis is not misread', () => {
    expect(vsyncLikely(frameStats(Array(50).fill(16.7)))).toBe(true)
    expect(vsyncLikely(frameStats(Array(50).fill(8.33)))).toBe(true)
    expect(vsyncLikely(frameStats(Array(50).fill(24)))).toBe(false)
    expect(vsyncLikely(frameStats([]))).toBe(false)
  })
})

describe('which series is the trustworthy result', () => {
  it('GPU timestamps always win — they answer the geometry question', () => {
    // The point-276 regression is GEOMETRY: a config 40 % more expensive on
    // the GPU moves NEITHER a capped wall clock NOR the CPU time.
    expect(headlineSeries(true, true)).toBe('gpu')
    expect(headlineSeries(true, false)).toBe('gpu')
  })

  it('without GPU times a capped wall clock is worthless, so the CPU leads', () => {
    expect(headlineSeries(false, true)).toBe('cpu')
  })

  it('without GPU times an UNCAPPED wall clock is the end-to-end number', () => {
    expect(headlineSeries(false, false)).toBe('wall')
  })

  it('the note names the missing feature and warns that GPU cost is unmeasured', () => {
    const note = headlineNote('cpu', 'WebGL 2 backend has no timestamp queries')
    expect(note).toContain('WebGL 2 backend has no timestamp queries')
    expect(note).toMatch(/NOT measured/)
    expect(headlineNote('gpu', '')).toMatch(/vsync/)
    expect(headlineNote('wall', '')).toMatch(/end to end/)
  })
})

describe('scene-graph triangle breakdown', () => {
  const mesh = (name: string | undefined, verts: number, extra: Partial<BenchSceneNode> = {}): BenchSceneNode => ({
    name,
    isMesh: true,
    geometry: { attributes: { position: { count: verts } } },
    ...extra,
  })

  it('sums triangles per named system, instances multiplied', () => {
    const root: BenchSceneNode = {
      name: 'root',
      children: [
        { name: 'flora', children: [mesh(undefined, 30, { isInstancedMesh: true, count: 10 })] },
        { name: 'wildlife', children: [mesh(undefined, 30), mesh(undefined, 60)] },
      ],
    }
    const out = sceneTriangleBreakdown(root)
    expect(out.flora).toEqual({ tris: 100, meshes: 1 })
    expect(out.wildlife).toEqual({ tris: 30, meshes: 2 })
  })

  it('prefers the index count and folds per-chunk names into one system row', () => {
    const root: BenchSceneNode = {
      children: [
        {
          name: 'terrain-chunk-3,7',
          children: [mesh(undefined, 999, { geometry: { index: { count: 300 }, attributes: { position: { count: 999 } } } })],
        },
        {
          name: 'terrain-chunk-4,7',
          children: [mesh(undefined, 999, { geometry: { index: { count: 300 }, attributes: { position: { count: 999 } } } })],
        },
      ],
    }
    const out = sceneTriangleBreakdown(root)
    expect(Object.keys(out)).toHaveLength(1)
    expect(Object.values(out)[0]).toEqual({ tris: 200, meshes: 2 })
  })

  it('skips invisible subtrees — they cost nothing', () => {
    const root: BenchSceneNode = {
      children: [
        { name: 'hidden', visible: false, children: [mesh(undefined, 300)] },
        { name: 'shown', children: [mesh(undefined, 300)] },
      ],
    }
    const out = sceneTriangleBreakdown(root)
    expect(out.hidden).toBeUndefined()
    expect(out.shown.tris).toBe(100)
  })

  it('falls back to the material for unnamed streamed geometry', () => {
    const root: BenchSceneNode = {
      children: [mesh(undefined, 300, { material: { name: 'water' } })],
    }
    expect(sceneTriangleBreakdown(root)['(unnamed) water']).toEqual({ tris: 100, meshes: 1 })
  })
})

describe('report shaping', () => {
  const report = (gpu = true): BenchReport => ({
    app: BENCH_APP,
    kind: 'render-benchmark',
    short: true,
    seed: BENCH_SEED,
    day: BENCH_DAY,
    dt: BENCH_DT,
    frames: benchFrameCounts(true),
    env: {
      userAgent: 'test-agent',
      backend: 'webgpu',
      adapter: 'Test Adapter',
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      build: 'production',
      commit: 'abc1234',
      startedAt: '2026-07-24T10:00:00.000Z',
    },
    gpuTiming: gpu ? { available: true, reason: '' } : { available: false, reason: 'WebGL 2 backend has no timestamp queries' },
    headline: headlineSeries(gpu, !gpu),
    rows: [
      {
        config: 'baseline',
        phase: 'savanna-standing',
        frame: frameStats([8, 9, 10]),
        cpu: frameStats([3, 4, 5]),
        gpu: gpu ? frameStats([6, 6.5, 7]) : null,
        vsyncLikely: !gpu,
        drawCalls: 412,
        triangles: 1234567,
        sceneTriangles: { terrain: { tris: 847076, meshes: 169 } },
      },
    ],
    durationMs: 12345,
    aborted: false,
  })

  it('names the file with the date and the backend', () => {
    expect(benchFilename('webgpu', new Date(2026, 6, 24))).toBe('hoa-bench-2026-07-24-webgpu.json')
    expect(benchFilename('webgl2', new Date(2026, 0, 3))).toBe('hoa-bench-2026-01-03-webgl2.json')
    expect(benchFilename('', new Date(2026, 0, 3))).toBe('hoa-bench-2026-01-03-unknown.json')
  })

  it('writes a human-readable digest naming the environment and every row', () => {
    const lines = benchSummaryLines(report())
    expect(lines[0]).toContain('render benchmark')
    expect(lines[1]).toContain('webgpu')
    expect(lines[1]).toContain('1440x900')
    expect(lines[1]).toContain('abc1234')
    expect(lines[2]).toContain('seed')
    // The series to read comes BEFORE the table, not as a footnote.
    expect(lines[3]).toContain('HEADLINE: gpu')
    expect(lines[4]).toContain('gpu')
    expect(lines.some((l) => l.includes('baseline') && l.includes('savanna-standing'))).toBe(true)
    expect(lines).toHaveLength(6) // 3 header lines + headline + table head + one row
  })

  it('prints the GPU column where it exists and a dash where it does not', () => {
    const withGpu = benchSummaryLines(report()).at(-1) ?? ''
    expect(withGpu).toContain('6.50') // the gpu median of [6, 6.5, 7]
    const withoutGpu = benchSummaryLines(report(false))
    expect(withoutGpu[3]).toContain('HEADLINE: cpu')
    expect(withoutGpu[3]).toContain('WebGL 2 backend has no timestamp queries')
    expect(withoutGpu.at(-1)).toContain('—')
    expect(withoutGpu.at(-1)).toContain('[vsync-capped]')
  })

  it('is valid JSON that leads with the digest and states the GPU availability', () => {
    const json = benchReportJson(report())
    const parsed = JSON.parse(json) as {
      summary: string[]
      rows: Array<{ gpu: unknown }>
      gpuTiming: { available: boolean }
      headline: string
    }
    expect(Object.keys(parsed)[0]).toBe('summary')
    expect(parsed.summary.length).toBeGreaterThan(3)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.gpuTiming.available).toBe(true)
    expect(parsed.headline).toBe('gpu')
    expect(parsed.rows[0].gpu).not.toBeNull()

    // Unavailable is FLAGGED, never fabricated.
    const none = JSON.parse(benchReportJson(report(false))) as {
      rows: Array<{ gpu: unknown }>
      gpuTiming: { available: boolean; reason: string }
      headline: string
    }
    expect(none.gpuTiming).toEqual({ available: false, reason: 'WebGL 2 backend has no timestamp queries' })
    expect(none.headline).toBe('cpu')
    expect(none.rows[0].gpu).toBeNull()
  })

  it('estimates the remaining time from the pace so far', () => {
    expect(benchRemainingMs(100, 300, 1000)).toBe(2000)
    expect(benchRemainingMs(0, 300, 0)).toBe(0)
    expect(benchRemainingMs(300, 300, 5000)).toBe(0)
  })

  it('formats a duration as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(9000)).toBe('0:09')
    expect(formatDuration(125000)).toBe('2:05')
  })
})
