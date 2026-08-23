// The typed user gate: parser, classifier and pure work-order rewrites. Every
// case uses text fixtures — never live TASKS.md, which is main-only.
import { describe, expect, it } from 'vitest'
import {
  ANSWERED_MARKER,
  CONFIRMATION_MARKER,
  SELF_DECIDED_MARKER,
  advisoryDecisionCard,
  CONFIRMATION_ACTS,
  answeredPoints,
  clearMarkers,
  classifyConfirmationReason,
  classifyLegacyReason,
  formatConfirmationReason,
  gateReport,
  gateSets,
  gatedPoints,
  markAnswered,
  markGated,
  markSelfDecided,
  migrateLegacyGates,
  parseGateLine,
  parseUserGates,
  prepareAdvisoryDecision,
  sanitiseReason,
} from './user-gate-core.mjs'

const tasks = (...lines) => lines.join('\n')
const confirmation = 'release-tag: push the version tag, safe prepared state: the build is verified locally and no tag is pushed'
const confirmationStored = confirmation
/** The untyped prose the LEGACY heuristic still has to judge. */
const legacyProse = 'push the version tag; safe prepared state: the build is verified locally and no tag is pushed'

describe('classifyConfirmationReason — the TYPED form is exact', () => {
  // THE STRUCTURAL ANSWER TO THREE ROUNDS OF COUNTEREXAMPLES (GPT-5.6 Sol,
  // 23.08.2026). Every one of them was an advisory question whose words happened
  // to name an outward act, and each widening produced the next. A typed
  // confirmation now SELECTS its act, so no sentence can be mistaken for one.
  it.each(Object.keys(CONFIRMATION_ACTS))('recognises the composed form for act %s', (act) => {
    const composed = formatConfirmationReason({ act, detail: 'do the concrete thing', prepared: 'nothing is out yet' })
    expect(composed.ok).toBe(true)
    expect(classifyConfirmationReason(composed.reason)).toMatchObject({ verdict: 'confirmation', act })
  })

  it('refuses PROSE outright, however outward-facing it reads', () => {
    for (const reason of [
      legacyProse,
      'dispatch the public release; prepared locally without deploying it',
      'Delete the v1.2.0 release tag; safe prepared state: nothing removed yet and the tag still stands',
      'which card colour should we use?',
      '   ',
    ]) {
      expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'advisory' })
    }
  })

  it('refuses an unknown act key and a field that names nothing', () => {
    expect(formatConfirmationReason({ act: 'ship-it', detail: 'do the thing now', prepared: 'nothing is out yet' })).toMatchObject({ ok: false })
    expect(formatConfirmationReason({ act: 'release-tag', detail: 'push', prepared: 'nothing is out yet' })).toMatchObject({ ok: false })
    expect(formatConfirmationReason({ act: 'release-tag', detail: 'push the v1 tag', prepared: 'ready' })).toMatchObject({ ok: false })
    // …and the stored shape is rejected the same way when it is read back.
    expect(classifyConfirmationReason('release-tag: push, safe prepared state: ok')).toMatchObject({ verdict: 'advisory' })
  })

  it('keeps the composed reason inside one work-order line', () => {
    const { reason } = formatConfirmationReason({
      act: 'release-tag',
      detail: 'push the v1.2.0 tag (after the closing)',
      prepared: 'the build is verified locally; no tag is pushed',
    })
    expect(reason).not.toMatch(/[()\r\n]/)
    expect(reason.length).toBeLessThanOrEqual(160)
    expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'confirmation', act: 'release-tag' })
  })
})

describe('classifyLegacyReason — the prose heuristic, for untyped markers alone', () => {
  it.each([
    'push the version tag; safe prepared state: the build is verified locally and no tag is pushed',
    'dispatch the public release; prepared locally without deploying it',
    'change the published four-section contract; safe prepared state: replacement built and not published',
  ])('reads a named act plus its safe prepared state as a confirmation: %s', (reason) => {
    expect(classifyLegacyReason(reason)).toMatchObject({ verdict: 'confirmation' })
    expect(classifyConfirmationReason(reason, { legacy: true })).toMatchObject({ verdict: 'confirmation' })
  })

  it.each([
    'which card colour should we use?',
    'please confirm the release design',
    'push the version tag',
    'outward-facing action; everything is ready',
  ])('reads advice or an incomplete reason as continuation: %s', (reason) => {
    expect(classifyLegacyReason(reason)).toMatchObject({ verdict: 'advisory' })
  })

  // The counterexamples of the three review rounds. They can no longer reach a
  // typed marker at all; here they decide only whether an ALREADY PARKED legacy
  // marker keeps its gate, and each still falls the way the 23.08.2026 order says.
  it.each([
    'Should the four-section internal draft change font? prepared locally without publishing it',
    'Choose copy for the withdrawal dialog in production; safe prepared state: mockups remain entirely local',
    'Choose typography for the published notice in production; safe prepared state: mockups remain entirely local',
    'Please choose whether to push the version tag; safe prepared state: the build is verified locally and no tag is pushed',
    'Review the changeability of the published four-section contract; safe prepared state: mockups remain entirely local',
    'push the release tag; safe prepared state:',
    'push the release tag; prepared locally',
    'Delete the public release; the locally built confirmation copy says do not publish',
  ])('keeps an ordinary product decision out of the gate: %s', (reason) => {
    expect(classifyLegacyReason(reason)).toMatchObject({ verdict: 'advisory' })
  })

  it.each([
    'Delete the v1.2.0 release tag; safe prepared state: nothing removed yet and the tag still stands',
    'Retract the poc tag; safe prepared state: the replacement is built and the tag still stands',
    'Send the version tag upstream; safe prepared state: the build is verified locally and no tag exists remotely',
    'Withdraw the public release; safe prepared state: it is still served and the rollback is staged',
    'Remove the deployed site from production; safe prepared state: it is still served and the takedown is staged',
    'push the version tag; the signed build output is prepared locally',
  ])('still reads a real outward act as one: %s', (reason) => {
    expect(classifyLegacyReason(reason)).toMatchObject({ verdict: 'confirmation' })
  })
})

describe('parseGateLine — one work-order line', () => {
  it('reads a typed confirmation with its stamp and reason', () => {
    const p = parseGateLine(`- [ ] 462. SOME POINT. AWAITING-CONFIRMATION(2026-07-30; ${confirmation})`)
    expect(p).toMatchObject({ point: 462, marker: CONFIRMATION_MARKER, gated: true, answered: false, since: '2026-07-30' })
    expect(p.reason).toContain('safe prepared state')
  })

  it('accepts a full ISO timestamp', () => {
    const p = parseGateLine(`- [ ] 7. X AWAITING-CONFIRMATION(2026-07-30T11:22:33.000Z; ${confirmation})`)
    expect(p).toMatchObject({ gated: true, since: '2026-07-30T11:22:33.000Z' })
  })

  it('classifies a qualifying legacy marker as confirmation before migration', () => {
    const p = parseGateLine(`- [ ] 7. X AWAITING-USER(2026-07-30; ${confirmation})`)
    expect(p).toMatchObject({ legacy: true, gated: true, classification: { verdict: 'confirmation' } })
  })

  it('keeps advisory, ambiguous and reasonless legacy markers workable', () => {
    for (const line of [
      '- [ ] 7. X AWAITING-USER(2026-07-30; choose a colour)',
      '- [ ] 8. X AWAITING-USER(2026-07-30)',
      '- [ ] 9. X AWAITING-USER',
    ]) {
      expect(parseGateLine(line)).toMatchObject({ legacy: true, gated: false, classification: { verdict: 'advisory' } })
    }
  })

  it('also keeps an invalid typed confirmation workable', () => {
    expect(parseGateLine('- [ ] 7. X AWAITING-CONFIRMATION(2026-07-30; choose a colour)')).toMatchObject({
      gated: false,
      classification: { verdict: 'advisory' },
    })
  })

  it('is not a point gate when there is no head or the marker is prose', () => {
    expect(parseGateLine('  prose AWAITING-CONFIRMATION(2026-01-01; x)')).toBeNull()
    expect(parseGateLine('')).toBeNull()
    expect(parseGateLine(undefined)).toBeNull()
    expect(parseGateLine('- [ ] 470. HARDEN THE AWAITING-CONFIRMATION PARSER.')).toMatchObject({ gated: false })
  })

  // A HEADLINE ENDING IN THE BARE WORD IS PROSE (cross-vendor review, GPT-5.6
  // Sol, 23.08.2026): it parsed as state, and the next rewrite deleted it.
  it('needs the brackets before a typed marker is state at all', () => {
    for (const line of [
      '- [ ] 9. RENAME THE MARKER TO SELF-DECIDED',
      '- [ ] 9. THE ANSWER ARRIVES AS USER-ANSWERED',
      '- [ ] 9. EVERY GATE BECOMES AWAITING-CONFIRMATION',
    ]) {
      const parsed = parseGateLine(line)
      expect(parsed).toMatchObject({ point: 9, gated: false, answered: false })
      expect(parsed.marker).toBeUndefined()
      expect(clearMarkers(line, 9).text).toBe(line)
    }
    // The legacy marker keeps them optional — untyped lines predate the rule.
    expect(parseGateLine('- [ ] 9. X AWAITING-USER')).toMatchObject({ legacy: true })
  })

  it('does not let an answer-marker mention inside the reason answer the gate', () => {
    const line = `- [ ] 5. X AWAITING-CONFIRMATION(2026-08-07; release-tag: push the version tag after checking USER-ANSWERED, safe prepared state: verified locally and no tag pushed)`
    expect(parseGateLine(line)).toMatchObject({ gated: true, answered: false })
  })

  it('preserves CRLF handling and requires the marker to end the line', () => {
    const line = `- [ ] 5. X AWAITING-CONFIRMATION(2026-08-07; ${confirmation})`
    expect(parseGateLine(`${line}\r`)).toMatchObject({ gated: true, since: '2026-08-07' })
    expect(gatedPoints(`${line}\r\n- [ ] 6. Y\r\n`).has(5)).toBe(true)
    expect(parseGateLine(`${line} and more prose`)).toMatchObject({ gated: false })
  })

  it('takes the last trailing marker as state', () => {
    expect(parseGateLine(`- [ ] 5. X AWAITING-CONFIRMATION(2026-07-30; ${confirmation}) USER-ANSWERED(2026-08-07)`)).toMatchObject({
      gated: false,
      answered: true,
      at: '2026-08-07',
    })
    expect(parseGateLine(`- [ ] 5. X USER-ANSWERED(2026-08-07) AWAITING-CONFIRMATION(2026-08-08; ${confirmation})`)).toMatchObject({
      gated: true,
      answered: false,
      since: '2026-08-08',
    })
  })

  it('reads SELF-DECIDED as workable state', () => {
    expect(parseGateLine('- [ ] 5. X SELF-DECIDED(2026-08-23; use the repository default)')).toMatchObject({
      gated: false,
      selfDecided: true,
      reason: 'use the repository default',
    })
  })

  it('never gates ticked or deferred points but reports their marker stale', () => {
    expect(parseGateLine(`- [x] 5. X AWAITING-CONFIRMATION(2026-07-30; ${confirmation})`)).toMatchObject({ gated: false, stale: true })
    expect(parseGateLine(`- [ ] 105. DEFERRED X AWAITING-CONFIRMATION(2026-07-30; ${confirmation})`)).toMatchObject({ gated: false, stale: true })
  })
})

describe('parseUserGates — every reader gets the typed workable set', () => {
  const text = tasks(
    '## Open',
    '- [ ] 10. NORMAL.',
    `- [ ] 11. TRUE CONFIRMATION. AWAITING-CONFIRMATION(2026-07-29; ${confirmation})`,
    '- [ ] 12. LEGACY ADVICE. AWAITING-USER(2026-07-22; choose a transport)',
    '- [ ] 13. ANSWERED. USER-ANSWERED(2026-08-07)',
    '- [ ] 14. DECIDED. SELF-DECIDED(2026-08-23; use rail)',
    '- [x] 15. DONE. AWAITING-USER(2026-06-01; old)',
    '- [ ] 16. REASONLESS. AWAITING-USER(2026-06-01)',
  )

  it('separates confirmations, answers, decisions, advisories and stale markers', () => {
    const g = parseUserGates(text)
    expect(g.gated.map((x) => x.point)).toEqual([11])
    expect(g.answered.map((x) => x.point)).toEqual([13])
    expect(g.selfDecided.map((x) => x.point)).toEqual([14])
    expect(g.advisory.map((x) => x.point)).toEqual([12, 16])
    expect(g.stale).toEqual([{ point: 15, kind: 'ticked' }])
    expect(g.reasonless).toEqual([16])
  })

  it('exposes only true confirmations through the shared gate sets', () => {
    const { gated, answered, reasons, since } = gateSets(text)
    expect([...gated]).toEqual([11])
    expect([...answered]).toEqual([13])
    expect(reasons.get(11)).toContain('version tag')
    expect(since.get(11)).toBe('2026-07-29')
    expect(gatedPoints(text).has(12)).toBe(false)
  })

  it('is total on rubbish input', () => {
    for (const bad of [null, undefined, '', 42, {}]) {
      expect(() => parseUserGates(bad)).not.toThrow()
      expect(parseUserGates(bad).gated).toEqual([])
    }
  })

  it('reports why confirmations wait and why legacy advice continues', () => {
    const report = gateReport(text).join('\n')
    expect(report).toContain('11 awaits confirmation since 2026-07-29')
    expect(report).toContain('12 continues — AWAITING-USER is advisory')
    expect(report).toContain('14 self-decided')
    expect(report).toContain('NO REASON RECORDED')
    expect(report).toContain('13 answered')
  })
})

describe('sanitiseReason — a reason survives on one work-order line', () => {
  it('strips brackets/newlines and reserves the semicolon separator', () => {
    expect(sanitiseReason('needs (a) ruling\non the\r\nboard; soon')).toBe('needs a ruling on the board, soon')
  })

  it('caps an essay and answers empty for nothing usable', () => {
    const long = sanitiseReason('x'.repeat(400))
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('…')).toBe(true)
    for (const bad of ['', '   ', null, undefined, '()']) expect(sanitiseReason(bad)).toBe('')
  })
})

describe('typed work-order rewrites', () => {
  const base = tasks('- [ ] 20. A POINT.', '  detail', '- [ ] 21. ANOTHER POINT.', '- [x] 22. A DONE POINT.')
  const tagAct = {
    act: 'release-tag',
    detail: 'push the version tag',
    prepared: 'the build is verified locally and no tag is pushed',
  }

  it('writes only a validated AWAITING-CONFIRMATION on the head line', () => {
    const r = markGated(base, 20, { since: '2026-08-07', ...tagAct })
    expect(r.ok).toBe(true)
    expect(r.text.split('\n')[0]).toBe(`- [ ] 20. A POINT. AWAITING-CONFIRMATION(2026-08-07; ${confirmationStored})`)
    expect(r.text.split('\n')[1]).toBe('  detail')
    expect(gatedPoints(r.text).has(20)).toBe(true)
  })

  it('refuses an unselected act and an unnamed field unchanged', () => {
    for (const fields of [
      { act: 'which colour should we use?', detail: 'pick one of them', prepared: 'nothing is out yet' },
      { act: '', detail: 'push the version tag', prepared: 'nothing is out yet' },
      { act: 'release-tag', detail: '', prepared: 'nothing is out yet' },
      { act: 'release-tag', detail: 'push the version tag', prepared: '' },
      {},
    ]) {
      const r = markGated(base, 20, { since: '2026-08-07', ...fields })
      expect(r.ok).toBe(false)
      expect(r.text).toBe(base)
    }
  })

  it('re-stamps an existing marker instead of doubling it', () => {
    const once = markGated(base, 20, { since: '2026-08-01', ...tagAct }).text
    const twice = markGated(once, 20, {
      since: '2026-08-07',
      act: 'release-tag',
      detail: 'push the poc tag',
      prepared: 'the build is verified locally and no tag is pushed',
    }).text
    expect(twice.match(/AWAITING-CONFIRMATION/g)).toHaveLength(1)
    expect(gateSets(twice).reasons.get(20)).toContain('poc tag')
  })

  it('refuses ticked/missing points and retains the source', () => {
    expect(markGated(base, 22, tagAct)).toMatchObject({ ok: false, text: base })
    expect(markGated(base, 999, tagAct)).toMatchObject({ ok: false, text: base })
    expect(markAnswered(base, 999)).toMatchObject({ ok: false })
    expect(clearMarkers(base, 999)).toMatchObject({ ok: false })
  })

  it('turns a confirmation into an answer at the queue head', () => {
    const gatedText = markGated(base, 21, { since: '2026-08-01', ...tagAct }).text
    const r = markAnswered(gatedText, 21, { at: '2026-08-07' })
    expect(r).toMatchObject({ ok: true, wasGated: true })
    expect(gatedPoints(r.text).has(21)).toBe(false)
    expect(answeredPoints(r.text).has(21)).toBe(true)
    expect(r.text).toContain(`${ANSWERED_MARKER}(2026-08-07)`)
    expect(r.text).not.toContain(CONFIRMATION_MARKER)
  })

  it('records SELF-DECIDED while leaving the point workable', () => {
    const r = markSelfDecided(base, 20, { at: '2026-08-23', decision: 'use the existing compact layout' })
    expect(r).toMatchObject({ ok: true })
    expect(r.text).toContain(`${SELF_DECIDED_MARKER}(2026-08-23; use the existing compact layout)`)
    expect(gatedPoints(r.text).has(20)).toBe(false)
    expect(parseUserGates(r.text).selfDecided).toEqual([{ point: 20, at: '2026-08-23', decision: 'use the existing compact layout' }])
  })

  it('keeps CRLF and rejects a junk stamp without corrupting the marker', () => {
    const crlf = ['- [ ] 20. A POINT.', '  detail', ''].join('\r\n')
    const r = markGated(crlf, 20, { since: 'later)', ...tagAct })
    expect(r.text.split('\n')[0]).toBe(`- [ ] 20. A POINT. AWAITING-CONFIRMATION(${confirmationStored})\r`)
    expect(gatedPoints(r.text.replace(/\r\n/g, '\n')).has(20)).toBe(true)
  })

  it('forgets a stale marker on a ticked point', () => {
    const ticked = '- [x] 9. DONE. AWAITING-USER(2026-06-01; old)'
    expect(clearMarkers(ticked, 9)).toMatchObject({ ok: true, text: '- [x] 9. DONE.' })
    expect(gateReport(ticked).join('\n')).toContain('--forget 9')
  })
})

describe('advisory decision record and legacy migration', () => {
  it('requires and labels decision, evidence, consequence and exact veto action', () => {
    expect(advisoryDecisionCard(20, { decision: 'use blue' })).toMatchObject({ ok: false })
    const card = advisoryDecisionCard(20, {
      decision: 'use blue',
      evidence: 'the existing tokens use blue',
      consequence: 'the point continues',
      vetoAction: 'reply Veto blue and revert commit abc',
    })
    expect(card.ok).toBe(true)
    expect(card.title).toBe('Entscheidungsprotokoll: Punkt 20 läuft weiter')
    expect(card.body).toContain('Entscheidung: use blue')
    expect(card.body).toContain('Evidenz: the existing tokens use blue')
    expect(card.body).toContain('Folge: the point continues')
    expect(card.body).toContain('Exakte Veto-Aktion: reply Veto blue and revert commit abc')
  })

  it('prepares both marker and card only for an advisory question', () => {
    const source = '- [ ] 20. PICK A COLOUR.'
    const fields = {
      at: '2026-08-23',
      question: 'which colour should the compact card use?',
      decision: 'use blue',
      evidence: 'the existing token is blue',
      consequence: 'the card stays consistent',
      vetoAction: 'reply Veto blue and restore the green token',
    }
    const prepared = prepareAdvisoryDecision(source, 20, fields)
    expect(prepared).toMatchObject({ ok: true, question: fields.question })
    expect(prepared.text).toContain('SELF-DECIDED(2026-08-23; use blue)')
    expect(prepared.card.body).toContain('Exakte Veto-Aktion')

    const trueConfirmation = prepareAdvisoryDecision(source, 20, { ...fields, question: confirmation })
    expect(trueConfirmation).toMatchObject({ ok: false, text: source, card: null })
    expect(trueConfirmation.error).toMatch(/true confirmation act/)
  })

  it('reports and rewrites every legacy marker, with ambiguity continuing', () => {
    const source = tasks(
      `- [ ] 1. RELEASE. AWAITING-USER(2026-08-01; ${legacyProse})`,
      '- [ ] 2. COLOUR. AWAITING-USER(2026-08-02; choose blue or green)',
      '- [ ] 3. UNKNOWN. AWAITING-USER',
      '- [x] 4. DONE. AWAITING-USER(2026-08-03; old question)',
    )
    const migrated = migrateLegacyGates(source, { at: '2026-08-23' })
    expect(migrated.entries).toEqual([
      { point: 1, verdict: 'confirmation', reason: legacyProse.replace(';', ',') },
      { point: 2, verdict: 'self-decided', reason: 'choose blue or green' },
      { point: 3, verdict: 'self-decided', reason: '' },
      { point: 4, verdict: 'stale-removed', reason: 'old question' },
    ])
    // The migrated gate is written in the TYPED form, or the strict reader —
    // the only one the queue uses — would drop the very gate migration keeps.
    expect(migrated.text).toContain(`AWAITING-CONFIRMATION(2026-08-01; ${confirmationStored})`)
    expect([...gatedPoints(migrated.text)]).toEqual([1])
    expect(migrated.text).toContain('SELF-DECIDED(2026-08-23; choose blue or green)')
    expect(migrated.text).toContain('SELF-DECIDED(2026-08-23; legacy marker had no recorded reason)')
    expect(migrated.text).not.toContain('AWAITING-USER')
    expect(migrated.cards).toHaveLength(2)
    expect([...gatedPoints(migrated.text)]).toEqual([1])
  })

  // EVERY MARKER, NOT ONLY THE STATE (cross-vendor review, GPT-5.6 Sol,
  // 23.08.2026): a legacy gate hidden behind a later answer was silently left
  // in place, and two in a row collapsed into one verdict.
  it('reports a legacy marker standing before a later answer, and each of several', () => {
    const source = tasks(
      '- [ ] 1. A AWAITING-USER(2026-08-01; choose a colour) USER-ANSWERED(2026-08-07)',
      '- [ ] 2. B AWAITING-USER(2026-08-01; first) AWAITING-USER(2026-08-02; second)',
      '- [x] 3. C AWAITING-USER(2026-08-01; one) AWAITING-USER(2026-08-02; two)',
    )
    const migrated = migrateLegacyGates(source, { at: '2026-08-23' })
    expect(migrated.entries).toEqual([
      { point: 1, verdict: 'self-decided', reason: 'choose a colour' },
      { point: 2, verdict: 'self-decided', reason: 'first' },
      { point: 2, verdict: 'self-decided', reason: 'second' },
      { point: 3, verdict: 'stale-removed', reason: 'one' },
      { point: 3, verdict: 'stale-removed', reason: 'two' },
    ])
    expect(migrated.text).not.toContain('AWAITING-USER')
    // The answer is still the LAST marker, so point 1 stays at the queue head.
    expect(migrated.text.split('\n')[0]).toBe('- [ ] 1. A SELF-DECIDED(2026-08-23; choose a colour) USER-ANSWERED(2026-08-07)')
    expect(answeredPoints(migrated.text).has(1)).toBe(true)
    expect(migrated.text.split('\n')[2]).toBe('- [x] 3. C')
  })
})
