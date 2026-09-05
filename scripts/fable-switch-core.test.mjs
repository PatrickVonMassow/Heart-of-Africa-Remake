import { describe, expect, it } from 'vitest'
import {
  FABLE_MODEL,
  ASTRA_MODEL,
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
      'claude-fable-5-1',
      'claude-opus-4-8[1m]',
    ])
    expect(servingFallbackModelId(on())).toBe('claude-fable-5-1')
    expect(servingFallbackModelId(off())).toBe('claude-opus-4-8[1m]')
  })

  it('builds the serving briefing and forbidden names from the same direction', () => {
    expect(servingPolicyLine(on())).toContain('Opus 5, then Fable 5.1, then Opus 4.8')
    expect(servingPolicyLine(on())).not.toContain('Fable 5.1, Sonnet, Haiku')
    expect(servingPolicyLine(off())).toContain('Opus 5, then Opus 4.8')
    expect(servingPolicyLine(off())).toContain('Fable 5.1, Sonnet, Haiku')
    expect(servingPolicyLine(off())).toContain('node scripts/fable-switch.mjs --status')
    expect(servingPolicyLine(off())).toContain('trusted handoff to the next allowed lane')
    expect(servingPolicyLine(off())).toContain('Only that fresh lane')
    expect(servingPolicyLine(off())).not.toContain('.claude/batch-paused')
  })

  it('selects Fable as merger while on and Astra while off', () => {
    expect(mergerModel(on())).toBe(FABLE_MODEL)
    expect(mergerModel(off())).toBe(ASTRA_MODEL)
  })

  it('names the model that wrote neither half once the authors are known', () => {
    // The 13.08.2026 stage recovered under docs/four-eyes/: Fable wrote half A and Astra
    // half B. Answering "Astra" there hands the merge to an author of the material, which
    // is the one thing the merge step exists to prevent.
    expect(mergerModel(off(), [FABLE_MODEL, ASTRA_MODEL])).toBe(CLAUDE_MODEL)
    expect(mergerModel(on(), [FABLE_MODEL, ASTRA_MODEL])).toBe(CLAUDE_MODEL)
    // Version and vendor spellings still have to resolve to the same model.
    expect(mergerModel(off(), ['Fable 5.1', 'GPT-6 Astra'])).toBe(CLAUDE_MODEL)
    expect(mergerModel(off(), [FABLE_MODEL, 'Claude Opus 5 (1M context)'])).toBe(ASTRA_MODEL)
  })

  it('keeps the two-model fallback when every roster model wrote a half', () => {
    // Nothing untainted is left, so the older answer stands and the caller owes the
    // recorded fallback rather than the selection quietly inventing a third model.
    expect(mergerModel(off(), [CLAUDE_MODEL, ASTRA_MODEL])).toBe(ASTRA_MODEL)
    expect(mergerModel(on(), [CLAUDE_MODEL, ASTRA_MODEL])).toBe(FABLE_MODEL)
  })

  it('leaves the author-blind answer untouched so existing callers do not shift', () => {
    expect(mergerModel(on(), [])).toBe(FABLE_MODEL)
    expect(mergerModel(off(), [])).toBe(ASTRA_MODEL)
    expect(mergerModel(off(), ['', '   '])).toBe(ASTRA_MODEL)
  })

  it('owes the decorrelated framing to whoever actually merges its own half', () => {
    // Fable off used to be enough to demand it; what matters is whether the SELECTED
    // merger wrote one of the halves.
    expect(mergePromptFraming(off(), [FABLE_MODEL, ASTRA_MODEL])).toBe('')
    expect(mergePromptFraming(off(), [CLAUDE_MODEL, ASTRA_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [CLAUDE_MODEL, ASTRA_MODEL])).toMatch(/GPT-6 Astra's own half/)
  })

  it('still demands the framing while either half leaves its author unnamed', () => {
    // A half nobody has named could be the merger's own. Reading that silence as "not
    // the merger" would retire the framing exactly where it is least safe to — and the
    // switch state does not change that, which is what the last line here used to get
    // wrong: it asserted the framing was dropped with Fable ON and a half unnamed.
    expect(mergePromptFraming(off(), [FABLE_MODEL, ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), ['   ', ASTRA_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [FABLE_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), [FABLE_MODEL, ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), ['', ASTRA_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
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

  it('reads a name carrying both vendors as writing EVERY model it mentions', () => {
    // "Fable / GPT-6 Astra" resolved to Astra by first-match, and mergerModel then
    // offered Fable as untainted although the marker names Fable. A mixed name
    // disqualifies every model it mentions instead of qualifying one of them.
    // With every roster model tainted by the mixed name, the switch's own answer
    // is kept for the caller to judge — which records the two-model fallback and
    // owes the decorrelated framing, instead of printing "wrote neither half".
    expect(mergerModel(on(), ['Fable / GPT-6 Astra', 'Claude Opus 5'])).toBe(FABLE_MODEL)
    expect(mergePromptFraming(on(), ['Fable / GPT-6 Astra', 'Claude Opus 5'])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergerModel(off(), ['Fable / GPT-6 Astra', CLAUDE_MODEL])).toBe(ASTRA_MODEL)
    expect(mergePromptFraming(off(), ['Fable / GPT-6 Astra', CLAUDE_MODEL])).toMatch(/DECORRELATED MERGE FRAMING/)
    // …but each mentioned model keeps its own version: a name mentioning a
    // DIFFERENT Astra does not disqualify the current one.
    expect(mergerModel(on(), ['Fable 5.1 / GPT-7 Astra', 'Claude Opus 5'])).toBe(ASTRA_MODEL)
    // While the mentioned version matching the roster still disqualifies.
    expect(mergerModel(on(), ['Fable 5.1 / GPT-6 Astra', ''])).toBe(CLAUDE_MODEL)
    // One family, several versions: each mentioned version is tainted — the
    // collapse to the first version let the other pass as untainted.
    expect(mergerModel(off(), ['GPT-7 Astra / GPT-6 Astra', CLAUDE_MODEL])).toBe(ASTRA_MODEL)
    expect(mergerModel(on(), ['GPT-7 Astra / GPT-6 Astra', 'Claude Opus 5'])).toBe(FABLE_MODEL)
    // SAME-VENDOR compounds too: "Fable 5.1 / Claude Opus 5" mentions Claude, so
    // Claude may not be offered as untainted (reduction to one key did that).
    expect(mergerModel(on(), ['Fable 5.1 / Claude Opus 5', 'GPT-6 Astra'])).toBe(FABLE_MODEL)
    expect(mergePromptFraming(on(), ['Fable 5.1 / Claude Opus 5', 'GPT-6 Astra'])).toMatch(/DECORRELATED MERGE FRAMING/)
  })

  it('tells two Astra versions apart instead of treating every Astra as one model', () => {
    // "GPT-6 Astra" carries its version on the VENDOR word, so a search keyed on "sol"
    // found no digits and made every Astra compare equal. A half written by a different
    // Astra version would then have wrongly disqualified the current one.
    expect(mergerModel(off(), [FABLE_MODEL, 'GPT-7 Astra'])).toBe(ASTRA_MODEL)
    expect(mergerModel(off(), [FABLE_MODEL, 'GPT-6 Astra'])).toBe(CLAUDE_MODEL)
    // A name with no version at all still matches its family, as before.
    expect(mergerModel(off(), [FABLE_MODEL, 'Astra'])).toBe(CLAUDE_MODEL)
  })

  it('names the model whose framing must not be reused, which is the selected merger', () => {
    expect(mergePromptFraming(off())).toMatch(/do not reuse.*Astra's own half/)
    expect(mergePromptFraming(on())).toMatch(/do not reuse.*Fable 5.1's own half/)
  })

  it('emits one checkable switch fallback without accepting a bare claim', () => {
    const reason = mergeFallbackReason(off())
    expect(reason).toContain('Fable 5.1 is switched off')
    expect(reason).toContain('not enough volume left')
    expect(isSwitchFallbackReason(reason)).toBe(true)
    expect(isSwitchFallbackReason('Fable 5.1 was there')).toBe(false)
    expect(mergeFallbackReason(on())).toBe('')
  })

  it('generates the route refusal from the same record', () => {
    expect(fableRefusalReason(off())).toBe(
      'Fable 5.1 is refused because the recorded Fable switch is OFF (node scripts/fable-switch.mjs --status): not enough volume left',
    )
    expect(fableRefusalReason(on())).toBe('')
  })
})
