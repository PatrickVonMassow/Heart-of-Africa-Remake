import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleSpeech } from './speechSampler.mjs'

function analysers() {
  return [0, 1].map(() => ({
    fftSize: 4096,
    frequencyBinCount: 2048,
    getFloatTimeDomainData: vi.fn((wave) => wave.fill(-0.2)),
    getFloatFrequencyData: vi.fn((spectra) => spectra.fill(-50)),
  }))
}

describe('live speech sampling cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reads hundreds of times without receiving a single animation frame', async () => {
    const raf = vi.fn(() => { throw new Error('sampling waited for paint') })
    vi.stubGlobal('requestAnimationFrame', raf)
    const ac = { get currentTime() { return 12 + Date.now() / 1000 }, sampleRate: 48000 }
    const nodes = analysers()
    const sampled = sampleSpeech(ac, nodes, [140, 210], ac.currentTime)
    await vi.advanceTimersByTimeAsync(1405)
    const result = await sampled
    expect(raf).not.toHaveBeenCalled()
    for (const node of nodes) {
      expect(node.getFloatTimeDomainData.mock.calls.length).toBeGreaterThan(200)
      expect(node.getFloatFrequencyData.mock.calls.length).toBeGreaterThan(40)
    }
    expect(result.peak).toBeCloseTo(0.2)
    expect(result.bands).toEqual([[-50, -50], [-50, -50]])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses audio time for duration even when the wall clock advances', async () => {
    const ac = { currentTime: 0, sampleRate: 48000 }
    const nodes = analysers()
    let finished = false
    const sampled = sampleSpeech(ac, nodes, [140, 210], 0).then(() => { finished = true })
    await vi.advanceTimersByTimeAsync(1500)
    expect(finished).toBe(false)
    expect(nodes[0].getFloatFrequencyData).not.toHaveBeenCalled()
    ac.currentTime = 0.1
    await vi.advanceTimersByTimeAsync(5)
    expect(nodes[0].getFloatFrequencyData).toHaveBeenCalledTimes(1)
    ac.currentTime = 1.4
    await vi.advanceTimersByTimeAsync(5)
    await sampled
    expect(finished).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reads both channels only inside the original open low-syllable windows', async () => {
    const ac = { currentTime: 0, sampleRate: 48000 }
    const nodes = analysers()
    const sampled = sampleSpeech(ac, nodes, [140, 210], 0)
    for (const [elapsed, reads] of [
      [0.04, 0], [0.041, 1], [0.179, 2], [0.18, 2],
      [0.64, 2], [0.641, 3], [0.779, 4], [0.78, 4], [1.4, 4],
    ]) {
      ac.currentTime = elapsed
      await vi.advanceTimersByTimeAsync(5)
      for (const node of nodes) expect(node.getFloatFrequencyData).toHaveBeenCalledTimes(reads)
    }
    await sampled
  })
})
