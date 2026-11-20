import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armGpuHealth,
  GPU_ERROR_CAP,
  gpuHealthSnapshot,
  isDeviceLost,
  resetGpuHealth,
  type DeviceLossInfo,
  type GpuErrorInfo,
} from './gpuHealth'
import { resetDevAsserts } from '../systems/devAssert'
import { useUi } from '../state/ui'

interface FakeRenderer {
  _isDeviceLost: boolean
  onDeviceLost: (info: DeviceLossInfo) => void
  onError: (info: GpuErrorInfo) => void
}

/** Stands in for three's Renderer: its defaults set the flag / log. */
function fakeRenderer(): FakeRenderer {
  return {
    _isDeviceLost: false,
    onDeviceLost(this: FakeRenderer) {
      this._isDeviceLost = true
    },
    onError() {},
  }
}

let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetGpuHealth()
  resetDevAsserts()
  useUi.setState({ deviceLost: false, deviceLostDismissed: false })
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errors.mockRestore()
  resetGpuHealth()
})

describe('gpu health (device loss and uncaptured errors)', () => {
  it('a simulated device.lost keeps three\'s default, asserts with the reason and raises the notice', () => {
    const r = fakeRenderer()
    armGpuHealth(r)
    expect(isDeviceLost()).toBe(false)
    r.onDeviceLost({ api: 'WebGPU', message: 'A valid external Instance reference no longer exists', reason: 'unknown' })
    expect(r._isDeviceLost).toBe(true)
    expect(isDeviceLost()).toBe(true)
    expect(useUi.getState().deviceLost).toBe(true)
    const line = errors.mock.calls.map((c: unknown[]) => String(c[0])).find((s: string) => s.startsWith('[ASSERT] gpu-device-lost'))
    expect(line).toContain('reason: unknown')
    expect(line).toContain('Instance reference')
    const snap = gpuHealthSnapshot()
    expect(snap.deviceLost).toMatchObject({ api: 'WebGPU', reason: 'unknown' })
  })

  it('keeps uncaptured errors up to the cap and counts the rest', () => {
    const r = fakeRenderer()
    armGpuHealth(r)
    for (let i = 0; i < GPU_ERROR_CAP + 3; i++) {
      r.onError({ api: 'WebGPU', type: 'GPUValidationError', message: `bad pipeline ${i}` })
    }
    const snap = gpuHealthSnapshot()
    expect(snap.uncapturedErrors).toHaveLength(GPU_ERROR_CAP)
    expect(snap.uncapturedErrors[0]).toMatchObject({ type: 'GPUValidationError', message: 'bad pipeline 0' })
    expect(snap.omittedErrors).toBe(3)
    expect(snap.deviceLost).toBeNull()
  })
})
