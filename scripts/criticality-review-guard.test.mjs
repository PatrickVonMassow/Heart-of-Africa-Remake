// THE CRITICALITY GATE, PROVEN BY TICKING A POINT (work-order point 298).
//
// The core test beside this one pins the decision; what it cannot show is that a
// real tick in a real repository reaches that decision at all — the branch check,
// the baseline arming, the `git show` of the work order at the baseline and the
// ancestry of the ledger entry are all wrapper work. So one synthetic
// high-criticality point is opened, ticked and reviewed in an ISOLATED temp repo,
// and the SPAWNED hook is asked at each step.
//
// The three states are the point's own acceptance: high + no review must block,
// the same state with a second model's `merge` must clear, and a tick that
// carries no high tag must never have blocked in the first place.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { baselineFor, bootstrapBase, showAt } from './criticality-review-guard.mjs'

describe('baselineFor', () => {
  it('prefers the branch’s own confirmed baseline, then main’s, then nothing', () => {
    const state = { baselines: { main: 'aaa', 'feat/x': 'bbb' } }
    expect(baselineFor(state, 'feat/x')).toBe('bbb')
    expect(baselineFor(state, 'main')).toBe('aaa')
    expect(baselineFor({}, 'main')).toBe(null)
    expect(baselineFor(undefined, 'main')).toBe(null)
  })
})

describe('bootstrapBase', () => {
  it('QUOTES the revision — cmd.exe eats a bare ^ and the gate then arms at HEAD', () => {
    const asked = []
    expect(
      bootstrapBase('headsha', (rev) => {
        asked.push(rev)
        throw new Error('no such ref')
      }),
    ).toBe('headsha')
    expect(asked[0]).toContain('"main^{commit}"')
    expect(asked[1]).toContain('"origin/main^{commit}"')
  })
})

describe('showAt', () => {
  it('reads a path that did not exist at the revision as empty', () => {
    expect(
      showAt('abc', 'docs/tasks-archive.md', () => {
        const e = new Error("fatal: path 'docs/tasks-archive.md' does not exist in 'abc'")
        e.stderr = e.message
        throw e
      }),
    ).toBe('')
  })

  it('RETHROWS anything else — an empty answer would make every archived point look newly ticked', () => {
    // The failure mode this protects against is not hypothetical: read as empty,
    // a gc'd baseline would block the turn on a hundred long-finished points.
    expect(() =>
      showAt('abc', 'TASKS.md', () => {
        const e = new Error('fatal: not a git repository')
        e.stderr = e.message
        throw e
      }),
    ).toThrow(/not a git repository/)
  })
})

// Spawning the hook plus a `git` sequence per step; on a machine that is also
// running three worktree agents this is a load verdict, not a defect.
describe('the gate against a real tick', { timeout: 60_000 }, () => {
  const SESSION = 'criticality-gate-test'
  const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
  let repo

  const git = (...args) =>
    spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', ...args], {
      windowsHide: true,
      cwd: repo,
      encoding: 'utf8',
    })

  const write = (rel, text) => {
    const full = resolve(repo, rel)
    mkdirSync(resolve(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }

  /** Commit everything, naming the AUTHORING model the way this project does. */
  const commit = (message, model = 'Claude Opus 5') => {
    git('add', '-A')
    const r = git(
      '-c',
      'user.email=c@test.local',
      '-c',
      'user.name=criticality test',
      'commit',
      '-q',
      '-m',
      `${message}\n\nCo-Authored-By: ${model} <noreply@anthropic.com>`,
    )
    expect(r.status, `commit failed: ${r.stderr}`).toBe(0)
    return git('rev-parse', 'HEAD').stdout.trim()
  }

  /** The Stop hook, spawned exactly as the harness spawns it. */
  const runHook = () => {
    const r = spawnSync(process.execPath, [resolve(repo, 'scripts', 'criticality-review-guard.mjs')], {
      windowsHide: true,
      cwd: repo,
      encoding: 'utf8',
      input: JSON.stringify({ session_id: SESSION, hook_event_name: 'Stop' }),
      maxBuffer: 64 * 1024 * 1024,
    })
    expect(r.status, `guard exited ${r.status}: ${r.stderr}`).toBe(0)
    let decision = null
    try {
      decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null
    } catch {
      /* not a decision payload — the assertion below reports the raw stdout */
    }
    return { ...r, decision }
  }

  const HIGH = (n, done) =>
    `- [${done ? 'x' : ' '}] ${n}. A MUST-WORK THING\n  spec prose.\n  Criticality: high (it gates every merge).\n`
  const PLAIN = (n, done) => `- [${done ? 'x' : ' '}] ${n}. AN ORDINARY THING\n  spec prose.\n`

  beforeAll(() => {
    repo = mkdtempSync(resolve(tmpdir(), 'hoa-criticality-'))
    cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), {
      recursive: true,
      filter: (src) => !/[\\/](verify|git-hooks)([\\/]|$)/.test(src),
    })
    mkdirSync(resolve(repo, '.claude'), { recursive: true })
    write('TASKS.md', `# TASKS\n\n## Checklist\n\n${HIGH(900)}\n${PLAIN(901)}\n`)
    write('docs/tasks-archive.md', '# Archive\n')
    git('init', '-q')
    git('symbolic-ref', 'HEAD', 'refs/heads/main')
    git('config', 'user.email', 'c@test.local')
    git('config', 'user.name', 'criticality test')
    commit('baseline')
  })

  afterAll(() => {
    try {
      rmSync(repo, { recursive: true, force: true })
    } catch {
      /* a file lock on a temp dir must not fail the suite */
    }
  })

  it('is clear before anything is ticked, and arms its baseline there', () => {
    expect(runHook().stdout.trim()).toBe('')
  })

  it('stays clear when an UNTAGGED point is ticked', () => {
    write('TASKS.md', `# TASKS\n\n## Checklist\n\n${HIGH(900)}\n`)
    write('docs/tasks-archive.md', `# Archive\n\n${PLAIN(901, true)}\n`)
    commit('archive the ordinary point')
    expect(runHook().stdout.trim()).toBe('')
  })

  it('BLOCKS the moment the HIGH point is ticked with no review on record', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n')
    write('docs/tasks-archive.md', `# Archive\n\n${PLAIN(901, true)}\n\n${HIGH(900, true)}\n`)
    commit('archive the must-work point')
    const hook = runHook()
    expect(hook.decision?.decision, `stdout was ${JSON.stringify(hook.stdout)}`).toBe('block')
    expect(hook.decision.reason).toContain('point 900')
    expect(hook.decision.reason).toContain('no review recorded')
  })

  it('BLOCKS on a self-review, refused by the record command itself', () => {
    const head = git('rev-parse', 'HEAD').stdout.trim()
    const r = spawnSync(
      process.execPath,
      [
        resolve(repo, 'scripts', 'mechanism-review.mjs'),
        '--record', head,
        '--point', '900',
        '--model', 'Claude Opus 5',
        '--verdict', 'merge',
        '--evidence', 'read my own work and liked it very much',
      ],
      { windowsHide: true, cwd: repo, encoding: 'utf8' },
    )
    expect(r.status, 'a self-review must be refused at the record command').toBe(1)
    expect(r.stderr).toMatch(/SELF-REVIEW/i)
    expect(runHook().decision?.decision).toBe('block')
  })

  it('CLEARS once a different model records a merge naming the point', () => {
    const reviewed = git('rev-parse', 'HEAD').stdout.trim()
    const r = spawnSync(
      process.execPath,
      [
        resolve(repo, 'scripts', 'mechanism-review.mjs'),
        '--record', reviewed,
        '--point', '900',
        '--model', 'Fable 5',
        '--verdict', 'merge',
        '--evidence', 'read the core, ran the gate against a synthetic tick, no side effects found',
      ],
      { windowsHide: true, cwd: repo, encoding: 'utf8' },
    )
    expect(r.status, `record failed: ${r.stderr}`).toBe(0)
    commit('record the diverse review')
    expect(runHook().stdout.trim()).toBe('')
  })

  it('stands down on a feature branch — ticks are main-only', () => {
    git('checkout', '-q', '-b', 'feat/900-something')
    write('TASKS.md', `# TASKS\n\n## Checklist\n\n${HIGH(902)}\n`)
    commit('open another must-work point on a branch')
    write('TASKS.md', '# TASKS\n\n## Checklist\n')
    write('docs/tasks-archive.md', `# Archive\n\n${PLAIN(901, true)}\n\n${HIGH(900, true)}\n\n${HIGH(902, true)}\n`)
    commit('tick it on the branch, which the workflow forbids')
    // Not a licence to tick on a branch — the work order forbids it and
    // tasks-archive-guard reads it there. This gate simply refuses to judge a
    // work order that is not the one main ships.
    expect(runHook().stdout.trim()).toBe('')
    git('checkout', '-q', 'main')
  })
})
