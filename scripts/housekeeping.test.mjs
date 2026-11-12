// The housekeeping run (point 1509) on a throwaway tree: fake repo, fake /tmp,
// injected process table, git and finding sink. Nothing outside the arena is
// touched — the symlink cases prove it.
import { afterEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { runDaemon } from './batch-launcher.mjs'
import { DAY_MS } from './housekeeping-core.mjs'
import { acquireLock, dataPaths, runHousekeeping, spawnHousekeepingIfDue } from './housekeeping.mjs'

const NOW = Date.UTC(2026, 10, 12, 12)
const OLD = (NOW - 30 * DAY_MS) / 1000

const arenas = []
afterEach(() => {
  while (arenas.length) rmSync(arenas.pop(), { recursive: true, force: true })
})

function put(path, text = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

/** Age a path and (for a dir) everything under it. Children first, so the
 *  dir's own mtime is set last. */
function age(path, secs = OLD) {
  const walk = (p) => {
    try {
      for (const n of readdirSync(p)) walk(join(p, n))
    } catch {
      /* a file */
    }
    utimesSync(p, secs, secs)
  }
  walk(path)
}

function arena({ archive = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-housekeeping-test-'))
  arenas.push(dir)
  const repo = join(dir, 'repo')
  const tmp = join(dir, 'tmp')
  const outside = join(dir, 'outside')
  mkdirSync(join(repo, '.git'), { recursive: true })
  mkdirSync(tmp, { recursive: true })
  put(join(outside, 'precious.txt'), 'keep me')
  put(
    join(repo, 'TASKS.md'),
    ['## Checklist', '- [ ] 900. Open', '  evidence at local/659-cited-frames/a.png', '- [ ] 1509. Housekeeping'].join('\n'),
  )
  if (archive)
    put(join(repo, 'docs/tasks-archive.md'), ['- [x] 659. Closed', '- [x] 700. Closed', '- [x] 701. Closed'].join('\n'))
  put(join(repo, 'docs/acceptance-evidence.md'), 'see local/700-accepted-frames')
  put(join(repo, 'docs/acceptance-criteria-detail.md'), '')
  put(join(repo, 'docs/backlog.md'), '')
  return { dir, repo, local: join(repo, 'local'), tmp, outside }
}

const quietGit = () => ({ status: 0, stdout: 'size-pack: 100\nsize: 0\n', stderr: '' })

function run(a, extra = {}) {
  const findings = []
  const gitCalls = []
  const r = runHousekeeping({
    repoRoot: a.repo,
    tmpRoot: a.tmp,
    clock: () => NOW,
    readWorktrees: () => `worktree ${a.repo}\nHEAD abc\n`,
    readProcesses: () => ({ ok: true, openPaths: [], cmdlines: [] }),
    runGit: (args) => {
      gitCalls.push(args)
      return quietGit()
    },
    fileFinding: (title, detail) => findings.push({ title, detail }),
    ...extra,
  })
  return { r, findings, gitCalls }
}

const manifest = (a) =>
  readFileSync(dataPaths(a.local).manifest(NOW), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))

describe('local/: allowlist, references, fail-closed reads', () => {
  it('deletes only closed, unreferenced, inventoried artifacts', () => {
    const a = arena()
    put(join(a.local, '659-evidence/shot.png'))
    put(join(a.local, '701-r2-review.log'))
    put(join(a.local, '900-frames/a.png'))
    put(join(a.local, '659-cited-frames/a.png'))
    put(join(a.local, '700-accepted-frames/a.png'))
    put(join(a.local, '700-notes/a.txt'))
    put(join(a.local, 'red-run-evidence/a.png'))
    put(join(a.local, 'codex-auth.json'))
    put(join(a.local, '659-token.log'))
    const { r } = run(a, { steps: ['local'] })
    expect(r.outcome).toBe('complete')
    expect(existsSync(join(a.local, '659-evidence'))).toBe(false)
    expect(existsSync(join(a.local, '701-r2-review.log'))).toBe(false)
    for (const kept of [
      '900-frames',
      '659-cited-frames',
      '700-accepted-frames',
      '700-notes',
      'red-run-evidence',
      'codex-auth.json',
      '659-token.log',
    ]) {
      expect(existsSync(join(a.local, kept)), kept).toBe(true)
    }
    const lines = manifest(a)
    expect(
      lines
        .filter((l) => l.outcome === 'deleted')
        .map((l) => l.rule)
        .sort(),
    ).toEqual(['local-closed-evidence', 'local-closed-log'])
    expect(lines.at(-1)).toMatchObject({ type: 'summary', complete: true })
    expect(lines.at(-1).freedBytes).toBeGreaterThan(0)
  })

  it('an unreadable archive keeps everything and files ONE finding per kind', () => {
    const a = arena({ archive: false })
    put(join(a.local, '659-evidence/shot.png'))
    const first = run(a, { steps: ['local'] })
    expect(first.r.outcome).toBe('failed')
    expect(existsSync(join(a.local, '659-evidence'))).toBe(true)
    expect(first.findings.map((f) => f.title)).toEqual(['Housekeeping failure: work-order-unreadable'])
    const second = run(a, { steps: ['local'] })
    expect(second.findings).toEqual([])
    expect(readFileSync(dataPaths(a.local).failures, 'utf8').trim().split('\n')).toHaveLength(2)
  })

  it('an unreadable worktree list skips the step', () => {
    const a = arena()
    put(join(a.local, '659-evidence/shot.png'))
    const { r } = run(a, { steps: ['local'], readWorktrees: () => null })
    expect(r.steps.local).toBe('skipped')
    expect(existsSync(join(a.local, '659-evidence'))).toBe(true)
  })

  it('never deletes a registered worktree or a tree holding .git', () => {
    const a = arena()
    put(join(a.local, '659-frames/a.png'))
    put(join(a.local, '700-frames/.git'), 'gitdir: elsewhere')
    const { r } = run(a, {
      steps: ['local'],
      readWorktrees: () => `worktree ${a.repo}\n\nworktree ${join(a.local, '659-frames')}\n`,
    })
    expect(r.outcome).toBe('complete')
    expect(existsSync(join(a.local, '659-frames/a.png'))).toBe(true)
    expect(existsSync(join(a.local, '700-frames/.git'))).toBe(true)
    const reasons = manifest(a).map((l) => l.reason)
    expect(reasons).toContain('git worktree')
    expect(reasons).toContain('contains .git')
  })

  it('does not traverse symlinks: a linked entry stays, a link inside a deleted dir leaves its target', () => {
    const a = arena()
    mkdirSync(a.local, { recursive: true })
    symlinkSync(a.outside, join(a.local, '659-frames'), 'dir')
    put(join(a.local, '700-evidence/a.png'))
    symlinkSync(a.outside, join(a.local, '700-evidence/escape'), 'dir')
    run(a, { steps: ['local'] })
    expect(existsSync(join(a.local, '659-frames'))).toBe(true)
    expect(existsSync(join(a.local, '700-evidence'))).toBe(false)
    expect(readFileSync(join(a.outside, 'precious.txt'), 'utf8')).toBe('keep me')
  })

  it('a dry run deletes nothing and plans the bytes', () => {
    const a = arena()
    put(join(a.local, '659-evidence/shot.png'), 'abcdef')
    const { r, gitCalls } = run(a, { dryRun: true })
    expect(existsSync(join(a.local, '659-evidence/shot.png'))).toBe(true)
    expect(r.plannedBytes).toBeGreaterThan(0)
    expect(r.freedBytes).toBe(0)
    expect(manifest(a).map((l) => l.outcome)).toContain('would-delete')
    expect(gitCalls.some((c) => c.includes('gc'))).toBe(false)
  })

  it('refuses to run from a worktree (.git is a file)', () => {
    const a = arena()
    rmSync(join(a.repo, '.git'), { recursive: true })
    writeFileSync(join(a.repo, '.git'), 'gitdir: x')
    expect(run(a).r.outcome).toBe('refused')
  })
})

describe('local/tool-output-logs', () => {
  it('removes files older than 14 days unless referenced', () => {
    const a = arena()
    const logs = join(a.local, 'tool-output-logs')
    put(join(logs, 'old.log'))
    put(join(logs, 'old-cited.log'))
    put(join(logs, 'young.log'))
    age(join(logs, 'old.log'))
    age(join(logs, 'old-cited.log'))
    writeFileSync(join(a.repo, 'docs/backlog.md'), 'see old-cited.log')
    run(a, { steps: ['logs'] })
    expect(existsSync(join(logs, 'old.log'))).toBe(false)
    expect(existsSync(join(logs, 'old-cited.log'))).toBe(true)
    expect(existsSync(join(logs, 'young.log'))).toBe(true)
  })
})

describe('/tmp', () => {
  function cache(a, name) {
    put(join(a.tmp, name, 'ssr/abc123.js'))
    put(join(a.tmp, name, 'web/def456.js'))
    age(join(a.tmp, name))
    return join(a.tmp, name)
  }
  it('removes old cache dirs and hoa-* logs; keeps young, odd-shaped, held-open and linked ones', () => {
    const a = arena()
    const gone = cache(a, 'Ab12Cd34Ef')
    const held = cache(a, 'Zz98Yy76Xx')
    const odd = cache(a, 'Odd0Shape1')
    put(join(odd, 'package.json'))
    age(odd)
    put(join(a.tmp, 'Young1Cache', 'ssr/x.js'))
    put(join(a.tmp, 'hoa-old.log'))
    age(join(a.tmp, 'hoa-old.log'))
    put(join(a.tmp, 'notes.txt'))
    age(join(a.tmp, 'notes.txt'))
    symlinkSync(a.outside, join(a.tmp, 'hoa-link'), 'dir')
    const { r } = run(a, {
      steps: ['tmp'],
      readProcesses: () => ({ ok: true, openPaths: [join(held, 'web/def456.js')], cmdlines: [] }),
    })
    expect(r.outcome).toBe('complete')
    expect(existsSync(gone)).toBe(false)
    expect(existsSync(join(a.tmp, 'hoa-old.log'))).toBe(false)
    for (const kept of [held, odd, join(a.tmp, 'Young1Cache'), join(a.tmp, 'notes.txt'), join(a.tmp, 'hoa-link')]) {
      expect(existsSync(kept), kept).toBe(true)
    }
    expect(readFileSync(join(a.outside, 'precious.txt'), 'utf8')).toBe('keep me')
  })
  it('an unreadable process table skips the whole step', () => {
    const a = arena()
    const c = cache(a, 'Ab12Cd34Ef')
    const { r, findings } = run(a, { steps: ['tmp', 'git'], readProcesses: () => ({ ok: false, openPaths: [], cmdlines: null }) })
    expect(r.steps.tmp).toBe('skipped')
    expect(r.steps.git).toBe('skipped')
    expect(existsSync(c)).toBe(true)
    expect(findings.map((f) => f.title)).toEqual(['Housekeeping failure: proc-unreadable'])
  })
})

describe('budget and resume', () => {
  it('ends incomplete at the budget and resumes from the cursor', () => {
    const a = arena()
    for (const n of ['659-a-frames', '659-b-frames', '659-c-frames', '659-d-frames']) put(join(a.local, n, '1.png'))
    const first = run(a, { steps: ['local'], budgetEntries: 4 })
    expect(first.r.outcome).toBe('incomplete')
    expect(first.r.complete).toBe(false)
    const state = JSON.parse(readFileSync(dataPaths(a.local).state, 'utf8'))
    expect(state.cursor.local).toBeTruthy()
    expect(state.lastSuccessAt).toBeUndefined()
    let r
    for (let i = 0; i < 5; i++) {
      r = run(a, { steps: ['local'], budgetEntries: 4 }).r
      if (r.outcome === 'complete') break
    }
    expect(r.outcome).toBe('complete')
    for (const n of ['659-a-frames', '659-b-frames', '659-c-frames', '659-d-frames'])
      expect(existsSync(join(a.local, n))).toBe(false)
  })
})

describe('budget: an entry larger than the whole budget', () => {
  it('is kept as scan incomplete and passed, so it never blocks later runs', () => {
    const a = arena()
    for (let i = 0; i < 10; i++) put(join(a.local, '659-a-frames', `${i}.png`))
    put(join(a.local, '659-b-frames/1.png'))
    run(a, { steps: ['local'], budgetEntries: 4 })
    expect(existsSync(join(a.local, '659-a-frames'))).toBe(true)
    expect(manifest(a).find((l) => l.path?.endsWith('659-a-frames'))?.reason).toBe('scan incomplete')
    // The next run starts after it (local/housekeeping/ sorts later and takes
    // the rest of a 4-entry budget, so a third run finishes the step).
    run(a, { steps: ['local'], budgetEntries: 4 })
    expect(existsSync(join(a.local, '659-b-frames'))).toBe(false)
    expect(run(a, { steps: ['local'], budgetEntries: 4 }).r.outcome).toBe('complete')
  })
})

describe('git', () => {
  it('runs gc --auto in the foreground when quiet, skips while a suite runs', () => {
    const a = arena()
    const quiet = run(a, { steps: ['git'] })
    expect(quiet.gitCalls).toContainEqual(['-c', 'gc.autoDetach=false', 'gc', '--auto'])
    const busy = run(a, {
      steps: ['git'],
      readProcesses: () => ({ ok: true, openPaths: [], cmdlines: ['node scripts/verify/run-all.mjs polish'] }),
    })
    expect(busy.gitCalls.some((c) => c.includes('gc'))).toBe(false)
    expect(busy.r.steps.git).toBe('skipped')
  })
})

describe('lock', () => {
  it('a live holder makes an overlapping run exit at once; a dead holder is taken over', () => {
    const a = arena()
    const paths = dataPaths(a.local)
    mkdirSync(paths.dir, { recursive: true })
    put(join(a.local, '659-evidence/a.png'))
    expect(acquireLock(paths.lock, { now: NOW }).ok).toBe(true)
    const overlap = run(a, { steps: ['local'] })
    expect(overlap.r.outcome).toBe('overlap')
    expect(existsSync(join(a.local, '659-evidence'))).toBe(true)
    writeJsonAtomic(paths.lock, { pid: 2 ** 22 + 7, pidStartedAt: 1, startedAt: 1 })
    const taken = run(a, { steps: ['local'] })
    expect(taken.r.outcome).toBe('complete')
    expect(existsSync(paths.lock)).toBe(false)
    expect(existsSync(join(a.local, '659-evidence'))).toBe(false)
  })
})

describe('the launcher hook', () => {
  function fakeSpawner() {
    const calls = []
    const spawner = (cmd, args, opts) => {
      const child = { unrefd: false, on: () => child, unref: () => (child.unrefd = true) }
      calls.push({ cmd, args, opts, child })
      return child
    }
    return { calls, spawner }
  }
  it('spawns detached and unref’d, then not again within 24 h; honours the script’s own stamp', () => {
    const a = arena()
    const statePath = dataPaths(a.local).state
    const { calls, spawner } = fakeSpawner()
    const first = spawnHousekeepingIfDue({ now: NOW, lastSpawnAt: 0, statePath, spawner, cwd: a.repo })
    expect(first.spawned).toBe(true)
    expect(calls[0].opts).toMatchObject({ detached: true, stdio: 'ignore' })
    expect(calls[0].child.unrefd).toBe(true)
    expect(spawnHousekeepingIfDue({ now: NOW + 1000, lastSpawnAt: first.lastSpawnAt, statePath, spawner }).spawned).toBe(false)
    put(statePath, JSON.stringify({ lastAttemptAt: NOW + DAY_MS }))
    expect(spawnHousekeepingIfDue({ now: NOW + DAY_MS + 1000, lastSpawnAt: 0, statePath, spawner }).spawned).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('does not delay the daemon tick: a never-exiting child, ticks keep their pace', { timeout: 30_000 }, async () => {
    const a = arena()
    const recordPath = join(a.dir, 'launcher.json')
    const logPath = join(a.dir, 'launcher.log')
    const statePath = dataPaths(a.local).state
    const { calls, spawner } = fakeSpawner()
    const tickTimes = []
    let ticks = 0
    const t0 = Date.now()
    await runDaemon({
      recordPath,
      logPath,
      tickMs: 150,
      pollMs: 20,
      readLock: () => null,
      isPaused: () => false,
      sendAlert: () => true,
      tick: () => {
        tickTimes.push(Date.now() - t0)
        ticks += 1
        if (ticks >= 3) writeJsonAtomic(recordPath, { stopped: true, stoppedAt: Date.now() + 1 })
        return Promise.resolve(0)
      },
      housekeep: ({ now, lastSpawnAt }) => spawnHousekeepingIfDue({ now, lastSpawnAt, statePath, spawner, cwd: a.repo }),
    })
    expect(ticks).toBe(3)
    expect(calls).toHaveLength(1)
    // Three ticks 150 ms apart: well under a second unless something blocked.
    expect(tickTimes[2]).toBeLessThan(3000)
    expect(readFileSync(logPath, 'utf8')).toContain('housekeeping spawned')
  })
})
