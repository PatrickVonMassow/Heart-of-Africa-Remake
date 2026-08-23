// The typed user gate: parser, classifier and pure work-order rewrites. Every
// case uses text fixtures — never live TASKS.md, which is main-only.
import { describe, expect, it } from 'vitest'
import {
  ANSWERED_MARKER,
  CONFIRMATION_MARKER,
  SELF_DECIDED_MARKER,
  advisoryDecisionCard,
  answeredPoints,
  clearMarkers,
  classifyConfirmationReason,
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
const confirmation = 'push the version tag; safe prepared state: artifacts verified locally and no tag pushed'
const confirmationStored = confirmation.replace(';', ',')

describe('classifyConfirmationReason — the closed outward-act rule', () => {
  it.each([
    'push the version tag; safe prepared state: artifacts verified locally and no tag pushed',
    'dispatch the public release; prepared locally without deploying it',
    'change the published four-section contract; safe prepared state: replacement built and not published',
  ])('accepts a named act plus its safe prepared state: %s', (reason) => {
    expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'confirmation' })
  })

  it.each([
    'which card colour should we use?',
    'please confirm the release design',
    'push the version tag',
    'outward-facing action; everything is ready',
  ])('classifies advice or an incomplete reason toward continuation: %s', (reason) => {
    expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'advisory' })
  })

  // THE THREE WAYS THE FIRST CLASSIFIER GOT IT WRONG (cross-vendor review,
  // GPT-5.6 Sol, 23.08.2026). Each of these ran through the shipped command.
  it('does not let an unpublished four-section draft park its point', () => {
    expect(
      classifyConfirmationReason('Should the four-section internal draft change font? prepared locally without publishing it'),
    ).toMatchObject({ verdict: 'advisory', act: '' })
  })

  it('treats UNDOING a released artefact as outward-facing too', () => {
    for (const reason of [
      'Delete the v1.2.0 release tag; safe prepared state: nothing removed yet and the tag still stands',
      'Retract the poc tag; safe prepared state: the replacement is built and the tag still stands',
    ]) {
      expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'confirmation', act: 'release-tag' })
    }
  })

  it('refuses the bare phrase "safe prepared state" as a prepared state', () => {
    expect(classifyConfirmationReason('push the release tag; safe prepared state:')).toMatchObject({
      verdict: 'advisory',
      act: 'release-tag',
    })
    expect(classifyConfirmationReason('push the release tag; safe prepared state: built and not pushed')).toMatchObject({
      verdict: 'confirmation',
    })
  })

  // THE SECOND CROSS-VENDOR ROUND (GPT-5.6 Sol, 23.08.2026) found the same two
  // shapes one level deeper: an act word that is really a NOUN, and a second
  // spelling of "prepared" that names nothing either.
  it('does not read a NOUN built from an act verb as an act', () => {
    expect(
      classifyConfirmationReason('Choose copy for the withdrawal dialog in production; safe prepared state: mockups remain entirely local'),
    ).toMatchObject({ verdict: 'advisory', act: '' })
    // …while the verb itself, in any of its forms, still is one.
    for (const reason of [
      'Withdraw the public release; safe prepared state: it is still served and the rollback is staged',
      'The public release was withdrawn by hand; safe prepared state: nothing is served yet and the rollback is staged',
    ]) {
      expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'confirmation', act: 'public-release' })
    }
  })

  it('refuses "prepared locally" with nothing prepared named', () => {
    expect(classifyConfirmationReason('push the release tag; prepared locally')).toMatchObject({
      verdict: 'advisory',
      act: 'release-tag',
    })
    expect(classifyConfirmationReason('push the release tag; prepared locally without pushing it')).toMatchObject({
      verdict: 'confirmation',
    })
  })

  it('covers taking a public release DOWN as well as putting it up', () => {
    expect(
      classifyConfirmationReason('Delete the public release; safe prepared state: the release is still online and the rollback is ready'),
    ).toMatchObject({ verdict: 'confirmation', act: 'public-release' })
  })

  // THE THIRD CROSS-VENDOR ROUND (GPT-5.6 Sol, 23.08.2026). Two rounds of
  // counterexamples were all one shape — an advisory QUESTION whose words named
  // an authorized act — so the classifier now refuses a question outright, the
  // release lane needs the thing released, and the prepared clause is read
  // whole rather than only after the word.
  it('never reads a question as an act, however it is worded', () => {
    for (const reason of [
      'Choose typography for the published notice in production; safe prepared state: mockups remain entirely local',
      'Which release page should the tag point at? safe prepared state: nothing is pushed and the build is local',
      'Should we push the version tag now; safe prepared state: verified locally and no tag pushed',
    ]) {
      expect(classifyConfirmationReason(reason)).toMatchObject({ verdict: 'advisory', act: '' })
    }
  })

  it('needs the thing released, not a released-sounding word near production', () => {
    expect(
      classifyConfirmationReason('Print the published notice in production colours; safe prepared state: mockups remain entirely local'),
    ).toMatchObject({ verdict: 'advisory', act: '' })
    expect(
      classifyConfirmationReason('Remove the deployed site from production; safe prepared state: it is still served and the takedown is staged'),
    ).toMatchObject({ verdict: 'confirmation', act: 'public-release' })
  })

  it('reads the prepared clause whole, so the state may be named before the word', () => {
    expect(classifyConfirmationReason('push the version tag; the signed artifacts are prepared locally')).toMatchObject({
      verdict: 'confirmation',
      act: 'release-tag',
    })
    // …and incidental prose that merely contains the old catch-all words is not a record.
    expect(
      classifyConfirmationReason('Delete the public release; the locally built confirmation copy says do not publish'),
    ).toMatchObject({ verdict: 'advisory', act: 'public-release' })
  })

  it('accepts the ordinary synonyms for pushing a tag', () => {
    expect(
      classifyConfirmationReason('Send the version tag upstream; safe prepared state: artifacts verified locally and no tag exists remotely'),
    ).toMatchObject({ verdict: 'confirmation', act: 'release-tag' })
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
    const line = `- [ ] 5. X AWAITING-CONFIRMATION(2026-08-07; push the version tag after checking USER-ANSWERED; safe prepared state: verified locally and no tag pushed)`
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

  it('writes only a validated AWAITING-CONFIRMATION on the head line', () => {
    const r = markGated(base, 20, { since: '2026-08-07', reason: confirmation })
    expect(r.ok).toBe(true)
    expect(r.text.split('\n')[0]).toBe(`- [ ] 20. A POINT. AWAITING-CONFIRMATION(2026-08-07; ${confirmationStored})`)
    expect(r.text.split('\n')[1]).toBe('  detail')
    expect(gatedPoints(r.text).has(20)).toBe(true)
  })

  it('refuses an advisory reason and an incomplete confirmation reason unchanged', () => {
    for (const reason of ['which colour should we use?', 'push the version tag', '   ']) {
      const r = markGated(base, 20, { since: '2026-08-07', reason })
      expect(r.ok).toBe(false)
      expect(r.text).toBe(base)
    }
  })

  it('re-stamps an existing marker instead of doubling it', () => {
    const once = markGated(base, 20, { since: '2026-08-01', reason: confirmation }).text
    const corrected = 'push the poc tag; safe prepared state: build verified locally and no tag pushed'
    const twice = markGated(once, 20, { since: '2026-08-07', reason: corrected }).text
    expect(twice.match(/AWAITING-CONFIRMATION/g)).toHaveLength(1)
    expect(gateSets(twice).reasons.get(20)).toContain('poc tag')
  })

  it('refuses ticked/missing points and retains the source', () => {
    expect(markGated(base, 22, { reason: confirmation })).toMatchObject({ ok: false, text: base })
    expect(markGated(base, 999, { reason: confirmation })).toMatchObject({ ok: false, text: base })
    expect(markAnswered(base, 999)).toMatchObject({ ok: false })
    expect(clearMarkers(base, 999)).toMatchObject({ ok: false })
  })

  it('turns a confirmation into an answer at the queue head', () => {
    const gatedText = markGated(base, 21, { since: '2026-08-01', reason: confirmation }).text
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
    const r = markGated(crlf, 20, { since: 'later)', reason: confirmation })
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
      `- [ ] 1. RELEASE. AWAITING-USER(2026-08-01; ${confirmation})`,
      '- [ ] 2. COLOUR. AWAITING-USER(2026-08-02; choose blue or green)',
      '- [ ] 3. UNKNOWN. AWAITING-USER',
      '- [x] 4. DONE. AWAITING-USER(2026-08-03; old question)',
    )
    const migrated = migrateLegacyGates(source, { at: '2026-08-23' })
    expect(migrated.entries).toEqual([
      { point: 1, verdict: 'confirmation', reason: confirmationStored },
      { point: 2, verdict: 'self-decided', reason: 'choose blue or green' },
      { point: 3, verdict: 'self-decided', reason: '' },
      { point: 4, verdict: 'stale-removed', reason: 'old question' },
    ])
    expect(migrated.text).toContain(`AWAITING-CONFIRMATION(2026-08-01; ${confirmationStored})`)
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
