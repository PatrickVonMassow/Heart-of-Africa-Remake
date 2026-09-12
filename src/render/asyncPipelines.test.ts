// Pure tests for the non-blocking shader-pipeline path (point 337). The
// browser half — that the startup picture really stops freezing — is
// scripts/verify/startup.mjs; what is testable without a GPU is the wiring:
// which calls are diverted onto the asynchronous branch, that three.js's own
// compileAsync is left alone, the throttled first-use release and its
// bookkeeping.
import { describe, expect, it, vi } from 'vitest'
import { NodeMaterial, QuadMesh, RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import {
  asyncPipelineHandle,
  enableAsyncPipelineCompile,
  withSynchronousPipelineCompile,
  type PipelineBackend,
} from './asyncPipelines'

/** A stand-in for three.js's WebGL 2 backend: `createRenderPipeline` pushes a
 *  compile promise when it is handed an array (the KHR_parallel_shader_compile
 *  branch) and calls `_completeCompile` when the caller wants it synchronously. */
function fakeWebglBackend() {
  const completed: unknown[] = []
  const data = new Map<unknown, { programGPU?: unknown; pipeline?: unknown }>()
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
      const d = data.get(pipeline)!
      d.pipeline = d.programGPU
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

const shaderObject = (id: number, vertex = 'vertex', fragment = 'fragment') => ({
  material: { name: 'scene' },
  pipeline: {
    cacheKey: `${id * 2},${id * 2 + 1},`, usedTimes: 1,
    vertexProgram: { id: id * 2, code: vertex },
    fragmentProgram: { id: id * 2 + 1, code: fragment },
  },
})

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

  it('paces identical rebuilt sources like every other first use', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    backend.createRenderPipeline(shaderObject(0), null)
    backend.settleAll()
    frames.tick()
    for (let id = 1; id <= 3; id++) backend.createRenderPipeline(shaderObject(id), null)
    backend.settleAll()
    frames.tick()
    expect(backend.completed).toHaveLength(2)
    expect(handle.state()).toMatchObject({ queued: 2, reused: 0 })
    frames.tick()
    frames.tick()
    expect(backend.completed).toHaveLength(4)
    expect(handle.state()).toMatchObject({ queued: 0, reused: 0 })
  })

  it('does not inspect shader sources or walk the backlog after spending the frame budget', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const objects = [shaderObject(0), shaderObject(1), shaderObject(2)]
    for (const object of objects) {
      Object.defineProperty(object.pipeline.vertexProgram, 'code', {
        get: () => { throw new Error('source text must not be read') },
      })
      backend.createRenderPipeline(object, null)
    }
    backend.settleAll()
    const get = vi.spyOn(backend, 'get')
    frames.tick()
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(objects[0].pipeline)
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

  it('presents LOW ahead of a TRAA rebuild backlog without increasing the release budget', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const scenePrograms = [renderObject(1), renderObject(2), renderObject(3)]
    for (const object of scenePrograms) backend.createRenderPipeline(object, null)
    backend.settleAll()

    // Use Three's actual composite quad/material: the priority depends on its
    // identity contract, not on an invented material name in a fake fixture.
    const post = new RenderPipeline({} as WebGPURenderer)
    const quad = (post as unknown as {
      _quadMesh: { isQuadMesh: boolean; material: { name: string } }
    })._quadMesh
    const low = { ...renderObject(4), object: quad, material: quad.material }
    backend.createRenderPipeline(low, null)
    backend.settleAll()
    expect(backend.completed).toEqual([])
    frames.tick()
    expect(backend.completed).toEqual([low.pipeline])
    expect(handle.state().queued).toBe(3)
    frames.tick()
    expect(backend.completed).toEqual([low.pipeline, scenePrograms[0].pipeline])
    frames.tick()
    frames.tick()
    expect(backend.completed).toEqual([low.pipeline, ...scenePrograms.map((object) => object.pipeline)])
    post.dispose()
  })

  it('releases the entire post chain ahead of a scene burst, keeping feeder order and one slot per frame', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const scene = Array.from({ length: 104 }, (_, id) => renderObject(id))
    for (const object of scene) backend.createRenderPipeline(object, null)
    const names = ['GTAO', 'RTT', 'TRAA.resolve', 'Bloom_highPass',
      ...Array<string>(5).fill('Bloom_separable'), 'Bloom_comp', 'RenderPipeline']
    const post = names.map((name, id) => {
      const material = new NodeMaterial()
      material.name = name
      return { ...renderObject(104 + id), object: new QuadMesh(material), material }
    })
    for (const object of post) backend.createRenderPipeline(object, null)
    backend.settleAll()
    const expected = [post.at(-1)!, ...post.slice(0, -1), ...scene]
    expect(handle.diagnostics().queued.map((entry) => entry.material).slice(0, post.length))
      .toEqual([names.at(-1), ...names.slice(0, -1)])
    for (let i = 0; i < expected.length; i++) {
      frames.tick()
      expect(backend.completed).toHaveLength(i + 1)
      expect(backend.completed[i]).toBe(expected[i].pipeline)
    }
    expect(handle.state().queued).toBe(0)
    for (const object of post) object.material.dispose()
  })

  it('drops a retired feeder and prioritizes a newly linked feeder on the next pump', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const scene = [renderObject(0), renderObject(1)]
    for (const object of scene) backend.createRenderPipeline(object, null)
    backend.settleAll()
    frames.tick()
    const retired = { object: new QuadMesh(), pipeline: { id: 2, usedTimes: 0 } }
    const feeder = { object: new QuadMesh(), pipeline: { id: 3, usedTimes: 1 } }
    backend.createRenderPipeline(retired, null)
    backend.createRenderPipeline(feeder, null)
    backend.settleAll()
    frames.tick()
    expect(backend.completed).toEqual([scene[0].pipeline, feeder.pipeline])
    expect(handle.state()).toMatchObject({ dropped: 1, queued: 1 })
    frames.tick()
    expect(backend.completed.at(-1)).toBe(scene[1].pipeline)
  })

  it('does not prioritize a scene material merely named RenderPipeline', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    enableAsyncPipelineCompile(backend, { schedule: frames.schedule })
    const first = renderObject(1)
    const named = { ...renderObject(2), material: { name: 'RenderPipeline' } }
    backend.createRenderPipeline(first, null)
    backend.createRenderPipeline(named, null)
    backend.settleAll()
    frames.tick()
    expect(backend.completed).toEqual([first.pipeline])
  })

  it('drops retired post programs whose backend data survives, without spending a release frame', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const retired = Array.from({ length: 12 }, (_, id) => ({ pipeline: { id, usedTimes: 1 } }))
    for (const object of retired) backend.createRenderPipeline(object, null)
    const live = { pipeline: { id: 12, usedTimes: 1 } }
    backend.createRenderPipeline(live, null)
    backend.settleAll()
    // Mirrors Three's release: usage reaches zero, but backend.get(pipeline)
    // still has a programGPU. Repeated toggles must not queue dead first uses.
    for (const object of retired) object.pipeline.usedTimes = 0
    frames.tick()
    expect(backend.completed).toEqual([live.pipeline])
    expect(handle.state()).toMatchObject({ dropped: 12, queued: 0 })
    expect(frames.depth).toBe(0)
  })

  it('completes a queued composite whose usage recovers before the release frame', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const composite = {
      object: { isQuadMesh: true },
      material: { name: 'RenderPipeline' },
      pipeline: { id: 7, usedTimes: 1 },
    }
    backend.createRenderPipeline(composite, null)
    composite.pipeline.usedTimes = 0
    backend.settleAll()
    // Retirement is checked at release, not when the completion is queued.
    composite.pipeline.usedTimes = 1
    frames.tick()
    expect(backend.completed).toEqual([composite.pipeline])
    expect(handle.state()).toMatchObject({ queued: 0, dropped: 0 })
  })

  it('names queued and dropped programs without exposing mutable diagnostic state', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    const composite = { material: { name: 'RenderPipeline' }, pipeline: { id: 7, cacheKey: 'off', usedTimes: 1 } }
    const bloom = { material: { name: 'Bloom_comp' }, pipeline: { id: 8, cacheKey: 'bloom', usedTimes: 1 } }
    backend.createRenderPipeline(composite, null)
    backend.createRenderPipeline(bloom, null)
    backend.settleAll()
    expect(handle.diagnostics().queued).toEqual([
      { key: 'off', material: 'RenderPipeline', usedTimes: 1 },
      { key: 'bloom', material: 'Bloom_comp', usedTimes: 1 },
    ])
    composite.pipeline.usedTimes = 0
    backend.releasePipeline(bloom.pipeline)
    frames.tick()
    const diagnostic = handle.diagnostics()
    expect(diagnostic).toEqual({
      queued: [],
      recentDrops: [
        { key: 'off', material: 'RenderPipeline', usedTimes: 0, reason: 'unused' },
        { key: 'bloom', material: 'Bloom_comp', usedTimes: 1, reason: 'released' },
      ],
    })
    diagnostic.recentDrops[0].material = 'changed by reader'
    expect(handle.diagnostics().recentDrops[0].material).toBe('RenderPipeline')
    expect(handle.state().dropped).toBe(2)
  })

  it('bounds drop history while keeping the full drop count', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    for (let id = 0; id < 40; id++) {
      backend.createRenderPipeline({ pipeline: { cacheKey: String(id), usedTimes: 0 } }, null)
    }
    backend.settleAll()
    frames.tick()
    expect(handle.state().dropped).toBe(40)
    expect(handle.diagnostics().recentDrops.map((entry) => entry.key))
      .toEqual(Array.from({ length: 32 }, (_, i) => String(i + 8)))
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

// The one-shot escape hatch (point 545). The panorama capture renders the travel
// scene into an offscreen target ONCE and keeps those pixels: an object whose
// pipeline is not ready is skipped for good, not "a frame later", so the shot
// must compile synchronously. These pin that the scope really switches BOTH
// halves — the diversion and the throttled first-use release — and hands them
// back afterwards.
describe('withSynchronousPipelineCompile (point 545)', () => {
  it('hands the backend the null it reads as "compile now"', () => {
    const backend = fakeWebglBackend()
    enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })
    withSynchronousPipelineCompile(backend, () => {
      backend.createRenderPipeline(renderObject(1), null)
    })
    expect(backend.calls[0].promises).toBeNull()
  })

  it('completes the program inside the scope instead of queueing it for a later frame', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    withSynchronousPipelineCompile(backend, () => {
      for (let i = 0; i < 3; i++) backend.createRenderPipeline(renderObject(i), null)
      // Drawable the moment the render returns — no frame tick in between.
      expect(backend.completed).toHaveLength(3)
    })
    expect(handle.state()).toMatchObject({ started: 0, pending: 0, queued: 0 })
  })

  it('restores the asynchronous path after the scope, including after a throw', () => {
    const backend = fakeWebglBackend()
    const frames = fakeFrames()
    const handle = enableAsyncPipelineCompile(backend, { schedule: frames.schedule })!
    expect(() =>
      withSynchronousPipelineCompile(backend, () => {
        throw new Error('capture blew up')
      }),
    ).toThrow('capture blew up')
    backend.createRenderPipeline(renderObject(1), null)
    expect(backend.calls[0].promises).not.toBeNull()
    expect(backend.completed).toHaveLength(0) // queued again, not immediate
    expect(handle.state()).toMatchObject({ started: 1, queued: 0 })
    backend.settleAll()
    frames.tick()
    expect(backend.completed).toHaveLength(1)
  })

  it('stays synchronous through a nested scope until the outer one ends', () => {
    const backend = fakeWebglBackend()
    enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })
    withSynchronousPipelineCompile(backend, () => {
      withSynchronousPipelineCompile(backend, () => {
        backend.createRenderPipeline(renderObject(1), null)
      })
      backend.createRenderPipeline(renderObject(2), null)
    })
    expect(backend.calls.map((c) => c.promises)).toEqual([null, null])
  })

  it("leaves three.js's own compileAsync array alone even inside the scope", () => {
    const backend = fakeWebglBackend()
    enableAsyncPipelineCompile(backend, { schedule: fakeFrames().schedule })
    const own: unknown[] = []
    withSynchronousPipelineCompile(backend, () => {
      backend.createRenderPipeline(renderObject(1), own)
    })
    expect(backend.calls[0].promises).toBe(own)
  })

  it('returns the callback result and runs on an unarmed backend unchanged', () => {
    const backend = fakeWebglBackend() // never armed: already synchronous
    const value = withSynchronousPipelineCompile(backend, () => {
      backend.createRenderPipeline(renderObject(1), null)
      return 'shot'
    })
    expect(value).toBe('shot')
    expect(backend.calls[0].promises).toBeNull()
    expect(withSynchronousPipelineCompile(null, () => 7)).toBe(7)
  })
})
