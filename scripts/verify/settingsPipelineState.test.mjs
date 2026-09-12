import { afterEach, describe, expect, it, vi } from 'vitest'
import RenderObjectPipeline from 'three/src/renderers/common/RenderObjectPipeline.js'
import { settingsPipelineState, startSettingsFrameTiming, stopSettingsFrameTiming } from './settingsPipelineState.mjs'

afterEach(() => {
  window.__stopSettingsFrameTiming?.()
  vi.unstubAllGlobals()
})

describe('settings pipeline evidence', () => {
  it('reports absent hooks without treating them as an empty, ready queue', () => {
    expect(settingsPipelineState()).toEqual({
      frame: null, drawCalls: null, pipelines: null, diagnostics: null, composites: [],
    })
  })

  it('distinguishes a linked composite from a drawable composite and preserves drop identities', () => {
    const linked = new RenderObjectPipeline('1,2,', {}, { name: 'RenderPipeline' })
    linked.usedTimes = 1
    const ready = new RenderObjectPipeline('1,3,', {}, { name: 'RenderPipeline' })
    ready.usedTimes = 3
    const scene = new RenderObjectPipeline('4,5,', {}, { name: 'ground' })
    const get = vi.fn((pipeline) => pipeline === ready ? { pipeline: {} } : { programGPU: {} })
    vi.stubGlobal('__renderer', {
      info: { frame: 90, render: { drawCalls: 24 } },
      _pipelines: { caches: new Map([[1, linked], [2, ready], [3, scene]]) },
      backend: { get },
    })
    const counts = { pending: 0, queued: 1, dropped: 1 }
    const diagnostics = {
      queued: [{ key: '1,2,', material: 'RenderPipeline', usedTimes: 1 }],
      recentDrops: [{ key: '1,0,', material: 'RenderPipeline', usedTimes: 0, reason: 'unused' }],
    }
    vi.stubGlobal('__shaderPipelines', () => counts)
    vi.stubGlobal('__shaderPipelineDiagnostics', () => diagnostics)
    // Playwright serializes the function: it must not depend on module scope.
    const probe = new Function(`return (${settingsPipelineState.toString()})()`)()
    expect(probe).toEqual({
      frame: 90, drawCalls: 24, pipelines: counts, diagnostics,
      composites: [
        { key: '1,2,', usedTimes: 1, ready: false },
        { key: '1,3,', usedTimes: 3, ready: true },
      ],
    })
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe('TRAA painted-frame timing receipt', () => {
  it('observes callback completion gaps and both window edges without scheduling frames', () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const scheduled = []
    const native = vi.fn((callback) => {
      scheduled.push(callback)
      return scheduled.length
    })
    vi.stubGlobal('requestAnimationFrame', native)
    // Both functions must survive Playwright serialization without imports.
    new Function(`return (${startSettingsFrameTiming.toString()})()`)()
    expect(native).not.toHaveBeenCalled()
    const first = vi.fn(() => { now = 900 })
    expect(window.requestAnimationFrame(first)).toBe(1)
    scheduled.shift()(120)
    expect(first).toHaveBeenCalledWith(120)
    window.requestAnimationFrame(() => { now = 1400 })
    scheduled.shift()(1000)
    now = 2300
    const result = new Function(`return (${stopSettingsFrameTiming.toString()})()`)()
    expect(result).toEqual({ maxGapMs: 900, elapsedMs: 2200, callbacks: 2 })
    expect(window.requestAnimationFrame).toBe(native)
    expect(window.__stopSettingsFrameTiming).toBeUndefined()
  })

  it('reports a window with no callbacks as a full gap rather than zero', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const native = vi.fn()
    vi.stubGlobal('requestAnimationFrame', native)
    startSettingsFrameTiming()
    now = 8500
    expect(stopSettingsFrameTiming()).toEqual({ maxGapMs: 8500, elapsedMs: 8500, callbacks: 0 })
    expect(native).not.toHaveBeenCalled()
  })

  it('records a throwing callback and preserves a later installed wrapper', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    let scheduled
    vi.stubGlobal('requestAnimationFrame', (callback) => { scheduled = callback })
    startSettingsFrameTiming()
    window.requestAnimationFrame(() => { throw new Error('render failed') })
    now = 2500
    expect(() => scheduled(100)).toThrow('render failed')
    const later = vi.fn()
    window.requestAnimationFrame = later
    expect(stopSettingsFrameTiming()).toEqual({ maxGapMs: 2500, elapsedMs: 2500, callbacks: 1 })
    expect(window.requestAnimationFrame).toBe(later)
  })
})
