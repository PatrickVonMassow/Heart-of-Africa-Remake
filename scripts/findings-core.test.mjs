import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLD,
  auditFindings,
  carrierEntry,
  classifyCall,
  formatFindings,
  malformedEntries,
  markDrained,
  parseCarrier,
  tallyTurn,
  turnCalls,
} from './findings-core.mjs'

const reads = (n) => Array.from({ length: n }, () => ({ name: 'Read', filePath: 'src/a.ts' }))
const kinds = (v) => v.violations.map((x) => x.kind)

describe('classifyCall separates looking from recording', () => {
  it('counts the read/search tools as investigation', () => {
    for (const name of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) {
      expect(classifyCall({ name }).kind).toBe('investigate')
    }
  })

  it('counts a spawned agent as investigation and flags it', () => {
    expect(classifyCall({ name: 'Agent' })).toEqual({ kind: 'investigate', agent: true })
  })

  it('reads a LOOKING shell call as investigation', () => {
    for (const command of [
      'git status --short',
      'git log -3 --format=%s',
      'ls -1 scripts',
      'grep -n "foo" TASKS.md | head -5',
      'node scripts/guard-health-guard.mjs --status',
      'node -e "console.log(1)"',
    ]) {
      expect(classifyCall({ name: 'Bash', command }).kind, command).toBe('investigate')
    }
  })

  it('does NOT read an ACTING shell call as investigation — that was the false-positive engine', () => {
    // Measured over 2709 real turns: counting these blocked 10.6 % of all
    // turns, three quarters of them build/verify turns rather than analysis.
    for (const command of [
      'npm run build',
      'npm run test:unit',
      'node scripts/board-publish.mjs',
      'npx vitest run scripts/findings-core.test.mjs',
      'git status && npm run lint',
    ]) {
      expect(classifyCall({ name: 'Bash', command }).kind, command).toBe('ignore')
    }
  })

  it('recognises a commit as a record', () => {
    expect(classifyCall({ name: 'Bash', command: 'git commit -q -m "x"' })).toEqual({
      kind: 'record',
      record: 'commit',
    })
    expect(classifyCall({ name: 'Bash', command: 'git -c user.name=x commit -m "y"' }).record).toBe('commit')
  })

  it('does NOT accept a dry-run commit as a record', () => {
    expect(classifyCall({ name: 'Bash', command: 'git commit --dry-run' }).kind).not.toBe('record')
  })

  it('cannot be talked into a record by a mention of one — the self-laundering path', () => {
    for (const command of [
      'rg "git commit" scripts/',
      'echo how to git commit > notes.txt',
      'git stash push -m "before git commit fix"',
      'grep -n "git commit" docs/*.md',
    ]) {
      expect(classifyCall({ name: 'Bash', command }).kind, command).not.toBe('record')
    }
  })

  it('finds the real commit beside a dry run instead of losing it', () => {
    expect(classifyCall({ name: 'Bash', command: 'git add -A; git commit --dry-run; git commit -m real' }).record).toBe(
      'commit',
    )
  })

  it('accepts the git forms that really do land work', () => {
    for (const command of [
      'cd x && git commit -m "y"',
      'git -C ../wt commit -m "y"',
      'git merge --no-ff feat/x',
      'git cherry-pick abc123',
    ]) {
      expect(classifyCall({ name: 'Bash', command }).record, command).toBe('commit')
    }
  })

  it('counts retiring a carrier entry as recording too', () => {
    expect(classifyCall({ name: 'Bash', command: 'node scripts/finding.mjs --drained "x"' }).record).toBe(
      'finding-drained',
    )
  })

  it('recognises both finding.mjs forms', () => {
    expect(classifyCall({ name: 'Bash', command: 'node scripts/finding.mjs --record "a" --detail "b"' }).record).toBe(
      'finding-record',
    )
    expect(classifyCall({ name: 'Bash', command: 'node scripts/finding.mjs --none "nothing"' }).record).toBe(
      'finding-none',
    )
  })

  it('accepts a TASKS.md edit and a memory write as records', () => {
    expect(classifyCall({ name: 'Edit', filePath: 'c:/repo/TASKS.md' }).record).toBe('tasks-edit')
    expect(
      classifyCall({
        name: 'Write',
        filePath: 'C:\\Users\\x\\.claude\\projects\\c--repo\\memory\\note.md',
      }).record,
    ).toBe('memory-write')
  })

  it('ignores an ordinary source edit — writing code is not recording a finding', () => {
    expect(classifyCall({ name: 'Edit', filePath: 'src/world/world.ts' }).kind).toBe('ignore')
  })
})

describe('condition 1 — investigated but recorded nothing', () => {
  it('blocks a turn over the threshold with no record', () => {
    const v = auditFindings({ tally: tallyTurn(reads(DEFAULT_THRESHOLD)) })
    expect(v.ok).toBe(false)
    expect(kinds(v)).toContain('unrecorded-investigation')
  })

  it('never blocks an answer-only turn', () => {
    expect(auditFindings({ tally: tallyTurn(reads(2)) }).ok).toBe(true)
    expect(auditFindings({ tally: tallyTurn([]) }).ok).toBe(true)
  })

  it('blocks on a single spawned agent, whatever the read count', () => {
    const v = auditFindings({ tally: tallyTurn([{ name: 'Agent' }]) })
    expect(kinds(v)).toContain('unrecorded-investigation')
  })

  it('passes once the turn recorded — one case per accepted record kind', () => {
    const cases = [
      { name: 'Bash', command: 'git commit -m "x"' },
      { name: 'Bash', command: 'node scripts/finding.mjs --record "t" --detail "d"' },
      { name: 'Bash', command: 'node scripts/finding.mjs --none "nichts"' },
      { name: 'Edit', filePath: 'TASKS.md' },
      { name: 'Write', filePath: '~/.claude/projects/c--repo/memory/carrier.md' },
    ]
    for (const record of cases) {
      const v = auditFindings({ tally: tallyTurn([...reads(20), record]) })
      expect(kinds(v), JSON.stringify(record)).not.toContain('unrecorded-investigation')
    }
  })

  it('honours an injected threshold', () => {
    expect(auditFindings({ tally: tallyTurn(reads(3)), threshold: 3 }).ok).toBe(false)
    expect(auditFindings({ tally: tallyTurn(reads(3)), threshold: 99 }).ok).toBe(true)
  })
})

describe('condition 2 — the carrier must not rest', () => {
  it('blocks the batch owner while findings still sit in the carrier', () => {
    const v = auditFindings({ tally: tallyTurn([]), ownsBatch: true, carrierPending: 2 })
    expect(kinds(v)).toEqual(['carrier-not-drained'])
  })

  it('never judges a session that does not own the batch', () => {
    expect(auditFindings({ tally: tallyTurn([]), ownsBatch: false, carrierPending: 5 }).ok).toBe(true)
  })

  it('passes the owner once the carrier is empty', () => {
    expect(auditFindings({ tally: tallyTurn([]), ownsBatch: true, carrierPending: 0 }).ok).toBe(true)
  })

  it('reports both violations at once when both hold', () => {
    const v = auditFindings({ tally: tallyTurn(reads(20)), ownsBatch: true, carrierPending: 1 })
    expect(kinds(v).sort()).toEqual(['carrier-not-drained', 'unrecorded-investigation'])
  })
})

describe('the carrier round-trips', () => {
  const entry = carrierEntry({
    at: '2026-07-29T18:50:00.000Z',
    session: '10a2d2e0',
    title: 'Die Hooks feuern außerhalb der Wurzel nicht',
    detail: 'Belegt über 46 Transkripte.\n\nZweite Zeile.',
  })

  it('writes a pending entry the parser finds again', () => {
    const parsed = parseCarrier(`# Träger\n\n${entry}\n`)
    expect(parsed.pending).toHaveLength(1)
    expect(parsed.pending[0].title).toBe('Die Hooks feuern außerhalb der Wurzel nicht')
    expect(parsed.drained).toBe(0)
  })

  it('indents the detail so the head line stays parseable', () => {
    expect(entry.split('\n')[1]).toBe('      Belegt über 46 Transkripte.')
  })

  it('counts a drained entry as drained, not pending', () => {
    const parsed = parseCarrier(entry.replace('- [ ] ', '- [x] '))
    expect(parsed.pending).toHaveLength(0)
    expect(parsed.drained).toBe(1)
  })

  it('ignores ordinary prose, so the carrier stays a readable document', () => {
    expect(parseCarrier('Eine Zeile Fließtext.\n- ein Aufzählungspunkt\n').pending).toEqual([])
  })

  it('marks a matching entry drained and reports WHICH one it hit', () => {
    const hit = markDrained(entry, 'hooks feuern')
    expect(hit.title).toBe('Die Hooks feuern außerhalb der Wurzel nicht')
    expect(parseCarrier(hit.text).pending).toEqual([])
    expect(parseCarrier(hit.text).drained).toBe(1)
  })

  it('returns null when nothing matched, so the caller can report it', () => {
    expect(markDrained(entry, 'gibt es nicht')).toBeNull()
    expect(markDrained(entry, '')).toBeNull()
  })

  it('refuses an ambiguous match rather than silencing the wrong finding', () => {
    const two = [
      carrierEntry({ at: '2026-07-29T18:00:00.000Z', session: 's', title: 'Hooks feuern nicht · Variante A' }),
      carrierEntry({ at: '2026-07-29T18:01:00.000Z', session: 's', title: 'Hooks feuern nicht' }),
    ].join('\n')
    const verdict = markDrained(two, 'Hooks feuern')
    expect(verdict.ambiguous).toHaveLength(2)
    expect(verdict.text).toBeUndefined()
    expect(parseCarrier(two).pending).toHaveLength(2)
  })

  it('surfaces a hand-broken entry instead of dropping it from every count', () => {
    const broken = '- [ ] kaputt ohne Trennzeichen\n' + entry
    expect(malformedEntries(broken)).toEqual(['- [ ] kaputt ohne Trennzeichen'])
    expect(parseCarrier(broken).pending).toHaveLength(1)
  })

  it('sees nothing wrong with a well-formed carrier', () => {
    expect(malformedEntries(entry)).toEqual([])
  })
})

describe('turnCalls reads only the current turn out of a transcript', () => {
  const line = (ts, part) =>
    JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: [part] } })
  const useRead = { type: 'tool_use', name: 'Read', input: { file_path: 'src/a.ts' } }
  const useBash = { type: 'tool_use', name: 'Bash', input: { command: 'git commit -m "x"' } }
  const turn = Date.parse('2026-07-29T18:00:00.000Z')

  it('keeps calls at or after the turn stamp and drops earlier ones', () => {
    const text = [
      line('2026-07-29T17:59:59.000Z', useRead),
      line('2026-07-29T18:00:00.000Z', useRead),
      line('2026-07-29T18:05:00.000Z', useBash),
    ].join('\n')
    const calls = turnCalls(text, turn)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual({ name: 'Bash', command: 'git commit -m "x"', filePath: undefined })
  })

  it('survives a corrupt line rather than losing the whole turn', () => {
    const text = ['{not json but has tool_use', line('2026-07-29T18:01:00.000Z', useRead)].join('\n')
    expect(turnCalls(text, turn)).toHaveLength(1)
  })

  it('ignores user entries and undated ones', () => {
    const text = [
      JSON.stringify({ type: 'user', timestamp: '2026-07-29T18:01:00.000Z', message: { content: [useRead] } }),
      JSON.stringify({ type: 'assistant', message: { content: [useRead] } }),
    ].join('\n')
    expect(turnCalls(text, turn)).toEqual([])
  })

  it('feeds the tally, so a whole turn can be judged from a transcript', () => {
    const text = Array.from({ length: 8 }, (_, i) =>
      line(`2026-07-29T18:0${i}:00.000Z`, useRead),
    ).join('\n')
    expect(auditFindings({ tally: tallyTurn(turnCalls(text, turn)) }).ok).toBe(false)
  })
})

describe('the block message', () => {
  it('is empty when there is nothing to say', () => {
    expect(formatFindings([])).toBe('')
  })

  it('names every violation and the way out', () => {
    const text = formatFindings(auditFindings({ tally: tallyTurn(reads(20)) }).violations)
    expect(text).toContain('unrecorded-investigation')
    expect(text).toContain('finding.mjs')
  })
})
