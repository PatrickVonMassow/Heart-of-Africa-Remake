// The context trigger and ceiling are different contracts. This test follows
// the live consumers by VALUE so swapping either side cannot read plausibly
// while sending admission to the ceiling or overshoot to the trigger.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { boundaryContextDistanceNote } from './batch-boundary.mjs'
import {
  CONTEXT_CEILING_TOKENS,
  CONTEXT_MARGIN_TOKENS,
  CONTEXT_TRIGGER_TOKENS,
  contextDistanceNote,
  watermarkDecision,
} from './context-watermark-core.mjs'
import { gatherWatermark, triggerTokens } from './context-watermark.mjs'

describe('the trigger/ceiling consumer split', () => {
  it('routes admission to 82k and overshoot to 150k', () => {
    const trigger = 82_000
    const ceiling = 150_000
    const aboveTriggerMargin = trigger + CONTEXT_MARGIN_TOKENS + 1
    const aboveCeilingMargin = ceiling + CONTEXT_MARGIN_TOKENS + 1

    expect(CONTEXT_TRIGGER_TOKENS).toBe(trigger)
    expect(CONTEXT_CEILING_TOKENS).toBe(ceiling)

    expect(watermarkDecision({ reading: { tokens: trigger } })).toMatchObject({
      state: 'past',
      watermark: trigger,
    })
    expect(triggerTokens({})).toBe(trigger)
    expect(
      gatherWatermark({ transcriptPath: fileURLToPath(import.meta.url), env: {} }).watermark,
    ).toBe(trigger)

    expect(contextDistanceNote({ tokens: aboveTriggerMargin })).toBeNull()
    expect(contextDistanceNote({ tokens: aboveCeilingMargin })).toContain(
      `1 TOKENS PAST THE ${ceiling} CEILING`,
    )
    expect(boundaryContextDistanceNote(aboveTriggerMargin)).toBeNull()
    expect(boundaryContextDistanceNote(aboveCeilingMargin)).toContain(
      `1 TOKENS PAST THE ${ceiling} CEILING`,
    )
  })
})
