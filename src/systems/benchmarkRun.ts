// In-game render benchmark (design.md §21.1, F8) — the RUNNER: drives the
// fixed route through the config sweep of benchmark.ts on the live scene and
// hands back a downloadable report.
//
// SHIPS IN THE DELIVERED BUILD (CLAUDE.md §7.1 pt. 20) — the numbers must come
// from the player's own hardware and the deployed bundle, not from a dev
// build. It is therefore NOT dev-gated; instead this module is imported
// LAZILY on the F8 keypress (like the TTS stack), so nothing of it enters the
// eager startup chunks.
//
// DETERMINISM (the reason the benchmark exists at all — two runs are otherwise
// incomparable, since other animals spawn and other dramas fire):
//   1. a seeded PRNG replaces Math.random for the run, restored in a finally,
//      so systems that roll directly are pinned too;
//   2. every phase resets the world seed, the date, the position, the travel
//      speed, the zoom, the journal and the event/deadline switches;
//   3. the frame clock is pinned to a FIXED TIMESTEP and every phase runs a
//      FIXED FRAME COUNT — the simulation therefore takes the identical steps
//      in every config, and only the measured wall-clock varies.

import { addAfterEffect, addEffect } from '@react-three/fiber'
import { balance } from '../config/balance'
import { getStrings } from '../i18n'
import { getRenderContext } from '../render/renderContext'
import { getTerrainRefine, resetTerrainRefine, setTerrainRefine } from '../scenes/travel/terrainLod'
import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import { mulberry32 } from '../world/noise'
import {
  BENCH_APP,
  BENCH_CONFIGS,
  BENCH_DAY,
  BENCH_DT,
  BENCH_PHASES,
  BENCH_SEED,
  BENCH_TRAVEL_SPEED,
  BENCH_ZOOM,
  benchFilename,
  benchFrameCounts,
  benchRemainingMs,
  benchReportJson,
  benchShortMode,
  benchTotalFrames,
  frameStats,
  headlineSeries,
  installFixedClock,
  sceneTriangleBreakdown,
  vsyncLikely,
  type BenchConfig,
  type BenchPhase,
  type BenchReport,
  type BenchRow,
  type BenchSceneNode,
} from './benchmark'

/** One rendered frame's two measurements. */
interface FrameSample {
  /** Wall-clock interval to the previous frame (ms) — vsync-capped. */
  frameMs: number
  /** CPU time inside the frame (ms): useFrame work plus render submission. */
  cpuMs: number
}

/** Raised when Esc aborts the run; unwinds to the restore block. */
class BenchAborted extends Error {}

/** A run that stops receiving frames (backgrounded tab, lost context) must not
 *  hang the overlay forever. */
const FRAME_STALL_MS = 20000

/** Guards a second run: the HUD checks the UI store, this catches the rest. */
let running = false

function pressKey(code: string, down: boolean): void {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }))
}

// --- GPU timing (the series the geometry question actually needs) ------------

/** Minimal structural view of the renderer's timestamp plumbing (three 0.185). */
interface TimestampRenderer {
  backend?: { isWebGPUBackend?: boolean; trackTimestamp?: boolean }
  hasFeature?: (name: string) => boolean
  resolveTimestampsAsync?: (type?: string) => Promise<number | undefined>
}

interface GpuTimer {
  available: boolean
  /** Why GPU time is missing — carried into the report, never a fake number. */
  reason: string
  /** Kick a resolve if none is in flight; a settled one appends to `sink`. */
  poll(sink: number[] | null): void
  /** Await the in-flight resolve (and one more) so a phase's samples are in. */
  flush(sink: number[] | null): Promise<void>
  restore(): void
}

/**
 * Real GPU milliseconds per frame via the WebGPU backend's timestamp queries.
 *
 * Why it matters: point 276's regression is GEOMETRY (terrain 1.99x, dressing
 * 2.41x). A page cannot disable vsync, so a config 40 % more expensive on the
 * GPU reads as a flat 16.7 ms wall clock AND as unchanged CPU time — exactly
 * the lever the benchmark exists to price would look free. `trackTimestamp`
 * makes three write timestamp queries around every render pass;
 * `resolveTimestampsAsync('render')` returns the summed GPU duration of the
 * last frame in the resolved batch.
 *
 * three requests every adapter-supported feature at device creation, so
 * `timestamp-query` is already enabled where the hardware has it and the flag
 * can be flipped for the run and restored afterwards. Everything here is
 * defensive: a missing feature or a throwing resolve marks the series
 * unavailable and the run continues on the other two.
 */
function createGpuTimer(gl: unknown): GpuTimer {
  const renderer = gl as TimestampRenderer
  const backend = renderer.backend
  const off: GpuTimer = {
    available: false,
    reason: '',
    poll: () => {},
    flush: () => Promise.resolve(),
    restore: () => {},
  }
  if (!backend || backend.isWebGPUBackend !== true) {
    return { ...off, reason: 'WebGL 2 backend has no timestamp queries' }
  }
  if (typeof renderer.resolveTimestampsAsync !== 'function') {
    return { ...off, reason: 'renderer exposes no timestamp resolve' }
  }
  try {
    if (renderer.hasFeature?.('timestamp-query') !== true) {
      return { ...off, reason: 'adapter without the timestamp-query feature' }
    }
  } catch {
    return { ...off, reason: 'timestamp-query feature check failed' }
  }
  const originalTrack = backend.trackTimestamp === true
  backend.trackTimestamp = true

  const timer: GpuTimer = {
    available: true,
    reason: '',
    poll: () => {},
    flush: () => Promise.resolve(),
    restore: () => {
      backend.trackTimestamp = originalTrack
    },
  }
  let inFlight: Promise<void> | null = null
  const resolveOnce = (sink: number[] | null): Promise<void> => {
    // One resolve at a time: three returns the SAME promise for a concurrent
    // call, which would record one duration twice.
    if (inFlight) return inFlight
    inFlight = (renderer.resolveTimestampsAsync as (type?: string) => Promise<number | undefined>)('render')
      .then((ms) => {
        if (typeof ms === 'number' && ms > 0 && sink !== null) sink.push(ms)
      })
      .catch(() => {
        timer.available = false
        timer.reason = 'timestamp resolve failed mid-run'
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }
  timer.poll = (sink) => {
    if (timer.available) void resolveOnce(sink)
  }
  timer.flush = async (sink) => {
    if (!timer.available) return
    if (inFlight) await inFlight
    await resolveOnce(sink)
  }
  return timer
}

/**
 * Run exactly `count` rendered frames, measuring each. Hooks R3F's global
 * before/after render callbacks: 'before' runs ahead of every root's update,
 * 'after' once the frame's useFrame work and the render submission are done —
 * so their difference is the CPU cost of the frame, uncapped by vsync, while
 * the before-to-before interval is the wall-clock frame time.
 */
function runFrames(count: number, collect: FrameSample[] | null, onFrame: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let seen = 0
    let previous = 0
    let cpuStart = 0
    let frameMs = 0
    let lastFrameAt = performance.now()
    let done = false
    const offBefore = addEffect(() => {
      const now = performance.now()
      frameMs = previous === 0 ? 0 : now - previous
      previous = now
      cpuStart = now
    })
    const offAfter = addAfterEffect(() => {
      if (done) return
      const now = performance.now()
      lastFrameAt = now
      seen++
      // The first frame has no interval to measure against.
      if (collect !== null && seen > 1) collect.push({ frameMs, cpuMs: now - cpuStart })
      onFrame()
      if (useUi.getState().benchAbort) return finish(new BenchAborted())
      if (seen >= count) finish(null)
    })
    const watchdog = window.setInterval(() => {
      if (performance.now() - lastFrameAt > FRAME_STALL_MS) finish(new Error('benchmark: no frames'))
    }, 1000)
    function finish(error: Error | null): void {
      if (done) return
      done = true
      offBefore()
      offAfter()
      window.clearInterval(watchdog)
      if (error) reject(error)
      else resolve()
    }
  })
}

/** Reset every state a config must not inherit (determinism rule 2). */
function resetWorld(phase: BenchPhase): void {
  balance.randomEventsEnabled = false
  balance.deadline.enabled = false
  balance.travelSpeed = BENCH_TRAVEL_SPEED
  useGame.setState({
    seed: BENCH_SEED,
    day: BENCH_DAY,
    mode: 'travel',
    placeId: null,
    journalOpen: false,
    victory: false,
    defeat: null,
  })
  useUi.setState({
    dialog: null,
    prompt: null,
    mapOpen: false,
    debugOpen: false,
    stateDumpOpen: false,
    // Written straight, not through setTravelZoom: the exact benchmark zoom,
    // whatever the debug unlock currently allows.
    travelZoom: BENCH_ZOOM,
    // No journal pop-up or read-aloud may interrupt a measured frame.
    journalDnd: true,
  })
  useGame.getState().debugJumpTo(phase.lat, phase.lon)
}

/** Apply one config's levers (the flags reset to their defaults first, so no
 *  config can leak into the next). */
function applyConfig(config: BenchConfig, defaultPixelRatio: number): void {
  const f = config.flags
  useUi.setState({
    traaEnabled: f.traaEnabled ?? true,
    ssaoEnabled: f.ssaoEnabled ?? true,
    shadowsEnabled: f.shadowsEnabled ?? true,
    shadowMapHalf: f.shadowMapHalf ?? false,
  })
  resetTerrainRefine()
  if (config.terrain) setTerrainRefine(config.terrain)
  const ctx = getRenderContext()
  ctx?.gl.setPixelRatio(config.pixelRatio ?? defaultPixelRatio)
}

/** Renderer backend and adapter string for the report environment. */
function describeBackend(gl: unknown): { backend: string; adapter: string } {
  const backend = (gl as { backend?: { isWebGPUBackend?: boolean } }).backend
  const isWebGpu = backend?.isWebGPUBackend === true
  const info = backend as unknown as {
    // three keeps no adapter handle, but the device carries its info
    // (GPUDevice.adapterInfo) — that is the GPU's name in the report.
    device?: { adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string } }
    gl?: WebGL2RenderingContext
  } | null
  let adapter = 'unknown'
  if (isWebGpu && info?.device?.adapterInfo) {
    const a = info.device.adapterInfo
    adapter = [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' ').trim() || 'unknown'
  } else if (info?.gl) {
    try {
      const dbg = info.gl.getExtension('WEBGL_debug_renderer_info')
      adapter = dbg ? String(info.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(info.gl.getParameter(info.gl.RENDERER))
    } catch {
      // Some drivers refuse the unmasked string — the backend name is enough.
    }
  }
  return { backend: isWebGpu ? 'webgpu' : 'webgl2', adapter }
}

/**
 * Run the whole sweep. Resolves once the report is in the UI store (or the run
 * was aborted); never throws at the caller — a failure lands in a toast.
 */
export async function startBenchmark(options: { short?: boolean } = {}): Promise<void> {
  if (running) return
  const ctx = getRenderContext()
  const ui = useUi.getState()
  if (!ctx) {
    useGame.getState().setToast(getStrings().benchmark.unavailable)
    return
  }
  running = true
  const short = options.short ?? benchShortMode(typeof location === 'undefined' ? '' : location.search)
  const counts = benchFrameCounts(short)
  const framesTotal = benchTotalFrames(short)

  // --- everything restored in the finally below ---
  const originalRandom = Math.random
  const gameSnapshot = { ...useGame.getState() }
  const uiSnapshot = { ...useUi.getState() }
  const balanceSnapshot = {
    travelSpeed: balance.travelSpeed,
    randomEventsEnabled: balance.randomEventsEnabled,
    deadlineEnabled: balance.deadline.enabled,
  }
  const terrainSnapshot = getTerrainRefine()
  const defaultPixelRatio = ctx.gl.getPixelRatio()
  const restoreClock = installFixedClock(ctx.clock, BENCH_DT)
  // Real GPU milliseconds where the backend can measure them — the only series
  // that answers the geometry question under vsync.
  const gpu = createGpuTimer(ctx.gl)
  Math.random = mulberry32(BENCH_SEED)

  ui.clearBenchAbort()
  ui.setBenchReport(null)
  const startedAt = new Date()
  const t0 = performance.now()
  const rows: BenchRow[] = []
  let framesDone = 0
  let aborted = false

  const publish = (config: string | null, configIndex: number, phase: string): void => {
    useUi.getState().setBenchProgress({
      config,
      configIndex,
      configCount: BENCH_CONFIGS.length,
      phase,
      framesDone,
      framesTotal,
      remainingMs: benchRemainingMs(framesDone, framesTotal, performance.now() - t0),
    })
  }

  /** One phase: reset, settle (discarded), then the measured fixed run. */
  const runPhase = async (
    config: BenchConfig,
    configIndex: number,
    phase: BenchPhase,
    measured: boolean,
  ): Promise<void> => {
    resetWorld(phase)
    publish(measured ? config.name : null, configIndex, phase.name)
    let sinceUpdate = 0
    // GPU durations of the measured frames. During the settle the queries are
    // still resolved but DISCARDED (an unresolved pool overflows at 2048).
    const gpuSamples: number[] = []
    let gpuSink: number[] | null = null
    const tick = (): void => {
      framesDone++
      gpu.poll(gpuSink)
      if (++sinceUpdate >= 15) {
        sinceUpdate = 0
        publish(measured ? config.name : null, configIndex, phase.name)
      }
    }
    if (phase.drive) pressKey('KeyW', true)
    try {
      await runFrames(counts.settle, null, tick)
      gpuSink = measured ? gpuSamples : null
      const samples: FrameSample[] = []
      await runFrames(counts.sample, samples, tick)
      // Drain the last in-flight resolve so the phase's GPU sample is complete.
      await gpu.flush(gpuSink)
      if (!measured) return
      const render = (ctx.gl.info as { render?: { drawCalls?: number; triangles?: number } }).render
      const frame = frameStats(samples.map((s) => s.frameMs))
      rows.push({
        config: config.name,
        phase: phase.name,
        frame,
        cpu: frameStats(samples.map((s) => s.cpuMs)),
        // Never fabricated: no timestamps, no number.
        gpu: gpu.available && gpuSamples.length > 0 ? frameStats(gpuSamples) : null,
        vsyncLikely: vsyncLikely(frame),
        drawCalls: render?.drawCalls ?? 0,
        triangles: render?.triangles ?? 0,
        sceneTriangles: sceneTriangleBreakdown(ctx.scene as unknown as BenchSceneNode),
      })
    } finally {
      // The forward key is released whatever happens — an abort must never
      // leave the traveller walking.
      if (phase.drive) pressKey('KeyW', false)
    }
  }

  try {
    // Warm-up pass: DISCARDED. The first pass pays the cold caches (terrain
    // geometry, flora instances, shader compiles) and that cost must not land
    // on whichever config happens to run first.
    applyConfig(BENCH_CONFIGS[0], defaultPixelRatio)
    for (const phase of BENCH_PHASES) await runPhase(BENCH_CONFIGS[0], 0, phase, false)

    for (let i = 0; i < BENCH_CONFIGS.length; i++) {
      const config = BENCH_CONFIGS[i]
      applyConfig(config, defaultPixelRatio)
      for (const phase of BENCH_PHASES) await runPhase(config, i + 1, phase, true)
    }
  } catch (error) {
    aborted = true
    if (!(error instanceof BenchAborted)) {
      useGame.getState().setToast(getStrings().benchmark.failed(error instanceof Error ? error.message : String(error)))
    }
  } finally {
    restoreClock()
    gpu.restore()
    Math.random = originalRandom
    resetTerrainRefine()
    setTerrainRefine(terrainSnapshot)
    ctx.gl.setPixelRatio(defaultPixelRatio)
    balance.travelSpeed = balanceSnapshot.travelSpeed
    balance.randomEventsEnabled = balanceSnapshot.randomEventsEnabled
    balance.deadline.enabled = balanceSnapshot.deadlineEnabled
    useGame.setState(gameSnapshot)
    useUi.setState(uiSnapshot)
    useUi.getState().setBenchProgress(null)
    useUi.getState().clearBenchAbort()
    running = false
  }

  const { backend, adapter } = describeBackend(ctx.gl)
  // The GPU series counts as measured only if rows actually carry it.
  const gpuMeasured = gpu.available && rows.some((r) => r.gpu !== null)
  const gpuReason = gpuMeasured ? '' : gpu.reason || 'no GPU timestamps were resolved'
  // "Capped" if the wall clock sat at a refresh period in most rows — then it
  // cannot be the headline, whatever it reads.
  const capped = rows.length > 0 && rows.filter((r) => r.vsyncLikely).length * 2 >= rows.length
  const report: BenchReport = {
    app: BENCH_APP,
    kind: 'render-benchmark',
    short,
    seed: BENCH_SEED,
    day: BENCH_DAY,
    dt: BENCH_DT,
    frames: counts,
    env: {
      userAgent: navigator.userAgent,
      backend,
      adapter,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      build: import.meta.env.MODE,
      commit: import.meta.env.VITE_BUILD_COMMIT ?? 'unknown',
      startedAt: startedAt.toISOString(),
    },
    gpuTiming: { available: gpuMeasured, reason: gpuReason },
    headline: headlineSeries(gpuMeasured, capped),
    rows,
    durationMs: Math.round(performance.now() - t0),
    aborted,
  }
  useUi.getState().setBenchReport({
    filename: benchFilename(backend, startedAt),
    json: benchReportJson(report),
    aborted,
  })
}
