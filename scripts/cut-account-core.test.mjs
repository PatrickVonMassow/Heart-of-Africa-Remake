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
  FLOOR_KINDS,
  parseCutAccount,
  parseFloorReadings,
  evaluateCutAccount,
  accountDestinationFault,
  expandDestination,
  isExternalDestination,
  userTreeRootOf,
  wiredGuards,
} from './cut-account-core.mjs'
import { DOC_BUDGETS, measure } from './doc-budget-core.mjs'

const ROOT = resolve(process.cwd())
const ACCOUNT_PATH = resolve(ROOT, 'docs/document-cut-757.md')
const MEMORY_DIR = resolve(homedir(), '.claude', 'projects', '-workspace-hoa', 'memory')
const MEMORY_PATH = resolve(MEMORY_DIR, 'MEMORY.md')

// Two of the three cut documents live in the USER's home, outside any checkout,
// so a CI runner has no `~/.claude` at all and cannot see a destination that
// points there. Judging those against the filesystem made this suite pass here
// and fail on the runner. The split below keeps the strict check exactly where
// it can be trusted — a repository destination is asserted everywhere, an
// external one only on a machine that carries the user-level tree — so a typo
// is still caught in the batch, which is where these documents are read.
const fullPath = (path) => {
  const expanded = expandDestination(path, homedir())
  return expanded.startsWith('/') ? expanded : resolve(ROOT, expanded)
}
// Absence is evidence wherever this project's user-level memory directory is
// present, and nowhere else. The anchor is that ONE fixed directory on purpose:
// keying on `~/.claude` in general made an unrelated, partly populated home
// fail, and keying on the destination's OWN parent let a misspelled directory
// component excuse itself — the very typo the check exists to catch. A fixed
// anchor cannot be moved by the string being judged. Anything outside the user
// tree, a repository path included, is judged unconditionally.
//
// RESIDUAL, and it is irreducible: on a machine without that directory — every
// CI runner — no `~/…` destination is checked at all. This is a REFUSED READ,
// not a missed write: the two documents concerned are the user's and cannot be
// checked in. The batch machine, which is where the account is read and where a
// cut is made, carries the directory and checks every one of them.
// Every `~` destination, not only those under `.claude`: `~/missing.md` is as
// unreadable on a foreign machine as the rest, and gating it differently made
// the code say something other than the residual above.
const judgeableWith = (path, anchorPresent) => {
  const p = String(path ?? '').trim()
  return !(p === '~' || p.startsWith('~/')) || anchorPresent
}
const judgeable = (path) => judgeableWith(path, existsSync(MEMORY_DIR))

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

  it('separates a destination this checkout can judge from one it cannot', () => {
    expect(isExternalDestination('docs/batch-owner-runbook.md', ROOT)).toBe(false)
    expect(isExternalDestination(`${ROOT}/docs/tts-architecture.md`, ROOT)).toBe(false)
    expect(isExternalDestination(ROOT, ROOT)).toBe(false)
    expect(isExternalDestination('~/.claude/projects/-workspace-hoa/memory/fable-sparingly.md', ROOT)).toBe(true)
    expect(isExternalDestination('/home/node/.claude/projects/-workspace-hoa-/memory/findings-carrier.md', ROOT)).toBe(true)
    // A sibling directory whose name merely starts with the root's is outside it.
    expect(isExternalDestination(`${ROOT}-other/docs/x.md`, ROOT)).toBe(true)
    // …and a path that shares the prefix but climbs out of it resolves outside.
    expect(isExternalDestination(`${ROOT}/../outside/x.md`, ROOT)).toBe(true)
    expect(isExternalDestination('../outside/x.md', ROOT)).toBe(true)
    expect(isExternalDestination('./docs/x.md', ROOT)).toBe(false)
    expect(isExternalDestination(`${ROOT}//docs//x.md`, ROOT)).toBe(false)
    expect(isExternalDestination(`${ROOT}/`, ROOT)).toBe(false)
    // Total on the empty and unusable cases, like the rest of this core.
    expect(isExternalDestination('', ROOT)).toBe(false)
    expect(isExternalDestination(undefined, ROOT)).toBe(false)
    // Without a root nothing can be placed, so it counts as external — the side
    // that refuses to report a loss it cannot see.
    expect(isExternalDestination('/anywhere/at/all.md')).toBe(true)
    // A root of `/` contains everything, so nothing is outside it.
    expect(isExternalDestination('/anywhere/at/all.md', '/')).toBe(false)
  })

  it('excuses only a destination written against this machine\'s own user tree', () => {
    const HOME = '/home/node'
    expect(userTreeRootOf('~/.claude/projects/x/memory/a.md', HOME)).toBe('/home/node/.claude')
    expect(userTreeRootOf('~/.claude', HOME)).toBe('/home/node/.claude')
    // Outside `.claude` nothing is excused, however it is written.
    expect(userTreeRootOf('~/missing.md', HOME)).toBe('')
    expect(userTreeRootOf('~', HOME)).toBe('')
    // A machine-absolute path earns no excuse — it cannot be told from a typo
    // of one, which is why the account refuses the form outright.
    expect(userTreeRootOf('/home/node/.claude/projects/x/memory/b.md', HOME)).toBe('')
    expect(userTreeRootOf('/home/runnre/.claude/x.md', HOME)).toBe('')
    expect(userTreeRootOf('/missing/file.md', HOME)).toBe('')
    expect(userTreeRootOf('docs/batch-owner-runbook.md', HOME)).toBe('')
    expect(userTreeRootOf('', HOME)).toBe('')
    expect(userTreeRootOf(undefined, HOME)).toBe('')
    // `.claude` must be a whole segment, not a prefix of one.
    expect(userTreeRootOf('~/.claudex/a.md', HOME)).toBe('')
    // Without a home there is nothing to expand a `~` against.
    expect(userTreeRootOf('~/.claude/a.md', '')).toBe('')
  })

  it('refuses a destination that names a machine instead of a place', () => {
    expect(accountDestinationFault('docs/batch-owner-runbook.md', ROOT)).toBe('')
    expect(accountDestinationFault('~/.claude/projects/x/memory/a.md', ROOT)).toBe('')
    expect(accountDestinationFault('~', ROOT)).toBe('')
    expect(accountDestinationFault('/home/node/.claude/x.md', ROOT)).toMatch(/names a machine/)
    expect(accountDestinationFault('/anywhere/at/all.md', ROOT)).toMatch(/names a machine/)
    // Absolute stays a fault even when it names THIS checkout: accepting it
    // would pass here and fail wherever the root differs.
    expect(accountDestinationFault(`${ROOT}/docs/x.md`, ROOT)).toMatch(/names a machine/)
    expect(accountDestinationFault('../outside/x.md', ROOT)).toMatch(/climbs through/)
    // A climbing segment collapses before the filesystem sees it, so the file it
    // names is never tested — `docs/missing.md/..` asks about `docs`.
    expect(accountDestinationFault('docs/definitely-missing.md/..', ROOT)).toMatch(/climbs through/)
    expect(accountDestinationFault('docs/./x.md', ROOT)).toMatch(/climbs through/)
    expect(accountDestinationFault('~/.claude/definitely-missing/..', ROOT)).toMatch(/climbs through/)
    expect(accountDestinationFault('', ROOT)).toMatch(/empty/)
  })

  it('judges by the fixed anchor, both when it is there and when it is not', () => {
    // Present: everything is judged, so a misspelled component cannot excuse
    // itself by naming a directory that happens not to exist.
    expect(judgeableWith('~/.claude/projects/-workspace-hoa/memmory/x.md', true)).toBe(true)
    expect(judgeableWith('~/missing.md', true)).toBe(true)
    expect(judgeableWith('~', true)).toBe(true)
    // Absent: no `~` destination at all is judged — exactly the stated residual,
    // and no more than it.
    expect(judgeableWith('~/.claude/projects/-workspace-hoa/memory/x.md', false)).toBe(false)
    expect(judgeableWith('~/missing.md', false)).toBe(false)
    expect(judgeableWith('~', false)).toBe(false)
    // A repository destination is never excused, with or without the anchor.
    expect(judgeableWith('docs/nowhere.md', false)).toBe(true)
    expect(judgeableWith('docs/nowhere.md', true)).toBe(true)
    expect(judgeableWith('', false)).toBe(true)
    expect(judgeableWith(undefined, false)).toBe(true)
  })

  it('expands a destination the same way it classifies one', () => {
    const HOME = '/home/node'
    expect(expandDestination('~/.claude/x.md', HOME)).toBe('/home/node/.claude/x.md')
    // The escape a review found: a doubled separator classified against the user
    // tree while resolving to a filesystem-rooted path.
    expect(expandDestination('~//.claude/x.md', HOME)).toBe('/home/node/.claude/x.md')
    expect(userTreeRootOf('~//.claude/x.md', HOME)).toBe('/home/node/.claude')
    expect(expandDestination('~', HOME)).toBe(HOME)
    expect(expandDestination('docs/x.md', HOME)).toBe('docs/x.md')
    expect(expandDestination('', HOME)).toBe('')
    expect(expandDestination(undefined, HOME)).toBe('')
    expect(expandDestination('~/.claude/x.md', '')).toBe('')
  })

  it('has no machine-absolute destination in the shipped account', () => {
    for (const e of entries) {
      const path = e.destination.split(/\s+§|\s+#/)[0].replace(/^`|`$/g, '').trim()
      expect([path, accountDestinationFault(path, ROOT)]).toEqual([path, ''])
    }
  })

  // The index lives in the user's home, so a runner without that tree cannot
  // read it — a REFUSED READ, not a missed write. The shape of every hook
  // destination IS judgeable anywhere, so it is judged here and the reachability
  // case below adds the real check on every machine that carries the index,
  // which is every machine that runs the batch.
  // Selected by SOURCE and rule alone. Filtering by the destination's shape and
  // then asserting that shape proves nothing: a malformed one would drop out of
  // the set it was meant to fail.
  const memoryHooks = () => entries.filter((e) => e.source === 'MEMORY.md' && /\bhooks?\b/i.test(e.rule))

  it('keeps every moved memory-topic hook well formed even where the index cannot be read', () => {
    const hooks = memoryHooks()
    expect(hooks.length).toBeGreaterThan(0)
    for (const hook of hooks) {
      // A hook either moved into a repository document — the owner runbook took
      // thirteen of them — or into its own topic file under the user's memory
      // directory. Both are judgeable forms; a machine-absolute path is not.
      expect([hook.rule, hook.account]).toEqual([hook.rule, 'MOVED'])
      const path = hook.destination.split(/\s+§|\s+#/)[0].replace(/^`|`$/g, '').trim()
      expect([path, accountDestinationFault(path, ROOT)]).toEqual([path, ''])
      expect(path).toMatch(/^(?:docs\/[a-z0-9-]+\.md|~\/[^\s]*\/memory\/(?:[a-z0-9-]+\.md)?)$/)
    }
  })

  // A missing index may only excuse this case where the index CANNOT be there —
  // that is, where the memory DIRECTORY itself is absent. Keying the skip on the
  // index file let a directory that exists without its index skip too, which is
  // precisely the loss worth catching; keying it on `~/.claude` in general made
  // an unrelated, partly populated home fail for no reason.
  it('is only unable to read the memory index where the memory directory is absent', () => {
    if (!existsSync(MEMORY_PATH)) expect(existsSync(MEMORY_DIR)).toBe(false)
  })

  it.skipIf(!existsSync(MEMORY_DIR))('keeps every moved memory-topic hook reachable from the index', () => {
    const memory = readFileSync(MEMORY_PATH, 'utf8')
    const hooks = memoryHooks().filter((e) => /\/memory\/[^/]+\.md$/.test(e.destination))
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
      const present = judgeable(path) ? existsSync(fullPath(path)) : true
      if (present) files.add(path)
    }
    const verdict = evaluateCutAccount(entries, { files, guards: wiredGuards(settings) })
    expect(verdict.findings.map((f) => f.why)).toEqual([])
    expect(verdict.block).toBe(false)
  })
})

// THE FLOOR READINGS (point 761). Point 757 claimed a saving by setting an
// owner-session baseline against a SUBAGENT reading, which is not the same kind
// of session. These cases pin the corrected account: both floors present, each
// re-derivable from the transcript it names, and the owner/subagent gap stated
// so a reader sees what the SessionStart hook and the owner runbook cost.
describe('parseFloorReadings', () => {
  const doc = (s) => parseFloorReadings(s)

  it('reads kind, date, transcript and the three summands', () => {
    const [r] = doc('FLOOR owner :: 20.08.2026 :: `~/t.jsonl` :: `2 + 22,579 + 21,034 = 43,615`')
    expect(r).toMatchObject({
      kind: 'owner',
      date: '20.08.2026',
      transcript: '~/t.jsonl',
      summands: [2, 22579, 21034],
      stated: 43615,
      adds: true,
    })
  })

  it('reads a reading that wraps after a separator', () => {
    expect(doc('FLOOR subagent :: 20.08.2026 :: `~/a.jsonl`\n:: `2 + 1 + 1 = 4`')).toHaveLength(1)
  })

  it('reports a sum that does not add up rather than trusting it', () => {
    // This is what a figure copied from another document looks like.
    const [r] = doc('FLOOR owner :: 20.08.2026 :: `~/t.jsonl` :: `1 + 1 + 1 = 99`')
    expect(r.adds).toBe(false)
    expect(r.total).toBe(3)
  })

  it('ignores prose and is total on missing input', () => {
    expect(doc('The floor fell a lot.')).toEqual([])
    expect(doc(undefined)).toEqual([])
  })

  it('does not swallow a cut-account line, and cut parsing does not swallow a floor', () => {
    const both = [
      'FLOOR owner :: 20.08.2026 :: `~/t.jsonl` :: `2 + 1 + 1 = 4`',
      '- `CLAUDE.md §1` :: U1 something :: DROPPED -> user ruling 20.08.2026',
    ].join('\n')
    expect(doc(both)).toHaveLength(1)
    expect(parseCutAccount(both)).toHaveLength(1)
  })
})

describe('docs/document-cut-757.md — the measured floors', () => {
  const text = existsSync(ACCOUNT_PATH) ? readFileSync(ACCOUNT_PATH, 'utf8') : ''
  const readings = parseFloorReadings(text)
  const byKind = new Map(readings.map((r) => [r.kind, r]))

  it('carries exactly one floor for each session kind', () => {
    expect([...byKind.keys()].sort()).toEqual([...FLOOR_KINDS].sort())
    expect(readings).toHaveLength(FLOOR_KINDS.length)
  })

  it('gives every floor a date, a transcript path and three summands that add up', () => {
    for (const r of readings) {
      expect(r.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
      expect(r.transcript).toMatch(/\.jsonl$/)
      expect(r.summands).toHaveLength(3)
      expect(r.adds).toBe(true)
    }
  })

  // The whole point of recording BOTH is that they are not interchangeable, so
  // an account that let them coincide would have lost the distinction it exists
  // to make. The owner carries strictly more at startup, never less.
  it('puts the owner floor above the subagent floor', () => {
    expect(byKind.get('owner').stated).toBeGreaterThan(byKind.get('subagent').stated)
  })

  it('states the owner-minus-subagent gap once, in words', () => {
    const gap = byKind.get('owner').stated - byKind.get('subagent').stated
    expect(gap).toBe(4078)
    // The phrase is prose and wraps at the margin, so it is matched against the
    // paragraph with whitespace normalised, not against a single line.
    const flowed = text.replace(/\s+/g, ' ')
    const inWords = flowed.match(/four thousand and seventy-eight/g) ?? []
    expect(inWords).toHaveLength(1)
  })

  // Where the transcript is still on this machine the figure is not merely
  // well-formed, it is re-derived. On any other machine the file is absent and
  // the case is a refused read, exactly like the external destinations above.
  it('re-derives each floor from its own transcript where that transcript exists', () => {
    let checked = 0
    for (const r of readings) {
      const path = fullPath(r.transcript)
      if (!existsSync(path)) continue
      const first = readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .find((o) => o?.type === 'assistant' && o?.message?.usage)
      expect(first, `no assistant message with usage in ${r.transcript}`).toBeTruthy()
      const u = first.message.usage
      expect([
        u.input_tokens ?? 0,
        u.cache_read_input_tokens ?? 0,
        u.cache_creation_input_tokens ?? 0,
      ]).toEqual(r.summands)
      checked++
    }
    // On the batch machine — the one anchor this suite trusts, as above — at
    // least one transcript is present, so a vacuous pass there would mean the
    // re-derivation never ran. Elsewhere both files are absent by construction.
    if (existsSync(MEMORY_DIR)) expect(checked).toBeGreaterThan(0)
  })
})

// THE CEILINGS, against the LANDED files rather than the pre-merge ones. Point
// 761 asks for that confirmation because the budgets were written from figures
// measured before the merge, and two of them turned out to be off by a line and
// ten words — enough to leave MEMORY.md sitting exactly on its word ceiling.
describe('docs/document-cut-757.md — the ceilings table', () => {
  const text = existsSync(ACCOUNT_PATH) ? readFileSync(ACCOUNT_PATH, 'utf8') : ''
  // The global file shares its BASENAME with the project one, so a row cannot be
  // found by the basename alone — that matched the project row for both and made
  // the global ceiling unchecked while the suite stayed green.
  const ROW_LABEL = {
    'CLAUDE.md': '| `CLAUDE.md` |',
    'MEMORY.md': '| `MEMORY.md` |',
    'global-CLAUDE.md': '| global `CLAUDE.md` |',
  }
  const rowFor = (path) => text.split('\n').find((l) => l.startsWith(ROW_LABEL[path]))

  it('quotes each cut document at the ceiling the budget module actually enforces', () => {
    for (const budget of DOC_BUDGETS.filter((b) => CUT_SOURCES.includes(b.path))) {
      const row = rowFor(budget.path)
      expect(row, `no ceilings row for ${budget.path}`).toBeTruthy()
      const n = (v) => v.toLocaleString('en-US')
      expect(row).toContain(`${n(budget.maxLines)} / ${n(budget.maxWords)}`)
    }
  })

  it('names all three cut documents in the table, each exactly once', () => {
    for (const path of CUT_SOURCES) {
      const rows = text.split('\n').filter((l) => l.startsWith(ROW_LABEL[path]))
      expect(rows, `ceilings rows for ${path}`).toHaveLength(1)
    }
  })

  // The landed measurement is the point of the table: a row still quoting the
  // pre-merge figure is exactly the defect point 761 exists to remove.
  it('quotes the landed line and word counts the guard tokenizer reports', () => {
    const files = {
      'CLAUDE.md': resolve(ROOT, 'CLAUDE.md'),
      'MEMORY.md': MEMORY_PATH,
      'global-CLAUDE.md': resolve(homedir(), '.claude', 'CLAUDE.md'),
    }
    for (const path of CUT_SOURCES) {
      const file = files[path]
      if (!existsSync(file)) continue // refused read off the batch machine
      const { lines, words } = measure(readFileSync(file, 'utf8'))
      const row = rowFor(path)
      expect(row, `no ceilings row for ${path}`).toBeTruthy()
      expect(row).toContain(`${lines} lines`)
      expect(row).toContain(`${words.toLocaleString('en-US')} words`)
    }
  })
})
