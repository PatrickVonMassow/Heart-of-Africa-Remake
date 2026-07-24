import { describe, it, expect } from 'vitest'
import { isPolicyBreach, parseLogLine, findForbiddenCommits } from './model-guard-core.mjs'

const T0 = Date.parse('2026-07-24T22:00:00Z')
const line = (sha, iso, trailer) => `${sha}|${iso}|${trailer}`

describe('parseLogLine', () => {
  it('parses sha, date and trailer field', () => {
    const c = parseLogLine(line('a69d1bdedf18', '2026-07-24T23:35:54+02:00', 'Claude Haiku 4.5 <noreply@anthropic.com>'))
    expect(c?.sha).toBe('a69d1bdedf18')
    expect(c?.when).toBe(Date.parse('2026-07-24T23:35:54+02:00'))
    expect(c?.trailers).toContain('Haiku')
  })
  it('keeps a trailer field that itself contains pipes intact', () => {
    const c = parseLogLine('abcdef1|2026-07-24T20:00:00Z|A <a@x>,B <b@x>')
    expect(c?.trailers).toBe('A <a@x>,B <b@x>')
  })
  it('rejects malformed lines: empty, missing fields, bad sha, bad date', () => {
    expect(parseLogLine('')).toBeNull()
    expect(parseLogLine('abcdef1|2026-07-24T20:00:00Z')).toBeNull()
    expect(parseLogLine('not-a-sha|2026-07-24T20:00:00Z|x')).toBeNull()
    expect(parseLogLine('abcdef1|yesterday-ish|x')).toBeNull()
    expect(parseLogLine(null)).toBeNull()
  })
})

describe('isPolicyBreach (allowlist: Opus 5 / Opus 4.8 / Fable 5)', () => {
  it('passes every allowed model incl. variants', () => {
    for (const t of [
      'Claude Opus 5 <noreply@anthropic.com>',
      'Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
      'Claude Opus 4.8 <noreply@anthropic.com>',
      'Claude Fable 5 <noreply@anthropic.com>',
    ]) expect(isPolicyBreach(t)).toBe(false)
  })
  it('flags every non-allowlisted Claude model — Haiku AND Sonnet AND unknowns', () => {
    for (const t of [
      'Claude Haiku 4.5 <noreply@anthropic.com>',
      'claude haiku 4.5 <noreply@anthropic.com>',
      'Claude Sonnet 5 <noreply@anthropic.com>',
      'Claude Nano 6 <noreply@anthropic.com>',
    ]) expect(isPolicyBreach(t)).toBe(true)
  })
  it('ignores empty merge-commit trailers and human co-authors', () => {
    expect(isPolicyBreach('')).toBe(false)
    expect(isPolicyBreach('Patrick von Massow <patrick@example.com>')).toBe(false)
  })
  it('one forbidden co-author flags the commit even next to an allowed one', () => {
    expect(isPolicyBreach('Claude Opus 4.8 <a@x>,Claude Haiku 4.5 <b@x>')).toBe(true)
    expect(isPolicyBreach('Claude Opus 4.8 <a@x>,Claude Fable 5 <b@x>')).toBe(false)
  })
})

describe('findForbiddenCommits', () => {
  const log = [
    line('1111111', '2026-07-24T21:35:00Z', 'Claude Haiku 4.5 <noreply@anthropic.com>'), // before baseline
    line('2222222', '2026-07-24T22:30:00Z', 'Claude Fable 5 <noreply@anthropic.com>'),
    line('3333333', '2026-07-24T23:00:00Z', 'Claude Sonnet 5 <noreply@anthropic.com>'),
    line('4444444', '2026-07-24T23:10:00Z', ''), // merge commit, no trailer
    'garbage line without pipes',
    line('5555555', '2026-07-24T23:20:00Z', 'Claude Opus 4.8 <a@x>,Claude Haiku 4.5 <b@x>'),
  ].join('\n')

  it('flags only forbidden commits at/after the baseline', () => {
    const hits = findForbiddenCommits(log, T0)
    expect(hits.map((h) => h.sha)).toEqual(['3333333', '5555555'])
  })
  it('the baseline boundary is inclusive', () => {
    const hits = findForbiddenCommits(line('9999999', '2026-07-24T22:00:00Z', 'Claude Haiku 4.5 <x@y>'), T0)
    expect(hits).toHaveLength(1)
  })
  it('is empty on empty/absent input', () => {
    expect(findForbiddenCommits('', T0)).toEqual([])
    expect(findForbiddenCommits(null, T0)).toEqual([])
  })
})
