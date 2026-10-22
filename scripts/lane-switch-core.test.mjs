import { describe, expect, it } from 'vitest'
import { CROSS, LEGACY, MAIN, SCARCE, TEST_FOREIGN_MODELS } from './model-lanes.mjs'
import {
  laneRefusalReason,
  laneIsOn,
  isSwitchFallbackReason,
  mergeFallbackReason,
  mergePromptFraming,
  mergerModel,
  readState,
  requireState,
  servingChain,
  servingRoute,
  servingFallbackModelId,
  servingPolicyLine,
  statePathFrom,
  statusReport,
  unreadableState,
  writeLaneFile,
  writeState,
  parseClaudeResultOutput,
} from './lane-switch-core.mjs'

// Roster names, read from the lane records.
const SCARCE_NAME = SCARCE.displayName
const CROSS_NAME = CROSS.displayName
const MAIN_TRAILER = MAIN.trailerName
const FUTURE_CROSS = TEST_FOREIGN_MODELS.futureCross
const entry = (state, why) => writeState(state, { why, by: 'the user', now: 1_700_000_000_000 })
const on = () => readState(JSON.stringify(entry('on', 'capacity restored')))
const off = () => readState(JSON.stringify(entry('off', 'not enough volume left')))

describe('the lane switch record', () => {
  it('round-trips a complete record and reports every decision field', () => {
    const state = off()
    expect(state).toMatchObject({ ok: true, state: 'off', reason: 'not enough volume left', setBy: 'the user' })
    expect(statusReport(state)).toBe(
      `lane-switch: scarce (${SCARCE_NAME}) OFF — reason: not enough volume left — set by the user at 2023-11-14T22:13:20.000Z`,
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
    expect(state.problem).toContain('node scripts/lane-switch.mjs --status')
    expect(() => laneIsOn(state)).toThrow(/lane-switch\.mjs --status/)
    expect(() => mergerModel(state)).toThrow(/lane-switch\.mjs --status/)
  })

  it('refuses incomplete writes', () => {
    expect(() => writeState('sideways', { why: 'x', by: 'y' })).toThrow(/on or off/)
    expect(() => writeState('off', { why: '', by: 'y' })).toThrow(/--why/)
    expect(() => writeState('off', { why: 'x', by: '' })).toThrow(/setter/)
    expect(() => requireState({ state: 'off' })).toThrow(/lane-switch\.mjs/)
  })

  it('lives in the main checkout shared by delegated worktrees', () => {
    expect(statePathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/p788')).toBe(
      '/workspace/hoa/.claude/lane-switch.json',
    )
    expect(statePathFrom('/workspace/hoa/.git', '/x', { name: LEGACY.files.switch })).toBe(
      `/workspace/hoa/.claude/${LEGACY.files.switch}`,
    )
  })

  it('reads one entry per lane and defaults only the switch-gated lane to unusable', () => {
    const file = JSON.stringify({ lanes: { cross: entry('off', 'cross paused') } })
    expect(readState(file, 'cross')).toMatchObject({ ok: true, role: 'cross', state: 'off', reason: 'cross paused' })
    // Absent scarce entry fails closed (today's refusal contract); absent main/cross are on.
    expect(readState(file, 'scarce')).toMatchObject({ ok: false, role: 'scarce', state: null })
    expect(readState(file, 'scarce').problem).toContain('state is absent')
    expect(readState(file, 'main')).toMatchObject({ ok: true, role: 'main', state: 'on' })
    expect(readState(null, 'cross')).toMatchObject({ ok: true, state: 'on' })
    expect(readState(null)).toMatchObject({ ok: false, role: 'scarce' })
    // A flat record (the legacy file) is the scarce entry and says nothing about the others.
    const flat = JSON.stringify(entry('off', 'legacy decision'))
    expect(readState(flat)).toMatchObject({ ok: true, role: 'scarce', state: 'off', reason: 'legacy decision' })
    expect(readState(flat, 'cross')).toMatchObject({ ok: true, state: 'on' })
    expect(() => readState(file, 'nobody')).toThrow(/unknown lane/)
  })

  it('sets one lane without dropping the others and carries a legacy scarce decision over', () => {
    const legacyRaw = JSON.stringify(entry('on', 'legacy on'))
    const first = writeLaneFile(null, 'cross', entry('off', 'pause cross'), { legacyRaw })
    expect(first.lanes.scarce).toMatchObject({ state: 'on', reason: 'legacy on' })
    expect(first.lanes.cross).toMatchObject({ state: 'off', reason: 'pause cross' })
    const second = writeLaneFile(JSON.stringify(first), 'scarce', entry('off', 'volume'))
    expect(second.lanes.cross).toMatchObject({ state: 'off' })
    expect(second.lanes.scarce).toMatchObject({ state: 'off', reason: 'volume' })
    expect(() => writeLaneFile('{broken', 'scarce', entry('off', 'x'))).toThrow(/not valid JSON/)
  })
})

describe('decisions derived from the state', () => {
  it('includes the scarce lane in the serving chain only while on', () => {
    expect(servingChain(on())).toEqual([MAIN.displayName, SCARCE_NAME, MAIN.fallback.displayName])
    expect(servingChain(off())).toEqual([MAIN.displayName, MAIN.fallback.displayName])
    expect(servingRoute(on()).map((lane) => lane.id)).toEqual([MAIN.modelId, SCARCE.modelId, MAIN.fallback.modelId])
    expect(servingFallbackModelId(on())).toBe(SCARCE.modelId)
    expect(servingFallbackModelId(off())).toBe(MAIN.fallback.modelId)
  })

  it('builds the serving briefing and forbidden names from the same direction', () => {
    expect(servingPolicyLine(on())).toContain(`${MAIN.displayName}, then ${SCARCE_NAME}, then ${MAIN.fallback.displayName}`)
    expect(servingPolicyLine(on())).not.toContain(`${SCARCE_NAME} (the scarce lane, switched off)`)
    expect(servingPolicyLine(on())).toContain('every model outside that chain')
    expect(servingPolicyLine(off())).toContain(`${MAIN.displayName}, then ${MAIN.fallback.displayName}`)
    expect(servingPolicyLine(off())).toContain(`${SCARCE_NAME} (the scarce lane, switched off) and every model outside that chain`)
    expect(servingPolicyLine(off())).toContain('node scripts/lane-switch.mjs --status')
    expect(servingPolicyLine(off())).toContain('trusted handoff to the next allowed lane')
    expect(servingPolicyLine(off())).toContain('Only that fresh lane')
    expect(servingPolicyLine(off())).not.toContain('.claude/batch-paused')
  })

  it('selects the scarce lane as merger while on and the cross lane while off', () => {
    expect(mergerModel(on())).toBe(SCARCE_NAME)
    expect(mergerModel(off())).toBe(CROSS_NAME)
  })

  it('names the model that wrote neither half once the authors are known', () => {
    // The 13.08.2026 stage recovered under docs/four-eyes/: the scarce lane wrote half A
    // and the cross lane half B. Answering the cross lane there hands the merge to an
    // author of the material, which is the one thing the merge step exists to prevent.
    expect(mergerModel(off(), [SCARCE_NAME, CROSS_NAME])).toBe(MAIN_TRAILER)
    expect(mergerModel(on(), [SCARCE_NAME, CROSS_NAME])).toBe(MAIN_TRAILER)
    // Version and vendor spellings still have to resolve to the same model.
    expect(mergerModel(off(), [SCARCE.trailerName, CROSS.retired[0]])).toBe(MAIN_TRAILER)
    expect(mergerModel(off(), [SCARCE_NAME, `${MAIN.retired[1]} (1M context)`])).toBe(CROSS_NAME)
  })

  it('keeps the two-model fallback when every roster model wrote a half', () => {
    // Nothing untainted is left, so the older answer stands and the caller owes the
    // recorded fallback rather than the selection quietly inventing a third model.
    expect(mergerModel(off(), [MAIN_TRAILER, CROSS_NAME])).toBe(CROSS_NAME)
    expect(mergerModel(on(), [MAIN_TRAILER, CROSS_NAME])).toBe(SCARCE_NAME)
  })

  it('leaves the author-blind answer untouched so existing callers do not shift', () => {
    expect(mergerModel(on(), [])).toBe(SCARCE_NAME)
    expect(mergerModel(off(), [])).toBe(CROSS_NAME)
    expect(mergerModel(off(), ['', '   '])).toBe(CROSS_NAME)
  })

  it('owes the decorrelated framing to whoever actually merges its own half', () => {
    // The scarce lane off used to be enough to demand it; what matters is whether the SELECTED
    // merger wrote one of the halves.
    expect(mergePromptFraming(off(), [SCARCE_NAME, CROSS_NAME])).toBe('')
    expect(mergePromptFraming(off(), [MAIN_TRAILER, CROSS_NAME])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [MAIN_TRAILER, CROSS_NAME])).toContain(`${CROSS_NAME}'s own half`)
  })

  it('still demands the framing while either half leaves its author unnamed', () => {
    // A half nobody has named could be the merger's own. Reading that silence as "not
    // the merger" would retire the framing exactly where it is least safe to — and the
    // switch state does not change that, which is what the last line here used to get
    // wrong: it asserted the framing was dropped with the scarce lane ON and a half unnamed.
    expect(mergePromptFraming(off(), [SCARCE_NAME, ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), ['   ', CROSS_NAME])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [SCARCE_NAME])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), [SCARCE_NAME, ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), ['', CROSS_NAME])).toMatch(/DECORRELATED MERGE FRAMING/)
  })

  it('owes the framing when NOTHING is known about the halves, switch state included', () => {
    // The empty list used to be a third state — "a caller not using this" — that fell
    // back to the switch-only reading and, with the scarce lane ON, dropped the framing. Two
    // unknown halves reach that state by filtering, which is how the least safe case
    // got the answer meant for a caller not asking about authors (cross-vendor review
    // of point 889). Unknown is now unknown wherever it comes from.
    expect(mergePromptFraming(on(), [])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on(), ['', ''])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(on())).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergePromptFraming(off(), [])).toMatch(/DECORRELATED MERGE FRAMING/)
  })

  it('reads a name carrying both vendors as writing EVERY model it mentions', () => {
    // A compound of the scarce and the cross lane once resolved to the cross lane by
    // first-match, and mergerModel then offered the scarce lane as untainted although the
    // marker names it. A mixed name disqualifies every model it mentions instead.
    // With every roster model tainted by the mixed name, the switch's own answer is kept
    // for the caller to judge — which records the two-model fallback and owes the
    // decorrelated framing, instead of printing "wrote neither half".
    const mixed = `${SCARCE.familyWords[0]} / ${CROSS.retired[0]}`
    expect(mergerModel(on(), [mixed, MAIN_TRAILER])).toBe(SCARCE_NAME)
    expect(mergePromptFraming(on(), [mixed, MAIN_TRAILER])).toMatch(/DECORRELATED MERGE FRAMING/)
    expect(mergerModel(off(), [mixed, MAIN_TRAILER])).toBe(CROSS_NAME)
    expect(mergePromptFraming(off(), [mixed, MAIN_TRAILER])).toMatch(/DECORRELATED MERGE FRAMING/)
    // A name mentioning ANOTHER version of the cross lane's family is still the cross lane
    // (lane-level identity, scripts/model-lanes.mjs sharesIdentity): every roster model
    // is tainted, so the switch's own answer stands.
    expect(mergerModel(on(), [`${SCARCE_NAME} / ${FUTURE_CROSS}`, MAIN_TRAILER])).toBe(SCARCE_NAME)
    // The current name still disqualifies.
    expect(mergerModel(on(), [`${SCARCE_NAME} / ${CROSS_NAME}`, ''])).toBe(MAIN_TRAILER)
    // One family, several versions: each mentioned name taints its lane.
    expect(mergerModel(off(), [`${FUTURE_CROSS} / ${CROSS.retired[0]}`, MAIN_TRAILER])).toBe(CROSS_NAME)
    expect(mergerModel(on(), [`${FUTURE_CROSS} / ${CROSS_NAME}`, MAIN_TRAILER])).toBe(SCARCE_NAME)
    // SAME-VENDOR compounds too: "<scarce> / <main>" mentions the main lane, so it may
    // not be offered as untainted (reduction to one key did that).
    expect(mergerModel(on(), [`${SCARCE_NAME} / ${MAIN_TRAILER}`, CROSS_NAME])).toBe(SCARCE_NAME)
    expect(mergePromptFraming(on(), [`${SCARCE_NAME} / ${MAIN_TRAILER}`, CROSS_NAME])).toMatch(/DECORRELATED MERGE FRAMING/)
  })

  it('treats every current and retired name of the cross lane as one lane', () => {
    // Lane-level identity (decided for point 1393): a half written under a retired or a
    // future cross-lane name is the cross lane's half.
    expect(mergerModel(off(), [SCARCE_NAME, FUTURE_CROSS])).toBe(MAIN_TRAILER)
    for (const retired of CROSS.retired) expect(mergerModel(off(), [SCARCE_NAME, retired])).toBe(MAIN_TRAILER)
    // A name with no version at all still matches its family, as before.
    expect(mergerModel(off(), [SCARCE_NAME, CROSS.familyWords.at(-1)])).toBe(MAIN_TRAILER)
    // A model the registry does not know taints nothing.
    expect(mergerModel(off(), [SCARCE_NAME, TEST_FOREIGN_MODELS.haiku])).toBe(CROSS_NAME)
  })

  it('names the model whose framing must not be reused, which is the selected merger', () => {
    expect(mergePromptFraming(off())).toContain(`do not reuse the framing, ordering, or categories of ${CROSS_NAME}'s own half`)
    expect(mergePromptFraming(on())).toContain(`of ${SCARCE_NAME}'s own half`)
  })

  it('emits one checkable switch fallback without accepting a bare claim', () => {
    const reason = mergeFallbackReason(off())
    expect(reason).toBe(
      'The scarce lane is switched off by the recorded lane switch (node scripts/lane-switch.mjs --status): not enough volume left',
    )
    expect(isSwitchFallbackReason(reason)).toBe(true)
    expect(isSwitchFallbackReason(`${SCARCE_NAME} was there`)).toBe(false)
    expect(isSwitchFallbackReason('The scarce lane is switched off by the recorded lane switch (node scripts/lane-switch.mjs --status): ')).toBe(false)
    expect(mergeFallbackReason(on())).toBe('')
  })

  it('keeps verifying the switch-fallback reasons landed ledger rows carry', () => {
    for (const prefix of LEGACY.switchFallbackPrefixes) {
      expect(isSwitchFallbackReason(`${prefix}not enough volume left`)).toBe(true)
      expect(isSwitchFallbackReason(prefix)).toBe(false)
    }
  })

  it('generates the route refusal from the same record', () => {
    expect(laneRefusalReason(off())).toBe(
      `${SCARCE_NAME} (the scarce lane) is refused because the recorded lane switch is OFF (node scripts/lane-switch.mjs --status): not enough volume left`,
    )
    expect(laneRefusalReason(on())).toBe('')
    const crossOff = readState(JSON.stringify({ lanes: { cross: entry('off', 'paused') } }), 'cross')
    expect(laneRefusalReason(crossOff)).toContain(`${CROSS_NAME} (the cross lane) is refused`)
    expect(laneRefusalReason(crossOff)).toContain('lane-switch.mjs --status): paused')
  })
})

describe('parseClaudeResultOutput', () => {
  const counters = { inputTokens: 7, outputTokens: 4, cacheReadInputTokens: 0, cacheCreationInputTokens: 9 }
  const output = (modelUsage) => JSON.stringify({
    result: 'answer',
    usage: { input_tokens: 7, output_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 9 },
    modelUsage,
  })
  const expected = { id: SCARCE.modelId, name: SCARCE.displayName }

  it('attributes the answer to the one row matching the top-level counters', () => {
    const parsed = parseClaudeResultOutput(output({ [SCARCE.modelId]: counters, [TEST_FOREIGN_MODELS.haikuId]: { ...counters, inputTokens: 1 } }), expected)
    expect(parsed.ok).toBe(true)
  })

  it('refuses when two rows match the counters, even if one is the expected model', () => {
    const parsed = parseClaudeResultOutput(output({ [SCARCE.modelId]: counters, [TEST_FOREIGN_MODELS.haikuId]: counters }), expected)
    expect(parsed.ok).toBe(false)
  })
})

describe('readState refuses a root that is no object', () => {
  it.each(['null', '[]', '42', '"on"'])('reads %s as unusable for every lane', (raw) => {
    for (const role of ['main', 'cross', 'scarce']) expect(readState(raw, role).ok, `${raw} ${role}`).toBe(false)
  })
})
