// Non-blocking shader-pipeline creation (point 337).
//
// THE DEFECT. three.js's renderer creates a render pipeline lazily, the first
// frame a given material/geometry/light combination is drawn. On the normal
// render path it passes `promises = null` into `backend.createRenderPipeline`,
// and both backends read that as "the caller wants the pipeline NOW":
//
//   * WebGL 2 links the program and then calls `_completeCompile`, whose
//     `gl.getProgramParameter(program, LINK_STATUS)` is a synchronous
//     command-buffer round trip — it waits out the whole ANGLE + driver
//     compile (CommandBufferHelper::Finish / WaitForGetOffset in a CDP trace).
//   * WebGPU calls `device.createRenderPipeline()`, which returns at once but
//     makes the first draw that uses it block the GPU queue on the compile.
//
// The scene's startup needs ~62 pipelines at once, so the picture stands still
// while they resolve. Measured on the headless verify lanes (a quiet machine,
// 40 s observation window from the first byte):
//
//   WebGL 2   62 pipelines, 36.3 s of blocking link waits inside just TWO
//             animation frames (16.7 s and 20.4 s) — max main-thread stall
//             21.0 s, max gap between painted frames 20.4 s.
//   WebGPU    65 pipelines, 9 ms of createRenderPipeline calls — but no frame
//             was PAINTED for 12.4 s while the driver compiled behind them.
//             The main thread stayed free (max stall 1.0 s), which is exactly
//             why a liveness metric alone never saw this: the picture froze,
//             the thread did not.
//
// THE FIX. Both backends already implement the asynchronous half — three.js
// only ever reaches it from `Renderer.compileAsync()`, which the render loop
// does not use. Handing `createRenderPipeline` a promise array on the ORDINARY
// path switches it over:
//
//   * WebGL 2 polls `KHR_parallel_shader_compile`'s COMPLETION_STATUS_KHR per
//     animation frame instead of waiting on LINK_STATUS.
//   * WebGPU uses `device.createRenderPipelineAsync()`.
//
// In both cases `Pipelines.isReady()` stays false until the pipeline really
// exists, and `Renderer._renderObjectDirect` already SKIPS the draw of a not
// yet ready object. So the first frames draw the reduced set that is ready and
// the rest links behind them, at no cost to the settled picture: every object
// appears as soon as its pipeline is done, and nothing is drawn differently.
//
// This is deliberately left on for the whole session, not just for startup —
// the second of the two blocking frames above was NOT the first frame but a
// later streaming step, and mid-game hitches have the same cause and the same
// cure. Where `KHR_parallel_shader_compile` is missing, three.js falls back to
// the synchronous path on its own, so this degrades rather than breaks.
//
// THE SECOND HALF, WebGL 2 ONLY. Linking asynchronously is not the end of the
// WebGL story: ANGLE defers the actual D3D shader compile to the program's
// FIRST USE, which is `_completeCompile`'s `useProgram`. With the links now all
// resolving in one burst, that burst simply moved — the WebGL 2 lane still went
// 8.5 s without painting a frame. So the completions are RELEASED at most
// `RELEASE_PER_FRAME` per animation frame, which spreads the first-use compiles
// across frames instead of stacking them into one. Measured (same lane):
//
//   release-all  max painted-frame gap 8.5 s
//   2 per frame  max painted-frame gap 2.5 s
//   1 per frame  max painted-frame gap 1.8 s — and that one is the renderer's
//                own init, not a compile; the compile gaps are ~1.3 s apart
//                with the picture updating in between.
//
// One per frame wins because a single first-use compile already costs most of a
// frame on this lane; releasing two just doubles the stall. The WebGPU backend
// has no such step (`createRenderPipelineAsync` resolves a ready pipeline) and
// no `_completeCompile`, so the feature detection below simply finds nothing to
// throttle there.

/** Completions released per animation frame on the WebGL 2 fallback (see above).
 *  Not a balance value: it is fixed render-internal pacing, meaningful only
 *  while a compile backlog exists and not something play calibrates. */
const RELEASE_PER_FRAME = 1

/** The shape of `renderer.backend` this module touches. Kept structural so the
 *  tests can drive it with a plain object — three.js exposes neither the
 *  backend base class nor these members in its public types. */
export interface PipelineBackend {
  createRenderPipeline(renderObject: unknown, promises: unknown[] | null): void
  /** WebGL 2 fallback only: finishes a linked program and makes it drawable. */
  _completeCompile?: (renderObject: unknown, pipeline: unknown) => void
  /** three.js's per-object data map, used to see whether a queued pipeline is
   *  still alive by the time its completion is released. */
  get?: (object: unknown) => { programGPU?: unknown } | undefined
}

/** Injectable frame scheduler — `requestAnimationFrame` in the game, a manual
 *  pump in the tests. */
export type FrameScheduler = (cb: () => void) => void

export interface AsyncPipelineState {
  /** Pipelines whose compile has been started and not yet resolved. */
  pending: number
  /** Pipelines that went down the asynchronous path in total. */
  started: number
  /** Pipelines whose compile has resolved. */
  done: number
  /** Linked programs waiting for their throttled first-use release (WebGL 2). */
  queued: number
  /** Queued completions dropped because their pipeline was released meanwhile. */
  dropped: number
}

export interface AsyncPipelineHandle {
  /** Live counters — a snapshot, safe to serialize. The program set is warm
   *  once `pending` AND `queued` are both zero: on WebGL 2 the compile promise
   *  resolves when the LINK is done, which is one throttled release short of
   *  the program actually being drawable. */
  state(): AsyncPipelineState
  /** Restores the backend's original method (used by the tests and on unmount). */
  restore(): void
}

const MARK = Symbol.for('hoa.asyncPipelines')

type Marked = PipelineBackend & { [MARK]?: AsyncPipelineHandle }

/**
 * Switch `backend` over to asynchronous pipeline creation.
 *
 * Calls that already carry a promise array (three.js's own `compileAsync`) are
 * passed through untouched; only the render path's `null` is replaced by a
 * sink array, which is drained immediately so it can never grow without bound
 * and no rejection is left unhandled.
 *
 * Idempotent: re-arming an already armed backend returns the existing handle
 * rather than stacking a second wrapper (React StrictMode mounts twice).
 */
export function enableAsyncPipelineCompile(
  backend: PipelineBackend | null | undefined,
  options: { schedule?: FrameScheduler; releasePerFrame?: number } = {},
): AsyncPipelineHandle | null {
  if (!backend || typeof backend.createRenderPipeline !== 'function') return null
  const marked = backend as Marked
  const existing = marked[MARK]
  if (existing) return existing

  const schedule: FrameScheduler =
    options.schedule ??
    ((cb) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb())
      else setTimeout(cb, 16)
    })
  const releasePerFrame = Math.max(1, options.releasePerFrame ?? RELEASE_PER_FRAME)

  const original = backend.createRenderPipeline
  let pending = 0
  let started = 0
  let done = 0
  let dropped = 0

  // --- The throttled first-use release (WebGL 2 only) ------------------------
  const completeOriginal = backend._completeCompile
  const queue: Array<[unknown, unknown]> = []
  let pumping = false
  let restoreComplete: (() => void) | null = null
  if (typeof completeOriginal === 'function') {
    const pump = () => {
      for (let i = 0; i < releasePerFrame && queue.length > 0; i++) {
        const entry = queue.shift()
        if (!entry) break
        const [renderObject, pipeline] = entry
        // The pipeline may have been released in the frames we held it back
        // (a post-chain rebuild, a graphics-level switch); completing a dead
        // program would raise a GL error, so skip it and count the drop.
        const data = backend.get?.(pipeline)
        if (data !== undefined && data.programGPU === undefined) {
          dropped++
          continue
        }
        completeOriginal.call(backend, renderObject, pipeline)
      }
      if (queue.length > 0) schedule(pump)
      else pumping = false
    }
    const throttled = function (this: PipelineBackend, renderObject: unknown, pipeline: unknown): void {
      queue.push([renderObject, pipeline])
      if (!pumping) {
        pumping = true
        schedule(pump)
      }
    }
    backend._completeCompile = throttled
    restoreComplete = () => {
      if (backend._completeCompile === throttled) backend._completeCompile = completeOriginal
    }
  }

  const wrapped = function (this: PipelineBackend, renderObject: unknown, promises: unknown[] | null): void {
    if (promises != null) {
      // three.js's own compileAsync — it owns and awaits this array.
      original.call(this, renderObject, promises)
      return
    }
    const sink: unknown[] = []
    original.call(this, renderObject, sink)
    // A backend without the parallel-compile extension ignores the array and
    // has already compiled synchronously; nothing to track then.
    if (sink.length === 0) return
    started += sink.length
    pending += sink.length
    for (const p of sink) {
      // Settle the sink here so the array is free and a backend-side failure
      // surfaces as a console error rather than an unhandled rejection.
      void Promise.resolve(p).then(
        () => {
          pending--
          done++
        },
        () => {
          pending--
          done++
        },
      )
    }
  }

  backend.createRenderPipeline = wrapped
  const handle: AsyncPipelineHandle = {
    state: () => ({ pending, started, done, queued: queue.length, dropped }),
    restore: () => {
      if (backend.createRenderPipeline === wrapped) backend.createRenderPipeline = original
      restoreComplete?.()
      delete marked[MARK]
    },
  }
  marked[MARK] = handle
  return handle
}

/** The handle armed on `backend`, if any. */
export function asyncPipelineHandle(backend: PipelineBackend | null | undefined): AsyncPipelineHandle | null {
  if (!backend) return null
  return (backend as Marked)[MARK] ?? null
}
