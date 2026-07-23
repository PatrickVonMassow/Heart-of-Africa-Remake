// The DEV attribution probe (docs/perf-driving-hitches.md): pure stat folding
// and the bounded frame ring, so the driven verification can trust its numbers.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  FRAME_RING_CAP,
  PERF,
  maxFrameMs,
  recordBurst,
  recordFrame,
  resetPerf,
} from './perfProbe'

beforeEach(() => resetPerf())

describe('recordBurst (per-burst attribution stats)', () => {
  it('accumulates count, last, max and total', () => {
    recordBurst(PERF.terrain, 5)
    recordBurst(PERF.terrain, 12)
    recordBurst(PERF.terrain, 3)
    expect(PERF.terrain.count).toBe(3)
    expect(PERF.terrain.lastMs).toBe(3)
    expect(PERF.terrain.maxMs).toBe(12)
    expect(PERF.terrain.totalMs).toBe(20)
    // The flora stat is independent.
    expect(PERF.flora.count).toBe(0)
  })
})

describe('frame ring (bounded rAF-delta history)', () => {
  it('keeps at most FRAME_RING_CAP frames, dropping the oldest', () => {
    for (let i = 0; i < FRAME_RING_CAP + 50; i++) recordFrame(i, 16)
    expect(PERF.frames.length).toBe(FRAME_RING_CAP)
    expect(PERF.frames[0].t).toBe(50) // the oldest 50 were dropped
  })

  it('maxFrameMs reports the longest delta since a timestamp', () => {
    recordFrame(100, 16)
    recordFrame(200, 180)
    recordFrame(300, 20)
    expect(maxFrameMs()).toBe(180)
    expect(maxFrameMs(250)).toBe(20) // the spike before `since` is excluded
    expect(maxFrameMs(1000)).toBe(0)
  })
})

describe('resetPerf (a measurement pass starts fresh)', () => {
  it('zeroes every stat and clears the ring', () => {
    recordBurst(PERF.terrain, 9)
    recordBurst(PERF.flora, 4)
    recordFrame(1, 16)
    resetPerf()
    expect(PERF.terrain).toEqual({ count: 0, lastMs: 0, maxMs: 0, totalMs: 0 })
    expect(PERF.flora).toEqual({ count: 0, lastMs: 0, maxMs: 0, totalMs: 0 })
    expect(PERF.frames.length).toBe(0)
  })
})
