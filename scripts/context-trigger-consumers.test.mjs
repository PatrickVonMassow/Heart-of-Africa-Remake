// The handover threshold, the refusal threshold and the ceiling are three
// different contracts. This test follows the live consumers by VALUE so
// swapping any two cannot read plausibly while sending the handover to the
// ceiling, the overshoot to the handover, or the refusal to either.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { boundaryContextDistanceNote } from './batch-boundary.mjs'
import {
  CONTEXT_CEILING_TOKENS,
  CONTEXT_MARGIN_TOKENS,
  CONTEXT_REFUSAL_TOKENS,
  CONTEXT_TRIGGER_TOKENS,
  contextDistanceNote,
  watermarkDecision,
} from './context-watermark-core.mjs'
import { gatherWatermark, refusalTokens, triggerTokens } from './context-watermark.mjs'

describe('the handover/refusal/ceiling consumer split', () => {
  it('routes the handover to 122k, the fence refusal to 110k and overshoot to 150k', () => {
    const trigger = 122_000
    const ceiling = 150_000
    const refusal = 110_000
    const aboveTriggerMargin = trigger + CONTEXT_MARGIN_TOKENS + 1
    const aboveCeilingMargin = ceiling + CONTEXT_MARGIN_TOKENS + 1

    expect(CONTEXT_TRIGGER_TOKENS).toBe(trigger)
    expect(CONTEXT_CEILING_TOKENS).toBe(ceiling)
    expect(CONTEXT_REFUSAL_TOKENS).toBe(refusal)

    expect(watermarkDecision({ reading: { tokens: trigger } })).toMatchObject({
      state: 'past',
      watermark: trigger,
    })
    expect(triggerTokens({})).toBe(trigger)
    expect(refusalTokens({})).toBe(refusal)
    expect(
      gatherWatermark({ transcriptPath: fileURLToPath(import.meta.url), env: {} }).watermark,
    ).toBe(trigger)
    // …and the fence's own reading judges the SAME transcript against the
    // refusal mark instead — one measurement, two contracts (point 758).
    expect(
      gatherWatermark({
        transcriptPath: fileURLToPath(import.meta.url),
        env: {},
        watermark: refusalTokens({}),
      }).watermark,
    ).toBe(refusal)

    expect(contextDistanceNote({ tokens: aboveTriggerMargin })).toBeNull()
    expect(contextDistanceNote({ tokens: aboveCeilingMargin })).toContain(
      `1 TOKENS PAST THE ${ceiling} CEILING`,
    )
    expect(boundaryContextDistanceNote(aboveTriggerMargin)).toBeNull()
    expect(boundaryContextDistanceNote(aboveCeilingMargin)).toContain(
      `1 TOKENS PAST THE ${ceiling} CEILING`,
    )
  })

  it('THE IMMEDIATE RELIEF reaches the boundary — it takes its threshold from the same env variable', () => {
    // batch-boundary decides "has the context passed the watermark?" through
    // gatherWatermark with no override, so HOA_CONTEXT_TRIGGER_TOKENS set wide
    // in the launcher environment moves the mark the boundary fires on. This is
    // point 758's relief clause, pinned at the consumer rather than assumed.
    const transcriptPath = fileURLToPath(import.meta.url)
    expect(
      gatherWatermark({ transcriptPath, env: { HOA_CONTEXT_TRIGGER_TOKENS: '400000' } }).watermark,
    ).toBe(400_000)
    // A reading that would be 'past' at the default is 'below' once relieved.
    expect(watermarkDecision({ reading: { tokens: 130_000 } }).state).toBe('past')
    expect(
      watermarkDecision({
        reading: { tokens: 130_000 },
        watermark: triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '400000' }),
      }).state,
    ).toBe('below')
  })
})
