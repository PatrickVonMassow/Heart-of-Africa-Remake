// The speech note's size from the camera distance (points 1271, 1278):
// monotone, clamped, and growing with its speaker noticeably.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { speechBubbleExponent, speechBubbleScale } from './speechBubbleScale'

const cfg = balance.communication.speechBubble
const FAR = speechBubbleScale(cfg.farDistance)
const CAP = cfg.baseScale * cfg.maxScale

describe('speechBubbleScale', () => {
  it('shrinks monotonically with distance, strictly between the cap and the far hold', () => {
    const capAt = cfg.nearDistance * Math.pow(cfg.nearScale / cfg.maxScale, 1 / speechBubbleExponent())
    let last = Infinity
    for (let d = 0; d <= 60; d += 0.05) {
      const s = speechBubbleScale(d)
      expect(s).toBeLessThanOrEqual(last)
      if (d > capAt + 0.05 && d <= cfg.farDistance) expect(s).toBeLessThan(last)
      last = s
    }
  })

  it('is capped up close and held beyond the far distance', () => {
    expect(speechBubbleScale(0)).toBeCloseTo(CAP)
    expect(speechBubbleScale(1)).toBeCloseTo(CAP)
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
    expect(sw).toBeLessThan(CAP)
    // A tall one: the height cap decides.
    const tall = { width: 120, height: 120, ...view }
    const st = speechBubbleScale(0.5, cfg, tall)
    expect(st * tall.height).toBeCloseTo(cfg.maxViewportHeight * 900)
    // Far away nothing is capped.
    expect(speechBubbleScale(22, cfg, wide)).toBeCloseTo(FAR)
    // An unmeasured note (zero size) is not capped to nothing.
    expect(speechBubbleScale(2, cfg, { width: 0, height: 0, ...view })).toBeCloseTo(speechBubbleScale(2))
  })

  it('gives the calibrated sizes themselves, worked out by hand', () => {
    // 1.4 · clamp(3.04 · (3/d)^k, 0.60, 4.0), k = ln(3.04/0.60)/ln(22/3) —
    // numbers computed outside the function, so a curve that kept the ratios
    // but not the scale fails here.
    expect(cfg).toMatchObject({ baseScale: 1.4, nearDistance: 3, farDistance: 22, nearScale: 3.04, farScale: 0.6, maxScale: 4 })
    expect(speechBubbleExponent()).toBeCloseTo(0.814424, 5)
    expect(speechBubbleScale(3)).toBeCloseTo(4.256, 4) // 1.4 · 3.04
    expect(speechBubbleScale(22)).toBeCloseTo(0.84, 4) // 1.4 · 0.60
    expect(speechBubbleScale(10)).toBeCloseTo(1.596455, 4)
    expect(speechBubbleScale(15)).toBeCloseTo(1.147476, 4)
    expect(speechBubbleScale(2.2)).toBeCloseTo(1.4 * 3.04 * Math.pow(3 / 2.2, 0.814424), 3) // just short of the cap
    expect(speechBubbleScale(2)).toBeCloseTo(5.6, 4) // capped at 4.0, reached at ~2.14 m
  })

  it('reads every field of the configuration it is handed', () => {
    const own = { ...cfg, baseScale: 2, nearDistance: 2, farDistance: 8, nearScale: 4, farScale: 1, maxScale: 6 }
    // k = ln 4 / ln 4 = 1
    expect(speechBubbleExponent(own)).toBeCloseTo(1, 6)
    expect(speechBubbleScale(4, own)).toBeCloseTo(4, 6) // 2 · 4 · 2/4
    expect(speechBubbleScale(1, own)).toBeCloseTo(12, 6) // 2 · min(6, 8)
    expect(speechBubbleScale(80, own)).toBeCloseTo(2, 6)
    // The caps read their own shares.
    const fit = { width: 100, height: 10, viewportWidth: 1000, viewportHeight: 1000 }
    expect(speechBubbleScale(1, { ...own, maxViewportWidth: 0.2 }, fit)).toBeCloseTo(2, 6)
    expect(speechBubbleScale(1, { ...own, maxViewportHeight: 0.01 }, fit)).toBeCloseTo(1, 6)
  })

  it('stays clamped for a degenerate near/far span', () => {
    const flat = { ...cfg, farDistance: cfg.nearDistance }
    expect(Number.isFinite(speechBubbleScale(0, flat))).toBe(true)
    expect(speechBubbleScale(0, flat)).toBeLessThanOrEqual(cfg.baseScale * cfg.maxScale)
    expect(speechBubbleScale(100, flat)).toBeCloseTo(cfg.baseScale * cfg.farScale)
  })
})
