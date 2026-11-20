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
//      FIXED FRAME COUNT — the simulation therefore takes the same number of
//      counted steps in every config, and mainly the measured wall-clock
//      varies. Not pinned: the clock's elapsed time carries over between
//      phases and configs (animation phases differ), and frames rendered while
//      the final GPU-timer flush is awaited can also advance the fixed clock.

import { addAfterEffect, addEffect } from '@react-three/fiber'
import { balance } from '../config/balance'
import { QUALITY_PRESETS, type DetailLevel } from '../config/quality'
import { getStrings } from '../i18n'
import { asyncPipelineHandle, type PipelineBackend } from '../render/asyncPipelines'
import { describeBackend } from '../render/backendInfo'
import { getRenderContext } from '../render/renderContext'
import { getTerrainRefine, resetTerrainRefine, setTerrainRefine } from '../scenes/travel/terrainLod'
import { setClimateHazeEnabled } from '../scenes/travel/Climate'
import { useGame } from '../state/store'
import { benchEnterPlace } from './benchmarkEntry'
import { effectiveDprCap, useUi } from '../state/ui'
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
  BENCH_PRESET_LEVELS,
  benchNativePixelRatio,
  PRESET_CONFIG_NAMES,
  benchFilename,
  benchFrameCounts,
  benchReadinessPush,
  benchReadyBudget,
  benchRemainingMs,
  benchReportJson,
  benchShortMode,
  benchTotalFrames,
  benchTrisStable,
  buildLowProfile,
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
import {
  createPassRecorder,
  passBreakdown,
  type BenchPassSample,
  type BenchPassTarget,
  type BenchTimestampPool,
} from './benchmarkPasses'

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

/** The renderer inspector's per-pass hook (three 0.185 InspectorBase). */
type BeginRender = (uid: string, scene: unknown, camera: unknown, target: BenchPassTarget | null) => void

/** Minimal structural view of the renderer's timestamp plumbing (three 0.185). */
interface TimestampRenderer {
  backend?: {
    isWebGPUBackend?: boolean
    trackTimestamp?: boolean
    timestampQueryPool?: Record<string, BenchTimestampPool | null | undefined>
    /** Submits a render pass's commands — the GPU order of the passes. */
    finishRender?: (renderContext: unknown) => unknown
    getTimestampUID?: (renderContext: unknown) => string
  }
  hasFeature?: (name: string) => boolean
  resolveTimestampsAsync?: (type?: string) => Promise<number | undefined>
  inspector?: { beginRender?: BeginRender }
}

/** Where a resolve delivers: the frame totals and, per frame, its passes. */
interface GpuSink {
  totals: number[]
  passes: BenchPassSample[][]
}

interface GpuTimer {
  available: boolean
  /** Why GPU time is missing — carried into the report, never a fake number. */
  reason: string
  /** Whether the per-pass breakdown is being recorded (point 1549). */
  passesAvailable: boolean
  /** Why the breakdown is missing while totals may still exist. */
  passesReason: string
  /** Kick a resolve if none is in flight; a settled one appends to `sink`. */
  poll(sink: GpuSink | null): void
  /** Await the in-flight resolve (and one more) so a phase's samples are in. */
  flush(sink: GpuSink | null): Promise<void>
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
    passesAvailable: false,
    passesReason: '',
    poll: () => {},
    flush: () => Promise.resolve(),
    restore: () => {},
  }
  if (!backend || backend.isWebGPUBackend !== true) {
    return { ...off, reason: 'WebGL 2 backend has no timestamp queries', passesReason: 'WebGL 2 backend has no timestamp queries' }
  }
  if (typeof renderer.resolveTimestampsAsync !== 'function') {
    return { ...off, reason: 'renderer exposes no timestamp resolve', passesReason: 'renderer exposes no timestamp resolve' }
  }
  try {
    if (renderer.hasFeature?.('timestamp-query') !== true) {
      return { ...off, reason: 'adapter without the timestamp-query feature', passesReason: 'adapter without the timestamp-query feature' }
    }
  } catch {
    return { ...off, reason: 'timestamp-query feature check failed', passesReason: 'timestamp-query feature check failed' }
  }
  const originalTrack = backend.trackTimestamp === true
  backend.trackTimestamp = true

  // Per-pass capture (point 1549), wrapped for the run only and restored in
  // `restore`: the inspector's beginRender sees every pass's UID with its
  // target (the identity), the backend's finishRender submits it (the GPU
  // order). Without both hooks the breakdown is flagged unavailable.
  const recorder = createPassRecorder()
  type Hooked = Record<string, unknown>
  const hooks: Array<() => void> = []
  const wrap = (owner: Hooked, key: string, make: (orig: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown): boolean => {
    const orig = owner[key]
    if (typeof orig !== 'function') return false
    const own = Object.prototype.hasOwnProperty.call(owner, key)
    owner[key] = make(orig as (...a: unknown[]) => unknown)
    hooks.push(() => {
      if (own) owner[key] = orig
      else delete owner[key]
    })
    return true
  }
  const inspector = renderer.inspector as Hooked | undefined
  const getUid = backend.getTimestampUID
  let passesAvailable = false
  let passesReason = 'renderer exposes no per-pass hooks (inspector.beginRender, backend.finishRender)'
  if (inspector && typeof inspector.beginRender === 'function' && typeof backend.finishRender === 'function' && typeof getUid === 'function') {
    wrap(inspector, 'beginRender', (orig) =>
      function benchBeginRender(this: unknown, ...a: unknown[]) {
        if (typeof a[0] === 'string') recorder.begin(a[0], a[3] as BenchPassTarget | null)
        return orig.apply(this, a)
      },
    )
    wrap(backend as Hooked, 'finishRender', (orig) =>
      function benchFinishRender(this: unknown, ...a: unknown[]) {
        const result = orig.apply(this, a)
        try {
          const uid = getUid.call(backend, a[0])
          if (typeof uid === 'string') recorder.submit(uid)
        } catch {
          // A context without a UID is simply not ordered.
        }
        return result
      },
    )
    passesAvailable = true
    passesReason = ''
  }

  const timer: GpuTimer = {
    available: true,
    reason: '',
    passesAvailable,
    passesReason,
    poll: () => {},
    flush: () => Promise.resolve(),
    restore: () => {
      backend.trackTimestamp = originalTrack
      for (const undo of hooks.splice(0)) undo()
    },
  }
  let inFlight: Promise<void> | null = null
  const resolveOnce = (sink: GpuSink | null): Promise<void> => {
    // One resolve at a time: three returns the SAME promise for a concurrent
    // call, which would record one duration twice.
    if (inFlight) return inFlight
    inFlight = (renderer.resolveTimestampsAsync as (type?: string) => Promise<number | undefined>)('render')
      .then((ms) => {
        if (!timer.passesAvailable) {
          if (typeof ms === 'number' && ms > 0 && sink !== null) sink.totals.push(ms)
          return
        }
        const take = recorder.take(backend.timestampQueryPool?.render)
        if (!take.fresh) {
          // three handed back its cached last value: no new frame was
          // resolved, so neither the total nor the passes are recorded (the
          // old code counted that duration twice).
          if (take.reason === 'no-pool') {
            timer.passesAvailable = false
            timer.passesReason = 'timestamp pool exposes no per-pass durations'
          }
          return
        }
        if (typeof ms === 'number' && ms > 0 && sink !== null) {
          sink.totals.push(ms)
          sink.passes.push(take.passes)
        }
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
/** Cap on the unmeasured frames that wait for TravelScene to remount after
 *  the settlement phase (its `travel-terrain` node, plus one frame for the
 *  mount effect). Calibratable. */
const BENCH_REMOUNT_MAX_FRAMES = 300

function runFrames(
  count: number,
  collect: FrameSample[] | null,
  onFrame: () => void,
  until?: () => boolean,
): Promise<void> {
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
      if (seen >= count || (until !== undefined && until())) finish(null)
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
function resetWorld(phase: BenchPhase): { journal: number; money: number } | undefined {
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
  if (phase.placeId !== undefined) {
    // The settlement phase: every config takes the identical, silent
    // LATER-entry path (benchmarkEntry.ts) into the walkable scene.
    return benchEnterPlace(phase.placeId)
  }
  return undefined
}

/** Apply one config's levers (the flags reset to their defaults first, so no
 *  config can leak into the next). */
function applyConfig(config: BenchConfig, defaultPixelRatio: number): void {
  const f = config.flags
  useUi.setState({
    // Force the HIGH graphics level so every render lever is ON in the baseline
    // and each config's flag can then suppress its own feature — otherwise the
    // level's preset (e.g. SSAO off at medium) would gate a flag out and a
    // config would measure nothing (point 276 part B / point 277).
    detailLevel: 'high',
    traaEnabled: f.traaEnabled ?? true,
    ssaoEnabled: f.ssaoEnabled ?? true,
    shadowsEnabled: f.shadowsEnabled ?? true,
    shadowMapHalf: f.shadowMapHalf ?? false,
  })
  resetTerrainRefine()
  if (config.terrain) setTerrainRefine(config.terrain)
  setClimateHazeEnabled(config.climateHaze ?? true)
  const ctx = getRenderContext()
  ctx?.gl.setPixelRatio(config.pixelRatio ?? defaultPixelRatio)
}

/**
 * Apply one graphics level's actual `QUALITY_PRESETS` values for a preset pass
 * (point 293 for low, point 1524 for medium/high). Unlike `applyConfig` (which
 * forces HIGH so every lever stays isolable), this sets the graphics level so
 * the effective* selectors read the preset for everything reactive (post,
 * shadows, campfire shadows, flora radius), and applies the two imperative
 * levers the scene does not re-read on its own — the pixel ratio (the level's
 * EFFECTIVE dpr cap, else the native ratio) and the terrain refinement. The
 * individual debug flags are set neutral so the preset's own AND-gates decide.
 */
function applyPreset(level: DetailLevel, nativePixelRatio: number): void {
  const preset = QUALITY_PRESETS[level]
  useUi.setState({
    detailLevel: level,
    traaEnabled: true,
    ssaoEnabled: true,
    shadowsEnabled: true,
    shadowMapHalf: false,
    fireShadowsEnabled: true,
  })
  resetTerrainRefine()
  setTerrainRefine({ enabled: preset.terrainRefine })
  setClimateHazeEnabled(true)
  const ctx = getRenderContext()
  ctx?.gl.setPixelRatio(effectiveDprCap(useUi.getState()) ?? nativePixelRatio)
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
  // The sweep configs PLUS the preset passes (low/medium/high), so the progress
  // bar and the estimate cover them; every config runs every phase, the
  // settlement included.
  const measuredConfigs = BENCH_CONFIGS.length + BENCH_PRESET_LEVELS.length
  const framesTotal = benchTotalFrames(short, measuredConfigs)

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
  // The ratio active when F8 was pressed — restored afterwards. It is NOT the
  // sweep's ratio: started from LOW it is the 0.8 cap, which made the
  // reference's forced-HIGH baseline cheaper than `dpr-1` (point 1524). The
  // sweep and the uncapped presets render at the NATIVE ratio instead.
  const defaultPixelRatio = ctx.gl.getPixelRatio()
  const nativePixelRatio = benchNativePixelRatio(window.devicePixelRatio)
  const restoreClock = installFixedClock(ctx.clock, BENCH_DT)
  // Real GPU milliseconds where the backend can measure them — the only series
  // that answers the geometry question under vsync.
  const gpu = createGpuTimer(ctx.gl)
  const renderInfo = (): { drawCalls?: number; triangles?: number } =>
    (ctx.gl.info as { render?: { drawCalls?: number; triangles?: number } }).render ?? {}
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
      configCount: measuredConfigs,
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
    const entryCost = resetWorld(phase)
    publish(measured ? config.name : null, configIndex, phase.name)
    let sinceUpdate = 0
    // GPU durations of the measured frames. During the settle the queries are
    // still resolved but DISCARDED (an unresolved pool overflows at 2048).
    const gpuSamples: GpuSink = { totals: [], passes: [] }
    let gpuSink: GpuSink | null = null
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
      // A settlement is sampled only once its scene stands (unmeasured,
      // uncounted frames; the GPU pool is drained, its samples discarded).
      let readyTimeout: boolean | undefined
      if (phase.placeId !== undefined) {
        const budget = benchReadyBudget(short)
        let tris: number[] = []
        let ready = false
        const sceneNodes = ctx.scene as unknown as { getObjectByName(name: string): unknown }
        const pipelines = asyncPipelineHandle(
          (ctx.gl as unknown as { backend?: PipelineBackend }).backend,
        )
        await runFrames(
          budget.maxFrames,
          null,
          () => {
            gpu.poll(null)
            const p = pipelines?.state()
            // A frame counts only once the outgoing travel scene is gone and the
            // settlement's pipelines are warm.
            const swapped = sceneNodes.getObjectByName('travel-terrain') === undefined
            tris = benchReadinessPush(tris, renderInfo().triangles ?? 0, swapped && (!p || (p.pending === 0 && p.queued === 0)))
            ready = benchTrisStable(tris, budget.stableFrames, budget.tolerance)
          },
          () => ready,
        )
        readyTimeout = !ready
      }
      gpuSink = measured ? gpuSamples : null
      const samples: FrameSample[] = []
      await runFrames(counts.sample, samples, tick)
      // Drain the last in-flight resolve so the phase's GPU sample is complete.
      await gpu.flush(gpuSink)
      if (!measured) return
      const render = renderInfo()
      const frame = frameStats(samples.map((s) => s.frameMs))
      const game = useGame.getState()
      rows.push({
        config: config.name,
        phase: phase.name,
        frame,
        cpu: frameStats(samples.map((s) => s.cpuMs)),
        // Never fabricated: no timestamps, no number.
        gpu: gpu.available && gpuSamples.totals.length > 0 ? frameStats(gpuSamples.totals) : null,
        // The per-pass split of those same frames (point 1549).
        gpuPasses: gpu.available && gpu.passesAvailable ? passBreakdown(gpuSamples.passes) : null,
        vsyncLikely: vsyncLikely(frame),
        drawCalls: render.drawCalls ?? 0,
        pixelRatio: ctx.gl.getPixelRatio(),
        triangles: render.triangles ?? 0,
        place: game.mode === 'place' ? game.placeId : null,
        ...(readyTimeout !== undefined ? { readyTimeout } : {}),
        ...(entryCost !== undefined ? { entryCost } : {}),
        sceneTriangles: sceneTriangleBreakdown(ctx.scene as unknown as BenchSceneNode),
      })
    } finally {
      // The forward key is released whatever happens — an abort must never
      // leave the traveller walking.
      if (phase.drive) pressKey('KeyW', false)
    }
  }

  /** Back to the bird's-eye view BEFORE the next config's levers apply. The
   *  settlement phase runs last, and TravelScene's mount effect writes the
   *  player's terrain-refine setting over the global override — so the levers
   *  must land after the remount, or `terrain-refine-off` measures nothing.
   *  The frames are unmeasured and uncounted (only the GPU pool is drained). */
  const leaveSettlement = async (): Promise<void> => {
    if (useGame.getState().mode !== 'place') return
    useGame.setState({ mode: 'travel', placeId: null })
    const scene = ctx.scene as unknown as { getObjectByName(name: string): unknown }
    let mountedFrames = 0
    await runFrames(
      BENCH_REMOUNT_MAX_FRAMES,
      null,
      () => {
        gpu.poll(null)
        if (scene.getObjectByName('travel-terrain') !== undefined) mountedFrames++
      },
      () => mountedFrames >= 2,
    )
    if (mountedFrames < 2) throw new Error('benchmark: the travel scene did not remount after the settlement')
  }

  try {
    // Warm-up pass: DISCARDED. The first pass pays the cold caches (terrain
    // geometry, flora instances, shader compiles) and that cost must not land
    // on whichever config happens to run first.
    applyConfig(BENCH_CONFIGS[0], nativePixelRatio)
    for (const phase of BENCH_PHASES) await runPhase(BENCH_CONFIGS[0], 0, phase, false)

    for (let i = 0; i < BENCH_CONFIGS.length; i++) {
      const config = BENCH_CONFIGS[i]
      await leaveSettlement()
      applyConfig(config, nativePixelRatio)
      for (const phase of BENCH_PHASES) await runPhase(config, i + 1, phase, true)
    }

    // The preset passes (point 293 for low, point 1524 for medium/high): the
    // sweep above forced HIGH to keep every lever isolable — these apply each
    // level's real QUALITY_PRESETS values, so every preset reads against the
    // same baseline and `buildLowProfile` can rank where LOW's cost still sits.
    for (let i = 0; i < BENCH_PRESET_LEVELS.length; i++) {
      const level = BENCH_PRESET_LEVELS[i]
      await leaveSettlement()
      applyPreset(level, nativePixelRatio)
      const presetConfig: BenchConfig = { name: PRESET_CONFIG_NAMES[level], flags: {} }
      for (const phase of BENCH_PHASES) await runPhase(presetConfig, BENCH_CONFIGS.length + i + 1, phase, true)
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
    setClimateHazeEnabled(true)
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
  const passesMeasured = gpuMeasured && gpu.passesAvailable && rows.some((r) => r.gpuPasses != null)
  const passesReason = passesMeasured
    ? ''
    : gpuReason || gpu.passesReason || 'no per-pass GPU timestamps were resolved'
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
    gpuPassTiming: { available: passesMeasured, reason: passesReason },
    headline: headlineSeries(gpuMeasured, capped),
    rows,
    // The low-preset cost ranking (point 293): where the frame cost still sits
    // at the low graphics level, so the player can decide the next reduction.
    lowProfile: buildLowProfile(rows),
    durationMs: Math.round(performance.now() - t0),
    aborted,
  }
  useUi.getState().setBenchReport({
    filename: benchFilename(backend, startedAt),
    json: benchReportJson(report),
    aborted,
  })
}
