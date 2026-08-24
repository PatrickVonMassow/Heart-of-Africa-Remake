import { describe, expect, it } from 'vitest'
import {
  FABLE_MODEL,
  SOL_MODEL,
  fableRefusalReason,
  fableIsOn,
  isSwitchFallbackReason,
  mergeFallbackReason,
  mergePromptFraming,
  mergerModel,
  CLAUDE_MODEL,
  readState,
  requireState,
  servingChain,
  servingRoute,
  servingFallbackModelId,
  servingPolicyLine,
  statePathFrom,
  statusReport,
  unreadableState,
  writeState,
} from './fable-switch-core.mjs'

const on = () => readState(JSON.stringify(writeState('on', { why: 'capacity restored', by: 'the user', now: 1_700_000_000_000 })))
const off = () => readState(JSON.stringify(writeState('off', { why: 'not enough volume left', by: 'the user', now: 1_700_000_000_000 })))

describe('the Fable state record', () => {
  it('round-trips a complete record and reports every decision field', () => {
    const state = off()
    expect(state).toMatchObject({ ok: true, state: 'off', reason: 'not enough volume left', setBy: 'the user' })
    expect(statusReport(state)).toBe(
      'fable-switch: OFF — reason: not enough volume left — set by the user at 2023-11-14T22:13:20.000Z',
    )
  })

  it.each([
    ['absent', readState(null)],
    ['unreadable', unreadableState(new Error('EACCES'))],
    ['garbled JSON', readState('{not json')],
    ['incomplete', readState('{"state":"off"}')],
  ])('%s state fails loud instead of choosing a direction', (_name, state) => {
    expect(state.ok).toBe(false)
    expect(state.state).toBeNull()
    expect(state.problem).toContain('node scripts/fable-switch.mjs --status')
    expect(() => fableIsOn(state)).toThrow(/fable-switch\.mjs --status/)
    expect(() => mergerModel(state)).toThrow(/fable-switch\.mjs --status/)
  })

  it('refuses incomplete writes', () => {
    expect(() => writeState('sideways', { why: 'x', by: 'y' })).toThrow(/on or off/)
    expect(() => writeState('off', { why: '', by: 'y' })).toThrow(/--why/)
    expect(() => writeState('off', { why: 'x', by: '' })).toThrow(/setter/)
    expect(() => requireState({ state: 'off' })).toThrow(/fable-switch\.mjs/)
  })

  it('lives in the main checkout shared by delegated worktrees', () => {
    expect(statePathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/p788')).toBe(
      '/workspace/hoa/.claude/fable-switch.json',
    )
  })
})

describe('decisions derived from the state', () => {
  it('includes Fable in the serving chain only while on', () => {
    expect(servingChain(on())).toEqual(['Opus 5', FABLE_MODEL, 'Opus 4.8'])
    expect(servingChain(off())).toEqual(['Opus 5', 'Opus 4.8'])
    expect(servingRoute(on()).map((lane) => lane.id)).toEqual([
      'claude-opus-5[1m]',
      'claude-fable-5',
      'claude-opus-4-8[1m]',
    ])
    expect(servingFallbackModelId(on())).toBe('claude-fable-5')
    expect(servingFallbackModelId(off())).toBe('claude-opus-4-8[1m]')
  })

  it('builds the serving briefing and forbidden names from the same direction', () => {
    expect(servingPolicyLine(on())).toContain('Opus 5, then Fable 5, then Opus 4.8')
    expect(servingPolicyLine(on())).not.toContain('Fable 5, Sonnet, Haiku')
    expect(servingPolicyLine(off())).toContain('Opus 5, then Opus 4.8')
    expect(servingPolicyLine(off())).toContain('Fable 5, Sonnet, Haiku')
    expect(servingPolicyLine(off())).toContain('node scripts/fable-switch.mjs --status')
    expect(servingPolicyLine(off())).toContain('trusted handoff to the next allowed lane')
    expect(servingPolicyLine(off())).toContain('Only that fresh lane')
    expect(servingPolicyLine(off())).not.toContain('.claude/batch-paused')
  })

  it('selects Fable as merger while on and Sol while off', () => {
    expect(mergerModel(on())).toBe(FABLE_MODEL)
    expect(mergerModel(off())).toBe(SOL_MODEL)
  })

  it('names the model that wrote neither half once the authors are known', () => {
    // The 13.08.2026 stage recovered under docs/four-eyes/: Fable wrote half A and Sol
    // half B. Answering "Sol" there hands the merge to an author of the material, which
    // is the one thing the merge step exists to prevent.
    expect(mergerModel(off(), [FABLE_MODEL, SOL_MODEL])).toBe(CLAUDE_MODEL)
    expect(mergerModel(on(), [FABLE_MODEL, SOL_MODEL])).toBe(CLAUDE_MODEL)
    // Version and vendor spellings still have to resolve to the same model.
    expect(mergerModel(off(), ['Fable 5', 'GPT-5.6 Sol'])).toBe(CLAUDE_MODEL)
    expect(mergerModel(off(), [FABLE_MODEL, 'Claude Opus 5 (1M context)'])).toBe(SOL_MODEL)
  })

  it('keeps the two-model fallback when every roster model wrote a half', () => {
    // Nothing untainted is left, so the older answer stands and the caller owes the
    // recorded fallback rather than the selection quietly inventing a third model.
    expect(mergerModel(off(), [CLAUDE_MODEL, SOL_MODEL])).toBe(SOL_MODEL)
    expect(mergerModel(on(), [CLAUDE_MODEL, SOL_MODEL])).toBe(FABLE_MODEL)
  })

  it('leaves the author-blind answer untouched so existing callers do not shift', () => {
    expect(mergerModel(on(), [])).toBe(FABLE_MODEL)
    expect(mergerModel(off(), [])).toBe(SOL_MODEL)
    expect(mergerModel(off(), ['', '   '])).toBe(SOL_MODEL)
  })

  it('owes the decorrelated framing to whoever actually merges its own half', () => {
    // Fable off used to be enough to demand it; what matters is whether the SELECTED
    // merger wrote one of the halves.
    expect(mergePromptFraming(off(), [FABLE_MODEL, SOL_MODEL])).toBe('')
    expect(mergePromptFraming(off(), [CLAUDE_MODEL, SOL_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [CLAUDE_MODEL, SOL_MODEL])).toMatch(/GPT-5\.6 Sol's own half/)
  })

  it('still demands the framing while either half leaves its author unnamed', () => {
    // A half nobody has named could be the merger's own. Reading that silence as "not
    // the merger" would retire the framing exactly where it is least safe to — and the
    // switch state does not change that, which is what the last line here used to get
    // wrong: it asserted the framing was dropped with Fable ON and a half unnamed.
    expect(mergePromptFraming(off(), [FABLE_MODEL, ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), ['   ', SOL_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [FABLE_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), [FABLE_MODEL, ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), ['', SOL_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
  })

  it('owes the framing when NOTHING is known about the halves, switch state included', () => {
    // The empty list used to be a third state — "a caller not using this" — that fell
    // back to the switch-only reading and, with Fable ON, dropped the framing. Two
    // unknown halves reach that state by filtering, which is how the least safe case
    // got the answer meant for a caller not asking about authors (cross-vendor review
    // of point 889). Unknown is now unknown wherever it comes from.
    expect(mergePromptFraming(on(), [])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), ['', ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on())).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [])).toMatch(/DECORRELATED MERGE FRAMING/)
  })

  it('tells two Sol versions apart instead of treating every Sol as one model', () => {
    // "GPT-5.6 Sol" carries its version on the VENDOR word, so a search keyed on "sol"
    // found no digits and made every Sol compare equal. A half written by a different
    // Sol version would then have wrongly disqualified the current one.
    expect(mergerModel(off(), [FABLE_MODEL, 'GPT-6 Sol'])).toBe(SOL_MODEL)
    expect(mergerModel(off(), [FABLE_MODEL, 'GPT-5.6 Sol'])).toBe(CLAUDE_MODEL)
    // A name with no version at all still matches its family, as before.
    expect(mergerModel(off(), [FABLE_MODEL, 'Sol'])).toBe(CLAUDE_MODEL)
  })

  it('names the model whose framing must not be reused, which is the selected merger', () => {
    expect(mergePromptFraming(off())).toMatch(/do not reuse.*Sol's own half/)
    expect(mergePromptFraming(on())).toMatch(/do not reuse.*Fable 5's own half/)
  })

  it('emits one checkable switch fallback without accepting a bare claim', () => {
    const reason = mergeFallbackReason(off())
    expect(reason).toContain('Fable 5 is switched off')
    expect(reason).toContain('not enough volume left')
    expect(isSwitchFallbackReason(reason)).toBe(true)
    expect(isSwitchFallbackReason('Fable 5 was there')).toBe(false)
    expect(mergeFallbackReason(on())).toBe('')
  })

  it('generates the route refusal from the same record', () => {
    expect(fableRefusalReason(off())).toBe(
      'Fable 5 is refused because the recorded Fable switch is OFF (node scripts/fable-switch.mjs --status): not enough volume left',
    )
    expect(fableRefusalReason(on())).toBe('')
  })
})
