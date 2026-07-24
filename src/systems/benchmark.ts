// In-game render benchmark (design.md §21.1, F8) — the PURE half: the config
// sweep plan, the route, the fixed-timestep clock, the statistics and the
// report shaping. Free of three.js, React and the stores, so all of it is
// unit-testable and the lazily loaded runner (benchmarkRun.ts) stays the only
// part that touches the live scene.
//
// WHY it exists: the headless numbers of docs/perf-276-findings.md were taken
// on a machine that is not geometry-bound, so they cannot decide which of the
// point-276 levers is worth shipping. The game measures on the player's own
// hardware instead, in the DELIVERED build, and hands back a report file.
//
// DETERMINISM is the whole point: two runs must differ ONLY in the graphics
// config, never in which animals spawned or which dramas fired. Hence the
// fixed seed, the fixed date, the fixed anchors and — above all — the FIXED
// SIMULATION TIMESTEP with a FIXED FRAME COUNT below: the simulation always
// sees dt = 1/60 s and always takes the same number of steps, so the path,
// the streaming crossings and every roll repeat exactly while only the
// measured wall-clock per frame varies.

import { QUALITY_PRESETS, type QualityPreset } from '../config/quality'

/** Simulation timestep every benchmark frame is stepped with (seconds). */
export const BENCH_DT = 1 / 60

/** World seed pinned for the whole run (any fixed value would do). */
export const BENCH_SEED = 18900701

/** Day 181 counted from 1 January 1890 = 1 July 1890: a fixed date, so the
 *  season, the flood and the vegetation state are the same for every config. */
export const BENCH_DAY = 181

/** Overland speed pinned for the driving leg (the shipped default). */
export const BENCH_TRAVEL_SPEED = 5.6

/** Bird's-eye zoom pinned for the run — the reachable default (design.md
 *  §21.4), never a debug wide zoom (CLAUDE.md §7.2, point 172). */
export const BENCH_ZOOM = 0.5

/** Debug render flags a config can override (src/state/ui.ts). */
export interface BenchFlags {
  traaEnabled?: boolean
  ssaoEnabled?: boolean
  shadowsEnabled?: boolean
  shadowMapHalf?: boolean
}

/**
 * Terrain near-ring refinement levers. The field names MUST match
 * `setTerrainRefine` in src/scenes/travel/terrainLod.ts — the runner passes
 * this object straight through, and a mismatched key silently does nothing
 * (it did: a `refine` key left point 209's refinement fully on while the
 * report claimed to have switched it off — caught by measuring the terrain
 * triangles, not by a green test).
 */
export interface BenchTerrainOverride {
  /** false switches point 209's near-ring refinement off entirely. */
  enabled?: boolean
  /** Caps the refined segment count (default 112). */
  segmentCap?: number
}

export interface BenchConfig {
  name: string
  flags: BenchFlags
  /** Renderer pixel-ratio cap; undefined keeps the display's own ratio. */
  pixelRatio?: number
  terrain?: BenchTerrainOverride
}

/**
 * The sweep. Every config runs the IDENTICAL route; `baseline` is first so the
 * rest read as deltas against it. The render-feature levers are the debug
 * switches; the geometry levers are the point-276 suspects (terrain refinement
 * and its segment cap); `dpr-1` prices the pixel count; `all-off` is every
 * lever at its cheapest — the floor the others are judged against.
 */
export const BENCH_CONFIGS: readonly BenchConfig[] = [
  { name: 'baseline', flags: {} },
  { name: 'traa-off', flags: { traaEnabled: false } },
  { name: 'ssao-off', flags: { ssaoEnabled: false } },
  { name: 'shadows-off', flags: { shadowsEnabled: false } },
  { name: 'shadow-half', flags: { shadowMapHalf: true } },
  { name: 'post-off', flags: { traaEnabled: false, ssaoEnabled: false } },
  { name: 'dpr-1', flags: {}, pixelRatio: 1 },
  { name: 'terrain-refine-off', flags: {}, terrain: { enabled: false } },
  { name: 'terrain-cap-84', flags: {}, terrain: { segmentCap: 84 } },
  {
    name: 'all-off',
    flags: { traaEnabled: false, ssaoEnabled: false, shadowsEnabled: false, shadowMapHalf: true },
    pixelRatio: 1,
    terrain: { enabled: false },
  },
]

/**
 * The row name of the point-293 LOW-preset profiling pass. The sweep above
 * forces the HIGH graphics level so every lever stays measurable; this extra
 * pass instead applies the actual LOW `QUALITY_PRESETS` values, so the report
 * can show WHERE the frame cost still sits at low and the player can decide the
 * next reduction. Kept distinct from the sweep's config names so the rows and
 * the low profile can be picked apart from one another.
 */
export const LOW_CONFIG_NAME = 'low-preset'

export type BenchPhaseName = 'savanna-standing' | 'desert-standing' | 'savanna-driving'

export interface BenchPhase {
  name: BenchPhaseName
  lat: number
  lon: number
  /** true = hold forward for the whole phase (the streaming/driving state). */
  drive: boolean
}

/**
 * The route: the three states of point 276 in order. The anchors are the ones
 * `scripts/perf-bench.mjs` measures, so the in-game numbers and the headless
 * ones describe the same places.
 */
export const BENCH_PHASES: readonly BenchPhase[] = [
  { name: 'savanna-standing', lat: -2.5, lon: 34.0, drive: false },
  { name: 'desert-standing', lat: 23.0, lon: 15.0, drive: false },
  { name: 'savanna-driving', lat: -2.5, lon: 34.0, drive: true },
]

export interface BenchFrameCounts {
  /** Frames run and DISCARDED after a jump/config change (pipeline rebuild,
   *  chunk and flora streaming settle here). */
  settle: number
  /** Frames MEASURED after the settle — the fixed step count. */
  sample: number
}

/** `?bench=short` shrinks the sample so the automated check finishes fast. */
export function benchShortMode(search: string): boolean {
  return /(^|[?&])bench=short(&|$)/.test(search)
}

/** Fixed frame budget per phase. Full run: 3 s of samples after 1.3 s settle. */
export function benchFrameCounts(short: boolean): BenchFrameCounts {
  return short ? { settle: 8, sample: 16 } : { settle: 80, sample: 150 }
}

/**
 * Total frames the run takes, warm-up pass included. The warm-up repeats the
 * route once at the baseline config and is DISCARDED: the first pass pays the
 * cold caches (terrain geometry, flora, shader compiles), and that cost must
 * not land on whichever config happens to run first.
 */
export function benchTotalFrames(short: boolean, configs: number = BENCH_CONFIGS.length): number {
  const c = benchFrameCounts(short)
  return (configs + 1) * BENCH_PHASES.length * (c.settle + c.sample)
}

export interface FrameStats {
  n: number
  median: number
  p95: number
  p99: number
  max: number
  /** Frames per second implied by the MEDIAN frame time. */
  fps: number
}

/** Percentile of a sorted array, the `scripts/perf-bench.mjs` convention. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

/** Median/p95/p99/max (ms) and the implied fps of a frame-time sample. */
export function frameStats(samples: readonly number[]): FrameStats {
  const s = [...samples].sort((a, b) => a - b)
  const median = quantile(s, 0.5)
  return {
    n: s.length,
    median,
    p95: quantile(s, 0.95),
    p99: quantile(s, 0.99),
    max: s.length === 0 ? 0 : s[s.length - 1],
    fps: median > 0 ? 1000 / median : 0,
  }
}

/**
 * Whether the wall-clock frame time looks VSYNC-CAPPED rather than
 * GPU-limited. A page cannot disable vsync, so a config that is comfortably
 * fast reads as a flat ~16.7 ms (or ~8.3 ms at 120 Hz) and the levers are
 * indistinguishable in the wall clock. The report carries the flag so a
 * capped number is never read as "this lever is worth nothing".
 */
export function vsyncLikely(stats: FrameStats): boolean {
  if (stats.n === 0) return false
  for (const hz of [60, 120, 144]) {
    const period = 1000 / hz
    if (Math.abs(stats.median - period) < period * 0.06) return true
  }
  return false
}

/** Which measured series actually answers "what does this lever cost?". */
export type BenchHeadline = 'gpu' | 'cpu' | 'wall'

/**
 * The series the report leads with.
 *
 * The question point 276 asks is a GPU question (terrain 1.99x, dressing
 * 2.41x): a config 40 % more expensive on the GPU shows up in NEITHER a
 * vsync-capped wall clock NOR the CPU time. So wherever real GPU timestamps
 * exist they are the headline; without them a capped wall clock is worthless
 * and only the CPU time carries information (it still misses pure GPU cost —
 * the report must say so rather than imply a verdict); only an UNCAPPED wall
 * clock is a trustworthy end-to-end number on its own.
 */
export function headlineSeries(gpuAvailable: boolean, vsyncCapped: boolean): BenchHeadline {
  if (gpuAvailable) return 'gpu'
  return vsyncCapped ? 'cpu' : 'wall'
}

/** One-line English note for the report digest (the UI localizes its own). */
export function headlineNote(headline: BenchHeadline, gpuReason: string): string {
  if (headline === 'gpu') return 'HEADLINE: gpu — real GPU timestamps, unaffected by vsync.'
  if (headline === 'wall') return 'HEADLINE: frame — the wall clock is not vsync-capped here, so it measures end to end.'
  return `HEADLINE: cpu — no GPU timestamps (${gpuReason}) and the wall clock is vsync-capped, so pure GPU cost is NOT measured here.`
}

/**
 * Fixed-timestep clock (the determinism device). R3F reads `clock.getDelta()`
 * exactly ONCE per frame and hands the result to every `useFrame`, and the
 * scenes read `clock.elapsedTime` for their animation phases — so replacing
 * those three on the live clock makes the whole simulation advance by exactly
 * `dt` per rendered frame, whatever the frame really took. Returns the restore
 * function; the runner calls it in a `finally`.
 */
export interface FixedClockTarget {
  elapsedTime: number
  getDelta(): number
  getElapsedTime(): number
}

export function installFixedClock(clock: FixedClockTarget, dt: number = BENCH_DT): () => void {
  const originalDelta = clock.getDelta
  const originalElapsed = clock.getElapsedTime
  const originalTime = clock.elapsedTime
  clock.getDelta = function fixedDelta(this: FixedClockTarget): number {
    // The single per-frame advance: the elapsed time moves in lockstep with
    // the simulation, never with the wall clock.
    this.elapsedTime += dt
    return dt
  }
  // Plain THREE.Clock.getElapsedTime() calls getDelta() internally, which
  // would advance the clock again for every reader. Here it only reads.
  clock.getElapsedTime = function fixedElapsed(this: FixedClockTarget): number {
    return this.elapsedTime
  }
  return () => {
    clock.getDelta = originalDelta
    clock.getElapsedTime = originalElapsed
    clock.elapsedTime = originalTime
  }
}

// --- Scene-graph triangle breakdown -----------------------------------------

/** Structural view of an Object3D — enough for the count, no three.js import. */
export interface BenchSceneNode {
  name?: string
  visible?: boolean
  isMesh?: boolean
  isInstancedMesh?: boolean
  count?: number
  geometry?: {
    index?: { count: number } | null
    attributes?: { position?: { count: number } }
  } | null
  material?: { name?: string; type?: string } | null
  children?: readonly BenchSceneNode[]
}

export interface BenchTriGroup {
  tris: number
  meshes: number
}

/** Triangles one mesh node draws (instances included). */
function nodeTriangles(node: BenchSceneNode): number {
  const g = node.geometry
  if (!g) return 0
  const verts = g.index ? g.index.count : (g.attributes?.position?.count ?? 0)
  return Math.round((verts / 3) * (node.isInstancedMesh ? (node.count ?? 1) : 1))
}

/** Group key: the nearest named ancestor with its instance index stripped, so
 *  `chunk-3,7` and `chunk-4,7` fold into one system row. Unnamed streamed
 *  geometry (terrain, ribbons, water sheets) falls back to its material. */
function groupKey(name: string | null, node: BenchSceneNode): string {
  if (name !== null) return name.replace(/-?\d+,-?\d+/, '').replace(/[\s-]*\d+$/, '') || name
  const mat = node.material?.name || node.material?.type || '?'
  return `(unnamed) ${mat}${node.isInstancedMesh ? ' [inst]' : ''}`
}

/**
 * Rendered triangles per system, attributing every visible mesh to its nearest
 * NAMED ancestor — the scene's own group names ARE the system boundaries
 * (the `scripts/perf-breakdown.mjs` rule, brought in-game). Invisible subtrees
 * are skipped: they cost nothing.
 */
export function sceneTriangleBreakdown(root: BenchSceneNode): Record<string, BenchTriGroup> {
  const out: Record<string, BenchTriGroup> = {}
  const walk = (node: BenchSceneNode, inherited: string | null): void => {
    if (node.visible === false) return
    const name = node.name ? node.name : inherited
    if (node.isMesh) {
      const key = groupKey(name, node)
      const row = (out[key] ??= { tris: 0, meshes: 0 })
      row.tris += nodeTriangles(node)
      row.meshes += 1
    }
    for (const child of node.children ?? []) walk(child, name)
  }
  walk(root, null)
  return out
}

// --- Report -----------------------------------------------------------------

export interface BenchEnvironment {
  userAgent: string
  /** 'webgpu' or 'webgl2' — the backend the renderer actually got. */
  backend: string
  /** Adapter/renderer string where the backend exposes one. */
  adapter: string
  viewport: { width: number; height: number }
  devicePixelRatio: number
  /** Vite build mode and the commit the bundle was built from. */
  build: string
  commit: string
  startedAt: string
}

export interface BenchRow {
  config: string
  phase: BenchPhaseName
  /** Wall-clock frame interval (ms) — vsync-capped, see `vsyncLikely`. */
  frame: FrameStats
  /** CPU time inside the frame (ms): every useFrame plus the render
   *  submission, measured between R3F's before/after effects. Not capped by
   *  vsync, but blind to pure GPU cost. */
  cpu: FrameStats
  /** REAL GPU time (ms) from the backend's timestamp queries — the series
   *  that answers the geometry question. null where unavailable (WebGL 2, or
   *  an adapter without `timestamp-query`); never fabricated. */
  gpu: FrameStats | null
  vsyncLikely: boolean
  drawCalls: number
  triangles: number
  /** Scene-graph triangles per system at the end of the sample. */
  sceneTriangles: Record<string, BenchTriGroup>
}

export interface BenchReport {
  app: string
  kind: 'render-benchmark'
  short: boolean
  seed: number
  day: number
  dt: number
  frames: BenchFrameCounts
  env: BenchEnvironment
  /** Whether real GPU timestamps were measured, and why not when they were
   *  not — an unavailable series is FLAGGED, never faked. */
  gpuTiming: { available: boolean; reason: string }
  /** The series to read as the result (see `headlineSeries`). */
  headline: BenchHeadline
  rows: BenchRow[]
  /** The point-293 LOW-preset cost profile: the per-system ranking at the low
   *  graphics level, so the player sees the dominant remaining systems and can
   *  pick the next cut. null if the low pass produced no rows (e.g. aborted). */
  lowProfile: BenchLowProfile | null
  /** Wall-clock duration of the whole sweep (ms). */
  durationMs: number
  aborted: boolean
  /** Human-readable digest, kept FIRST in the file (see `benchReportJson`). */
  summary?: string[]
}

// --- LOW-preset cost profile (point 293) ------------------------------------

/** One system's share of a phase's rendered triangles at the low preset. */
export interface BenchRankEntry {
  /** The scene-graph system name (the `sceneTriangleBreakdown` key). */
  system: string
  tris: number
  meshes: number
  /** Share of the phase's total rendered triangles, 0..1. */
  pct: number
}

/** The low-preset cost picture for one route phase. */
export interface BenchLowPhaseRanking {
  phase: BenchPhaseName
  /** Sum of the ranked systems' triangles (the scene-graph total). */
  totalTris: number
  /** `renderer.info` draw calls / triangles at the end of the phase's sample. */
  drawCalls: number
  triangles: number
  /** The whole-frame timing series at the low preset (per-system GPU cost is
   *  NOT attributable — timestamp queries are per render pass, not per object
   *  group — so the per-system split is by triangle share, and the frame series
   *  give the absolute cost the ranking sits inside). gpu is null off WebGPU. */
  frame: FrameStats
  cpu: FrameStats
  gpu: FrameStats | null
  /** Systems ranked most-expensive-first by triangle share. */
  ranking: BenchRankEntry[]
}

export interface BenchLowProfile {
  /** The LOW `QUALITY_PRESETS` values that were applied, echoed into the file. */
  preset: QualityPreset
  /** One ranked picture per route phase. */
  phases: BenchLowPhaseRanking[]
  /** The densest phase (most rendered triangles) — the worst case the "frame is
   *  dominated by …" digest line speaks about. */
  headlinePhase: BenchPhaseName
  /** The headline phase's top systems, for the digest dominance line. */
  dominant: BenchRankEntry[]
}

/**
 * Rank the systems of one scene-graph breakdown most-expensive-first by triangle
 * share — the honest per-system cost signal at a fixed preset (point 293).
 * Geometry is the lever the real-hardware benchmark proved dominant (points
 * 276/277: terrain 1.99x, dressing 2.41x), and the rendered triangle count is
 * the per-system attributable proxy for it: GPU timestamps resolve per render
 * pass, not per object group, so a per-system GPU split cannot be measured and
 * is never fabricated here. Ties break by name so the order is deterministic.
 */
export function rankSystemsByTriangles(breakdown: Record<string, BenchTriGroup>): BenchRankEntry[] {
  const total = Object.values(breakdown).reduce((sum, g) => sum + g.tris, 0)
  return Object.entries(breakdown)
    .map(([system, g]) => ({ system, tris: g.tris, meshes: g.meshes, pct: total > 0 ? g.tris / total : 0 }))
    .sort((a, b) => b.tris - a.tris || a.system.localeCompare(b.system))
}

/**
 * Build the low-preset profile from the sweep's rows: the LOW_CONFIG_NAME rows
 * ranked per phase, the densest phase chosen for the dominance digest. Returns
 * null when the low pass produced no rows. `topN` caps the dominance list.
 */
export function buildLowProfile(rows: readonly BenchRow[], topN = 5): BenchLowProfile | null {
  const lowRows = rows.filter((r) => r.config === LOW_CONFIG_NAME)
  if (lowRows.length === 0) return null
  const phases: BenchLowPhaseRanking[] = lowRows.map((r) => {
    const ranking = rankSystemsByTriangles(r.sceneTriangles)
    return {
      phase: r.phase,
      totalTris: ranking.reduce((sum, e) => sum + e.tris, 0),
      drawCalls: r.drawCalls,
      triangles: r.triangles,
      frame: r.frame,
      cpu: r.cpu,
      gpu: r.gpu,
      ranking,
    }
  })
  const headline = phases.reduce((a, b) => (b.totalTris > a.totalTris ? b : a))
  return {
    preset: QUALITY_PRESETS.low,
    phases,
    headlinePhase: headline.phase,
    dominant: headline.ranking.slice(0, topN),
  }
}

/** "terrain 42 %, flora 28 %, wildlife 12 %" from a ranked list. */
export function formatDominance(entries: readonly BenchRankEntry[]): string {
  return entries.map((e) => `${e.system} ${Math.round(e.pct * 100)} %`).join(', ')
}

/**
 * Digest lines for the low-preset profile, appended after the sweep table so
 * the file names the remaining cost centres at a glance (point 293).
 */
export function lowProfileSummaryLines(profile: BenchLowProfile): string[] {
  const lines = [
    '',
    'LOW PRESET PROFILE — where the frame cost still sits at the low graphics level:',
    `at LOW the frame is dominated by: ${formatDominance(profile.dominant)}  (${profile.headlinePhase})`,
  ]
  for (const p of profile.phases) {
    const gpu = p.gpu ? `${p.gpu.median.toFixed(2)}ms gpu` : 'gpu n/a'
    lines.push(`  ${pad(p.phase, 18)}${padStart(String(p.totalTris), 9)} tris · ${padStart(String(p.drawCalls), 5)} draws · ${gpu} · ${p.cpu.median.toFixed(2)}ms cpu · ${p.frame.median.toFixed(2)}ms frame`)
    for (const e of p.ranking.slice(0, 6)) {
      lines.push(`    ${pad(e.system, 22)}${padStart(String(e.tris), 9)}${padStart(`${Math.round(e.pct * 100)}%`, 5)}${padStart(`${e.meshes} mesh`, 10)}`)
    }
  }
  return lines
}

export const BENCH_APP = 'The Heart of Africa (POC remake)'

/** Download filename `hoa-bench-<YYYY-MM-DD>-<backend>.json` (design.md §21.1). */
export function benchFilename(backend: string, date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const tag = backend.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'unknown'
  return `hoa-bench-${y}-${m}-${d}-${tag}.json`
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}
function padStart(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

/**
 * Short human-readable digest so the file can be sanity-checked at a glance
 * before it is sent — one table row per config × phase.
 */
export function benchSummaryLines(report: BenchReport): string[] {
  const e = report.env
  const num = (v: number | undefined): string => (v === undefined ? '—' : v.toFixed(2))
  const lines = [
    `${report.app} — render benchmark${report.short ? ' (short mode)' : ''}${report.aborted ? ' — ABORTED' : ''}`,
    `${e.startedAt} · ${e.backend} · ${e.viewport.width}x${e.viewport.height} @dpr ${e.devicePixelRatio} · build ${e.build} ${e.commit}`,
    `fixed timestep ${report.dt.toFixed(5)}s · ${report.frames.sample} sampled frames per phase · seed ${report.seed} · day ${report.day}`,
    headlineNote(report.headline, report.gpuTiming.reason),
    `${pad('config', 20)}${pad('phase', 18)}${padStart('fps', 7)}${padStart('gpu', 8)}${padStart('gpu95', 8)}${padStart('cpu', 8)}${padStart('frame', 8)}${padStart('f95', 8)}${padStart('draws', 8)}${padStart('tris', 10)}`,
  ]
  for (const r of report.rows) {
    lines.push(
      pad(r.config, 20) +
        pad(r.phase, 18) +
        padStart(r.frame.fps.toFixed(1), 7) +
        padStart(num(r.gpu?.median), 8) +
        padStart(num(r.gpu?.p95), 8) +
        padStart(num(r.cpu.median), 8) +
        padStart(num(r.frame.median), 8) +
        padStart(num(r.frame.p95), 8) +
        padStart(String(r.drawCalls), 8) +
        padStart(String(r.triangles), 10) +
        (r.vsyncLikely ? '  [vsync-capped]' : ''),
    )
  }
  if (report.lowProfile) lines.push(...lowProfileSummaryLines(report.lowProfile))
  return lines
}

/** The report file: valid JSON whose FIRST key is the readable digest. */
export function benchReportJson(report: BenchReport): string {
  return JSON.stringify({ summary: benchSummaryLines(report), ...report }, null, 2)
}

/** Remaining wall-clock estimate (ms) from the frames left and the pace so far. */
export function benchRemainingMs(framesDone: number, framesTotal: number, elapsedMs: number): number {
  if (framesDone <= 0) return 0
  const perFrame = elapsedMs / framesDone
  return Math.max(0, Math.round((framesTotal - framesDone) * perFrame))
}

/** `m:ss` for the progress overlay. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
