import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeWebglRendererName, startProbeName } from './backendInfo'

describe('startProbeName (point 1562)', () => {
  it('probes on WebGPU', () => {
    expect(startProbeName({ backend: 'webgpu', adapter: 'amd rdna-2' }, () => 'AMD Radeon(TM) Graphics')).toBe('AMD Radeon(TM) Graphics')
  })

  it('never probes on WebGL 2, whose name is already the renderer string', () => {
    const probe = vi.fn(() => 'x')
    expect(startProbeName({ backend: 'webgl2', adapter: 'Intel(R) UHD Graphics' }, probe)).toBe('')
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('probeWebglRendererName (point 1562)', () => {
  afterEach(() => vi.restoreAllMocks())

  function fakeContext(opts: { debug: boolean; throwOnRead?: boolean }) {
    const loseContext = vi.fn()
    const gl = {
      getExtension: (name: string) =>
        name === 'WEBGL_lose_context' ? { loseContext } : opts.debug ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
      getParameter: () => {
        if (opts.throwOnRead) throw new Error('refused')
        return 'AMD Radeon(TM) Graphics'
      },
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as never)
    return loseContext
  }

  it('reads the unmasked name and releases the context', () => {
    const lose = fakeContext({ debug: true })
    expect(probeWebglRendererName()).toBe('AMD Radeon(TM) Graphics')
    expect(lose).toHaveBeenCalledOnce()
  })

  it('returns empty for a masked name and still releases the context', () => {
    const lose = fakeContext({ debug: false })
    expect(probeWebglRendererName()).toBe('')
    expect(lose).toHaveBeenCalledOnce()
  })

  it('returns empty when a read throws and still releases the context', () => {
    const lose = fakeContext({ debug: true, throwOnRead: true })
    expect(probeWebglRendererName()).toBe('')
    expect(lose).toHaveBeenCalledOnce()
  })

  it('returns empty without WebGL 2', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(probeWebglRendererName()).toBe('')
  })
})
