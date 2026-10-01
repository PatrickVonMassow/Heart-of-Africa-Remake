// The bring-up probe (CLAUDE.md §3): a device with neither WebGPU nor WebGL 2
// must be recognised before the canvas mounts, so the app shows the
// compatibility notice instead of crashing inside three's WebGL backend on a
// null context.
import { describe, it, expect, vi } from 'vitest'
import { hasWebgl2, hasWebgpuAdapter, probeRenderSupport, renderSupportNow, type RenderSupportEnv } from './renderSupport'

function env({ webgl2, adapter, gpu = true }: { webgl2: boolean | 'throw'; adapter: boolean | 'throw'; gpu?: boolean }) {
  const loseContext = vi.fn()
  const requestAdapter = vi.fn(async () => {
    if (adapter === 'throw') throw new Error('adapter refused')
    return adapter ? {} : null
  })
  const e: RenderSupportEnv = {
    createCanvas: () => ({
      getContext: () => {
        if (webgl2 === 'throw') throw new Error('context refused')
        return webgl2 ? { getExtension: () => ({ loseContext }) } : null
      },
    }),
    gpu: gpu ? { requestAdapter } : null,
  }
  return { e, loseContext, requestAdapter }
}

describe('render support probe', () => {
  it('answers at once when WebGL 2 is there, without asking for a WebGPU adapter', async () => {
    const { e, loseContext, requestAdapter } = env({ webgl2: true, adapter: false })
    expect(renderSupportNow(e)).toBe(true)
    expect(await probeRenderSupport(e)).toBe(true)
    expect(requestAdapter).not.toHaveBeenCalled()
    // The probe context is released so it does not count against the context limit.
    expect(loseContext).toHaveBeenCalled()
  })

  it('leaves the answer to WebGPU when WebGL 2 is missing', async () => {
    const { e } = env({ webgl2: false, adapter: true })
    expect(renderSupportNow(e)).toBeNull()
    expect(await probeRenderSupport(e)).toBe(true)
  })

  it('reports no renderer when neither backend is offered (the null-context crash case)', async () => {
    expect(await probeRenderSupport(env({ webgl2: false, adapter: false }).e)).toBe(false)
    expect(await probeRenderSupport(env({ webgl2: false, adapter: true, gpu: false }).e)).toBe(false)
  })

  it('treats a throwing context or adapter request as unavailable, never as a crash', async () => {
    expect(hasWebgl2(env({ webgl2: 'throw', adapter: false }).e)).toBe(false)
    expect(await hasWebgpuAdapter(env({ webgl2: false, adapter: 'throw' }).e)).toBe(false)
    expect(hasWebgl2({ createCanvas: () => null })).toBe(false)
  })
})
