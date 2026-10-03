// The speech note's size from the camera distance (points 1271, 1278):
// monotone, clamped, and growing with its speaker noticeably.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { speechBubbleScale } from './speechBubbleScale'

const cfg = balance.communication.speechBubble
const FAR = speechBubbleScale(cfg.farDistance)
const NEAR = speechBubbleScale(cfg.nearDistance)

describe('speechBubbleScale', () => {
  it('shrinks monotonically with distance, strictly between the holds', () => {
    let last = Infinity
    for (let d = 0; d <= 60; d += 0.05) {
      const s = speechBubbleScale(d)
      expect(s).toBeLessThanOrEqual(last)
      if (d > cfg.nearDistance + 1e-9 && d <= cfg.farDistance) expect(s).toBeLessThan(last)
      last = s
    }
  })

  it('is held below the near distance and beyond the far one', () => {
    expect(speechBubbleScale(0)).toBeCloseTo(NEAR)
    expect(speechBubbleScale(cfg.nearDistance / 2)).toBeCloseTo(NEAR)
    expect(speechBubbleScale(cfg.farDistance * 3)).toBeCloseTo(FAR)
    expect(speechBubbleScale(500)).toBeCloseTo(FAR)
  })

  it('grows a near speaker’s note at least 3x over a far one’s, 2 m against 20 m (point 1278)', () => {
    // The old curve spanned 1.8x while the speaker's own picture grows 10x.
    expect(speechBubbleScale(2) / speechBubbleScale(20)).toBeGreaterThanOrEqual(3)
    // And it keeps growing below the old 3 m hold, down to arm's length.
    expect(speechBubbleScale(1.5)).toBeGreaterThan(speechBubbleScale(3) * 1.2)
  })

  it('follows the speaker’s projection part-way, never faster than it', () => {
    // A speaker's picture scales 1/d; the note by (d1/d2)^exponent of it, with
    // 0 < exponent < 1 — growth that reads, short of matching the figure.
    for (const [a, b] of [
      [2, 15],
      [3, 12],
      [1.5, 20],
    ]) {
      const note = speechBubbleScale(a) / speechBubbleScale(b)
      const figure = b / a
      expect(note).toBeGreaterThan(Math.sqrt(figure))
      expect(note).toBeLessThan(figure)
    }
  })

  it('a near speaker’s receded older note still outgrows a far speaker’s current one', () => {
    // labelRecede shrinks the older of two notes; in ordinary conversation at
    // 2 m against 15 m that must not undo the growth.
    const receded = speechBubbleScale(2) * balance.communication.labelRecede.scale
    expect(receded / speechBubbleScale(15)).toBeGreaterThanOrEqual(2.5)
  })

  it('keeps the far note readable: never under the old minimum of 1.05 (a 13.7 px script)', () => {
    expect(FAR).toBeGreaterThanOrEqual(1.05 - 1e-9)
  })

  it('treats a missing distance as far, never as a huge note', () => {
    expect(speechBubbleScale(Number.NaN)).toBeCloseTo(FAR)
    expect(speechBubbleScale(Number.POSITIVE_INFINITY)).toBeCloseTo(FAR)
  })

  it('caps a close-up note at its share of the viewport, by width and by height', () => {
    const view = { viewportWidth: 1440, viewportHeight: 900 }
    // A wide note at arm's length: the width cap decides.
    const wide = { width: 300, height: 40, ...view }
    const sw = speechBubbleScale(0.5, cfg, wide)
    expect(sw * wide.width).toBeCloseTo(cfg.maxViewportWidth * 1440)
    expect(sw).toBeLessThan(NEAR)
    // A tall one: the height cap decides.
    const tall = { width: 120, height: 120, ...view }
    const st = speechBubbleScale(0.5, cfg, tall)
    expect(st * tall.height).toBeCloseTo(cfg.maxViewportHeight * 900)
    // Far away nothing is capped.
    expect(speechBubbleScale(20, cfg, wide)).toBeCloseTo(FAR)
    // An unmeasured note (zero size) is not capped to nothing.
    expect(speechBubbleScale(2, cfg, { width: 0, height: 0, ...view })).toBeCloseTo(speechBubbleScale(2))
  })

  it('stays clamped for a degenerate near/far span', () => {
    const flat = { ...cfg, farDistance: cfg.nearDistance }
    expect(speechBubbleScale(0, flat)).toBeCloseTo(speechBubbleScale(100, flat))
  })
})
