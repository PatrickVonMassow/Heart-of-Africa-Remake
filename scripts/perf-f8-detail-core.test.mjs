import { describe, expect, it } from 'vitest'
import { measuredPhases, phaseDetail, quantile } from './perf-f8-detail-core.mjs'

describe('perf-f8-detail core', () => {
  it('uses the F8 quantile rule (floor index)', () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(3)
    expect(quantile([], 0.5)).toBe(0)
  })

  it('pools the worst frames and splits them per system, render-submit net of shader builds', () => {
    const rec = {
      cpuMs: [2, 2, 2, 20, 10],
      work: [{}, {}, {}, { 'terrain-stream': 12, 'render-submit': 6, 'shader-programs': 4 }, { wildlife: 5 }],
      heapDropMb: [0, 0, 0, 3, 0],
    }
    const d = phaseDetail(rec, 2)
    expect(d.worstFrames).toEqual([20, 10])
    expect(d.gcFrames).toBe(1)
    const by = Object.fromEntries(d.worst.map((e) => [e.name, e.ms]))
    expect(by['terrain-stream']).toBe(12)
    expect(by['render-submit']).toBe(2)
    expect(by['shader-programs']).toBe(4)
    expect(by.wildlife).toBe(5)
    expect(by.unbooked).toBe(7) // 30 - 23
    expect(d.worst[0].share).toBe(0.4)
  })

  it('keeps only measured records of the phase', () => {
    const det = [
      { measured: false, phase: 'savanna-driving' },
      { measured: true, phase: 'savanna-driving', config: 'a' },
      { measured: true, phase: 'desert-standing' },
    ]
    expect(measuredPhases(det, 'savanna-driving').map((r) => r.config)).toEqual(['a'])
  })

  it('lists render:/gpu: bookings as nested, outside the booked sum', () => {
    const rec = {
      cpuMs: [1, 40],
      work: [{}, { 'render-submit': 36, 'render:main': 20, 'gpu:get-texture': 15 }],
      heapDropMb: null,
    }
    const d = phaseDetail(rec, 1)
    expect(d.worst.map((e) => e.name)).toEqual(['render-submit', 'unbooked'])
    expect(d.worst.find((e) => e.name === 'unbooked').ms).toBe(4)
    expect(d.nested.map((e) => [e.name, e.ms])).toEqual([['render:main', 20], ['gpu:get-texture', 15]])
  })
})
