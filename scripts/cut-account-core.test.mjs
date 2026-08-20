// The cut account of point 757 (scripts/cut-account-core.mjs), plus the real
// document: the account only does its job if it holds TODAY, so the shipped
// docs/document-cut-757.md is judged here against the real filesystem and the
// really wired hook chains, not only against synthetic input.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import {
  ACCOUNTS,
  CUT_SOURCES,
  parseCutAccount,
  evaluateCutAccount,
  wiredGuards,
} from './cut-account-core.mjs'

const ROOT = resolve(process.cwd())
const ACCOUNT_PATH = resolve(ROOT, 'docs/document-cut-757.md')
const MEMORY_PATH = resolve(homedir(), '.claude', 'projects', '-workspace-hoa', 'memory', 'MEMORY.md')

const line = (where, rule, account, dest) => `- \`${where}\` :: ${rule} :: ${account} -> ${dest}`

describe('parseCutAccount', () => {
  it('reads the three fields of an account line', () => {
    const [e] = parseCutAccount(line('CLAUDE.md §6', 'the lease is renewed before each call', 'MOVED', 'docs/batch-autonomy.md'))
    expect(e).toMatchObject({
      source: 'CLAUDE.md',
      where: 'CLAUDE.md §6',
      rule: 'the lease is renewed before each call',
      account: 'MOVED',
      destination: 'docs/batch-autonomy.md',
    })
  })

  it('ignores prose, headings and half-written lines', () => {
    const text = ['# Heading', 'ordinary prose about the cut', '- `CLAUDE.md §6` :: no account yet', ''].join('\n')
    expect(parseCutAccount(text)).toEqual([])
  })

  it('is total on missing input', () => {
    expect(parseCutAccount(undefined)).toEqual([])
    expect(parseCutAccount('')).toEqual([])
  })
})

describe('evaluateCutAccount', () => {
  const known = { files: new Set(['docs/batch-autonomy.md']), guards: new Set(['board-first-guard']) }

  it('passes a MOVED entry whose destination exists', () => {
    const entries = parseCutAccount(line('CLAUDE.md §6', 'the boundary is two-phase', 'MOVED', 'docs/batch-autonomy.md'))
    expect(evaluateCutAccount(entries, known).block).toBe(false)
  })

  it('FAILS a MOVED entry whose destination does not exist — the point 757 case', () => {
    const entries = parseCutAccount(line('CLAUDE.md §6', 'the boundary is two-phase', 'MOVED', 'docs/nowhere.md'))
    const v = evaluateCutAccount(entries, known)
    expect(v.block).toBe(true)
    expect(v.findings[0].why).toMatch(/does not exist/)
  })

  it('passes a COVERED entry naming a WIRED guard', () => {
    const entries = parseCutAccount(line('CLAUDE.md §7.2', 'the board is published first', 'COVERED', 'board-first-guard'))
    expect(evaluateCutAccount(entries, known).block).toBe(false)
  })

  it('FAILS a COVERED entry naming a guard that hangs in no chain', () => {
    const entries = parseCutAccount(line('CLAUDE.md §7.2', 'the board is published first', 'COVERED', 'imaginary-guard'))
    const v = evaluateCutAccount(entries, known)
    expect(v.block).toBe(true)
    expect(v.findings[0].why).toMatch(/not wired/)
  })

  it('accepts the .mjs suffix and a parenthesised chain note on a guard', () => {
    const entries = parseCutAccount(line('CLAUDE.md §6', 'a rule', 'COVERED', 'board-first-guard.mjs (PreToolUse)'))
    expect(evaluateCutAccount(entries, known).block).toBe(false)
  })

  it('accepts a MOVED destination that names a section inside the file', () => {
    const entries = parseCutAccount(line('CLAUDE.md §6', 'a rule', 'MOVED', 'docs/batch-autonomy.md §3'))
    expect(evaluateCutAccount(entries, known).block).toBe(false)
  })

  it('FAILS an unknown account word', () => {
    const entries = parseCutAccount(line('CLAUDE.md §6', 'a rule', 'DELETED', 'because it felt long'))
    const v = evaluateCutAccount(entries, known)
    expect(v.block).toBe(true)
    expect(v.findings[0].why).toMatch(/not one of/)
  })

  it('FAILS a DROPPED entry with no dated user ruling', () => {
    const entries = parseCutAccount(line('MEMORY.md', 'an entry', 'DROPPED', 'the user agreed'))
    expect(evaluateCutAccount(entries, known).findings[0].why).toMatch(/dated user ruling/)
  })

  it('passes a DROPPED entry that quotes its dated ruling', () => {
    const entries = parseCutAccount(line('MEMORY.md', 'an entry', 'DROPPED', 'user ruling 20.08.2026: only this project reads it'))
    expect(evaluateCutAccount(entries, known).block).toBe(false)
  })

  it('FAILS a source that is not one of the cut documents', () => {
    const entries = parseCutAccount(line('design.md §3', 'a rule', 'MOVED', 'docs/batch-autonomy.md'))
    expect(evaluateCutAccount(entries, known).findings[0].why).toMatch(/names no cut document/)
  })

  it('FAILS the same rule accounted for twice', () => {
    const one = line('CLAUDE.md §6', 'a rule', 'MOVED', 'docs/batch-autonomy.md')
    const v = evaluateCutAccount(parseCutAccount(`${one}\n${one}`), known)
    expect(v.block).toBe(true)
    expect(v.findings.some((f) => /twice/.test(f.why))).toBe(true)
  })

  it('is total on missing input', () => {
    expect(evaluateCutAccount(undefined).block).toBe(false)
    expect(evaluateCutAccount([], undefined).block).toBe(false)
  })
})

describe('wiredGuards', () => {
  it('collects guard names out of every hook chain', () => {
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ command: 'node scripts/model-guard.mjs' }, { command: 'node "$X/scripts/prep-guard.mjs" --x' }] }],
        PreToolUse: [{ hooks: [{ command: 'node scripts/board-first-guard.mjs' }] }],
      },
    }
    expect([...wiredGuards(settings)].sort()).toEqual(['board-first-guard', 'model-guard', 'prep-guard'])
  })

  it('is total on missing input', () => {
    expect(wiredGuards(undefined).size).toBe(0)
    expect(wiredGuards({}).size).toBe(0)
  })
})

// THE REAL ACCOUNT. This is the case point 757 asked for: it fails when a rule
// named in the account has no destination — no such file, or a guard wired
// nowhere. It is deliberately not a guard in the Stop chain: the account is
// written once with the cut and then only edited when a document is cut again,
// so the everyday layer is the right home for it.
//
// WHEN THE ACCOUNT BECOMES MANDATORY, and why it is tied to the budget rather
// than to a date: the account exists to explain a cut, so it is owed exactly
// when a cut has been BANKED. Banking is what lowering the CLAUDE.md ceiling in
// scripts/doc-budget-core.mjs means — point 757's own spec demands that step,
// because a ceiling left at the old figure simply refills. So the ceiling is the
// trigger: while it still stands at the pre-cut 787 lines the account may be
// absent (the cut is decided but not executed), and the moment it drops the
// account must exist and hold. That link cannot be gamed the way a skip-if-
// missing check can — deleting the account no longer makes this pass, it only
// moves the failure to the entry that is missing.
const PRE_CUT_CLAUDE_MD_LINES = 787

describe('docs/document-cut-757.md — the shipped account', () => {
  const text = existsSync(ACCOUNT_PATH) ? readFileSync(ACCOUNT_PATH, 'utf8') : ''
  const entries = parseCutAccount(text)
  const banked = (() => {
    const src = readFileSync(resolve(ROOT, 'scripts/doc-budget-core.mjs'), 'utf8')
    const claude = /path:\s*'CLAUDE\.md'[\s\S]*?maxLines:\s*(\d+)/.exec(src)
    return claude ? Number(claude[1]) < PRE_CUT_CLAUDE_MD_LINES : false
  })()

  it('exists once the cut is banked in the CLAUDE.md budget', () => {
    if (!banked) {
      expect(entries.length).toBe(entries.length) // decided, not yet executed
      return
    }
    expect(existsSync(ACCOUNT_PATH)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('names only the three always-loaded documents as sources', () => {
    for (const e of entries) expect(CUT_SOURCES).toContain(e.source)
  })

  it('gives every entry one of the three accounts', () => {
    for (const e of entries) expect(ACCOUNTS).toContain(e.account)
  })

  it('accounts for every executed union entry and only omits ruled-out cuts', () => {
    const union = JSON.parse(readFileSync(resolve(ROOT, 'docs/blind-757/union.json'), 'utf8'))
    const whollyWaiting = new Set(['U6', 'U48', 'U55', 'U65'])
    const executed = new Set(union.entries.filter((e) => !whollyWaiting.has(e.id)).map((e) => e.id))
    // U45 remains because its freeze half executes while its graphics-detail
    // half waits for the user.
    const accounted = new Set(entries.flatMap((e) => e.rule.match(/\bU\d+\b/g) ?? []))
    expect([...accounted].sort()).toEqual([...executed].sort())
  })

  it('keeps every moved memory-topic hook reachable from the index', () => {
    const memory = readFileSync(MEMORY_PATH, 'utf8')
    const hooks = entries.filter(
      (e) => e.source === 'MEMORY.md' && /\bhooks?\b/i.test(e.rule) && /\/memory\/[^/]+\.md$/.test(e.destination),
    )
    expect(hooks.length).toBeGreaterThan(0)
    for (const hook of hooks) {
      const topic = hook.destination.split('/').at(-1)
      expect(memory).toContain(`(${topic})`)
    }
  })

  it('has a real destination behind every account', () => {
    const settings = JSON.parse(readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8'))
    const files = new Set()
    for (const e of entries) {
      if (e.account !== 'MOVED') continue
      const path = e.destination.split(/\s+§|\s+#/)[0].replace(/^`|`$/g, '').trim()
      const full = path.startsWith('~/')
        ? resolve(homedir(), path.slice(2))
        : path.startsWith('/')
          ? path
          : resolve(ROOT, path)
      if (existsSync(full)) files.add(path)
    }
    const verdict = evaluateCutAccount(entries, { files, guards: wiredGuards(settings) })
    expect(verdict.findings.map((f) => f.why)).toEqual([])
    expect(verdict.block).toBe(false)
  })
})
