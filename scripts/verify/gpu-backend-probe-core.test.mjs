import { describe, expect, it } from 'vitest'
import { backendProbeDetail, gpuBackendVerdict, softwareRenderer } from './gpu-backend-probe-core.mjs'

const hardware = 'ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 4070 Ti), OpenGL ES 3.1)'

function lane(name, overrides = {}) {
  return {
    lane: name,
    available: true,
    renderer: hardware,
    implementation: '(gl=egl-angle,angle=opengl)',
    featureStatus: { webgl: 'enabled', webgpu: 'enabled' },
    ...overrides,
  }
}

describe('gpuBackendVerdict', () => {
  it('reports present only when both APIs exist on a named hardware renderer', () => {
    const verdict = gpuBackendVerdict([lane('webgl2'), lane('webgpu')])

    expect(verdict).toMatchObject({ ok: true, state: 'present' })
    expect(verdict.summary).toContain('WebGL 2 context and WebGPU adapter')
    expect(verdict.summary).toContain('app startup failure')
  })

  it('reports absent when Chrome exposes neither API and names the pre-app layer', () => {
    const disabled = {
      available: false,
      renderer: '',
      implementation: '(gl=none,angle=none)',
      featureStatus: { webgl: 'disabled_off', webgpu: 'disabled_off' },
    }
    const verdict = gpuBackendVerdict([lane('webgl2', disabled), lane('webgpu', disabled)])

    expect(verdict).toMatchObject({ ok: false, state: 'absent' })
    expect(verdict.summary).toContain('host/browser GPU layer')
    expect(verdict.summary).toContain('before app startup')
  })

  it('reports degraded when only one backend exists and names the missing lane', () => {
    const verdict = gpuBackendVerdict([
      lane('webgl2'),
      lane('webgpu', { available: false, error: 'navigator.gpu returned no adapter' }),
    ])

    expect(verdict).toMatchObject({ ok: false, state: 'degraded' })
    expect(verdict.summary).toContain('webgpu missing')
  })

  it('reports degraded when APIs silently fall back to software', () => {
    const swiftshader = 'ANGLE (Google, Vulkan 1.3 (SwiftShader Device (Subzero)))'
    const verdict = gpuBackendVerdict([
      lane('webgl2', { renderer: swiftshader }),
      lane('webgpu', { renderer: swiftshader }),
    ])

    expect(verdict).toMatchObject({ ok: false, state: 'degraded' })
    expect(verdict.summary).toContain('uses swiftshader')
  })

  it('does not call an unlabelled backend hardware', () => {
    const verdict = gpuBackendVerdict([lane('webgl2', { renderer: '' }), lane('webgpu')])
    expect(verdict).toMatchObject({ ok: false, state: 'degraded' })
    expect(verdict.summary).toContain('renderer unnamed')
  })
})

describe('probe diagnostics', () => {
  it('recognises the software renderers Chrome and Mesa can expose', () => {
    expect(softwareRenderer('ANGLE (SwiftShader Device)')).toBe('swiftshader')
    expect(softwareRenderer('Mesa llvmpipe (LLVM 19.1)')).toBe('llvmpipe')
    expect(softwareRenderer(hardware)).toBe(null)
  })

  it('keeps Chrome feature status and implementation in an absent-lane detail', () => {
    const detail = backendProbeDetail({
      lane: 'webgl2',
      available: false,
      renderer: '',
      implementation: '(gl=none,angle=none)',
      featureStatus: { webgl: 'disabled_off' },
    })

    expect(detail).toContain('API missing')
    expect(detail).toContain('(gl=none,angle=none)')
    expect(detail).toContain('feature=disabled_off')
  })
})
