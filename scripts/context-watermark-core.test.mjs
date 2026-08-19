// The context watermark (point 675, defeat 3), pinned. Written from the failure
// side: the watermark exists because NOTHING watched the context — so the two
// forbidden outcomes are firing on an ASSUMPTION and silently never firing.
import { describe, it, expect } from 'vitest'
import {
  CONTEXT_CEILING_TOKENS,
  CONTEXT_MARGIN_TOKENS,
  CONTEXT_TRIGGER_TOKENS,
  contextDistanceNote,
  parseContextTokens,
  watermarkDecision,
} from './context-watermark-core.mjs'
import { triggerTokens } from './context-watermark.mjs'

const LARGEST_OBSERVED_SINGLE_RESPONSE_TOKENS = 40_000
const MEASURED_BOUNDARY_COST_TOKENS = 27_336
// The startup cost of a session that has done NO work, measured 19./20.08.2026
// across four autostarted sessions: 85,225 / 83,079 / 86,416, plus one that
// reached 91,605 on orientation alone. The trigger must clear this, or it
// forbids a fresh session its first call.
const MEASURED_STARTUP_FLOOR_TOKENS = 86_416

const usageLine = (over = {}, top = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-13T10:00:00.000Z',
    message: {
      usage: {
        input_tokens: 1000,
        cache_read_input_tokens: 120_000,
        cache_creation_input_tokens: 4000,
        output_tokens: 300,
        ...over,
      },
    },
    ...top,
  })

describe('parseContextTokens — the reading is the NEWEST real usage record', () => {
  it('sums input + cache-read + cache-creation of the last usage record', () => {
    const r = parseContextTokens(`${usageLine()}\n`)
    expect(r).toEqual({ tokens: 125_000, at: Date.parse('2026-08-13T10:00:00.000Z') })
  })

  it('the LAST record wins — the context a next call will carry', () => {
    const text = [usageLine({ input_tokens: 10 }), usageLine({ input_tokens: 90_000 })].join('\n')
    expect(parseContextTokens(text).tokens).toBe(214_000)
  })

  it('skips sidechain records — a subagent’s context is not this session’s', () => {
    const text = [
      usageLine({ input_tokens: 50 }),
      usageLine({ input_tokens: 999_999 }, { isSidechain: true }),
    ].join('\n')
    expect(parseContextTokens(text).tokens).toBe(124_050)
  })

  it('walks past torn, empty and non-usage lines without inventing anything', () => {
    const text = ['{"type":"user"}', usageLine(), '{"half a json', '', 'not json at all'].join('\n')
    expect(parseContextTokens(text).tokens).toBe(125_000)
  })

  it('missing cache fields count as zero, and a usage-free tail answers null', () => {
    expect(
      parseContextTokens(
        JSON.stringify({ message: { usage: { input_tokens: 42, output_tokens: 1 } } }),
      ).tokens,
    ).toBe(42)
    expect(parseContextTokens('{"type":"user"}\n{"type":"system"}')).toBeNull()
    expect(parseContextTokens('')).toBeNull()
    expect(parseContextTokens(null)).toBeNull()
  })

  it('an all-zero usage record proves nothing — keep looking, else null', () => {
    const zero = usageLine({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
    expect(parseContextTokens(`${usageLine()}\n${zero}`).tokens).toBe(125_000)
    expect(parseContextTokens(zero)).toBeNull()
  })

  it('a missing timestamp yields a reading with at:null, never a lost reading', () => {
    const r = parseContextTokens(JSON.stringify({ message: { usage: { input_tokens: 7 } } }))
    expect(r).toEqual({ tokens: 7, at: null })
  })
})

describe('watermarkDecision — past, below, or LOUDLY unreadable', () => {
  it('pins the ceiling, the trigger, and the FLOOR the trigger must clear', () => {
    expect(CONTEXT_CEILING_TOKENS).toBe(150_000)
    expect(CONTEXT_TRIGGER_TOKENS).toBe(110_000)

    // THE BINDING RULE (user 20.08.2026). A trigger below the measured startup
    // cost of an idle session bounds nothing — it refuses that session its
    // FIRST call, which is how four sessions in a row stranded without
    // beginning a point. The trigger clears the floor with room to work.
    expect(CONTEXT_TRIGGER_TOKENS).toBeGreaterThan(MEASURED_STARTUP_FLOOR_TOKENS)
    expect(CONTEXT_TRIGGER_TOKENS).toBeLessThan(CONTEXT_CEILING_TOKENS)
  })

  it('NAMES the worst case the raised trigger no longer covers — the residual is stated, not hidden', () => {
    // The old 82,000 was derived from this sum fitting under the ceiling. At
    // 110,000 it no longer does, and that is the accepted cost of a usable
    // window: a session that takes its largest observed single response right
    // AT the trigger and then pays the measured cost of leaving lands past the
    // ceiling. Both premises are single observations, not bounds. Point 744
    // recomputes the exit cost from clean measurement and point 747
    // recalibrates the ceiling from the recorded overshoot series; until then
    // the overshoot is MEASURED by the incident record rather than prevented.
    const worstCase =
      CONTEXT_TRIGGER_TOKENS +
      LARGEST_OBSERVED_SINGLE_RESPONSE_TOKENS +
      MEASURED_BOUNDARY_COST_TOKENS
    expect(worstCase).toBeGreaterThan(CONTEXT_CEILING_TOKENS)
    // …while the ordinary case — a trigger firing and the boundary taken
    // straight away — still fits, which is what the trigger is FOR.
    expect(CONTEXT_TRIGGER_TOKENS + MEASURED_BOUNDARY_COST_TOKENS).toBeLessThanOrEqual(
      CONTEXT_CEILING_TOKENS,
    )
  })

  it('the admission consumer fires on the trigger, not the ceiling', () => {
    expect(watermarkDecision({ reading: { tokens: CONTEXT_TRIGGER_TOKENS } }).state).toBe('past')
    expect(watermarkDecision({ reading: { tokens: CONTEXT_CEILING_TOKENS } }).state).toBe('past')
    expect(watermarkDecision({ reading: { tokens: CONTEXT_TRIGGER_TOKENS - 1 } }).state).toBe('below')
    expect(triggerTokens({})).toBe(CONTEXT_TRIGGER_TOKENS)
    expect(triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '90_000' })).toBe(CONTEXT_TRIGGER_TOKENS)
    expect(triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '90000' })).toBe(90_000)
  })

  it('NO reading is "unreadable" WITH an alert — never a silent "below"', () => {
    for (const reading of [null, undefined, {}, { tokens: 0 }, { tokens: -5 }, { tokens: 'many' }]) {
      const d = watermarkDecision({ reading })
      expect(d.state).toBe('unreadable')
      expect(d.alert).toBe(true)
      expect(d.tokens).toBeNull()
    }
  })

  it('a calibrated watermark is honoured; a broken one falls back to the named default', () => {
    expect(watermarkDecision({ reading: { tokens: 60_000 }, watermark: 50_000 }).state).toBe('past')
    expect(watermarkDecision({ reading: { tokens: 60_000 }, watermark: 0 }).state).toBe('below')
    expect(watermarkDecision({ reading: { tokens: 60_000 }, watermark: NaN }).watermark).toBe(
      110_000,
    )
  })

  it('a real reading carries its tokens through to the verdict', () => {
    const d = watermarkDecision({ reading: { tokens: 111_000 } })
    expect(d).toEqual({ state: 'past', tokens: 111_000, watermark: 110_000, alert: false })
  })
})

describe('contextDistanceNote — the distance between ceiling and handover is a number, not a claim (point 700)', () => {
  it('stays silent within the stated margin, below the ceiling included', () => {
    expect(contextDistanceNote({ tokens: 120_000, ceiling: 150_000 })).toBeNull()
    expect(contextDistanceNote({ tokens: 150_000 + CONTEXT_MARGIN_TOKENS, ceiling: 150_000 })).toBeNull()
  })

  it('demands the closing report name a boundary taken further past the ceiling than the margin', () => {
    const note = contextDistanceNote({ tokens: 434_440, ceiling: 150_000 })
    expect(note).toContain('284440')
    expect(note).toContain('150000 CEILING')
    expect(note).toContain('closing report')
  })

  it('an UNMEASURED boundary is named too — no reading must never read as a small distance', () => {
    expect(contextDistanceNote({ tokens: null, ceiling: 150_000 })).toContain('NO CONTEXT READING')
  })

  it('a broken ceiling falls back to the named ceiling, not the trigger', () => {
    expect(contextDistanceNote({ tokens: 500_000, ceiling: 0 })).toContain('150000 CEILING')
  })
})
