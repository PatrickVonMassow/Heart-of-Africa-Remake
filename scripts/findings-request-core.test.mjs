import { describe, expect, it } from 'vitest'
import {
  auditFindings,
  classifyCall,
  malformedEntries,
  markDrained,
  parseCarrier,
  parseHead,
  tallyTurn,
  turnTakesBoundary,
} from './findings-core.mjs'
import {
  escapeBodyLine,
  formatRequest,
  markBlocked,
  markQueued,
  parseFields,
  pendingRequests,
  reapplyTransition,
  requestEntries,
  requestEntry,
  requestRoute,
  requestWarnings,
  unescapeBodyLine,
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

// Four-eyes finding 1 (Fable 5, 31.07.2026): the transition is decided on the
// text that was read and WRITTEN onto the text that is there now. The live
// interleave — a second process depositing inside the gap — is in
// finding-request-cli.test.mjs; what is swept here is the re-apply itself.
describe('the write-back re-applies onto whatever the carrier says NOW', () => {
  const text = `${deposit()}\n`

  it('carries a deposit that arrived in the gap through the transition', () => {
    const hit = markQueued(text, 'Nebenfenster', 481)
    const fresh = `${text}\n${deposit({ at: '2026-07-31T06:00:00.000Z', title: 'Zweite Anfrage' })}\n`
    const landed = reapplyTransition(fresh, hit.identity, hit.state)
    expect(requestEntries(landed.text)[0].state).toBe('queued 481')
    expect(pendingRequests(landed.text).map((r) => r.title)).toEqual(['Zweite Anfrage'])
  })

  it('takes the blocked reason with it', () => {
    const hit = markBlocked(text, 'Nebenfenster', 'Widerspricht der Sperre auf main.')
    const fresh = `${text}\n${deposit({ at: '2026-07-31T06:00:00.000Z', title: 'Zweite Anfrage' })}\n`
    const landed = reapplyTransition(fresh, hit.identity, hit.state, hit.extra)
    const entry = requestEntries(landed.text)[0]
    expect(entry.state).toBe('blocked')
    expect(entry.fields.blockedWhy).toBe('Widerspricht der Sperre auf main.')
    expect(entry.fields.spec).toBe(SPEC)
    expect(pendingRequests(landed.text)).toHaveLength(1)
  })

  it('matches the exact deposit, never a newcomer that shares its title', () => {
    const hit = markQueued(text, 'Nebenfenster', 481)
    const twin = deposit({ at: '2026-07-31T06:00:00.000Z', session: 'ffff0000' })
    const landed = reapplyTransition(`${text}\n${twin}\n`, hit.identity, hit.state)
    expect(pendingRequests(landed.text).map((r) => r.session)).toEqual(['ffff0000'])
  })

  it('refuses when the entry is no longer pending instead of overwriting', () => {
    const hit = markQueued(text, 'Nebenfenster', 481)
    expect(reapplyTransition(hit.text, hit.identity, hit.state)).toBeNull()
    expect(reapplyTransition('', hit.identity, hit.state)).toBeNull()
  })
})

describe('a spec that talks ABOUT this mechanism survives it', () => {
  // Four-eyes finding 1 (Fable 5, 30.07.2026): the specs most likely to be
  // deposited here are specs about the carrier itself, and a bare field marker
  // inside one used to truncate the field it was supposed to carry verbatim.
  const spec = ['Die Felder heißen:', '#spec', '#why', 'und der Rest.'].join('\n')

  it('keeps a field marker that stands INSIDE the spec', () => {
    const entry = requestEntries(deposit({ spec }))[0]
    expect(entry.fields.spec).toBe(spec)
    expect(entry.fields.why).toBe('Eine Stunde lang konnte nichts eingereiht werden.')
  })

  it('keeps a line that already begins with backslashes', () => {
    const tricky = ['\\#spec', '\\\\#why', 'Ende.'].join('\n')
    expect(requestEntries(deposit({ spec: tricky }))[0].fields.spec).toBe(tricky)
  })

  it('does not let a marker inside the spec contaminate the blocked reason', () => {
    const text = deposit({ spec: ['vorher', '#blocked', 'nachher'].join('\n') })
    const entry = requestEntries(markBlocked(text, 'Nebenfenster', 'Der echte Grund.').text)[0]
    expect(entry.fields.blockedWhy).toBe('Der echte Grund.')
    expect(entry.fields.spec).toBe(['vorher', '#blocked', 'nachher'].join('\n'))
  })

  it('escapes and unescapes nothing else', () => {
    expect(escapeBodyLine('#ziel')).toBe('#ziel')
    expect(escapeBodyLine('ein Satz mit #spec darin')).toBe('ein Satz mit #spec darin')
    expect(unescapeBodyLine('\\#ziel')).toBe('\\#ziel')
    expect(unescapeBodyLine('gewöhnlich')).toBe('gewöhnlich')
  })
})

describe('the route', () => {
  it('sends a request with open questions to a decision card, never to the work order', () => {
    const text = deposit({ openQuestions: 'Soll die Sperre auch für Doku gelten?' })
    expect(requestRoute(requestEntries(text)[0])).toBe('vdzk')
  })

  it('REFUSES to queue a request with open questions, not merely says so', () => {
    // Four-eyes finding 2 (Fable 5, 31.07.2026): the route was display-only, so
    // "NEVER to a TASKS append" queued fine.
    const open = `${deposit({ openQuestions: 'Soll das auch für die Doku gelten?' })}\n`
    expect(() => markQueued(open, 'Nebenfenster', 481)).toThrow(/OPEN QUESTIONS/)
    expect(() => markQueued(open, 'Nebenfenster', 481)).toThrow(/--blocked/)
    expect(pendingRequests(open)).toHaveLength(1)
  })

  it('still lets the same request take the escape hatch to the user', () => {
    const open = `${deposit({ openQuestions: 'Soll das auch für die Doku gelten?' })}\n`
    expect(markBlocked(open, 'Nebenfenster', 'Erst entscheiden.').title).toContain('Nebenfenster')
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

  it('counts a hand tick with a capital X as ticked instead of losing the entry', () => {
    // Four-eyes finding 4 (Fable 5): it used to fall through the pending count
    // AND the malformed report, so the entry vanished from both.
    const ticked = '- [X] 2026-07-29T18:50:00.000Z · 10a2d2e0 · Ein Befund von Hand abgehakt\n'
    expect(parseHead(ticked.trim()).done).toBe(true)
    expect(parseCarrier(ticked).drained).toBe(1)
    expect(malformedEntries(ticked)).toEqual([])
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

describe('depositing and retiring a request are durable records', () => {
  const record = (command) => classifyCall({ name: 'Bash', command }).record

  it('counts the deposit and both retirements', () => {
    expect(record('node scripts/finding.mjs --request "t" --spec-file spec.md')).toBe('request-deposited')
    expect(record('node scripts/finding.mjs --queued "t" --point 481')).toBe('request-queued')
    expect(record('node scripts/finding.mjs --blocked "t" --why "x"')).toBe('request-blocked')
  })

  it('does NOT count merely listing them', () => {
    expect(record('node scripts/finding.mjs --requests')).toBeUndefined()
    expect(record('node scripts/finding.mjs --show "t"')).toBeUndefined()
  })
})

describe('the gate is the point boundary, not every turn end', () => {
  const boundary = (command) => turnTakesBoundary([{ name: 'Bash', command }])

  it('recognises the turn that TAKES the boundary', () => {
    expect(boundary('node scripts/batch-boundary.mjs 462')).toBe(true)
    // A PowerShell caller quotes it (four-eyes finding 3, Fable 5).
    expect(boundary('node scripts/batch-boundary.mjs "462"')).toBe(true)
    expect(boundary('node C:/repo/scripts/batch-boundary.mjs 462')).toBe(true)
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
