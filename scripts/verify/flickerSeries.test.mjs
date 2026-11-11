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
