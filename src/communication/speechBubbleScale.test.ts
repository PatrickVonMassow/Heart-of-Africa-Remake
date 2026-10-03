// The speech note's size from the camera distance: monotone and clamped.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { speechBubbleScale } from './speechBubbleScale'

const cfg = balance.communication.speechBubble
const MIN = cfg.baseScale * cfg.farScale
const MAX = cfg.baseScale * cfg.nearScale

describe('speechBubbleScale', () => {
  it('is clearly larger than the former CSS size at every distance', () => {
    expect(MIN).toBeGreaterThanOrEqual(1)
    expect(MAX).toBeGreaterThan(MIN)
  })

  it('shrinks monotonically with distance and strictly between near and far', () => {
    let last = Infinity
    for (let d = 0; d <= 60; d += 0.25) {
      const s = speechBubbleScale(d)
      expect(s).toBeLessThanOrEqual(last)
      if (d > cfg.nearDistance && d <= cfg.farDistance) expect(s).toBeLessThan(last)
      last = s
    }
  })

  it('holds its maximum up close and its minimum far away', () => {
    expect(speechBubbleScale(0)).toBeCloseTo(MAX)
    expect(speechBubbleScale(cfg.nearDistance)).toBeCloseTo(MAX)
    expect(speechBubbleScale(cfg.farDistance)).toBeCloseTo(MIN)
    expect(speechBubbleScale(500)).toBeCloseTo(MIN)
  })

  it('treats a missing distance as far, never as a huge note', () => {
    expect(speechBubbleScale(Number.NaN)).toBeCloseTo(MIN)
    expect(speechBubbleScale(Number.POSITIVE_INFINITY)).toBeCloseTo(MIN)
  })

  it('stays clamped for a degenerate near/far span', () => {
    const flat = { ...cfg, farDistance: cfg.nearDistance }
    expect(speechBubbleScale(0, flat)).toBeCloseTo(MAX)
    expect(speechBubbleScale(100, flat)).toBeCloseTo(MIN)
  })
})
