import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  chooseTranscriptDirectory,
  extractText,
  formatEntry,
  isHumanEntry,
  parseLine,
  parseSince,
  projectDirName,
  selectEntries,
  transcriptDirectoryCandidates,
} from './user-said-core.mjs'

const human = (text, at = '2026-08-20T05:31:57.062Z', sessionId = 'd5fcb9cf-2936-4743') => JSON.stringify({
  type: 'user',
  origin: { kind: 'human' },
  timestamp: at,
  sessionId,
  message: { role: 'user', content: [{ type: 'text', text }] },
})

describe('what counts as the user speaking', () => {
  it('keeps a typed message', () => {
    expect(parseLine(human('Die Reihenfolge-Regel zum Release stimmt noch.'))).toEqual({
      at: Date.parse('2026-08-20T05:31:57.062Z'),
      session: 'd5fcb9cf',
      text: 'Die Reihenfolge-Regel zum Release stimmt noch.',
    })
  })

  it('drops a tool result, which wears the same user role', () => {
    const line = JSON.stringify({
      type: 'user',
      timestamp: '2026-08-20T05:31:00.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', content: 'declared focus : …' }] },
    })
    expect(parseLine(line)).toBeNull()
  })

  it('drops harness wrappers that arrive as human turns', () => {
    expect(parseLine(human('<ide_opened_file>CLAUDE.md</ide_opened_file>'))).toBeNull()
    expect(parseLine(human('<command-name>/clear</command-name>'))).toBeNull()
  })

  it('drops a sidechain, so a subagent never speaks as the user', () => {
    const entry = JSON.parse(human('agent prose'))
    expect(isHumanEntry({ ...entry, isSidechain: true })).toBe(false)
  })

  it('survives a corrupt line rather than dying mid-transcript', () => {
    expect(parseLine('{not json')).toBeNull()
    expect(parseLine('')).toBeNull()
  })

  it('reads a plain string body as well as content blocks', () => {
    expect(extractText({ content: '  ein Wort  ' })).toBe('ein Wort')
  })
})

describe('selection', () => {
  const rows = [
    { at: Date.parse('2026-08-20T05:26:00Z'), session: 'd5fcb9cf', text: '224 kann weg.' },
    { at: Date.parse('2026-08-20T05:31:00Z'), session: 'd5fcb9cf', text: 'Die Reihenfolge-Regel stimmt noch.' },
    { at: Date.parse('2026-08-20T09:45:00Z'), session: '28243666', text: 'Wieso ist die Karte noch da?' },
  ]

  it('matches case-insensitively and keeps chronological order', () => {
    expect(selectEntries(rows, { grep: 'reihenfolge' }).map((r) => r.session)).toEqual(['d5fcb9cf'])
  })

  it('cuts to the NEWEST n, because the recent answer is the one being looked for', () => {
    expect(selectEntries(rows, { last: 1 })[0].text).toBe('Wieso ist die Karte noch da?')
  })

  it('filters by session prefix and by since', () => {
    expect(selectEntries(rows, { session: '2824' })).toHaveLength(1)
    expect(selectEntries(rows, { since: Date.parse('2026-08-20T06:00:00Z') })).toHaveLength(1)
  })

  it('last: 0 means everything', () => {
    expect(selectEntries(rows, { last: 0 })).toHaveLength(3)
  })

  it('limits by the newest HUMAN MESSAGE in each of the newest sessions before matching', () => {
    const fixture = [
      { at: Date.parse('2026-08-20T08:00:00Z'), session: 'old', text: 'needle in an older session' },
      { at: Date.parse('2026-08-20T10:00:00Z'), session: 'new', text: 'newest human turn does not match' },
      { at: Date.parse('2026-08-20T09:00:00Z'), session: 'new', text: 'needle in the newest session' },
    ]
    expect(selectEntries(fixture, { grep: 'needle', sessions: 1, last: 0 })).toEqual([fixture[2]])
  })
})

describe('--since', () => {
  const now = Date.parse('2026-08-20T10:00:00Z')

  it('reads a relative age', () => {
    expect(parseSince('90m', now)).toBe(now - 90 * 60_000)
    expect(parseSince('6h', now)).toBe(now - 6 * 3_600_000)
    expect(parseSince('2d', now)).toBe(now - 2 * 86_400_000)
  })

  it('reads an ISO stamp and refuses nonsense instead of filtering nothing', () => {
    expect(parseSince('2026-08-20T05:00:00Z', now)).toBe(Date.parse('2026-08-20T05:00:00Z'))
    expect(() => parseSince('gestern', now)).toThrow(/not a time/)
  })

  it('is absent when not asked for', () => {
    expect(parseSince(undefined, now)).toBeNull()
  })
})

describe('one hit, one line', () => {
  const row = { at: Date.parse('2026-08-20T05:31:00Z'), session: 'd5fcb9cf', text: 'a'.repeat(200) }

  it('truncates by default — the tool must not become the dump it replaces', () => {
    const line = formatEntry(row, { width: 40 })
    expect(line.endsWith('…')).toBe(true)
    expect(line.length).toBeLessThan(80)
  })

  it('prints the whole text on --full', () => {
    expect(formatEntry(row, { full: true })).toContain('a'.repeat(200))
  })

  it('collapses newlines so a paragraph cannot break the table', () => {
    const multi = { ...row, text: 'erste Zeile\n\nzweite Zeile' }
    expect(formatEntry(multi, { full: true })).toContain('erste Zeile zweite Zeile')
  })

  it('stamps in the user\'s zone', () => {
    expect(formatEntry(row, { width: 40 })).toMatch(/^20\.08\. 07:31 · d5fcb9cf · /)
  })
})

describe('transcript directory', () => {
  it('mirrors the harness naming', () => {
    expect(projectDirName('/workspace/hoa')).toBe('-workspace-hoa')
  })

  it('prefers a populated worktree folder, then falls back to the populated main checkout', () => {
    const dirs = transcriptDirectoryCandidates({
      projectsDir: '/projects',
      checkoutRoot: '/workspace/hoa/.claude/worktrees/agent-a',
      mainCheckout: '/workspace/hoa',
      join,
    })
    expect(dirs).toEqual([
      '/projects/-workspace-hoa--claude-worktrees-agent-a',
      '/projects/-workspace-hoa',
    ])
    expect(chooseTranscriptDirectory([
      { dir: dirs[0], files: [] },
      { dir: dirs[1], files: ['session.jsonl'] },
      { dir: '/projects/-workspace-hoa-', files: ['wrong.jsonl'] },
    ])).toEqual({ dir: dirs[1], files: ['session.jsonl'] })
  })

  it('exits non-zero when an explicit directory has no transcripts', () => {
    const empty = mkdtempSync(join(tmpdir(), 'user-said-empty-'))
    const run = spawnSync(process.execPath, ['scripts/user-said.mjs', '--dir', empty], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(`no transcripts at ${empty}`)
  })

  it('the CLI honours --sessions against transcript fixtures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'user-said-sessions-'))
    writeFileSync(join(dir, 'old.jsonl'), `${human('needle old', '2026-08-20T08:00:00Z', 'old-session')}\n`)
    writeFileSync(join(dir, 'new.jsonl'), [
      human('needle new', '2026-08-20T09:00:00Z', 'new-session'),
      human('newest turn', '2026-08-20T10:00:00Z', 'new-session'),
    ].join('\n'))
    const out = execFileSync(process.execPath, [
      'scripts/user-said.mjs', '--dir', dir, '--grep', 'needle', '--sessions', '1', '--last', '0',
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true })
    expect(out).toContain('needle new')
    expect(out).not.toContain('needle old')
    expect(out).toContain(`2 transcripts · ${dir}`)
  })
})
