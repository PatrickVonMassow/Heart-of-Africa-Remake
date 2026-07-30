import { describe, expect, it } from 'vitest'
import { auditFindings, malformedEntries, markDrained, parseCarrier, parseHead, tallyTurn, turnTakesBoundary } from './findings-core.mjs'
import {
  formatRequest,
  markBlocked,
  markQueued,
  parseFields,
  pendingRequests,
  requestEntries,
  requestEntry,
  requestRoute,
  requestWarnings,
} from './findings-request-core.mjs'

const SPEC = [
  'A WINDOW THAT IS NOT THE MASTER MUST BE ABLE TO ENQUEUE (user 30.07.2026).',
  '',
  'FINAL STATE: the carrier gains a request kind.',
  '  - [ ] a line that itself looks like an entry head',
].join('\n')

const deposit = (over = {}) =>
  requestEntry({
    at: '2026-07-30T20:11:00.000Z',
    session: 'ab12cd34',
    title: 'Anfragen aus einem Nebenfenster einreihen',
    why: 'Eine Stunde lang konnte nichts eingereiht werden.',
    spec: SPEC,
    constraints: 'Kein zweiter Träger.',
    userQuotes: 'user 30.07.2026: „Gibt es eine sichere Lösung?“',
    docImpact: 'docs/batch-autonomy.md beschreibt den neuen Zweig.',
    bundle: 'Session- & Repo-Hygiene',
    refs: 'scripts/finding.mjs; docs/batch-autonomy.md',
    revision: 'c2950bc0',
    ...over,
  })

describe('a request round-trips through the carrier', () => {
  const text = `# Träger\n\n${deposit()}\n\n`

  it('writes a head the shared parser reads as a pending request', () => {
    const head = parseHead(text.split('\n').find((l) => l.startsWith('- [')))
    expect(head.kind).toBe('request')
    expect(head.state).toBe('pending')
    expect(head.title).toBe('Anfragen aus einem Nebenfenster einreihen')
  })

  it('keeps the spec VERBATIM — blank lines, indentation and all', () => {
    expect(requestEntries(text)[0].fields.spec).toBe(SPEC)
  })

  it('does not let a spec line that looks like an entry head end the body', () => {
    const entry = requestEntries(text)[0]
    expect(entry.fields.spec).toContain('- [ ] a line that itself looks like an entry head')
    expect(entry.fields.bundle).toBe('Session- & Repo-Hygiene')
  })

  it('carries every field it was given', () => {
    const f = requestEntries(text)[0].fields
    expect(f.why).toMatch(/Eine Stunde/)
    expect(f.userQuotes).toMatch(/30\.07\.2026/)
    expect(f.docImpact).toMatch(/batch-autonomy/)
    expect(f.refs).toMatch(/finding\.mjs/)
    expect(f.revision).toBe('c2950bc0')
  })

  it('separates requests from findings in the pending counts', () => {
    const withFinding = `${text}- [ ] 2026-07-29T18:50:00.000Z · 10a2d2e0 · Ein Befund\n      Detail.\n`
    const parsed = parseCarrier(withFinding)
    expect(parsed.pending.map((p) => p.title)).toEqual(['Ein Befund'])
    expect(parsed.requests.map((r) => r.title)).toEqual(['Anfragen aus einem Nebenfenster einreihen'])
  })

  it('never lets --drained retire a request — that is the queued/blocked path', () => {
    expect(markDrained(text, 'Nebenfenster')).toBeNull()
  })

  it('two requests in one file stay separate entries', () => {
    const two = `${deposit()}\n\n${deposit({ title: 'Zweite Anfrage' })}\n`
    expect(requestEntries(two).map((r) => r.title)).toEqual([
      'Anfragen aus einem Nebenfenster einreihen',
      'Zweite Anfrage',
    ])
  })
})

describe('the states and the escape hatch', () => {
  const text = `${deposit()}\n`

  it('queues a request against its point number', () => {
    const hit = markQueued(text, 'Nebenfenster', 481)
    expect(hit.title).toBe('Anfragen aus einem Nebenfenster einreihen')
    expect(requestEntries(hit.text)[0].state).toBe('queued 481')
    expect(parseCarrier(hit.text).requests).toEqual([])
    expect(parseCarrier(hit.text).drained).toBe(1)
  })

  it('refuses a queue without a real point number rather than writing nonsense', () => {
    expect(() => markQueued(text, 'Nebenfenster', 'bald')).toThrow(/point number/)
  })

  it('blocks a request WITH its reason kept beside the entry', () => {
    const hit = markBlocked(text, 'Nebenfenster', 'Widerspricht der Sperre auf main.')
    const entry = requestEntries(hit.text)[0]
    expect(entry.state).toBe('blocked')
    expect(entry.fields.blockedWhy).toBe('Widerspricht der Sperre auf main.')
    expect(entry.fields.spec).toBe(SPEC)
    expect(parseCarrier(hit.text).requests).toEqual([])
  })

  it('refuses a reasonless block — the user would get a card that says nothing', () => {
    expect(() => markBlocked(text, 'Nebenfenster', '   ')).toThrow(/reason/)
  })

  it('reports an ambiguous title instead of transitioning the wrong deposit', () => {
    const two = `${deposit()}\n\n${deposit({ title: 'Anfragen aus einem Nebenfenster — Teil 2' })}\n`
    const verdict = markQueued(two, 'Nebenfenster', 481)
    expect(verdict.ambiguous).toHaveLength(2)
    expect(verdict.text).toBeUndefined()
    expect(pendingRequests(two)).toHaveLength(2)
  })

  it('returns null when nothing matches, so the caller can say so', () => {
    expect(markQueued(text, 'gibt es nicht', 481)).toBeNull()
    expect(markQueued(text, '', 481)).toBeNull()
  })

  it('does not transition an already queued request a second time', () => {
    const once = markQueued(text, 'Nebenfenster', 481)
    expect(markQueued(once.text, 'Nebenfenster', 482)).toBeNull()
  })
})

describe('the route', () => {
  it('sends a request with open questions to a decision card, never to the work order', () => {
    const text = deposit({ openQuestions: 'Soll die Sperre auch für Doku gelten?' })
    expect(requestRoute(requestEntries(text)[0])).toBe('vdzk')
  })

  it('sends a decided request into the work order', () => {
    expect(requestRoute(requestEntries(deposit())[0])).toBe('tasks')
  })

  it('treats a whitespace-only open question as no question', () => {
    expect(requestRoute({ fields: { openQuestions: '   \n ' } })).toBe('tasks')
    expect(requestRoute(undefined)).toBe('tasks')
  })
})

describe('a malformed request warns and never blocks', () => {
  it('names the missing spec instead of dropping the entry', () => {
    const text = requestEntry({ at: '2026-07-30T20:00:00.000Z', session: 's', title: 'Halb geschrieben' })
    const entry = requestEntries(text)[0]
    expect(entry.title).toBe('Halb geschrieben')
    expect(requestWarnings(entry).join(' ')).toMatch(/spec/)
    expect(pendingRequests(text)).toHaveLength(1)
  })

  it('reports body text that stands before the first field marker', () => {
    const text = `- [ ] 2026-07-30T20:00:00.000Z · s · [request] · pending · Von Hand\n      lose Zeile\n      #spec\n      etwas\n      #why\n      darum\n`
    const entry = requestEntries(text)[0]
    expect(entry.fields.loose).toBe('lose Zeile')
    expect(requestWarnings(entry).join(' ')).toMatch(/before the first #field/)
  })

  it('reports a head that lost its state field rather than counting it as a finding', () => {
    const broken = '- [ ] 2026-07-30T20:00:00.000Z · s · [request] · Ohne Zustand\n'
    expect(parseHead(broken.trim())).toBeNull()
    expect(malformedEntries(broken)).toEqual(['- [ ] 2026-07-30T20:00:00.000Z · s · [request] · Ohne Zustand'])
    expect(parseCarrier(broken).pending).toEqual([])
    expect(parseCarrier(broken).requests).toEqual([])
  })

  it('leaves an unknown #tag inside the section it stands in — a spec may carry headings', () => {
    expect(parseFields(['#spec', '#ziel', 'eine Zeile']).spec).toBe('#ziel\neine Zeile')
  })

  it('warns about a deposit without the user’s own words', () => {
    const entry = requestEntries(deposit({ userQuotes: '' }))[0]
    expect(requestWarnings(entry).join(' ')).toMatch(/user quotes/)
  })

  it('formats a request for the owner without throwing on a half-written one', () => {
    expect(formatRequest(requestEntries(deposit())[0])).toContain('append VERBATIM')
    expect(formatRequest(null)).toBe('')
  })
})

describe('the gate is the point boundary, not every turn end', () => {
  const boundary = (command) => turnTakesBoundary([{ name: 'Bash', command }])

  it('recognises the turn that TAKES the boundary', () => {
    expect(boundary('node scripts/batch-boundary.mjs 462')).toBe(true)
  })

  it('does not read the read-only forms as taking it', () => {
    expect(boundary('node scripts/batch-boundary.mjs --status')).toBe(false)
    expect(boundary('node scripts/batch-boundary.mjs --clear')).toBe(false)
    expect(boundary('node scripts/batch-boundary.mjs')).toBe(false)
    expect(boundary('node scripts/guard-preflight.mjs --for boundary --session x')).toBe(false)
  })

  it('never blocks an owner mid-branch — it cannot write the work order at all', () => {
    expect(auditFindings({ tally: tallyTurn([]), ownsBatch: true, carrierRequests: 3 }).ok).toBe(true)
  })

  it('blocks the owner that takes the boundary with requests still waiting', () => {
    const v = auditFindings({ tally: tallyTurn([]), ownsBatch: true, carrierRequests: 1, atBoundary: true })
    expect(v.violations.map((x) => x.kind)).toEqual(['request-not-queued'])
    expect(v.violations[0].detail).toMatch(/--queued/)
  })

  it('never judges a session that does not own the batch', () => {
    expect(auditFindings({ tally: tallyTurn([]), carrierRequests: 5, atBoundary: true }).ok).toBe(true)
  })

  it('passes the boundary once every request is queued or blocked', () => {
    expect(auditFindings({ tally: tallyTurn([]), ownsBatch: true, carrierRequests: 0, atBoundary: true }).ok).toBe(true)
  })

  it('keeps the findings rule independent of the request rule', () => {
    const v = auditFindings({
      tally: tallyTurn([]),
      ownsBatch: true,
      carrierPending: 1,
      carrierRequests: 1,
      atBoundary: true,
    })
    expect(v.violations.map((x) => x.kind).sort()).toEqual(['carrier-not-drained', 'request-not-queued'])
  })
})
