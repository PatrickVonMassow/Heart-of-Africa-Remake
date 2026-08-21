// Handover still consumes the point-743 trigger. Pre-call admission consumes
// the raw reading, ceiling, series cost, pending ledger and reserved handover;
// no second global refusal threshold remains to drift beside it.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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

describe('the handover/ceiling consumer split', () => {
  it('routes handover to 122k and overshoot distance to the 150k ceiling', () => {
    const trigger = 122_000
    const ceiling = 150_000
    const aboveTriggerMargin = trigger + CONTEXT_MARGIN_TOKENS + 1
    const aboveCeilingMargin = ceiling + CONTEXT_MARGIN_TOKENS + 1

    expect(CONTEXT_TRIGGER_TOKENS).toBe(trigger)
    expect(CONTEXT_CEILING_TOKENS).toBe(ceiling)
    expect(watermarkDecision({ reading: { tokens: trigger } })).toMatchObject({ state: 'past', watermark: trigger })
    expect(triggerTokens({})).toBe(trigger)
    expect(gatherWatermark({ transcriptPath: fileURLToPath(import.meta.url), env: {} }).watermark).toBe(trigger)

    expect(contextDistanceNote({ tokens: aboveTriggerMargin })).toBeNull()
    expect(contextDistanceNote({ tokens: aboveCeilingMargin })).toContain(`1 TOKENS PAST THE ${ceiling} CEILING`)
    expect(boundaryContextDistanceNote(aboveTriggerMargin)).toBeNull()
    expect(boundaryContextDistanceNote(aboveCeilingMargin)).toContain(`1 TOKENS PAST THE ${ceiling} CEILING`)
  })

  it('keeps the handover relief on the handover path only', () => {
    const transcriptPath = fileURLToPath(import.meta.url)
    expect(gatherWatermark({ transcriptPath, env: { HOA_CONTEXT_TRIGGER_TOKENS: '400000' } }).watermark).toBe(400_000)
    expect(watermarkDecision({ reading: { tokens: 130_000 } }).state).toBe('past')
    expect(watermarkDecision({
      reading: { tokens: 130_000 },
      watermark: triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '400000' }),
    }).state).toBe('below')
  })

  it('routes the live fence to remaining-budget admission, never another watermark', () => {
    const HERE = dirname(fileURLToPath(import.meta.url))
    const source = (name) => readFileSync(resolve(HERE, name), 'utf8')
    const argumentsOf = (src) => [...src.matchAll(/gatherWatermark\(\{([^}]*)\}/g)].map((m) => m[1])
    const boundary = source('batch-boundary.mjs')
    for (const args of argumentsOf(boundary)) expect(args).not.toContain('watermark')

    const fence = source('context-fence-guard.mjs')
    for (const args of argumentsOf(fence)) expect(args).not.toContain('watermark')
    expect(fence).toContain('admitContextCall({')
    expect(fence).not.toContain('refusalTokens')
    expect(fence).not.toContain('CONTEXT_REFUSAL_TOKENS')
    expect(fence).not.toMatch(/\b110[_,]?000\b/)
  })
})
