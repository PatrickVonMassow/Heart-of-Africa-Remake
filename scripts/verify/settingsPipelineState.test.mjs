import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingsPipelineState } from './settingsPipelineState.mjs'

afterEach(() => vi.unstubAllGlobals())

describe('settings pipeline evidence', () => {
  it('reports absent hooks without treating them as an empty, ready queue', () => {
    expect(settingsPipelineState()).toEqual({
      frame: null, drawCalls: null, pipelines: null, diagnostics: null, composites: [],
    })
  })

  it('distinguishes a linked composite from a drawable composite and preserves drop identities', () => {
    const linked = { id: 1, usedTimes: 1, fragmentProgram: { name: 'RenderPipeline' } }
    const ready = { id: 2, usedTimes: 3, fragmentProgram: { name: 'RenderPipeline' } }
    const scene = { id: 3, usedTimes: 1, fragmentProgram: { name: 'ground' } }
    const get = vi.fn((pipeline) => pipeline === ready ? { pipeline: {} } : { programGPU: {} })
    vi.stubGlobal('__renderer', {
      info: { frame: 90, render: { drawCalls: 24 } },
      _pipelines: { caches: new Map([[1, linked], [2, ready], [3, scene]]) },
      backend: { get },
    })
    const counts = { pending: 0, queued: 1, dropped: 1 }
    const diagnostics = {
      queued: [{ id: 1, material: 'RenderPipeline', usedTimes: 1 }],
      recentDrops: [{ id: 0, material: 'RenderPipeline', usedTimes: 0, reason: 'unused' }],
    }
    vi.stubGlobal('__shaderPipelines', () => counts)
    vi.stubGlobal('__shaderPipelineDiagnostics', () => diagnostics)
    // Playwright serializes the function: it must not depend on module scope.
    const probe = new Function(`return (${settingsPipelineState.toString()})()`)()
    expect(probe).toEqual({
      frame: 90, drawCalls: 24, pipelines: counts, diagnostics,
      composites: [
        { id: 1, usedTimes: 1, ready: false },
        { id: 2, usedTimes: 3, ready: true },
      ],
    })
    expect(get).toHaveBeenCalledTimes(2)
  })
})
