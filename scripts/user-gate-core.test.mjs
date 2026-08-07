// The user gate (point 450): marker syntax, parser and the pure work-order
// rewrites. Everything runs against TEXT FIXTURES — never against the live
// TASKS.md, which is main-only and changes several times a day.
import { describe, it, expect } from 'vitest'
import {
  ANSWERED_MARKER,
  GATE_MARKER,
  answeredPoints,
  clearMarkers,
  gateReport,
  gateSets,
  gatedPoints,
  markAnswered,
  markGated,
  parseGateLine,
  parseUserGates,
  sanitiseReason,
} from './user-gate-core.mjs'

const tasks = (...lines) => lines.join('\n')

describe('parseGateLine — one work-order line', () => {
  it('reads the date and the reason out of a gate', () => {
    const p = parseGateLine('- [ ] 462. SOME POINT. AWAITING-USER(2026-07-30; needs the user’s ruling on the chat channel)')
    expect(p).toMatchObject({ point: 462, gated: true, answered: false, since: '2026-07-30' })
    expect(p.reason).toContain('ruling on the chat channel')
    expect(p.reasonMissing).toBe(false)
  })

  it('accepts a full ISO timestamp as the since stamp', () => {
    const p = parseGateLine('- [ ] 7. X AWAITING-USER(2026-07-30T11:22:33.000Z; why)')
    expect(p.since).toBe('2026-07-30T11:22:33.000Z')
    expect(p.reason).toBe('why')
  })

  it('is not a gate line at all when there is no head', () => {
    expect(parseGateLine('  some prose AWAITING-USER(2026-01-01; x)')).toBeNull()
    expect(parseGateLine('')).toBeNull()
    expect(parseGateLine(undefined)).toBeNull()
  })

  it('reads an ungated open point as neither gated nor answered', () => {
    expect(parseGateLine('- [ ] 12. A NORMAL POINT.')).toMatchObject({ point: 12, gated: false, answered: false, stale: false })
  })

  it('treats a legacy marker with only a date as a gate with no reason recorded', () => {
    const p = parseGateLine('- [ ] 203. Finder AWAITING-USER(2026-07-22)')
    expect(p.gated).toBe(true)
    expect(p.reason).toBe('')
    expect(p.reasonMissing).toBe(true)
  })

  it('treats a bare marker with no brackets as a gate too — skipping is the safe direction', () => {
    const p = parseGateLine('- [ ] 204. Finder AWAITING-USER')
    expect(p).toMatchObject({ gated: true, since: '', reasonMissing: true })
  })

  it('takes a bracket payload that is only prose as the reason', () => {
    expect(parseGateLine('- [ ] 9. X AWAITING-USER(waiting for the colour decision)')).toMatchObject({
      gated: true,
      since: '',
      reason: 'waiting for the colour decision',
      reasonMissing: false,
    })
  })

  it('lets ANSWERED win when both markers stand on one line', () => {
    const p = parseGateLine('- [ ] 5. X AWAITING-USER(2026-07-30; why) USER-ANSWERED(2026-08-07)')
    expect(p).toMatchObject({ gated: false, answered: true, at: '2026-08-07' })
  })

  it('never gates a ticked point, but reports the leftover as stale', () => {
    const p = parseGateLine('- [x] 5. X AWAITING-USER(2026-07-30; why)')
    expect(p).toMatchObject({ gated: false, answered: false, stale: true, open: false })
  })

  it('ignores a DEFERRED line wholesale', () => {
    const p = parseGateLine('- [ ] 105. DEFERRED thing AWAITING-USER(2026-07-30; why)')
    expect(p).toMatchObject({ gated: false, answered: false, stale: true, open: true })
  })
})

describe('parseUserGates — the whole work order', () => {
  const text = tasks(
    '## Open',
    '- [ ] 10. FIRST POINT.',
    '  body line mentioning AWAITING-USER(2026-01-01; not a gate, it is prose)',
    '- [ ] 11. SECOND POINT. AWAITING-USER(2026-07-29; needs the user to choose a transport)',
    '- [ ] 12. THIRD POINT. AWAITING-USER(2026-07-22)',
    '- [ ] 13. FOURTH POINT. USER-ANSWERED(2026-08-07)',
    '- [x] 14. FIFTH POINT. AWAITING-USER(2026-06-01; long answered)',
    '- [ ] 15. DEFERRED SIXTH POINT. AWAITING-USER(2026-06-01; moot)',
  )

  it('collects gates, answers and stale leftovers, and ignores prose mentions', () => {
    const g = parseUserGates(text)
    expect(g.gated.map((x) => x.point)).toEqual([11, 12])
    expect(g.answered.map((x) => x.point)).toEqual([13])
    expect(g.stale.map((x) => x.point).sort((a, b) => a - b)).toEqual([14, 15])
    expect(g.reasonless).toEqual([12])
  })

  it('exposes the sets and the recorded reasons', () => {
    const { gated, answered, reasons, since } = gateSets(text)
    expect([...gated].sort((a, b) => a - b)).toEqual([11, 12])
    expect([...answered]).toEqual([13])
    expect(reasons.get(11)).toContain('choose a transport')
    expect(since.get(11)).toBe('2026-07-29')
    expect(gatedPoints(text).has(11)).toBe(true)
    expect(answeredPoints(text).has(13)).toBe(true)
  })

  it('handles several gated points at once without losing any', () => {
    const many = tasks(
      '- [ ] 1. A AWAITING-USER(2026-01-01; a)',
      '- [ ] 2. B AWAITING-USER(2026-01-02; b)',
      '- [ ] 3. C AWAITING-USER(2026-01-03; c)',
    )
    expect([...gatedPoints(many)]).toEqual([1, 2, 3])
  })

  it('is total on rubbish input', () => {
    for (const bad of [null, undefined, '', 42, {}]) {
      expect(() => parseUserGates(bad)).not.toThrow()
      expect(parseUserGates(bad).gated).toEqual([])
    }
  })

  it('reports every gate with its reason, and names a reasonless one', () => {
    const report = gateReport(text).join('\n')
    expect(report).toContain('11 waits on the user since 2026-07-29')
    expect(report).toContain('choose a transport')
    expect(report).toContain('NO REASON RECORDED')
    expect(report).toContain('13 answered')
    expect(report).toMatch(/14 carries a leftover marker on a ticked point/)
  })
})

describe('sanitiseReason — a reason must survive on one work-order line', () => {
  it('strips brackets and newlines that would end the marker or the line', () => {
    expect(sanitiseReason('needs (a) ruling\non the\r\nboard')).toBe('needs a ruling on the board')
  })

  it('turns a semicolon into a comma so the separator stays unambiguous', () => {
    expect(sanitiseReason('a; b')).toBe('a, b')
  })

  it('caps an essay', () => {
    const long = sanitiseReason('x'.repeat(400))
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('…')).toBe(true)
  })

  it('answers empty for nothing usable', () => {
    for (const bad of ['', '   ', null, undefined, '()']) expect(sanitiseReason(bad)).toBe('')
  })
})

describe('markGated / markAnswered / clearMarkers — the pure rewrites', () => {
  const base = tasks('- [ ] 20. A POINT.', '  detail', '- [ ] 21. ANOTHER POINT.', '- [x] 22. A DONE POINT.')

  it('writes the marker with the stamp and the reason on the head line only', () => {
    const r = markGated(base, 20, { since: '2026-08-07', reason: 'needs the user to pick a colour' })
    expect(r.ok).toBe(true)
    expect(r.text.split('\n')[0]).toBe('- [ ] 20. A POINT. AWAITING-USER(2026-08-07; needs the user to pick a colour)')
    expect(r.text.split('\n')[1]).toBe('  detail')
    expect(gatedPoints(r.text).has(20)).toBe(true)
  })

  it('REFUSES a gate with no reason — the record is what the skip is bought with', () => {
    const r = markGated(base, 20, { since: '2026-08-07', reason: '   ' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/needs a reason/)
    expect(r.text).toBe(base)
  })

  it('re-stamps an already gated point instead of doubling the marker', () => {
    const once = markGated(base, 20, { since: '2026-08-01', reason: 'first' }).text
    const twice = markGated(once, 20, { since: '2026-08-07', reason: 'corrected' }).text
    expect(twice.match(/AWAITING-USER/g)).toHaveLength(1)
    expect(gateSets(twice).reasons.get(20)).toBe('corrected')
  })

  it('refuses to gate a ticked point and leaves the text untouched', () => {
    const r = markGated(base, 22, { since: '2026-08-07', reason: 'too late' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/already ticked/)
    expect(r.text).toBe(base)
  })

  it('reports a point that has no line at all', () => {
    expect(markGated(base, 999, { reason: 'x' })).toMatchObject({ ok: false })
    expect(markAnswered(base, 999)).toMatchObject({ ok: false })
    expect(clearMarkers(base, 999)).toMatchObject({ ok: false })
  })

  it('turns the gate into an answer, which is what returns it to the queue head', () => {
    const gatedText = markGated(base, 21, { since: '2026-08-01', reason: 'needs a decision' }).text
    const r = markAnswered(gatedText, 21, { at: '2026-08-07' })
    expect(r.ok).toBe(true)
    expect(r.wasGated).toBe(true)
    expect(gatedPoints(r.text).has(21)).toBe(false)
    expect(answeredPoints(r.text).has(21)).toBe(true)
    expect(r.text).toContain(`${ANSWERED_MARKER}(2026-08-07)`)
    expect(r.text).not.toContain(GATE_MARKER)
  })

  it('answers a point that was never gated without pretending it was', () => {
    const r = markAnswered(base, 21, { at: '2026-08-07' })
    expect(r).toMatchObject({ ok: true, wasGated: false })
  })

  it('clears both markers again when the answered point is picked up', () => {
    const answeredText = markAnswered(markGated(base, 20, { reason: 'x' }).text, 20, { at: '2026-08-07' }).text
    const r = clearMarkers(answeredText, 20)
    expect(r.ok).toBe(true)
    expect(r.text.split('\n')[0]).toBe('- [ ] 20. A POINT.')
    expect(parseUserGates(r.text)).toMatchObject({ gated: [], answered: [] })
  })
})
