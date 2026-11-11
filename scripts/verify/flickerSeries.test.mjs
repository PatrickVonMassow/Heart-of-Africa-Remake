import { describe, expect, it } from 'vitest'
import { judgeFlickerSeries } from './flickerSeries.mjs'

const W = 40
const H = 30

/** A grey frame with a vertical edge at column `edge` (dark left, light right). */
function frame(edge, fight) {
  const data = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = x < edge ? 60 : 200
      if (fight && y >= 10 && y < 20 && x >= 30 && x < 38) v = fight
      data.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3)
    }
  }
  return { data, width: W, height: H, channels: 3 }
}

describe('flicker judgement of a moving-camera series', () => {
  it('passes smooth motion: an edge sweeping across the frames never flips back', () => {
    const frames = Array.from({ length: 8 }, (_, k) => frame(5 + k * 2))
    const r = judgeFlickerSeries(frames)
    expect(r.ok).toBe(true)
    expect(r.worst).toBe(0)
  })

  it('passes a narrow feature moving across the frame: a one-pixel stripe stepping one column per frame', () => {
    // Every pixel the stripe crosses goes dark → bright → dark (30 per triple,
    // 2.5 % of 40×30 — far above the limit if counted); it is motion.
    const stripe = (col) => {
      const data = new Uint8Array(W * H * 3).fill(30)
      for (let y = 0; y < H; y++) data.fill(230, (y * W + col) * 3, (y * W + col) * 3 + 3)
      return { data, width: W, height: H, channels: 3 }
    }
    for (const step of [1, 2]) {
      const r = judgeFlickerSeries(Array.from({ length: 10 }, (_, k) => stripe(5 + k * step)))
      expect(r.ok, `step ${step}`).toBe(true)
      expect(r.worst).toBe(0)
    }
  })

  it('fails twelve stationary single pixels toggling 30 <-> 130 (1 % of the frame) — the centre must be explained, not averaged away', () => {
    const spots = Array.from({ length: 12 }, (_, i) => [4 + (i % 6) * 6, 6 + Math.floor(i / 6) * 12])
    const frames = Array.from({ length: 6 }, (_, k) => {
      const data = new Uint8Array(W * H * 3).fill(30)
      for (const [x, y] of spots) data.fill(k % 2 ? 130 : 30, (y * W + x) * 3, (y * W + x) * 3 + 3)
      return { data, width: W, height: H, channels: 3 }
    })
    const r = judgeFlickerSeries(frames)
    expect(r.ok).toBe(false)
    expect(r.worst).toBeCloseTo(12 / (W * H), 6)
  })

  it('still fails a patch that toggles in place beside a moving stripe', () => {
    const frames = Array.from({ length: 8 }, (_, k) => {
      const data = new Uint8Array(W * H * 3).fill(30)
      for (let y = 0; y < H; y++) data.fill(230, (y * W + 5 + k) * 3, (y * W + 5 + k) * 3 + 3)
      // An 8×10 patch toggling between two surfaces.
      for (let y = 10; y < 20; y++) for (let x = 28; x < 36; x++) data.fill(k % 2 ? 40 : 220, (y * W + x) * 3, (y * W + x) * 3 + 3)
      return { data, width: W, height: H, channels: 3 }
    })
    const r = judgeFlickerSeries(frames)
    expect(r.ok).toBe(false)
    expect(r.worst).toBeGreaterThan(0.03)
  })

  it('fails a patch that toggles between two surfaces from frame to frame (a depth fight)', () => {
    const frames = Array.from({ length: 8 }, (_, k) => frame(5 + k * 2, k % 2 ? 40 : 220))
    const r = judgeFlickerSeries(frames)
    expect(r.ok).toBe(false)
    expect(r.worst).toBeGreaterThan(0.05)
  })

  it('refuses a series too short to see a flip', () => {
    expect(() => judgeFlickerSeries([frame(5), frame(6)])).toThrow(/at least 3/)
  })
})
