import { describe, expect, it } from 'vitest'
import { CONFIRM_READS, READ_COUNT, READ_GAP_FRAMES, READ_GAP_MS, SHOT_DRIFT_BAR, shotDrift, shotReading } from './cropLuma.mjs'
import { edgeShotReading } from './edgeBandReading.mjs'
import { SETTLE_READ_LIMIT, settledEdgeShot } from './edgeBandSettle.mjs'

const windowSize = READ_COUNT + CONFIRM_READS
const crop = value => Float64Array.of(value, value)

async function sample(values, gapResult = () => true) {
  const reads = []
  const gaps = []
  const result = await settledEdgeShot({
    gap: async (ms, frames) => {
      gaps.push([ms, frames])
      return gapResult(gaps.length)
    },
    read: async () => {
      const value = values(reads.length)
      reads.push(value)
      return { value }
    },
  })
  return { result, reads, gaps, window: reads.slice(-windowSize) }
}

describe('settlement edge settle / shot consistency', () => {
  it('measures the certified full window without starting another shot', async () => {
    const s = await sample(() => crop(73.4))
    expect(s.result).toEqual({ value: 73.4 })
    expect(s.reads).toHaveLength(windowSize)
    expect(s.gaps).toEqual(Array.from({ length: windowSize }, () => [READ_GAP_MS, READ_GAP_FRAMES]))
    expect(s.result).toEqual(edgeShotReading(s.window))
  })

  it.each([1, -1])('waits out a monotonic trend that the two-frame epsilon accepted (direction %i)', async direction => {
    const slopePerSecond = 0.5 * direction
    // The old gate accepts this at 60 fps, yet a six-read shot rejects it.
    expect(Math.abs(slopePerSecond * 2 / 60)).toBeLessThan(0.2)
    const s = await sample(i => crop(73.4 + slopePerSecond * Math.min(i * READ_GAP_MS / 1000, 6)))
    expect(shotDrift(s.reads.slice(0, windowSize))).toBeGreaterThan(SHOT_DRIFT_BAR)
    expect(s.reads.length).toBeGreaterThan(windowSize)
    expect(s.result.value).not.toBeNull()
    expect(shotDrift(s.window)).toBeLessThanOrEqual(SHOT_DRIFT_BAR)
    expect(s.result.value).toBe(shotReading(s.window.slice(0, READ_COUNT)))
  })

  it.each([0.1, 1, 73.4, 107.5, 200])('shares the drift guard at luminance %s, for both trend directions and near its bar', async luma => {
    for (const direction of [-1, 1]) {
      for (const scale of [0, 0.9, 1, 1.1, 2]) {
        // Derive the slope from the actual guard and window length, then let
        // it converge. Every accepted measurement must pass the guard over
        // exactly the reads it used, even if the shot constants are retuned.
        const step = direction * luma * SHOT_DRIFT_BAR / Math.ceil(windowSize / 2) * scale
        const s = await sample(i => crop(luma + step * Math.min(i, windowSize * 2)))
        expect(s.result.value).not.toBeNull()
        expect(shotDrift(s.window)).toBeLessThanOrEqual(SHOT_DRIFT_BAR)
        expect(s.result).toEqual(edgeShotReading(s.window))
      }
    }
  })

  it('rejects a trend that never settles instead of returning the last reading', async () => {
    const s = await sample(i => crop(73.4 + i * 0.5))
    expect(s.reads).toHaveLength(SETTLE_READ_LIMIT)
    expect(s.result.value).toBeNull()
    expect(s.result.detail).toContain(`did not settle after ${SETTLE_READ_LIMIT} reads`)
    expect(s.result.detail).toContain('shot rejected: luminance=')
    expect(shotDrift(s.window)).toBeGreaterThan(SHOT_DRIFT_BAR)
  })

  it('still rejects a moving partial-crop defect and measures it once persistent', async () => {
    // A brightening of a fifth of the crop could hide in the old spatial trim.
    // The shot halves include it, just as they include a dark band leak.
    for (const change of [-20, 20]) {
      const s = await sample(i => Float64Array.of(i < 3 ? 100 : 100 + change, 100, 100, 100, 100))
      expect(shotDrift(s.reads.slice(0, windowSize))).toBeGreaterThan(SHOT_DRIFT_BAR)
      expect(s.reads.length).toBeGreaterThan(windowSize)
      expect(s.result.value).toBe(100 + change / 5)
      expect(s.result).toEqual(edgeShotReading(s.window))
    }
  })

  it('retains temporal rain rejection in both halves', async () => {
    const s = await sample(i => Float64Array.of(i === 0 || i === 3 ? 200 : 100, 100, 100))
    expect(s.reads).toHaveLength(windowSize)
    expect(s.result).toEqual({ value: 100 })
  })

  it('reports zero luminance when a black crop never settles to a valid shot', async () => {
    const s = await sample(() => crop(0))
    expect(s.result.value).toBeNull()
    expect(s.result.detail).toContain('zero-luminance shot: reading=0, drift=null')
  })

  it('preserves an off-frame diagnostic without waiting for more reads', async () => {
    let count = 0
    const failure = { value: null, detail: 'crop off-frame: rectangle outside viewport' }
    const result = await settledEdgeShot({ gap: async () => true, read: async () => { count++; return failure } })
    expect(result).toBe(failure)
    expect(count).toBe(1)
  })

  it.each([1, 3, 6])('fails a starved gap before read %i without capturing it', async starved => {
    const s = await sample(() => crop(100), i => i !== starved)
    expect(s.reads).toHaveLength(starved - 1)
    expect(s.result.value).toBeNull()
    expect(s.result.detail).toContain(`read gap starved before settle read ${starved}:`)
  })
})
