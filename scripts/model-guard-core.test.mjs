import { describe, it, expect } from 'vitest'
import {
  ALLOWED_TRAILERS,
  backupRefsIn,
  classifyTrailer,
  coAuthorTrailers,
  evaluateCommitTrailers,
  formatCommitTrailerVerdict,
  findForbiddenCommits,
  findUnidentifiedCommits,
  formatForbiddenReason,
  formatUnidentifiedReason,
  isPolicyBreach,
  modelNameIn,
  parseLogLine,
} from './model-guard-core.mjs'

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

// POINT 397: the three-way split. The trailer that cost a round was
// `Co-Authored-By: Claude <noreply@anthropic.com>` — no model at all.
describe('classifyTrailer', () => {
  it('calls an allowlisted model allowed, in every spelling', () => {
    for (const t of [
      'Claude Opus 5 <noreply@anthropic.com>',
      'Claude Opus 5 (1M context) <noreply@anthropic.com>',
      'Claude Opus 4.8 <noreply@anthropic.com>',
      'Claude Fable 5 <noreply@anthropic.com>',
    ]) expect(classifyTrailer(t)).toBe('allowed')
  })

  it('calls the REAL bare trailer unidentified, not forbidden', () => {
    expect(classifyTrailer('Claude <noreply@anthropic.com>')).toBe('unidentified')
    expect(classifyTrailer('Claude Code <noreply@anthropic.com>')).toBe('unidentified')
    expect(classifyTrailer('Claude (1M context) <noreply@anthropic.com>')).toBe('unidentified')
    expect(isPolicyBreach('Claude <noreply@anthropic.com>')).toBe(false)
  })

  it('calls a NAMED model outside the allowlist forbidden', () => {
    for (const t of [
      'Claude Haiku 4.5 <noreply@anthropic.com>',
      'claude sonnet 5 <noreply@anthropic.com>',
      'Claude Nano 6 <noreply@anthropic.com>',
    ]) expect(classifyTrailer(t)).toBe('forbidden')
  })

  it('judges a commit by its WORST trailer', () => {
    expect(classifyTrailer('Claude Opus 5 <a@x>,Claude <b@x>')).toBe('unidentified')
    expect(classifyTrailer('Claude <a@x>,Claude Haiku 4.5 <b@x>')).toBe('forbidden')
    expect(classifyTrailer('Claude Opus 5 <a@x>;Claude Fable 5 <b@x>')).toBe('allowed')
  })

  it('does not judge what carries no model evidence', () => {
    expect(classifyTrailer('')).toBe('allowed')
    expect(classifyTrailer(null)).toBe('allowed')
    expect(classifyTrailer('Patrick von Massow <patrick@example.com>')).toBe('allowed')
  })

  it('reads the model name out of a trailer', () => {
    expect(modelNameIn('Claude Opus 4.8 (1M context) <noreply@anthropic.com>')).toBe('Opus 4.8')
    expect(modelNameIn('Claude <noreply@anthropic.com>')).toBe('')
  })
})

describe('findUnidentifiedCommits', () => {
  const log = [
    line('1111111', '2026-07-24T21:00:00Z', 'Claude <noreply@anthropic.com>'), // before baseline
    line('2222222', '2026-07-24T22:30:00Z', 'Claude <noreply@anthropic.com>'),
    line('3333333', '2026-07-24T23:00:00Z', 'Claude Haiku 4.5 <noreply@anthropic.com>'),
    line('4444444', '2026-07-24T23:10:00Z', ''),
    line('5555555', '2026-07-24T23:20:00Z', 'Claude Opus 5 <noreply@anthropic.com>'),
    line('6666666', '2026-07-24T23:30:00Z', 'Patrick von Massow <patrick@example.com>'),
  ].join('\n')

  it('returns the unnamed commits and nothing else', () => {
    expect(findUnidentifiedCommits(log, T0).map((h) => h.sha)).toEqual(['2222222'])
  })
  it('the forbidden finder never returns an unidentified commit', () => {
    expect(findForbiddenCommits(log, T0).map((h) => h.sha)).toEqual(['3333333'])
  })
  it('is empty on empty/absent input', () => {
    expect(findUnidentifiedCommits('', T0)).toEqual([])
    expect(findUnidentifiedCommits(null, T0)).toEqual([])
  })
})

describe('the two block texts', () => {
  const hits = [{ sha: '652a8ba1111', trailer: 'Claude <noreply@anthropic.com>' }]

  it('the unnamed one names the commit and where the answer lives', () => {
    const text = formatUnidentifiedReason(hits)
    expect(text).toContain('652a8ba')
    expect(text).toContain('~/.claude/projects/')
    expect(text).toContain('subagents/agent-')
    expect(text).toContain('message.model')
    expect(text).toContain('model-guard-baseline.json')
    // It must NOT read as the breach ritual: no pause is owed here.
    expect(text).toContain('do not pause the batch over it')
  })

  it('the named one keeps demanding the pause', () => {
    const text = formatForbiddenReason([{ sha: 'a69d1bd', trailer: 'Claude Haiku 4.5 <x@y>' }])
    expect(text).toContain('SERVING-MODEL TRIPWIRE')
    expect(text).toContain('a69d1bd')
    expect(text).toContain('.claude/batch-paused')
  })

  it('names a surviving filter-branch backup ref instead of reporting it twice', () => {
    const refs = backupRefsIn('refs/original/refs/heads/feat/392-x\nrefs/heads/main\n')
    expect(refs).toEqual(['refs/original/refs/heads/feat/392-x'])
    const text = formatUnidentifiedReason(hits, { backupRefs: refs })
    expect(text).toContain('refs/original/refs/heads/feat/392-x')
    expect(text).toContain('git update-ref -d refs/original/refs/heads/feat/392-x')
    // and it stays out of the way when there are none
    expect(formatUnidentifiedReason(hits, { backupRefs: [] })).not.toContain('update-ref')
  })
})

// POINT 425: the grip at the source — the commit-msg gate's pure half.
describe('evaluateCommitTrailers (the commit-msg gate)', () => {
  const msg = (...trailers) => `Do a thing\n\n${trailers.join('\n')}\n`

  it('accepts each allowed spelling, with and without the context suffix', () => {
    for (const t of [
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
      'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>',
      'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>',
      'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
      'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
    ]) expect(evaluateCommitTrailers(msg(t)).block, t).toBe(false)
    // every spelling the refusal advertises must itself pass the gate
    for (const t of ALLOWED_TRAILERS) expect(evaluateCommitTrailers(msg(t)).block, t).toBe(false)
  })

  it('rejects the bare trailer', () => {
    const v = evaluateCommitTrailers(msg('Co-Authored-By: Claude <noreply@anthropic.com>'))
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('unnamed-model-trailer')
  })

  it('rejects a named model outside the allowlist', () => {
    const v = evaluateCommitTrailers(msg('Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>'))
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('forbidden-model-trailer')
  })

  it('ignores a purely human co-author and a message with no trailer at all', () => {
    expect(evaluateCommitTrailers(msg('Co-Authored-By: Patrick von Massow <p@example.com>')).block).toBe(false)
    expect(evaluateCommitTrailers('Merge branch main into feat/x\n').block).toBe(false)
    expect(evaluateCommitTrailers('').block).toBe(false)
    expect(evaluateCommitTrailers(null).block).toBe(false)
  })

  it('flags a bare trailer standing beside a named one', () => {
    const v = evaluateCommitTrailers(
      msg('Co-Authored-By: Claude Opus 5 <a@x>', 'Co-Authored-By: Claude <b@x>'),
    )
    expect(v.block).toBe(true)
    expect(v.findings).toHaveLength(1)
  })

  it('reads trailers case-insensitively and never out of a comment line', () => {
    expect(coAuthorTrailers('x\n\nco-authored-by: Claude Opus 5 <a@x>\n')).toEqual(['Claude Opus 5 <a@x>'])
    expect(coAuthorTrailers('x\n\n# Co-Authored-By: Claude <a@x>\n')).toEqual([])
    expect(evaluateCommitTrailers('x\n\n# Co-Authored-By: Claude <a@x>\n').block).toBe(false)
  })

  it('the refusal prints the exact trailer to write and where to look it up', () => {
    const text = formatCommitTrailerVerdict(
      evaluateCommitTrailers(msg('Co-Authored-By: Claude <noreply@anthropic.com>')),
    )
    expect(text).toContain('Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
    expect(text).toContain('Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>')
    expect(text).toContain('Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')
    expect(text).toContain('~/.claude/projects/')
    expect(formatCommitTrailerVerdict({ block: false, findings: [] })).toBe('')
  })
})
