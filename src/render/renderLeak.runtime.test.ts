// The live half of the point-1447 return/hop judgements, driven through the
// armed watch itself: the store transitions, the rAF settle loop and the
// renderer counters, with a fake renderer and a hand-cranked frame clock.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface Fake {
  info: { memory: { renderTargets: number; textures: number } }
  _pipelines: { caches: { size: number } } | undefined
  backend: { isWebGPUBackend: boolean }
}

let frames: FrameRequestCallback[] = []

async function harness(webgpu = true) {
  vi.resetModules()
  delete (window as unknown as Record<string, unknown>).__renderLeakArmed
  ;(window as unknown as { __assertLog?: unknown[] }).__assertLog = []
  const { useGame } = await import('../state/store')
  const { useUi } = await import('../state/ui')
  const { setRenderContext } = await import('./renderContext')
  const leak = await import('./renderLeak')
  const gl: Fake = {
    info: { memory: { renderTargets: 20, textures: 75 } },
    _pipelines: { caches: { size: 60 } },
    backend: { isWebGPUBackend: webgpu },
  }
  setRenderContext({ gl, scene: null, camera: null, clock: null } as never)
  useGame.setState({ mode: 'travel', placeId: null })
  leak.armRenderLeakWatch()
  const tick = (n = 80, each?: () => void) => {
    for (let i = 0; i < n; i++) {
      each?.()
      const due = frames
      frames = []
      for (const cb of due) cb(0)
    }
  }
  const go = (mode: 'travel' | 'place', placeId: string | null = null) => useGame.setState({ mode, placeId })
  const asserts = () =>
    ((window as unknown as { __assertLog?: Array<{ code: string }> }).__assertLog ?? []).map((e) => e.code)
  const state = () =>
    (window as unknown as { __renderLeak: { state: () => Record<string, { history: unknown[] }> } }).__renderLeak.state()
  tick()
  return { gl, go, tick, asserts, state, useUi }
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('render leak watch, live', () => {
  it('ends a hop chain on the bird\'s-eye view: per-trip hop growth that every exit frees never adds up', async () => {
    const h = await harness()
    for (let trip = 0; trip < 4; trip++) {
      h.go('place', 'a')
      h.gl.info.memory.textures = 100
      h.tick()
      h.go('place', 'b') // a walk straight on: +15 legitimate textures
      h.gl.info.memory.textures = 115
      h.tick()
      h.go('travel')
      h.gl.info.memory.textures = 75 // the exit frees everything
      h.tick()
    }
    expect(h.state().placeHop.history).toHaveLength(4)
    expect(h.asserts()).not.toContain('render-place-hop-leak')
  })

  it('still judges the texture return when the pipeline counter is unreadable', async () => {
    const h = await harness()
    h.gl._pipelines = undefined
    h.go('place', 'a')
    h.gl.info.memory.textures = 120
    h.tick()
    h.go('travel')
    h.gl.info.memory.textures = 75 + 30 // the visit left 30 textures behind
    h.tick()
    expect(h.state().textureReturn.history).toHaveLength(1)
    expect(h.state().textureReturn.history[0].verdict).toBe('leak')
    expect(h.asserts()).toContain('render-texture-return-leak')
  })

  it('compares a return only with an entry under the same bird\'s-eye signature', async () => {
    const h = await harness()
    const level = h.useUi.getState().detailLevel
    h.go('place', 'a')
    h.tick()
    h.useUi.getState().setDetailLevel(level === 'high' ? 'low' : 'high') // a graphics change mid-visit
    h.tick()
    h.go('travel')
    h.gl.info.memory.textures = 75 + 30 // a different resident set, legitimately
    h.tick()
    expect(h.state().textureReturn.history).toHaveLength(0)
    expect(h.asserts()).not.toContain('render-texture-return-leak')
    // the next visit under one signature is judged again
    h.go('place', 'a')
    h.tick()
    h.go('travel')
    h.gl.info.memory.textures = 105 + 30
    h.tick()
    expect(h.state().textureReturn.history).toHaveLength(1)
    expect(h.state().textureReturn.history[0].verdict).toBe('leak')
    expect(h.asserts()).toContain('render-texture-return-leak')
  })

  it('judges a hop on the texture count once it has settled, not while the place still builds', async () => {
    const h = await harness()
    h.go('place', 'a')
    h.gl.info.memory.textures = 60
    // render targets stand still at once; the place's textures climb for 40 frames
    h.tick(100, () => {
      if (h.gl.info.memory.textures < 100) h.gl.info.memory.textures++
    })
    h.go('place', 'b')
    h.gl.info.memory.textures = 110
    h.tick()
    const hops = h.state().placeHop.history as Array<{ delta: { textures: number } }>
    expect(hops).toHaveLength(1)
    expect(hops[0].delta.textures).toBe(10)
    expect(h.asserts()).not.toContain('render-place-hop-leak')
  })

  it('still judges a hop on pipelines when the next place\'s textures never settle', async () => {
    const h = await harness()
    h.go('place', 'a')
    h.tick()
    h.go('place', 'b')
    h.gl._pipelines!.caches.size += 90 // the hop left its pipelines behind
    // render targets stand; the textures stream for the whole watch
    h.tick(700, () => {
      h.gl.info.memory.textures++
    })
    const hops = h.state().placeHop.history as Array<{ delta: { textures: number | null; pipelines: number | null } }>
    expect(hops).toHaveLength(1)
    expect(hops[0].delta).toEqual({ textures: null, pipelines: 90 })
    expect(h.asserts()).toContain('render-place-hop-leak')
  })

  it('reports but does not assert a pipelines hop on WebGL 2 (point 1570 owns that drift)', async () => {
    const h = await harness(false)
    h.go('place', 'a')
    h.tick()
    h.go('place', 'b')
    h.gl._pipelines!.caches.size += 90
    h.tick()
    const hops = h.state().placeHop.history as Array<{ verdict: string; delta: { pipelines: number | null } }>
    expect(hops).toHaveLength(1)
    expect(hops[0]).toMatchObject({ verdict: 'ok', delta: { pipelines: 90 } })
    expect(h.asserts()).not.toContain('render-place-hop-leak')
  })

  it('judges a hop on pipelines when the player moves on while the place\'s textures still stream', async () => {
    const h = await harness()
    h.go('place', 'a')
    h.tick()
    h.go('place', 'b')
    h.gl._pipelines!.caches.size += 90 // the hop left its pipelines behind
    // render targets stand at once; textures stream until the player leaves at frame 80
    h.tick(80, () => {
      h.gl.info.memory.textures++
    })
    h.go('place', 'c')
    h.tick()
    const hops = h.state().placeHop.history as Array<{ from: string; to: string; delta: { textures: number | null; pipelines: number | null } }>
    expect(hops[0]).toMatchObject({ from: 'a', to: 'b', delta: { textures: null, pipelines: 90 } })
    expect(h.asserts()).toContain('render-place-hop-leak')
  })

  it('judges a return on pipelines when the player leaves the bird\'s-eye view while its textures still stream', async () => {
    const h = await harness()
    h.go('place', 'a')
    h.tick()
    h.go('travel')
    h.gl._pipelines!.caches.size += 200 // the visit left its pipelines behind
    h.tick(80, () => {
      h.gl.info.memory.textures++
    })
    h.go('place', 'b') // the next visit's entry is recorded after the old return closed
    h.tick()
    expect(h.state().pipelines.history).toHaveLength(1)
    expect(h.asserts()).toContain('render-pipeline-leak')
    const entry = h.gl._pipelines!.caches.size
    h.gl._pipelines!.caches.size += 5
    h.go('travel')
    h.tick()
    const returns = h.state().pipelines.history as Array<{ entry: number; back: number }>
    expect(returns).toHaveLength(2)
    expect(returns[1]).toMatchObject({ entry, back: entry + 5 })
  })

  it('judges a leave and re-entry of the same place in one tick as a hop', async () => {
    const h = await harness()
    h.go('place', 'a')
    h.tick()
    h.go('travel')
    h.go('place', 'a') // no frame in between: the bird's-eye view never settles
    h.gl._pipelines!.caches.size += 90
    h.tick()
    expect(h.state().placeHop.history).toHaveLength(1)
    expect(h.asserts()).toContain('render-place-hop-leak')
  })
})
