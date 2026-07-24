// Decision/fingerprint sweep of the retrospective-currency toolchain
// (retro-core + retro-sources): the sources fingerprint changes exactly when
// a source changes, the guard's stale/fresh verdict, and the refresh's
// only-between-the-markers rewrite that preserves the analysis prose.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTO_END,
  AUTO_START,
  MEMORY_TYPES,
  buildRows,
  computeFingerprint,
  escalationCount,
  evaluateCurrency,
  extractFingerprint,
  guardScriptNames,
  matchingGuards,
  parseMemoryDescription,
  parseMemoryType,
  processTaskPoints,
  refreshedDoc,
  renderAutoSection,
  replaceAutoSection,
  revertCommits,
  severityFor,
  skeletonDoc,
} from './retro-core.mjs'
import { collectMemories, collectSources, defaultMemoryDir } from './retro-sources.mjs'

const memoryFile = (type, description = 'Eine Regel') =>
  `---\nname: x\ndescription: "${description}"\nmetadata: \n  node_type: memory\n  type: ${type}\n---\n\nBody. Angemahnt am 20.07. und 21.07.2026.\n`

describe('memory frontmatter parsing', () => {
  it('reads the type without tripping on node_type, and the description', () => {
    const text = memoryFile('feedback', 'Zeitstempel vor jeder Antwort')
    expect(parseMemoryType(text)).toBe('feedback')
    expect(parseMemoryDescription(text)).toBe('Zeitstempel vor jeder Antwort')
  })
  it('returns null without frontmatter and on malformed input', () => {
    expect(parseMemoryType('no frontmatter')).toBeNull()
    expect(parseMemoryType(null)).toBeNull()
    expect(parseMemoryDescription(undefined)).toBeNull()
  })
  it('pins the relevant memory kinds (reference stays out)', () => {
    expect([...MEMORY_TYPES].sort()).toEqual(['feedback', 'project', 'user'])
    expect(MEMORY_TYPES.has('reference')).toBe(false)
  })
})

describe('guardScriptNames', () => {
  it('keeps guards/hooks/infra, drops cores, tests and race workers', () => {
    const names = guardScriptNames([
      'dashboard-guard.mjs',
      'dashboard-guard-core.mjs',
      'retro-core.test.mjs',
      'batch-singleton.mjs',
      'batch-singleton-race-worker.mjs',
      'lock-heartbeat-hook.mjs',
      'batch-doctor.mjs',
      'batch-autostart.mjs',
      'worktree-reminder.mjs',
      'perf-bench.mjs',
      'notify.mjs',
      'retro-currency-guard.mjs',
    ])
    expect(names).toEqual([
      'batch-autostart.mjs',
      'batch-doctor.mjs',
      'batch-singleton.mjs',
      'dashboard-guard.mjs',
      'lock-heartbeat-hook.mjs',
      'retro-currency-guard.mjs',
      'worktree-reminder.mjs',
    ])
    expect(guardScriptNames(null)).toEqual([])
  })
})

describe('revertCommits', () => {
  it('collects Revert/Reapply subjects only', () => {
    const log = [
      'aaaa111 Add the crocodile ambush',
      'bbbb222 Revert "Add SSR to the pipeline"',
      'cccc333 Reapply the TRAA node',
      '',
    ].join('\n')
    expect(revertCommits(log)).toEqual([
      { hash: 'bbbb222', subject: 'Revert "Add SSR to the pipeline"' },
      { hash: 'cccc333', subject: 'Reapply the TRAA node' },
    ])
    expect(revertCommits(undefined)).toEqual([])
  })
})

describe('processTaskPoints', () => {
  it('keeps process/meta titles with their done state, skips game points', () => {
    const tasks = [
      '- [ ] 290. A RELIABLE MECHANISM: a Stop-hook guard for the retrospective',
      '- [x] 271. Harden the batch singleton lock',
      '- [ ] 130. The crocodile ambush on river water',
      '  continuation line with the word guard must not match',
    ].join('\n')
    expect(processTaskPoints(tasks)).toEqual([
      { num: 290, done: false, title: 'A RELIABLE MECHANISM: a Stop-hook guard for the retrospective' },
      { num: 271, done: true, title: 'Harden the batch singleton lock' },
    ])
  })
})

describe('escalationCount / severityFor', () => {
  it('counts distinct German and ISO dates, floor 1', () => {
    expect(escalationCount('am 09.07. und 10.07., dann 2026-07-16, nochmal 09.07.')).toBe(3)
    expect(escalationCount('no dates here')).toBe(1)
    expect(escalationCount(null)).toBe(1)
  })
  it('maps attempts to the heuristic severity bands', () => {
    expect(severityFor(1)).toBe('niedrig')
    expect(severityFor(2)).toBe('mittel')
    expect(severityFor(4)).toBe('hoch')
  })
})

describe('computeFingerprint', () => {
  const base = () => ({
    memories: [
      { name: 'chat-timestamp', hash: 'h1' },
      { name: 'language-german', hash: 'h2' },
    ],
    guards: ['dashboard-guard.mjs', 'timestamp-guard.mjs'],
    reverts: [{ hash: 'r1', subject: 'Revert "x"' }],
    processPoints: [{ num: 290, done: false, title: 'Guard for the retrospective' }],
  })

  it('is stable across list order and repeated calls', () => {
    const a = computeFingerprint(base())
    const shuffled = base()
    shuffled.memories.reverse()
    shuffled.guards.reverse()
    expect(computeFingerprint(shuffled)).toBe(a)
    expect(computeFingerprint(base())).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when any single source changes', () => {
    const a = computeFingerprint(base())

    const editedMemory = base()
    editedMemory.memories[0].hash = 'h1-edited' // an appended escalation
    expect(computeFingerprint(editedMemory)).not.toBe(a)

    const newGuard = base()
    newGuard.guards.push('retro-currency-guard.mjs')
    expect(computeFingerprint(newGuard)).not.toBe(a)

    const newRevert = base()
    newRevert.reverts.push({ hash: 'r2', subject: 'Revert "y"' })
    expect(computeFingerprint(newRevert)).not.toBe(a)

    const tickedPoint = base()
    tickedPoint.processPoints[0].done = true
    expect(computeFingerprint(tickedPoint)).not.toBe(a)
  })

  it('is total on empty/missing input', () => {
    expect(computeFingerprint()).toMatch(/^[0-9a-f]{64}$/)
    expect(computeFingerprint({})).toBe(computeFingerprint())
  })
})

describe('matchingGuards / buildRows', () => {
  it('links a memory to guards sharing a meaningful name token', () => {
    const guards = ['timestamp-guard.mjs', 'timestamp-posttool-hook.mjs', 'dashboard-guard.mjs']
    expect(matchingGuards('chat-timestamp', guards)).toEqual([
      'timestamp-guard.mjs',
      'timestamp-posttool-hook.mjs',
    ])
    expect(matchingGuards('language-german', guards)).toEqual([])
  })
  it('builds one sorted row per memory with measure and status', () => {
    const rows = buildRows({
      memories: [
        { name: 'language-german', description: 'Deutsch im Chat', hash: 'b', escalations: 3 },
        { name: 'chat-timestamp', description: 'Zeitstempel', hash: 'a', escalations: 9 },
      ],
      guards: ['timestamp-guard.mjs'],
    })
    expect(rows.map((r) => r.name)).toEqual(['chat-timestamp', 'language-german'])
    expect(rows[0]).toMatchObject({
      klass: 'Zeitstempel',
      attempts: 9,
      severity: 'hoch',
      measure: 'timestamp-guard.mjs',
      status: '✔ Mechanismus',
    })
    expect(rows[1]).toMatchObject({ severity: 'mittel', measure: '— (Regel/Memory)', status: '◐ Regel' })
  })
})

describe('auto section rendering and splicing', () => {
  const sources = {
    memories: [{ name: 'chat-timestamp', description: 'Zeitstempel', hash: 'a', escalations: 9 }],
    guards: ['timestamp-guard.mjs'],
    reverts: [{ hash: 'r1', subject: 'Revert "x"' }],
    processPoints: [{ num: 290, done: false, title: 'Retrospective guard' }],
  }
  const fp = computeFingerprint(sources)

  it('renders markers, fingerprint and the counts line; extractFingerprint roundtrips', () => {
    const section = renderAutoSection({
      rows: buildRows(sources),
      ...sources,
      fingerprint: fp,
      refreshedStamp: 'Freitag, 24.07.2026, 12:00',
      refreshedIso: '2026-07-24T10:00:00.000Z',
    })
    expect(section.startsWith(AUTO_START)).toBe(true)
    expect(section.endsWith(AUTO_END)).toBe(true)
    expect(section).toContain('| Zeitstempel | 9 | hoch | timestamp-guard.mjs | ✔ Mechanismus |')
    expect(section).toContain('1 Guard-/Hook-Skripte · 1 Revert-/Reapply-Commits · 1 Prozess-/Meta-TASKS-Punkte (davon 1 offen)')
    expect(extractFingerprint(section)).toBe(fp)
  })

  it('replaces ONLY the region between the markers, preserving surrounding prose', () => {
    const doc = `# Titel\n\nProsa davor.\n\n${AUTO_START}\nALTER INHALT\n${AUTO_END}\n\nProsa danach.\n`
    const next = replaceAutoSection(doc, `${AUTO_START}\nNEU\n${AUTO_END}`)
    expect(next).toBe(`# Titel\n\nProsa davor.\n\n${AUTO_START}\nNEU\n${AUTO_END}\n\nProsa danach.\n`)
  })

  it('appends behind a rule when the markers are absent', () => {
    const next = replaceAutoSection('# Titel\n\nNur Prosa.\n', `${AUTO_START}\nNEU\n${AUTO_END}`)
    expect(next).toBe(`# Titel\n\nNur Prosa.\n\n---\n\n${AUTO_START}\nNEU\n${AUTO_END}\n`)
  })

  it('refreshedDoc: null doc yields the skeleton; an existing doc keeps its prose and updates the fingerprint', () => {
    const created = refreshedDoc(null, sources, { refreshedStamp: 's', refreshedIso: 'i' })
    expect(created).toContain('# Retrospektive der Zusammenarbeit')
    expect(extractFingerprint(created)).toBe(fp)

    const grown = {
      ...sources,
      guards: [...sources.guards, 'retro-currency-guard.mjs'],
    }
    const updated = refreshedDoc(created, grown, { refreshedStamp: 's2', refreshedIso: 'i2' })
    expect(updated).toContain('# Retrospektive der Zusammenarbeit')
    expect(extractFingerprint(updated)).toBe(computeFingerprint(grown))
    expect(updated.split(AUTO_START).length).toBe(2) // exactly one auto section
    // idempotent when nothing changed
    expect(refreshedDoc(updated, grown, { refreshedStamp: 's2', refreshedIso: 'i2' })).toBe(updated)
  })

  it('skeletonDoc carries the section verbatim', () => {
    expect(skeletonDoc('SECTION')).toContain('SECTION')
  })
})

describe('evaluateCurrency (the guard decision)', () => {
  const doc = (fp) => `Prosa.\n<!-- RETRO-FINGERPRINT: ${fp} -->\n`
  const fp = computeFingerprint({ guards: ['a-guard.mjs'] })

  it('allows when the recorded fingerprint matches the current one', () => {
    expect(evaluateCurrency({ docText: doc(fp), currentFingerprint: fp })).toBeNull()
  })
  it('blocks with the refresh+review instruction when stale', () => {
    const other = computeFingerprint({ guards: ['a-guard.mjs', 'b-guard.mjs'] })
    const verdict = evaluateCurrency({ docText: doc(fp), currentFingerprint: other })
    expect(verdict).toMatchObject({ decision: 'block' })
    expect(verdict.reason).toContain('scripts/retro-refresh.mjs')
    expect(verdict.reason).toContain('NEW problem class')
  })
  it('blocks when the doc has no recorded fingerprint (never refreshed)', () => {
    const verdict = evaluateCurrency({ docText: 'Prosa ohne Marker.', currentFingerprint: fp })
    expect(verdict).toMatchObject({ decision: 'block' })
    expect(verdict.reason).toContain('no sources fingerprint')
  })
})

describe('collectSources / collectMemories (fs-level, temp fixtures)', () => {
  const dirs = []
  const tempDir = () => {
    const d = mkdtempSync(join(tmpdir(), 'retro-test-'))
    dirs.push(d)
    return d
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('collects only feedback/project/user memories and hashes their content', () => {
    const mem = tempDir()
    writeFileSync(join(mem, 'chat-timestamp.md'), memoryFile('feedback', 'Zeitstempel'))
    writeFileSync(join(mem, 'some-reference.md'), memoryFile('reference'))
    writeFileSync(join(mem, 'MEMORY.md'), '# Memory Index\n(no frontmatter)\n')
    const memories = collectMemories(mem)
    expect(memories.map((m) => m.name)).toEqual(['chat-timestamp'])
    expect(memories[0]).toMatchObject({ description: 'Zeitstempel', escalations: 2 })
    expect(memories[0].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(collectMemories(join(mem, 'does-not-exist'))).toEqual([])
  })

  it('end to end: the fingerprint changes when a memory changes and is stable otherwise', () => {
    const repo = tempDir()
    const mem = tempDir()
    mkdirSync(join(repo, 'scripts'))
    writeFileSync(join(repo, 'scripts', 'demo-guard.mjs'), '// guard')
    writeFileSync(join(repo, 'TASKS.md'), '- [ ] 1. Build the demo guard workflow\n')
    writeFileSync(join(mem, 'rule.md'), memoryFile('feedback'))
    const opts = { repoRoot: repo, memoryDir: mem }
    // no git in the temp repo — a git failure must THROW (the guard wrapper fail-opens)
    expect(() => collectSources(opts)).toThrow()

    // stub the git axis out by comparing computeFingerprint over collected parts
    const partsA = {
      memories: collectMemories(mem),
      guards: ['demo-guard.mjs'],
      reverts: [],
      processPoints: processTaskPoints('- [ ] 1. Build the demo guard workflow\n'),
    }
    const a = computeFingerprint(partsA)
    expect(computeFingerprint({ ...partsA, memories: collectMemories(mem) })).toBe(a)

    writeFileSync(join(mem, 'rule.md'), memoryFile('feedback', 'Eine Regel — eskaliert am 22.07.'))
    expect(computeFingerprint({ ...partsA, memories: collectMemories(mem) })).not.toBe(a)
  })

  // Windows-only: the harness path munging this pins is the Windows form
  // (`c--Users-Patri-…`), and `resolve()` of a Windows literal on a POSIX CI
  // runner prepends the runner cwd, so the assertion only holds on win32 — which
  // is the only platform the retrospective mechanism actually runs on.
  it.skipIf(process.platform !== 'win32')(
    'defaultMemoryDir munges the repo path like the harness (drive lowered, separators to dashes)',
    () => {
      const dir = defaultMemoryDir('C:\\Users\\Patri\\Documents\\Developing\\hoa').replace(/\\/g, '/')
      expect(dir).toMatch(/\/\.claude\/projects\/c--Users-Patri-Documents-Developing-hoa\/memory$/)
    },
  )
})
