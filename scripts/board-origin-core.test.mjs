import { describe, expect, it } from 'vitest'
import {
  classifyCommit,
  classifySource,
  firstAdditions,
  firstDate,
  originLine,
  originOf,
  renderCardOrigins,
  shortDate,
  sourceLineFor,
  sourceLines,
  withSourceLine,
} from './board-origin-core.mjs'

const TASKS = [
  '# Work order',
  '',
  '- [ ] 1547. Board: origin line',
  '  Some spec.',
  '  Source: user request of 18.11.2026 17:44 (spec cut from 04642a868).',
  '- [ ] 1548. Split part',
  '  Source: split from point 1302 on 12.11.2026 (owner decision).',
  '- [ ] 1549. No source here',
  '- [x] 900. Closed one',
  '  Source: finding of the 1234 session, 03.10.2026 14:00.',
  '',
].join('\n')

const LOG = [
  '@@C aaaa 2026-01-01 Initial work order',
  '+- [ ] 1547. Board: origin line',
  '+- [ ] 1549. No source here',
  '@@C bbbb 2026-11-17 Queue the two user orders of 17.11.2026',
  '+- [ ] 1549. No source here',
  '+- [ ] 1550. Added by user order',
  '@@C cccc 2026-11-18 Split the shadow inversion out of point 1302',
  '+- [ ] 1551. Shadow inversion',
  '@@C dddd 2026-11-18 Re-sequence the queue',
  '+- [ ] 1552. Moved here first',
].join('\n')

describe('origin derivation', () => {
  it('reads the first Source: line of each point block, open and closed', () => {
    const s = sourceLines(TASKS)
    expect(s.get(1547)).toMatch(/^user request of 18\.11\.2026/)
    expect(s.get(900)).toMatch(/^finding of the 1234 session/)
    expect(s.has(1549)).toBe(false)
  })

  it('formats dates as TT.MM.JJ from either notation', () => {
    expect(shortDate(firstDate('of 18.11.2026 17:44'))).toBe('18.11.26')
    expect(shortDate(firstDate('2026-03-05'))).toBe('05.03.26')
    expect(firstDate('no date')).toBeNull()
  })

  it('tells a user request from an agent and names the agent context', () => {
    expect(classifySource('user request of 18.11.2026').by).toBe('user')
    expect(classifySource('user-approved findings-carrier request').by).toBe('user')
    expect(classifySource('user bug report hoa-state.zip').by).toBe('userBug')
    expect(classifySource('split from point 1302 on 12.11.2026').context).toEqual({ type: 'split', point: 1302 })
    expect(classifySource('cross-vendor review of point 1400').context).toEqual({ type: 'review', point: 1400 })
    expect(classifySource('covering WebGPU passes of point 1201 (01.11.2026)').context).toEqual({ type: 'covering', point: 1201 })
    expect(classifySource('picture check of the 1234 landing session, 01.10.2026').context).toEqual({ type: 'working', point: 1234 })
    expect(classifySource('findings carrier, found on feat/1310-natural-village').context).toEqual({ type: 'working', point: 1310 })
    expect(classifySource('agent finding of 19.11.2026 via the findings carrier')).toEqual({ by: 'agent', context: null })
    expect(classifySource('imported from the old tracker')).toEqual({ by: null, context: null })
    expect(classifySource('imported from the old tracker, see point 1302')).toEqual({ by: null, context: null })
  })

  it('reads a Source: line only with a value on the same line', () => {
    expect(sourceLines('- [ ] 7. Seven\n  Source:\n  some prose\n').has(7)).toBe(false)
    expect(withSourceLine('spec\nSource:\n', 'Source: stamped.')).toContain('Source: stamped.')
  })

  it('reads a commit subject as user, agent split, or unknown — never guessed', () => {
    expect(classifyCommit('Queue the two user orders of 17.11.2026').by).toBe('user')
    expect(classifyCommit('Split the shadow inversion out of point 1302')).toEqual({ by: 'agent', context: { type: 'split', point: 1302 } })
    expect(classifyCommit('Re-sequence the queue').by).toBeNull()
  })

  it('takes the FIRST adding commit and skips grafted shallow roots', () => {
    const all = firstAdditions(LOG)
    expect(all.get(1549).sha).toBe('aaaa')
    const real = firstAdditions(LOG, { skip: new Set(['aaaa']) })
    expect(real.has(1549)).toBe(false)
    const rootLast = firstAdditions('@@C cccc 2026-11-02 Other branch\n+- [ ] 1549. No source here\n@@C aaaa 2026-01-01 Graft\n+- [ ] 1549. No source here\n', { skip: new Set(['aaaa']) })
    expect(rootLast.has(1549)).toBe(false)
    expect(real.has(1547)).toBe(false)
  })

  it('prefers the Source: line, then the commit, then says it is unknown', () => {
    const sources = sourceLines(TASKS)
    const additions = firstAdditions(LOG, { skip: new Set(['aaaa']) })
    const line = (n) => originLine(originOf(n, { sources, additions }))
    expect(line(1547)).toBe('Eingestellt: 18.11.26 durch Benutzeranfrage')
    expect(line(1548)).toBe('Eingestellt: 12.11.26 durch Agenten, abgespalten von 1302')
    expect(line(900)).toBe('Eingestellt: 03.10.26 durch Agenten, der beim Abarbeiten von 1234 auf das Problem gestoßen ist')
    expect(line(1549)).toBe('Herkunft unbekannt')
    expect(originLine(originOf(1549, { additions: new Map([[1549, { sha: 'bbbb', date: '2026-11-17', subject: 'Queue the two user orders of 17.11.2026' }]]) }))).toBe('Eingestellt: 17.11.26 durch Benutzeranfrage')
    expect(line(1551)).toBe('Eingestellt: 18.11.26 durch Agenten, abgespalten von 1302')
    expect(line(1552)).toBe('Eingestellt: 18.11.26, Urheber unbekannt')
    expect(line(1)).toBe('Herkunft unbekannt')
  })

  it('has the English set beside the German one', () => {
    expect(originLine({ by: 'user', date: { d: 18, m: 11, y: 2026 } }, 'en')).toBe('Filed: 18.11.26 by user request')
    expect(originLine({}, 'en')).toBe('Origin unknown')
  })

  it('never writes "Punkt N", which the card-topic guard reads as a foreign reference', () => {
    for (const type of ['working', 'review', 'covering', 'split']) {
      expect(originLine({ by: 'agent', context: { type, point: 12 }, date: { d: 1, m: 1, y: 2026 } })).not.toMatch(/\b(?:punkt|point)\s+\d/i)
    }
  })
})

describe('rendered origin line', () => {
  const card = (num, body) =>
    `<details>\n  <summary><span class="num">${num}</span><span class="t">T</span></summary>\n  <div class="body">\n${body}\n  </div>\n</details>\n`
  const queueBody = '    <p class="desc">Beschreibung.</p>\n    <hr class="split">\n    <p class="status-head">Stand der Umsetzung</p>\n    <p>Noch nicht begonnen.</p>'
  const originFor = (n) => (n === 1547 ? { by: 'user', date: { d: 18, m: 11, y: 2026 } } : n === 7 ? undefined : {})

  it('sits below the description and above the status divider', () => {
    const html = renderCardOrigins(card(1547, queueBody), originFor)
    expect(html).toContain('<p class="desc">Beschreibung.</p>\n    <p class="origin">Eingestellt: 18.11.26 durch Benutzeranfrage</p>\n    <hr class="split">')
  })

  it('goes at the end of a body without a divider, and says when the origin is unknown', () => {
    const html = renderCardOrigins(card(12, '    <p>Erledigt.</p>'), originFor)
    expect(html).toContain('<p>Erledigt.</p>\n    <p class="origin">Herkunft unbekannt</p>')
  })

  it('is idempotent and leaves non-point cards and unknown points alone', () => {
    const once = renderCardOrigins(card(1547, queueBody), originFor)
    expect(renderCardOrigins(once, originFor)).toBe(once)
    const request = card('✳', '    <p>Anfrage.</p>')
    expect(renderCardOrigins(request, originFor)).toBe(request)
    expect(renderCardOrigins(card(7, queueBody), originFor)).toBe(card(7, queueBody))
  })
})

describe('Source: line for newly filed points', () => {
  it('stamps a deposit with date and origin, and keeps an existing Source: line', () => {
    const line = sourceLineFor({ kind: 'request', at: new Date('2026-11-19T06:41:00Z') })
    expect(line).toBe('Source: user request of 19.11.2026 06:41 UTC via the findings carrier.')
    expect(withSourceLine('Spec.\n', line)).toBe(`Spec.\n${line}\n`)
    expect(withSourceLine('Spec.\nSource: user request of 01.01.2026.', line)).toBe('Spec.\nSource: user request of 01.01.2026.')
    const finding = sourceLineFor({ kind: 'finding', at: new Date('2026-11-19T06:41:00Z') })
    expect(originLine(originOf(1, { sources: sourceLines(`- [ ] 1. X\n  ${finding}`) }))).toBe('Eingestellt: 19.11.26 durch Agenten')
  })
})
