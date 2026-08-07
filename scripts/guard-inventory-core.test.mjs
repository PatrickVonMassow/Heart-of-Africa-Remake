// The inventory's pure parts, proven on constructed corpora.
//
// Every case here is a shape the real audit met: a hook table flattened out of
// the nested settings.json, a hook line naming a script nobody shipped, an
// enforcer nothing calls, a wired script whose name no by-name selector
// reaches, and a repo whose memory resolves to more than one directory.
import { describe, it, expect } from 'vitest'
import {
  buildInventory,
  formatInventory,
  formatScriptTable,
  memoryDirVariants,
  memoryReport,
  parseHookTable,
  scriptOfCommand,
  scriptsInGitHooks,
} from './guard-inventory-core.mjs'

const settings = {
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'node scripts/a-guard.mjs' }, { command: 'node scripts/b-guard.mjs' }] }],
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ command: 'node scripts/c-guard.mjs' }] },
      { matcher: 'PowerShell', hooks: [{ command: 'node scripts/c-guard.mjs' }] },
    ],
    SessionStart: [{ hooks: [{ command: 'node scripts/d-hook.mjs' }] }],
  },
}

describe('scriptOfCommand', () => {
  it('extracts the script a hook command runs', () => {
    expect(scriptOfCommand('node scripts/model-guard.mjs')).toBe('model-guard.mjs')
    expect(scriptOfCommand('node scripts\\model-guard.mjs')).toBe('model-guard.mjs')
  })
  it('answers null for anything that is not such a call', () => {
    expect(scriptOfCommand('echo hi')).toBeNull()
    expect(scriptOfCommand(undefined)).toBeNull()
  })
})

describe('parseHookTable', () => {
  it('flattens every event/matcher/command into one row each', () => {
    const rows = parseHookTable(settings)
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.script)).toEqual([
      'd-hook.mjs', // SessionStart first: the table follows firing order, not JSON order
      'c-guard.mjs',
      'c-guard.mjs',
      'a-guard.mjs',
      'b-guard.mjs',
    ])
    expect(rows.filter((r) => r.script === 'c-guard.mjs').map((r) => r.matcher)).toEqual(['Bash', 'PowerShell'])
  })

  it('keeps a command that runs no script, rather than dropping it silently', () => {
    const rows = parseHookTable({ hooks: { Stop: [{ hooks: [{ command: 'pwsh -c whatever' }] }] } })
    expect(rows).toEqual([{ event: 'Stop', matcher: '', command: 'pwsh -c whatever', script: null }])
  })

  it('reports an event the harness gained after this module was written', () => {
    const rows = parseHookTable({ hooks: { Notification: [{ hooks: [{ command: 'node scripts/x-guard.mjs' }] }] } })
    expect(rows).toEqual([
      { event: 'Notification', matcher: '', command: 'node scripts/x-guard.mjs', script: 'x-guard.mjs' },
    ])
  })

  it('survives absent, empty and malformed settings', () => {
    expect(parseHookTable(null)).toEqual([])
    expect(parseHookTable({})).toEqual([])
    expect(parseHookTable({ hooks: { Stop: 'nope' } })).toEqual([])
    expect(parseHookTable({ hooks: { Stop: [{ hooks: [{}] }] } })).toEqual([])
  })
})

describe('scriptsInGitHooks', () => {
  it('collects every script an active git hook invokes', () => {
    const set = scriptsInGitHooks(['exec node scripts/commit-scope-guard.mjs', 'node scripts/pre-push-gate.mjs "$@"'])
    expect([...set].sort()).toEqual(['commit-scope-guard.mjs', 'pre-push-gate.mjs'])
  })
  it('is empty when no hooks path is active — which is how a gate goes dead', () => {
    expect(scriptsInGitHooks([]).size).toBe(0)
  })
})

describe('buildInventory', () => {
  const files = ['a-guard.mjs', 'b-guard.mjs', 'c-guard.mjs', 'c-guard-core.mjs', 'c-guard-core.test.mjs', 'd-hook.mjs']

  it('records where every enforcer is wired', () => {
    const inv = buildInventory({ settings, scriptFiles: files })
    const c = inv.scripts.find((s) => s.script === 'c-guard.mjs')
    expect(c.wiredIn).toEqual(['PreToolUse(Bash)', 'PreToolUse(PowerShell)'])
    expect(c.tested).toBe(true)
    expect(inv.scripts.find((s) => s.script === 'a-guard.mjs').tested).toBe(false)
    expect(inv.counts.hooks).toBe(5)
    expect(inv.counts.byEvent).toEqual({ Stop: 2, PreToolUse: 2, SessionStart: 1 })
    expect(inv.findings).toEqual([])
  })

  it('flags a hook line naming a script that is not in the tree', () => {
    const inv = buildInventory({ settings, scriptFiles: files.filter((f) => f !== 'b-guard.mjs') })
    expect(inv.counts.dangling).toBe(1)
    expect(inv.findings[0]).toMatchObject({ kind: 'dangling', script: 'b-guard.mjs' })
  })

  it('flags an enforcer nothing calls, and clears it once a git hook does', () => {
    const withOrphan = [...files, 'orphan-gate.mjs']
    const dead = buildInventory({ settings, scriptFiles: withOrphan })
    expect(dead.counts.orphans).toBe(1)
    expect(dead.findings.find((f) => f.kind === 'orphan').script).toBe('orphan-gate.mjs')

    const wired = buildInventory({
      settings,
      scriptFiles: withOrphan,
      gitHookTexts: ['exec node scripts/orphan-gate.mjs'],
    })
    expect(wired.counts.orphans).toBe(0)
    expect(wired.scripts.find((s) => s.script === 'orphan-gate.mjs').wiredIn).toEqual(['git-hook'])
  })

  it('flags a WIRED script no by-name selector reaches', () => {
    const inv = buildInventory({
      settings: { hooks: { Stop: [{ hooks: [{ command: 'node scripts/dashboard-sync.mjs' }] }] } },
      scriptFiles: ['dashboard-sync.mjs'],
    })
    expect(inv.counts.unconventional).toBe(1)
    expect(inv.findings[0]).toMatchObject({ kind: 'unconventional', script: 'dashboard-sync.mjs' })
    expect(inv.scripts.find((s) => s.script === 'dashboard-sync.mjs').enforcerNamed).toBe(false)
  })

  it('never mistakes a core or a test for the enforcer beside it', () => {
    const inv = buildInventory({ settings, scriptFiles: files })
    expect(inv.scripts.map((s) => s.script)).not.toContain('c-guard-core.mjs')
    expect(inv.scripts.map((s) => s.script)).not.toContain('c-guard-core.test.mjs')
  })
})

describe('memoryDirVariants', () => {
  it('offers the trailing-dash and lowercased forms that the two resolvers disagree on', () => {
    const v = memoryDirVariants('/workspace/hoa/')
    expect(v).toContain('-workspace-hoa')
    expect(v).toContain('-workspace-hoa-')
  })

  it('resolves a worktree back to the checkout it belongs to', () => {
    const v = memoryDirVariants('/workspace/hoa/.claude/worktrees/agent-abc/')
    expect(v).toContain('-workspace-hoa')
    expect(v).toContain('-workspace-hoa--claude-worktrees-agent-abc-')
  })

  it('covers the drive-letter case both resolvers spell differently', () => {
    const v = memoryDirVariants('C:/Users/x/hoa/')
    expect(v).toContain('C--Users-x-hoa-')
    expect(v).toContain('c--Users-x-hoa')
  })
})

describe('memoryReport', () => {
  const now = Date.parse('2026-08-07T00:00:00Z')
  const day = 86_400_000
  const entries = [
    { name: 'MEMORY.md', mtimeMs: now, bytes: 1000 },
    { name: 'fresh.md', mtimeMs: now - 2 * day, bytes: 500 },
    { name: 'old.md', mtimeMs: now - 40 * day, bytes: 4000 },
    { name: 'notes.txt', mtimeMs: now, bytes: 99 },
  ]

  it('separates the index from the memories and ages the rest', () => {
    const r = memoryReport(entries, { now })
    expect(r.count).toBe(2)
    expect(r.hasIndex).toBe(true)
    expect(r.indexBytes).toBe(1000)
    expect(r.bytes).toBe(4500)
    expect(r.stale.map((e) => e.name)).toEqual(['old.md'])
    expect(r.largest[0].name).toBe('old.md')
  })

  it('reports a directory holding a carrier but no index — the split this pass found', () => {
    const r = memoryReport([{ name: 'findings-carrier.md', mtimeMs: now, bytes: 60 }], { now })
    expect(r.hasIndex).toBe(false)
    expect(r.count).toBe(1)
  })

  it('is empty, not thrown, on nothing at all', () => {
    expect(memoryReport(undefined).count).toBe(0)
    expect(memoryReport([null, { bytes: 1 }]).count).toBe(0)
  })
})

describe('formatting', () => {
  const inv = buildInventory({ settings, scriptFiles: ['a-guard.mjs', 'b-guard.mjs', 'c-guard.mjs', 'd-hook.mjs'] })

  it('stays small: counts, then only what needs a decision', () => {
    const out = formatInventory(inv, [
      { path: '/m', exists: true, report: memoryReport([{ name: 'x.md', mtimeMs: Date.now(), bytes: 10 }]) },
    ])
    expect(out.split('\n').length).toBeLessThan(15)
    expect(out).toContain('hooks wired: 5')
    expect(out).toContain('no wiring findings.')
  })

  it('warns when more than one memory directory resolves', () => {
    const dir = { path: '/m', exists: true, report: memoryReport([]) }
    expect(formatInventory(inv, [dir, { ...dir, path: '/m2' }])).toContain('more than one memory directory')
  })

  it('lists every script with its wiring only on demand', () => {
    expect(formatScriptTable(inv)).toContain('a-guard.mjs')
    expect(formatScriptTable(inv)).toContain('PreToolUse(Bash)')
  })
})
