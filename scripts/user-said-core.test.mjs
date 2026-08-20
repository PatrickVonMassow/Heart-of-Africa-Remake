import { describe, expect, it } from 'vitest'
import {
  extractText,
  formatEntry,
  isHumanEntry,
  parseLine,
  parseSince,
  projectDirName,
  selectEntries,
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
})
