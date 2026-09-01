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
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  attachPointFileSets,
  attachUnavailableClearances,
  baselineFor,
  bootstrapBase,
  buildFindingsFiledReceipt,
  buildUnavailableReceipt,
  measurePointFilesWithoutCommission,
  parseFindingsFiledArgs,
  parseUnavailableReceiptArgs,
  pointAuthorshipLogCommand,
  pointFilesCommand,
  pointLandingLogCommand,
  pointLaneCommitsCommand,
  pointLaneRefsCommand,
  readWorkOrder,
  showAt,
} from './criticality-review-guard.mjs'

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

describe('readWorkOrder', () => {
  it('reads an absent file as empty', () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    expect(
      readWorkOrder('TASKS.md', () => {
        throw enoent
      }),
    ).toBe('')
  })

  it('RETHROWS any other read failure — a swallowed one forgave a tick FOREVER', () => {
    // The blocker the four-eyes review of this branch reproduced: read as empty,
    // the pending high tick vanishes, the gate reports clear, and a clear run
    // ADVANCES THE BASELINE — so the tick stays forgiven after the file is
    // readable again. Rethrowing lands it in the per-turn fail-open, which
    // writes no state at all.
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    expect(() =>
      readWorkOrder('docs/tasks-archive.md', () => {
        throw eacces
      }),
    ).toThrow(/EACCES/)
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

describe('point file-set measurement', () => {
  it('uses the point lane only, excluding merges that import unrelated main work', () => {
    expect(pointFilesCommand('base', 'review')).toEqual([
      'log',
      '--first-parent',
      '--no-merges',
      '--format=format:',
      '--name-only',
      '-z',
      'base..review',
    ])
  })

  it('measures a self-authored point from the merge that landed its named lane', () => {
    const reviewed = 'c'.repeat(40)
    const landing = 'c'.repeat(40)
    const side = 'd'.repeat(40)
    const calls = []
    const files = measurePointFilesWithoutCommission(893, reviewed, {
      isAncestor: () => false,
      run: (args) => {
        calls.push(args)
        if (args[0] === 'log') {
          return `\x1e${landing}\x1f${'a'.repeat(40)} ${side}\x1fMerge branch 'feat/893-attempt-lease-fencing'\n`
        }
        if (args[0] === 'diff') return 'scripts/lease.mjs\0scripts/lease.test.mjs\0scripts/lease.mjs\0'
        throw new Error(`unexpected command: ${args.join(' ')}`)
      },
    })

    expect(calls).toEqual([pointLandingLogCommand(), ['diff', '--name-only', '-z', `${landing}^1`, landing]])
    expect(files).toEqual(['scripts/lease.mjs', 'scripts/lease.test.mjs'])
  })

  // ONE BOUNDARY (28.08.2026): `review-sol` structurally refuses to put the work
  // order, its archive or the retrospective in a pass, so a point whose measured
  // file set picked one of them up could never reach a complete composition,
  // whatever was reviewed. The gate reads the planner's exclusion list.
  // The receipt path measured its own set and skipped the boundary (cross-vendor
  // review, GPT-5.6 Sol): a clearance could then be written for the work order or
  // the retrospective — paths no review round was ever owed for.
  it('never lets an unavailable receipt claim a path outside the review boundary', () => {
    const sha = 'a'.repeat(40)
    const built = buildUnavailableReceipt({
      sha,
      point: 893,
      files: ['scripts/lease.mjs', 'TASKS.md'],
      reason: 'every configured reviewer vendor authored part of this contribution',
      records: [{ kind: 'authoring-commission', point: 893, sha: 'b'.repeat(40), at: 1 }],
      resolveSha: () => sha,
      isAncestor: () => true,
      measure: () => ({ unavailableFiles: ['scripts/lease.mjs', 'TASKS.md'] }),
    })

    expect(built.ok).toBe(false)
    expect(built.errors.join(' ')).toContain('scripts/lease.mjs')
    expect(built.errors.join(' ')).not.toContain('TASKS.md')
  })

  it('writes the receipt for the measured set once the excluded paths are gone', () => {
    const sha = 'a'.repeat(40)
    const built = buildUnavailableReceipt({
      sha,
      point: 893,
      files: ['scripts/lease.mjs'],
      reason: 'every configured reviewer vendor authored part of this contribution',
      records: [{ kind: 'authoring-commission', point: 893, sha: 'b'.repeat(40), at: 1 }],
      resolveSha: () => sha,
      isAncestor: () => true,
      measure: () => ({ unavailableFiles: ['scripts/lease.mjs', 'docs/tasks-archive.md'] }),
      now: 1_700_000_000_000,
    })

    expect(built.ok).toBe(true)
    expect(built.record.files).toEqual(['scripts/lease.mjs'])
  })

  it('leaves out the paths no review round may carry', () => {
    const reviewed = 'c'.repeat(40)
    const landing = 'c'.repeat(40)
    const side = 'd'.repeat(40)
    const files = measurePointFilesWithoutCommission(893, reviewed, {
      isAncestor: () => false,
      run: (args) => {
        if (args[0] === 'log') {
          return `\x1e${landing}\x1f${'a'.repeat(40)} ${side}\x1fMerge branch 'feat/893-attempt-lease-fencing'\n`
        }
        if (args[0] === 'diff') {
          return [
            'scripts/lease.mjs',
            'TASKS.md',
            'docs/tasks-archive.md',
            'docs/analysis_de/retrospektive-zusammenarbeit.md',
          ].join('\0')
        }
        throw new Error(`unexpected command: ${args.join(' ')}`)
      },
    })

    expect(files).toEqual(['scripts/lease.mjs'])
  })

  it('uses a landing merge to recover the lane base for an earlier branch review', () => {
    const first = 'a'.repeat(40)
    const reviewed = 'b'.repeat(40)
    const landing = 'c'.repeat(40)
    const side = 'd'.repeat(40)
    const mainParent = 'e'.repeat(40)
    const base = 'f'.repeat(40)
    const calls = []
    const files = measurePointFilesWithoutCommission(893, reviewed, {
      isAncestor: (a, b) => (a === reviewed && b === side) || (a === first && b === reviewed),
      run: (args) => {
        calls.push(args)
        if (args.includes('--merges')) {
          return `\x1e${landing}\x1f${mainParent} ${side}\x1fMerge branch 'feat/893-attempt-lease-fencing'\n`
        }
        if (args[0] === 'rev-list') return `${first}\n${reviewed}\n${side}\n`
        if (args[0] === 'rev-parse') return `${base}\n`
        if (args[0] === 'log') return 'scripts/lease.mjs\0scripts/lease.test.mjs\0'
        throw new Error(`unexpected command: ${args.join(' ')}`)
      },
    })

    expect(calls).toContainEqual(pointLaneCommitsCommand(side, `${landing}^1`))
    expect(calls.at(-1)).toEqual(pointFilesCommand(base, reviewed))
    expect(files).toEqual(['scripts/lease.mjs', 'scripts/lease.test.mjs'])
  })

  it('falls back to the parent of the first retained lane commit before landing', () => {
    const first = 'a'.repeat(40)
    const reviewed = 'b'.repeat(40)
    const tip = 'c'.repeat(40)
    const base = 'd'.repeat(40)
    const ref = 'refs/heads/feat/903-measurable-point-file-set'
    const calls = []
    const files = measurePointFilesWithoutCommission(903, reviewed, {
      isAncestor: (a, b) => (a === reviewed && b === tip) || (a === first && b === reviewed),
      run: (args) => {
        calls.push(args)
        if (args.includes('--merges')) return ''
        if (args[0] === 'for-each-ref') return `${ref}\t${tip}\n`
        if (args[0] === 'rev-list') return `${first}\n${reviewed}\n${tip}\n`
        if (args[0] === 'rev-parse') return `${base}\n`
        if (args[0] === 'log') return 'scripts/guard.mjs\0scripts/guard.test.mjs\0'
        throw new Error(`unexpected command: ${args.join(' ')}`)
      },
    })

    expect(pointLaneRefsCommand(903)).toContain('refs/heads/feat/903-*')
    expect(pointLaneCommitsCommand(ref)).toEqual(['rev-list', '--first-parent', '--reverse', ref, '--not', 'main'])
    expect(calls.at(-1)).toEqual(pointFilesCommand(base, reviewed))
    expect(files).toEqual(['scripts/guard.mjs', 'scripts/guard.test.mjs'])
  })

  it('attaches a Git fallback file set when no commission row exists', () => {
    const review = {
      point: 893,
      sha: 'b'.repeat(40),
      verdict: 'merge',
      pointFiles: ['forged.mjs'],
      reachable: true,
    }
    const calls = []
    const rows = attachPointFileSets(
      [review],
      () => {
        throw new Error('commission measurement must not run')
      },
      (point, sha) => {
        calls.push([point, sha])
        return ['scripts/lease.mjs', 'scripts/lease.test.mjs']
      },
    )

    expect(calls).toEqual([[893, review.sha]])
    expect(rows[0].pointFiles).toEqual(['scripts/lease.mjs', 'scripts/lease.test.mjs'])
  })

  it('includes only first-parent work plus cc-only merge resolutions in unavailable measurement', () => {
    expect(pointAuthorshipLogCommand('base', 'review')).toEqual([
      '-c',
      'core.quotepath=on',
      'log',
      '--first-parent',
      '--format=%x1e%H%x1f%ct%x1f%P',
      '--name-only',
      '--no-renames',
      '--diff-merges=cc',
      '--reverse',
      'base..review',
    ])
  })

  it('replaces forged ledger coverage and leaves a failed measurement unknown', () => {
    const commission = {
      kind: 'authoring-commission',
      point: 769,
      sha: 'a'.repeat(40),
      at: 1_787_000_000_000,
      reachable: true,
    }
    const measured = {
      point: 769,
      sha: 'b'.repeat(40),
      verdict: 'merge',
      descendsFrom: [commission.sha],
      pointFiles: ['forged.mjs'],
      reachable: true,
    }
    const failed = {
      ...measured,
      sha: 'c'.repeat(40),
      descendsFrom: [commission.sha, measured.sha],
    }
    const rows = attachPointFileSets([commission, measured, failed], (_base, sha) => {
      if (sha === failed.sha) throw new Error('undiffable')
      return ['scripts/real.mjs', ' edge-space.mjs', 'scripts/real.mjs']
    })
    expect(rows[1].pointFiles).toEqual(['scripts/real.mjs', ' edge-space.mjs'])
    expect(rows[2].pointFiles).toBeUndefined()
  })

  it('computes the reviewed file set from a Fable commission base', () => {
    const commission = {
      kind: 'authoring-commission',
      point: 846,
      sha: 'a'.repeat(40),
      model: 'Fable 5',
      at: 1_787_130_000_000,
      reachable: true,
    }
    const review = {
      point: 846,
      sha: 'b'.repeat(40),
      verdict: 'merge',
      descendsFrom: [commission.sha],
      reachable: true,
    }
    const calls = []
    const rows = attachPointFileSets([commission, review], (base, sha) => {
      calls.push([base, sha])
      return ['scripts/author-fable.mjs', 'scripts/author-sol.mjs']
    })

    expect(calls).toEqual([[commission.sha, review.sha]])
    expect(rows[1].pointFiles).toEqual(['scripts/author-fable.mjs', 'scripts/author-sol.mjs'])
  })

  it('verifies unavailable receipts only for Git’s exact unreviewable file set', () => {
    const commission = {
      kind: 'authoring-commission',
      point: 769,
      sha: 'a'.repeat(40),
      at: 1_787_000_000_000,
      reachable: true,
    }
    const receipt = {
      kind: 'criticality-review-unavailable',
      point: 769,
      sha: 'b'.repeat(40),
      files: ['scripts/both.mjs'],
      descendsFrom: [commission.sha],
      unavailableVerified: true,
      unavailableFiles: ['forged.mjs'],
      reachable: true,
    }
    const wrong = { ...receipt, sha: 'c'.repeat(40), files: ['scripts/reviewable.mjs'] }
    const rows = attachUnavailableClearances([commission, receipt, wrong], () => ({
      pointFiles: ['scripts/reviewable.mjs', 'scripts/both.mjs'],
      unavailableFiles: ['scripts/both.mjs'],
    }))
    expect(rows[1]).toMatchObject({
      unavailableVerified: true,
      unavailableFiles: ['scripts/both.mjs'],
      pointFiles: ['scripts/reviewable.mjs', 'scripts/both.mjs'],
    })
    expect(rows[2].unavailableVerified).toBeUndefined()
    expect(rows[2].unavailableFiles).toBeUndefined()
  })

  it('builds a receipt only when its file set equals the Git measurement', () => {
    const commission = {
      kind: 'authoring-commission',
      point: 870,
      sha: 'a'.repeat(40),
      at: 100,
    }
    const common = {
      sha: 'b'.repeat(40),
      point: '870',
      reason: 'both configured vendors authored these contributions',
      records: [commission],
      now: 1_787_000_000_000,
      resolveSha: () => 'b'.repeat(40),
      isAncestor: () => true,
      measure: () => ({ unavailableFiles: ['scripts/both.mjs', ' edge.mjs'] }),
    }
    const wrong = buildUnavailableReceipt({ ...common, files: ['scripts/both.mjs'] })
    expect(wrong.ok).toBe(false)
    expect(wrong.errors[0]).toContain("does not equal Git's unavailable set")
    expect(wrong.errors[0]).toContain('" edge.mjs"')

    const exact = buildUnavailableReceipt({ ...common, files: [' edge.mjs', 'scripts/both.mjs'] })
    expect(exact).toMatchObject({
      ok: true,
      record: {
        kind: 'criticality-review-unavailable',
        point: 870,
        sha: 'b'.repeat(40),
        files: ['scripts/both.mjs', ' edge.mjs'],
      },
    })
  })

  it('parses the receipt file list byte-exact and refuses unknown CLI input', () => {
    const parsed = parseUnavailableReceiptArgs([
      '--record-unavailable', 'b'.repeat(40),
      '--point', '870',
      '--files', 'plain.mjs," edge.mjs"',
      '--reason', 'no independent reviewer exists',
    ])
    expect(parsed).toMatchObject({ ok: true, values: { files: ['plain.mjs', ' edge.mjs'] } })
    expect(parseUnavailableReceiptArgs(['--record-unavailable', 'abc1234', '--file', 'x']).errors).toContain(
      'unknown unavailable-receipt argument --file',
    )
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

  /**
   * A clean allow: nothing on stdout AND nothing on stderr. The stderr half is
   * load-bearing — the wrapper's fail-open path also prints nothing to stdout,
   * so `stdout === ''` alone lets a crashing guard masquerade as a clear gate.
   */
  const expectAllow = () => {
    const hook = runHook()
    expect(hook.stdout.trim(), 'a clear gate must print no decision').toBe('')
    expect(hook.stderr.trim(), 'a clear gate must not have fallen open on an error').toBe('')
    return hook
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

  it('binds every fixture git call to the temporary repository', () => {
    expect(git('rev-parse', '--show-toplevel').stdout.trim()).toBe(resolve(repo))
    expect(repo.startsWith(tmpdir())).toBe(true)
  })

  it('is clear before anything is ticked, and arms its baseline there', () => {
    expectAllow()
  })

  it('stays clear when an UNTAGGED point is ticked', () => {
    write('TASKS.md', `# TASKS\n\n## Checklist\n\n${HIGH(900)}\n`)
    write('docs/tasks-archive.md', `# Archive\n\n${PLAIN(901, true)}\n`)
    commit('archive the ordinary point')
    expectAllow()
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
        '--mode', 'review',
      ],
      { windowsHide: true, cwd: repo, encoding: 'utf8' },
    )
    expect(r.status, 'a self-review must be refused at the record command').toBe(1)
    expect(r.stderr).toMatch(/SAME-VENDOR REVIEW/i)
    expect(runHook().decision?.decision).toBe('block')
  })

  it('CLEARS once a different vendor records a merge naming the point', () => {
    const reviewed = git('rev-parse', 'HEAD').stdout.trim()
    const r = spawnSync(
      process.execPath,
      [
        resolve(repo, 'scripts', 'mechanism-review.mjs'),
        '--record', reviewed,
        '--point', '900',
        '--model', 'GPT-5.6 Sol',
        '--verdict', 'merge',
        '--evidence', 'read the core, ran the gate against a synthetic tick, no side effects found',
        '--mode', 'review',
      ],
      { windowsHide: true, cwd: repo, encoding: 'utf8' },
    )
    expect(r.status, `record failed: ${r.stderr}`).toBe(0)
    commit('record the diverse review')
    expectAllow()
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
    expectAllow()
    git('checkout', '-q', 'main')
  })

  it('a read failure of the work order NEVER advances the baseline', () => {
    // The blocker from this branch's own four-eyes review, end to end. The
    // archive is replaced by a DIRECTORY (EISDIR — a non-ENOENT failure that
    // reproduces as any user, unlike chmod under root), which is the shape of
    // the Windows sharing violation this guard will meet in practice.
    write('TASKS.md', '# TASKS\n\n## Checklist\n')
    write('docs/tasks-archive.md', `# Archive\n\n${PLAIN(901, true)}\n\n${HIGH(900, true)}\n\n${HIGH(903, true)}\n`)
    commit('tick a second must-work point with no review on record')
    expect(runHook().decision?.decision, 'the pending tick must block first').toBe('block')

    const before = readFileSync(resolve(repo, '.claude/criticality-review-baseline.json'), 'utf8')
    rmSync(resolve(repo, 'docs/tasks-archive.md'))
    mkdirSync(resolve(repo, 'docs/tasks-archive.md'))
    const hook = runHook()
    // Fail-OPEN: the turn is allowed, loudly, and the state is left alone.
    expect(hook.stdout.trim(), 'an unreadable work order must not produce a verdict').toBe('')
    expect(hook.stderr).toMatch(/allowing stop/)
    expect(
      readFileSync(resolve(repo, '.claude/criticality-review-baseline.json'), 'utf8'),
      'the baseline moved — the tick is now forgiven forever',
    ).toBe(before)

    rmSync(resolve(repo, 'docs/tasks-archive.md'), { recursive: true })
    write('docs/tasks-archive.md', `# Archive\n\n${PLAIN(901, true)}\n\n${HIGH(900, true)}\n\n${HIGH(903, true)}\n`)
    expect(runHook().decision?.decision, 'the gate must still be there afterwards').toBe('block')
  })
})

describe('the unavailable-receipt CLI', { timeout: 30_000 }, () => {
  it('refuses a mismatched file claim and appends the exact Git-measured set', () => {
    const receiptRepo = mkdtempSync(resolve(tmpdir(), 'hoa-unavailable-receipt-'))
    try {
      cpSync(resolve(process.cwd(), 'scripts'), resolve(receiptRepo, 'scripts'), {
        recursive: true,
        filter: (src) => !/[\\/](verify|git-hooks)([\\/]|$)/.test(src),
      })
      mkdirSync(resolve(receiptRepo, '.claude'), { recursive: true })
      const runGit = (...args) =>
        spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', ...args], {
          windowsHide: true,
          cwd: receiptRepo,
          encoding: 'utf8',
        })
      expect(runGit('init', '-q', '-b', 'main').status).toBe(0)
      expect(runGit('config', 'user.email', 'receipt@test.local').status).toBe(0)
      expect(runGit('config', 'user.name', 'receipt test').status).toBe(0)
      writeFileSync(resolve(receiptRepo, 'seed.txt'), 'base\n')
      expect(runGit('add', 'seed.txt').status).toBe(0)
      expect(
        runGit(
          'commit', '-q', '-m',
          'Seed the receipt range\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
        ).status,
      ).toBe(0)
      const base = runGit('rev-parse', 'HEAD').stdout.trim()
      writeFileSync(
        resolve(receiptRepo, '.claude/mechanism-reviews.jsonl'),
        `${JSON.stringify({ kind: 'authoring-commission', point: 870, sha: base, model: 'GPT-5.6 Sol', at: 1 })}\n`,
      )
      mkdirSync(resolve(receiptRepo, 'src'), { recursive: true })
      writeFileSync(resolve(receiptRepo, 'src/both.mjs'), 'export const both = true\n')
      expect(runGit('add', 'src/both.mjs').status).toBe(0)
      expect(
        runGit(
          'commit', '-q', '-m',
          'Add a contribution by every configured reader\n\nCo-Authored-By: GPT-5.6 Sol <noreply@openai.com>\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>',
        ).status,
      ).toBe(0)
      const head = runGit('rev-parse', 'HEAD').stdout.trim()
      const command = resolve(receiptRepo, 'scripts/criticality-review-guard.mjs')
      const args = [
        '--record-unavailable', head,
        '--point', '870',
        '--reason', 'every configured reviewer authored this contribution',
      ]
      const wrong = spawnSync(process.execPath, [command, ...args, '--files', 'src/wrong.mjs'], {
        windowsHide: true,
        cwd: receiptRepo,
        encoding: 'utf8',
      })
      expect(wrong.status).toBe(1)
      expect(wrong.stderr).toContain("does not equal Git's unavailable set")
      expect(readFileSync(resolve(receiptRepo, '.claude/mechanism-reviews.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)

      const exact = spawnSync(process.execPath, [command, ...args, '--files', 'src/both.mjs'], {
        windowsHide: true,
        cwd: receiptRepo,
        encoding: 'utf8',
      })
      expect(exact.status, exact.stderr).toBe(0)
      const rows = readFileSync(resolve(receiptRepo, '.claude/mechanism-reviews.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
      expect(rows[1]).toMatchObject({
        kind: 'criticality-review-unavailable',
        point: 870,
        sha: head,
        files: ['src/both.mjs'],
      })
    } finally {
      rmSync(receiptRepo, { recursive: true, force: true })
    }
  })
})

// THE READ THAT IS BIGGER THAN THE DEFAULT BUFFER (found on main, 07.08.2026).
//
// Every fixture above builds a temp repo whose work order is a few hundred bytes,
// so none of them can see the one thing that made this guard inert on the REAL
// repository: `git show <rev>:docs/tasks-archive.md` returns the whole archive —
// 1.12 MB and growing — against execSync's 1 MB default buffer. The child died
// with ENOBUFS, the throw landed in the wrapper's fail-open, and the guard allowed
// every turn while looking armed. This pins the read at its real size.
describe('the archive read at its REAL size', () => {
  it('reads the whole work-order archive at HEAD without dying on the buffer', () => {
    const onDisk = readFileSync(resolve(import.meta.dirname, '..', 'docs/tasks-archive.md'), 'utf8')
    expect(onDisk.length).toBeGreaterThan(1024 * 1024) // the premise: past execSync's default

    const atHead = showAt('HEAD', 'docs/tasks-archive.md')
    expect(atHead.length).toBeGreaterThan(1024 * 1024)
    expect(atHead.trimEnd()).toBe(onDisk.trimEnd())
  })
})

// THE ROUTE THE REFUSAL NAMES, WHICH NOTHING COULD TAKE. The gate's own text
// offers two durable answers to a `do-not-merge` — fix it and record the
// re-review, or file every finding as an open work-order point and append this
// receipt naming them — and no command wrote the second. Measured 01.09.2026,
// when a refusal raised AFTER a point had landed could not be answered the first
// way either: the point's reviewed range ends at its landing, so a later commit
// is not "a LATER commit" to the ancestor index. A rule whose only remaining
// exit is unbuildable is a rule that gets waived.
describe('the findings-filed receipt', () => {
  const SHA = 'a'.repeat(40)
  // A LEDGER TIMESTAMP MUST LOOK LIKE ONE: the row filter asks `ledgerAtUsable`,
  // so a toy number is not a usable `at` and the review would not be found.
  const REVIEW = { sha: SHA, point: 700, model: 'GPT-5.6 Sol', verdict: 'do-not-merge', at: 1_788_000_000_000 }
  const build = (over = {}) =>
    buildFindingsFiledReceipt({
      sha: SHA,
      point: 700,
      model: 'GPT-5.6 Sol',
      findingPoints: [801, 802],
      records: [REVIEW],
      openPoints: [801, 802, 900],
      now: 1_788_000_100_000,
      resolveSha: () => SHA,
      ...over,
    })

  it('binds the exact review it answers, so two verdicts on one sha stay apart', () => {
    const built = build()
    expect(built.ok).toBe(true)
    expect(built.record).toMatchObject({
      kind: 'review-findings-filed',
      sha: SHA,
      point: 700,
      model: 'GPT-5.6 Sol',
      reviewAt: REVIEW.at,
      findingPoints: [801, 802],
    })
    // Strictly after the review, because the acceptance rule compares the two.
    expect(built.record.at).toBeGreaterThan(REVIEW.at)
  })

  it('REFUSES a point that is not open — a finding moved nowhere is a finding dropped', () => {
    const built = build({ findingPoints: [801, 999] })
    expect(built.ok).toBe(false)
    expect(built.errors.join(' ')).toMatch(/999/)
  })

  it('REFUSES a receipt against a verdict that needs no answering', () => {
    const built = build({ records: [{ ...REVIEW, verdict: 'merge' }] })
    expect(built.ok).toBe(false)
    expect(built.errors.join(' ')).toMatch(/needs answering/)
  })

  it('REFUSES when no such review exists at all', () => {
    expect(build({ records: [] }).ok).toBe(false)
    expect(build({ model: 'Opus 5' }).ok).toBe(false)
  })

  it('REFUSES an empty or malformed finding list', () => {
    expect(build({ findingPoints: [] }).ok).toBe(false)
    expect(build({ findingPoints: [0] }).ok).toBe(false)
  })

  it('takes the LATEST refusal when the same model refused twice on one sha', () => {
    const later = { ...REVIEW, at: 1_788_000_050_000, evidence: 'the second refusal' }
    expect(build({ records: [REVIEW, later] }).record.reviewAt).toBe(1_788_000_050_000)
  })

  it('parses its flags strictly, and ignores no unknown token', () => {
    const ok = parseFindingsFiledArgs([
      '--record-findings-filed', SHA, '--point', '700', '--model', 'GPT-5.6 Sol', '--finding-points', '801, 802',
    ])
    expect(ok.ok).toBe(true)
    expect(ok.values.findingPoints).toEqual([801, 802])

    expect(parseFindingsFiledArgs(['--record-findings-filed', SHA, '--nope', 'x']).ok).toBe(false)
    expect(parseFindingsFiledArgs(['--finding-points', '801,eight']).ok).toBe(false)
    expect(parseFindingsFiledArgs(['--point']).ok).toBe(false)
  })
})
