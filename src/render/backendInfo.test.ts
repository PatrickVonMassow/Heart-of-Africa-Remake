import { describe, expect, it } from 'vitest'
import { startAdapterName } from './backendInfo'

describe('startAdapterName (point 1562)', () => {
  it('appends the probed WebGL name on WebGPU', () => {
    expect(startAdapterName({ backend: 'webgpu', adapter: 'amd rdna-2' }, () => 'ANGLE (AMD Radeon(TM) Graphics)')).toBe(
      'amd rdna-2 | ANGLE (AMD Radeon(TM) Graphics)',
    )
  })

  it('keeps the backend name when the probe yields nothing', () => {
    expect(startAdapterName({ backend: 'webgpu', adapter: 'amd rdna-2' }, () => '')).toBe('amd rdna-2')
  })

  it('uses the probe alone for an unknown WebGPU adapter', () => {
    expect(startAdapterName({ backend: 'webgpu', adapter: 'unknown' }, () => 'Intel(R) UHD Graphics')).toBe('Intel(R) UHD Graphics')
  })

  it('never probes on WebGL 2, whose name is already the renderer string', () => {
    const probe = () => {
      throw new Error('probed')
    }
    expect(startAdapterName({ backend: 'webgl2', adapter: 'Intel(R) UHD Graphics' }, probe)).toBe('Intel(R) UHD Graphics')
  })
})
