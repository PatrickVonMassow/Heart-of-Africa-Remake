import { describe, expect, it } from 'vitest'
import { laneRenderers, softwareRendererVerdict } from './backend-lane-core.mjs'

describe('laneRenderers (point 493)', () => {
  it('offers both lanes when a system Chrome was found, and hands its PATH to the WebGPU one', () => {
    const lanes = laneRenderers('/usr/bin/google-chrome', 'linux')
    expect(lanes.map((l) => l.name)).toEqual(['webgl2', 'webgpu'])
    expect(lanes[1].launchOptions.executablePath).toBe('/usr/bin/google-chrome')
  })

  it('leaves the WebGPU lane unopenable WITH A REASON when there is no system Chrome', () => {
    const lanes = laneRenderers(null, 'linux')
    expect(lanes[1].launchOptions).toBeNull()
    expect(lanes[1].reason).toContain('no system Chrome')
    expect(lanes[1].reason).toContain('verify-host-setup.sh')
  })

  it('never drops the WebGL 2 lane — it is the shipped fallback and must always be probed', () => {
    expect(laneRenderers(null, 'linux')[0].launchOptions).toBeTruthy()
    expect(laneRenderers('/usr/bin/google-chrome', 'linux')[0].launchOptions).toBeTruthy()
  })
})

describe('softwareRendererVerdict (point 493)', () => {
  const hints = ['swiftshader', 'llvmpipe', 'softpipe', 'lavapipe']

  it('names SwiftShader as software — the string this container actually reports', () => {
    const verdict = softwareRendererVerdict(
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      hints,
    )
    expect(verdict.software).toBe(true)
    expect(verdict.reason).toContain('swiftshader')
  })

  it('names llvmpipe too, which is the same trap under another driver', () => {
    expect(softwareRendererVerdict('Mesa/X.org llvmpipe (LLVM 15.0.6, 256 bits)', hints).software).toBe(true)
  })

  it('passes a real GPU renderer', () => {
    const verdict = softwareRendererVerdict('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)', hints)
    expect(verdict.software).toBe(false)
  })

  it('does not call a missing renderer string software — that is a different failure', () => {
    expect(softwareRendererVerdict(null, hints).software).toBe(false)
    expect(softwareRendererVerdict('', hints).software).toBe(false)
  })
})
