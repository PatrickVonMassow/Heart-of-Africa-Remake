// The live half of the point-1447 return/hop judgements, driven through the
// armed watch itself: the store transitions, the rAF settle loop and the
// renderer counters, with a fake renderer and a hand-cranked frame clock.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface Fake {
  info: { memory: { renderTargets: number; textures: number } }
  _pipelines: { caches: { size: number } } | undefined
}

let frames: FrameRequestCallback[] = []

async function harness() {
  vi.resetModules()
  delete (window as unknown as Record<string, unknown>).__renderLeakArmed
  ;(window as unknown as { __assertLog?: unknown[] }).__assertLog = []
  const { useGame } = await import('../state/store')
  const { useUi } = await import('../state/ui')
  const { setRenderContext } = await import('./renderContext')
  const leak = await import('./renderLeak')
  const gl: Fake = { info: { memory: { renderTargets: 20, textures: 75 } }, _pipelines: { caches: { size: 60 } } }
  setRenderContext({ gl, scene: null, camera: null, clock: null } as never)
  useGame.setState({ mode: 'travel', placeId: null })
  leak.armRenderLeakWatch()
  const tick = (n = 40) => {
    for (let i = 0; i < n; i++) {
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
    expect(h.asserts()).toContain('render-texture-return-leak')
  })
})
