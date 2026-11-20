// The F8 render benchmark's runner against a lost GPU device (point 507): a
// loss — or a measured phase that drew nothing — ends the run INVALID with its
// reason and writes no rows, instead of publishing vsync-paced empty frames as
// fps. R3F's frame hooks are replaced by a pump this test drives.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshGame, withWorld } from '../test/store'
import { useUi } from '../state/ui'
import { useGame } from '../state/store'
import { setRenderContext, type RenderContext } from '../render/renderContext'
import { recordDeviceLost, resetGpuHealth } from '../render/gpuHealth'
import { resetDevAsserts } from './devAssert'

const before = new Set<() => void>()
const after = new Set<() => void>()
vi.mock('@react-three/fiber', () => ({
  addEffect: (cb: () => void) => {
    before.add(cb)
    return () => before.delete(cb)
  },
  addAfterEffect: (cb: () => void) => {
    after.add(cb)
    return () => after.delete(cb)
  },
}))
// The settlement phase's entry path is not what this test is about.
vi.mock('./benchmarkEntry', () => ({ benchEnterPlace: () => undefined }))

withWorld()

const { startBenchmark } = await import('./benchmarkRun')

interface FakeGl {
  info: { render: { drawCalls: number; triangles: number } }
  backend: { isWebGPUBackend: boolean }
  getPixelRatio(): number
  setPixelRatio(r: number): void
}

function fakeContext(drawCalls: number): FakeGl {
  const gl: FakeGl = {
    info: { render: { drawCalls, triangles: 1200 } },
    backend: { isWebGPUBackend: false },
    getPixelRatio: () => 1,
    setPixelRatio: () => {},
  }
  const scene = { getObjectByName: () => undefined, children: [] }
  const clock = { elapsedTime: 0, getDelta: () => 0.016, getElapsedTime: () => 0 }
  setRenderContext({ gl, scene, camera: {}, clock } as unknown as RenderContext)
  return gl
}

/** Drives frames until the run settles; `onFrame(n)` may inject a fault. */
async function pump(run: Promise<void>, onFrame: (n: number) => void = () => {}): Promise<number> {
  let settled = false
  void run.then(() => (settled = true))
  let n = 0
  while (!settled && n < 5000) {
    n++
    onFrame(n)
    for (const cb of [...before]) cb()
    for (const cb of [...after]) cb()
    await new Promise((r) => setTimeout(r, 0))
  }
  await run
  return n
}

function report(): { invalidReason?: string; aborted: boolean; rows: unknown[]; summary: string[]; lowProfile: unknown } {
  const file = useUi.getState().benchReport
  expect(file).not.toBeNull()
  return JSON.parse(file!.json)
}

let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  freshGame()
  resetGpuHealth()
  resetDevAsserts()
  useUi.setState({ benchReport: null, benchProgress: null, benchAbort: false, deviceLost: false })
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errors.mockRestore()
  setRenderContext(null)
  resetGpuHealth()
})

describe('render benchmark on a lost GPU device (point 507)', () => {
  it('a device lost mid-run ends the run INVALID with the reason and no rows', async () => {
    fakeContext(42)
    const frames = await pump(startBenchmark({ short: true }), (n) => {
      if (n === 10) recordDeviceLost({ api: 'WebGPU', reason: 'unknown', message: 'Instance dropped' })
    })
    // Stopped AT the loss, not after the sweep.
    expect(frames).toBeLessThan(20)
    const r = report()
    expect(r.aborted).toBe(true)
    expect(r.invalidReason).toContain('GPU device lost')
    expect(r.invalidReason).toContain('reason: unknown')
    expect(r.rows).toEqual([])
    expect(r.lowProfile).toBeNull()
    expect(r.summary[0]).toContain('INVALID')
    expect(r.summary.some((l) => l.includes('no rows were recorded'))).toBe(true)
    expect(useUi.getState().benchReport?.invalidReason).toBe(r.invalidReason)
  })

  it('the restore after the run keeps the live device-loss notice', async () => {
    fakeContext(42)
    await pump(startBenchmark({ short: true }), (n) => {
      if (n === 10) recordDeviceLost({ api: 'WebGPU', reason: 'unknown', message: 'Instance dropped' })
    })
    expect(report().invalidReason).toContain('GPU device lost')
    expect(useUi.getState().deviceLost).toBe(true)
    expect(useUi.getState().deviceLostDismissed).toBe(false)
  })

  it('a loss that stops the frames after rows accumulated ends INVALID, not as a plain abort', async () => {
    fakeContext(42)
    const run = startBenchmark({ short: true })
    let settled = false
    void run.then(() => (settled = true))
    // Healthy frames until the first measured config has written its rows.
    for (let n = 0; n < 5000 && (useUi.getState().benchProgress?.configIndex ?? 0) < 2; n++) {
      for (const cb of [...before]) cb()
      for (const cb of [...after]) cb()
      await new Promise((r) => setTimeout(r, 0))
    }
    expect(useUi.getState().benchProgress?.configIndex).toBe(2)
    // The device dies and no frame callback runs again: only the watchdog ends it.
    recordDeviceLost({ api: 'WebGPU', reason: 'unknown', message: 'Instance dropped' })
    const t = performance.now()
    const clock = vi.spyOn(performance, 'now').mockReturnValue(t + 60000)
    try {
      await run
    } finally {
      clock.mockRestore()
    }
    expect(settled).toBe(true)
    const r = report()
    expect(r.invalidReason).toContain('GPU device lost')
    expect(r.rows).toEqual([])
    expect(useGame.getState().toast).toBeNull()
  })

  it('a measured phase with zero draw calls ends the run INVALID instead of reporting fps', async () => {
    fakeContext(0)
    await pump(startBenchmark({ short: true }))
    const r = report()
    expect(r.aborted).toBe(true)
    expect(r.invalidReason).toContain('0 draw calls')
    expect(r.rows).toEqual([])
  })

  it('a healthy run still records its rows and stays valid', async () => {
    fakeContext(42)
    await pump(startBenchmark({ short: true }))
    const r = report()
    expect(r.invalidReason).toBeUndefined()
    expect(r.aborted).toBe(false)
    expect(r.rows.length).toBeGreaterThan(0)
  })
})
