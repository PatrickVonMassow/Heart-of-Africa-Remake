// Pure tests for the non-blocking shader-pipeline path (point 337). The
// browser half — that the startup picture really stops freezing — is
// scripts/verify/startup.mjs; what is testable without a GPU is the wiring:
// which calls are diverted onto the asynchronous branch, that three.js's own
// compileAsync is left alone, the throttled first-use release and its
// bookkeeping.
import { describe, expect, it, vi } from 'vitest'
import { asyncPipelineHandle, enableAsyncPipelineCompile, type PipelineBackend } from './asyncPipelines'

/** A stand-in for three.js's WebGL 2 backend: `createRenderPipeline` pushes a
 *  compile promise when it is handed an array (the KHR_parallel_shader_compile
 *  branch) and calls `_completeCompile` when the caller wants it synchronously. */
function fakeWebglBackend() {
  const completed: unknown[] = []
  const data = new Map<unknown, { programGPU?: unknown }>()
  let resolveNext: Array<() => void> = []
  const backend: PipelineBackend & {
    calls: Array<{ renderObject: unknown; promises: unknown[] | null }>
    completed: unknown[]
    settleAll(): void
    releasePipeline(pipeline: unknown): void
  } = {
    calls: [],
    completed,
    createRenderPipeline(renderObject: unknown, promises: unknown[] | null) {
      backend.calls.push({ renderObject, promises })
      const pipeline = (renderObject as { pipeline: unknown }).pipeline
      data.set(pipeline, { programGPU: {} })
      if (promises !== null) {
        promises.push(
          new Promise<void>((resolve) => {
            resolveNext.push(() => {
              backend._completeCompile?.(renderObject, pipeline)
              resolve()
            })
          }),
        )
        return
      }
      backend._completeCompile?.(renderObject, pipeline)
    },
    _completeCompile(_renderObject: unknown, pipeline: unknown) {
      completed.push(pipeline)
    },
    get(object: unknown) {
      let d = data.get(object)
      if (d === undefined) {
        d = {}
        data.set(object, d)
      }
      return d
    },
    settleAll() {
      const pending = resolveNext
      resolveNext = []
      for (const r of pending) r()
    },
    releasePipeline(pipeline: unknown) {
      data.delete(pipeline)
    },
  }
  return backend
}

/** A manual frame pump standing in for requestAnimationFrame. */
function fakeFrames() {
  let queue: Array<() => void> = []
  return {
    schedule: (cb: () => void) => {
      queue.push(cb)
    },
    /** Run one frame's worth of callbacks. */
    tick() {
      const due = queue
      queue = []
      for (const cb of due) cb()
    },
    get depth() {
      return queue.length
    },
  }
}

const renderObject = (id: number) => ({ id, pipeline: { id } })

describe('enableAsyncPipelineCompile (point 337)', () => {
  it('hands the render path a promise array so three.js takes the async branch', () => {
    const backend = fakeWebglBackend()
    enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })
    backend.createRenderPipeline(renderObject(1), null)
    expect(backend.calls).toHaveLength(1)
    expect(Array.isArray(backend.calls[0].promises)).toBe(true)
  })

  it("leaves three.js's own compileAsync calls untouched", () => {
    const backend = fakeWebglBackend()
    enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })
    const own: unknown[] = []
    backend.createRenderPipeline(renderObject(1), own)
    expect(backend.calls[0].promises).toBe(own)
    expect(own).toHaveLength(1)
  })

  it('counts a diverted pipeline as pending until its compile resolves', async () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    backend.createRenderPipeline(renderObject(1), null)
    expect(handle.state()).toMatchObject({ started: 1, pending: 1, done: 0 })
    backend.settleAll()
    await Promise.resolve()
    await Promise.resolve()
    expect(handle.state()).toMatchObject({ started: 1, pending: 0, done: 1 })
  })

  it('releases at most one queued first-use compile per frame', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    for (let i = 0; i < 4; i++) backend.createRenderPipeline(renderObject(i), null)
    backend.settleAll() // all four links finish in the same burst
    expect(handle.state().queued).toBe(4)
    expect(backend.completed).toHaveLength(0)
    frames.tick()
    expect(backend.completed).toHaveLength(1)
    frames.tick()
    frames.tick()
    expect(backend.completed).toHaveLength(3)
    frames.tick()
    expect(backend.completed).toHaveLength(4)
    expect(handle.state().queued).toBe(0)
  })

  it('honours a wider release budget when one is asked for', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    enableAsyncPipelineCompile(backend, { schedule: frames.schedule, releasePerFrame: 3 })
    for (let i = 0; i < 4; i++) backend.createRenderPipeline(renderObject(i), null)
    backend.settleAll()
    frames.tick()
    expect(backend.completed).toHaveLength(3)
  })

  it('stops pumping once the queue drains and restarts on the next pipeline', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    enableAsyncPipelineCompile(backend, { schedule: frames.schedule })
    backend.createRenderPipeline(renderObject(1), null)
    backend.settleAll()
    frames.tick()
    expect(frames.depth).toBe(0) // no self-perpetuating frame chain
    backend.createRenderPipeline(renderObject(2), null)
    backend.settleAll()
    frames.tick()
    expect(backend.completed).toHaveLength(2)
  })

  it('drops a queued completion whose pipeline was released in the meantime', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const doomed = renderObject(1)
    backend.createRenderPipeline(doomed, null)
    backend.createRenderPipeline(renderObject(2), null)
    backend.settleAll()
    backend.releasePipeline(doomed.pipeline) // a post-chain rebuild, say
    frames.tick()
    frames.tick()
    expect(handle.state().dropped).toBe(1)
    expect(backend.completed).toEqual([{ id: 2 }])
  })

  it('is idempotent — a second arming does not stack a second wrapper', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const first = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const second = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    expect(second).toBe(first)
    expect(asyncPipelineHandle(backend)).toBe(first)
    backend.createRenderPipeline(renderObject(1), null)
    expect(first.state().started).toBe(1)
  })

  it('restores both patched methods', () => {
    const backend = fakeWebglBackend()
    const original = backend.createRenderPipeline
    const originalComplete = backend._completeCompile
    const handle = enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })!
    handle.restore()
    expect(backend.createRenderPipeline).toBe(original)
    expect(backend._completeCompile).toBe(originalComplete)
    expect(asyncPipelineHandle(backend)).toBeNull()
  })

  it('tracks nothing when the backend compiles synchronously anyway (no parallel extension)', () => {
    // A backend that ignores the promise array — three.js's documented fallback
    // when KHR_parallel_shader_compile is missing.
    const backend: PipelineBackend = { createRenderPipeline: vi.fn() }
    const handle = enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })!
    backend.createRenderPipeline(renderObject(1), null)
    expect(handle.state()).toMatchObject({ started: 0, pending: 0, queued: 0 })
  })

  it('leaves a backend without the WebGPU-absent _completeCompile alone', () => {
    // The WebGPU backend has no first-use step to throttle; only the async
    // diversion applies there.
    const backend: PipelineBackend = {
      createRenderPipeline(_ro, promises) {
        promises?.push(Promise.resolve())
      },
    }
    const handle = enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })!
    backend.createRenderPipeline(renderObject(1), null)
    expect(handle.state()).toMatchObject({ started: 1, queued: 0 })
  })

  it('returns null for a backend it cannot patch', () => {
    expect(enableAsyncPipelineCompile(null)).toBeNull()
    expect(enableAsyncPipelineCompile(undefined)).toBeNull()
    expect(enableAsyncPipelineCompile({} as unknown as PipelineBackend)).toBeNull()
    expect(asyncPipelineHandle(null)).toBeNull()
  })
})
