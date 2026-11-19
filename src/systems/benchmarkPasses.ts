// Per-pass GPU breakdown for the F8 render benchmark (point 1549) — the PURE
// half: parsing three's timestamp UIDs, labelling a pass, folding one frame's
// pass durations and aggregating them per report row. Free of three.js, so all
// of it is unit-testable; benchmarkRun.ts feeds it from the live renderer.
//
// WHY: the whole-frame GPU median cannot say WHICH pass grows when a lever is
// switched off (the shadows-off inversion of point 1549 raised the GPU median
// while draws and triangles fell). three's WebGPUTimestampQueryPool already
// times every render pass separately; this keeps that split instead of only
// its sum, so a run on the affected hardware names the growing pass.
//
// three 0.185 UID scheme (Backend.updateTimeStampUID): a render pass is
// `r:<frameCalls>:<renderContextId>:f<frame>`, where frameCalls is the
// 1-based index of the render call within the frame — i.e. the PASS ORDER.
// Render contexts are shared between targets of equal format, so the context
// id is not a pass identity; the label comes from the render target instead,
// recorded per UID when the pass begins.

/** One render pass of one frame. */
export interface BenchPassSample {
  /** Stable key within the frame: the label, suffixed `#2`, `#3`… for repeats. */
  pass: string
  /** 1-based render-call index within the frame (the pass order). */
  call: number
  /** GPU duration of the pass (ms). */
  ms: number
}

/** One pass aggregated over a row's measured frames. */
export interface BenchGpuPass {
  pass: string
  /** Mean pass order over the frames it ran in (the report sorts by it). */
  order: number
  /** Measured frames the pass ran in (an intermittent pass runs in fewer). */
  frames: number
  /** Median duration over the frames the pass ran in (ms). */
  median: number
  /** Mean cost PER MEASURED FRAME, absent frames counted as 0 (ms). These
   *  means add up to the mean whole-frame GPU time, so they are the additive
   *  share a lever moves. */
  mean: number
}

interface ParsedRenderUid {
  call: number
  context: number
  frame: number
}

/** Parse a three render-pass timestamp UID; null for compute or foreign UIDs. */
export function parseRenderUid(uid: string): ParsedRenderUid | null {
  const m = /^r:(\d+):(\d+):f(\d+)$/.exec(uid)
  if (!m) return null
  return { call: Number(m[1]), context: Number(m[2]), frame: Number(m[3]) }
}

/** Structural view of a render target — enough for a label, no three import. */
export interface BenchPassTarget {
  name?: string
  texture?: { name?: string } | null
}

/**
 * Human label of a pass from its render target: the target's texture name
 * (three names its own: `ShadowMap`, `output`, `TRAANode.resolve`,
 * `GTAONode.AO`), else the target's name, else `target`; the canvas when the
 * pass renders to the screen.
 */
export function passLabel(target: BenchPassTarget | null | undefined): string {
  if (!target) return 'canvas'
  return target.texture?.name || target.name || 'target'
}

/**
 * The passes of ONE frame in pass order, from the pool's uid→ms map and the
 * uid→label map recorded when each pass began. Entries of other frames and
 * non-render UIDs are ignored; a repeated label is suffixed `#2`, `#3`… so
 * every pass of the frame keeps its own key.
 */
export function framePasses(
  timestamps: Iterable<readonly [string, number]>,
  labels: ReadonlyMap<string, string>,
  frame: number,
): BenchPassSample[] {
  const rows: Array<{ call: number; label: string; ms: number }> = []
  for (const [uid, ms] of timestamps) {
    const p = parseRenderUid(uid)
    if (!p || p.frame !== frame || !Number.isFinite(ms)) continue
    rows.push({ call: p.call, label: labels.get(uid) ?? `pass ${p.call}`, ms })
  }
  rows.sort((a, b) => a.call - b.call)
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const n = (seen.get(r.label) ?? 0) + 1
    seen.set(r.label, n)
    return { pass: n === 1 ? r.label : `${r.label}#${n}`, call: r.call, ms: r.ms }
  })
}

/** The latest frame number among a resolve's frames (three's `pool.frames`). */
export function latestFrame(frames: readonly number[]): number | null {
  return frames.length === 0 ? null : frames[frames.length - 1]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  // The frameStats convention (benchmark.ts): the floor(n/2) element.
  return s[Math.floor(s.length / 2)]
}

/**
 * Aggregate a row's measured frames into one entry per pass, sorted by the
 * mean pass order (ties by name). Empty input → empty list.
 */
export function aggregatePasses(frames: readonly (readonly BenchPassSample[])[]): BenchGpuPass[] {
  const byPass = new Map<string, { ms: number[]; calls: number[] }>()
  for (const frame of frames) {
    for (const s of frame) {
      const e = byPass.get(s.pass) ?? { ms: [], calls: [] }
      e.ms.push(s.ms)
      e.calls.push(s.call)
      byPass.set(s.pass, e)
    }
  }
  const n = frames.length
  return [...byPass.entries()]
    .map(([pass, e]) => ({
      pass,
      order: e.calls.reduce((a, b) => a + b, 0) / e.calls.length,
      frames: e.ms.length,
      median: median(e.ms),
      mean: n > 0 ? e.ms.reduce((a, b) => a + b, 0) / n : 0,
    }))
    .sort((a, b) => a.order - b.order || a.pass.localeCompare(b.pass))
}

/** A row's breakdown: the measured frames it covers and its passes. */
export interface BenchGpuPassBreakdown {
  /** Measured frames whose passes were resolved (the mean's denominator). */
  frames: number
  passes: BenchGpuPass[]
}

/** Build a row's breakdown from its measured frames; null without frames. */
export function passBreakdown(frames: readonly (readonly BenchPassSample[])[]): BenchGpuPassBreakdown | null {
  return frames.length === 0 ? null : { frames: frames.length, passes: aggregatePasses(frames) }
}

/** Report-level availability of the breakdown — flagged, never faked. */
export interface BenchGpuPassTiming {
  available: boolean
  reason: string
}

/** The row fields the digest reads (a structural subset of BenchRow). */
interface PassRow {
  config: string
  phase: string
  gpuPasses?: BenchGpuPassBreakdown | null
}

/** `ShadowMap 3.21 (75/150)` — mean per measured frame, plus the frames it ran
 *  in when that is not every one. */
export function formatPass(p: BenchGpuPass, measuredFrames: number): string {
  const share = p.frames < measuredFrames ? ` (${p.frames}/${measuredFrames})` : ''
  return `${p.pass} ${p.mean.toFixed(2)}${share}`
}

/**
 * Digest lines of the breakdown: one line per row, the passes in pass order
 * with their mean ms per measured frame. Unavailable → one line saying why;
 * an older report without the field → nothing.
 */
export function gpuPassSummaryLines(timing: BenchGpuPassTiming | undefined, rows: readonly PassRow[]): string[] {
  if (!timing) return []
  if (!timing.available) return ['', `GPU PASS BREAKDOWN: unavailable — ${timing.reason}`]
  const lines = ['', 'GPU PASS BREAKDOWN — mean ms per measured frame, in pass order (frames ran/measured where fewer):']
  for (const r of rows) {
    const b = r.gpuPasses
    const body = b && b.passes.length > 0 ? b.passes.map((p) => formatPass(p, b.frames)).join(' | ') : 'n/a'
    lines.push(`  ${r.config} / ${r.phase}: ${body}`)
  }
  return lines
}
