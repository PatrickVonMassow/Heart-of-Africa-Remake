// The context watermark (point 675, defeat 3), pinned. Written from the failure
// side: the watermark exists because NOTHING watched the context — so the two
// forbidden outcomes are firing on an ASSUMPTION and silently never firing.
import { describe, it, expect } from 'vitest'
import {
  CONTEXT_CEILING_TOKENS,
  CONTEXT_HANDOVER_RESERVE_TOKENS,
  CONTEXT_FENCE_MODES,
  CONTEXT_FENCE_MODE_DEFAULT,
  CONTEXT_MARGIN_TOKENS,
  CONTEXT_TRIGGER_TOKENS,
  contextDistanceNote,
  normalizeFenceMode,
  parseContextTokens,
  watermarkDecision,
} from './context-watermark-core.mjs'
import { fenceMode, triggerTokens } from './context-watermark.mjs'

// The startup cost of a session that has done NO work, measured 19./20.08.2026
// across four autostarted sessions: 85,225 / 83,079 / 86,416, plus one that
// reached 91,605 on orientation alone. Neither threshold may sit below this, or
// it forbids a fresh session its first call.
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
  it('pins the ceiling and the remaining handover threshold above the startup floor', () => {
    expect(CONTEXT_CEILING_TOKENS).toBe(150_000)
    expect(CONTEXT_TRIGGER_TOKENS).toBe(122_000) // provisional point-743 handover threshold
    expect(CONTEXT_TRIGGER_TOKENS).toBeGreaterThan(MEASURED_STARTUP_FLOOR_TOKENS)
    expect(CONTEXT_TRIGGER_TOKENS).toBeLessThan(CONTEXT_CEILING_TOKENS)
  })

  it('exports the provisional handover reserve derived from the point-743 pair', () => {
    expect(CONTEXT_HANDOVER_RESERVE_TOKENS).toBe(
      CONTEXT_CEILING_TOKENS - CONTEXT_TRIGGER_TOKENS,
    )
    expect(CONTEXT_HANDOVER_RESERVE_TOKENS).toBe(28_000)
  })

  it('the handover consumer fires on its threshold, not the ceiling', () => {
    expect(watermarkDecision({ reading: { tokens: CONTEXT_TRIGGER_TOKENS } }).state).toBe('past')
    expect(watermarkDecision({ reading: { tokens: CONTEXT_CEILING_TOKENS } }).state).toBe('past')
    expect(watermarkDecision({ reading: { tokens: CONTEXT_TRIGGER_TOKENS - 1 } }).state).toBe('below')
    expect(triggerTokens({})).toBe(CONTEXT_TRIGGER_TOKENS)
    expect(triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '90_000' })).toBe(CONTEXT_TRIGGER_TOKENS)
    expect(triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '90000' })).toBe(90_000)
  })

  it('THE IMMEDIATE RELIEF: HOA_CONTEXT_TRIGGER_TOKENS set wide in the launcher environment is honoured', () => {
    // Point 758's relief clause, independent of the merge: a launcher that
    // exports a wide value must actually move the mark that strands sessions.
    expect(triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '400000' })).toBe(400_000)
    expect(watermarkDecision({
      reading: { tokens: 200_000 },
      watermark: triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: '400000' }),
    }).state).toBe('below')
    // A junk or non-positive override is NOT an override — it must never
    // silently disable the threshold.
    for (const raw of ['', '0', '-1', 'wide', 'null', undefined]) {
      expect(triggerTokens({ HOA_CONTEXT_TRIGGER_TOKENS: raw })).toBe(CONTEXT_TRIGGER_TOKENS)
    }
  })

})

describe('the fence MODE is a named, single-valued switch — and its default is DISARMED (point 758)', () => {
  it('names exactly two modes, and observation is the default', () => {
    expect([...CONTEXT_FENCE_MODES]).toEqual(['observe', 'armed'])
    expect(CONTEXT_FENCE_MODE_DEFAULT).toBe('observe')
    expect(CONTEXT_FENCE_MODES).toContain(CONTEXT_FENCE_MODE_DEFAULT)
    // A frozen list: the mode must stay single-valued, not accrue a third
    // meaning that reads as neither armed nor disarmed.
    expect(Object.isFrozen(CONTEXT_FENCE_MODES)).toBe(true)
  })

  it('normalises spelling but invents nothing', () => {
    expect(normalizeFenceMode('armed')).toBe('armed')
    expect(normalizeFenceMode('  ARMED  ')).toBe('armed')
    expect(normalizeFenceMode('observe')).toBe('observe')
    for (const bogus of ['', ' ', 'off', 'on', 'true', '1', null, undefined, 7, {}]) {
      expect(normalizeFenceMode(bogus), `${JSON.stringify(bogus)}`).toBe(CONTEXT_FENCE_MODE_DEFAULT)
    }
  })

  it('reads HOA_CONTEXT_FENCE_MODE from the environment, defaulting to observation', () => {
    expect(fenceMode({})).toBe('observe')
    expect(fenceMode({ HOA_CONTEXT_FENCE_MODE: 'armed' })).toBe('armed')
    expect(fenceMode({ HOA_CONTEXT_FENCE_MODE: 'Armed' })).toBe('armed')
    expect(fenceMode({ HOA_CONTEXT_FENCE_MODE: 'observe' })).toBe('observe')
    expect(fenceMode({ HOA_CONTEXT_FENCE_MODE: 'yes' })).toBe('observe')
  })
})

describe('watermarkDecision — past, below, or LOUDLY unreadable', () => {
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
      CONTEXT_TRIGGER_TOKENS,
    )
  })

  it('a real reading carries its tokens through to the verdict', () => {
    const d = watermarkDecision({ reading: { tokens: 123_000 } })
    expect(d).toEqual({ state: 'past', tokens: 123_000, watermark: CONTEXT_TRIGGER_TOKENS, alert: false })
    // Admission consumes this raw reading separately; the watermark remains a
    // handover-only question.
    expect(watermarkDecision({ reading: { tokens: CONTEXT_TRIGGER_TOKENS - 1 } }).state).toBe('below')
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
