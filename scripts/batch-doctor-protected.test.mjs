// THE DOCTOR NEVER STASHES THE WORK ORDER (no user order is ever lost, 21.10.2026).
//
// At 11:15Z `batch-doctor --repair` (owner gone, an unhandled parallel alert)
// moved the uncommitted TASKS.md appends of points 1402–1406 into a quarantine
// stash and judged the repo "consistent"; the carrier already said queued. The
// pure planner, the rescue commit and the whole CLI run are pinned here — the
// last one REPLAYS that sequence on a throwaway repository.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import {
  NEEDS_PROTECTED_SECURED,
  PROTECTED_PATHS,
  planRemediation,
  quarantineScope,
  quarantineStashArgs,
} from './batch-doctor-core.mjs'
import { INDEX_RESCUE_DIR, rescueProtectedCommit } from './batch-doctor-states.mjs'
import { appendPoint, makeRepoFixture } from './carrier-reconcile-fixture.mjs'

const CLEAN = { dirtyFiles: [], divergence: { ahead: 0, behind: 0 }, tasksParses: true, parallelDetected: false }
const DIRTY = ['TASKS.md', 'docs/tasks-archive.md', '.claude/queue-rank.json', 'docs/work-packages.md', 'src/x.ts']
const actions = (plan) => plan.map((a) => a.action)

describe('quarantineScope / quarantineStashArgs — only unprotected paths are stashed', () => {
  it('of the work order, archive, queue rank, work packages and src/x.ts only src/x.ts is quarantinable', () => {
    const scope = quarantineScope(DIRTY)
    expect(scope.quarantinable).toEqual(['src/x.ts'])
    expect(scope.protected.sort()).toEqual([...PROTECTED_PATHS].sort())
    expect(scope.needed).toBe(true)
    expect(quarantineScope(['TASKS.md']).needed).toBe(false)
  })

  it('excludes every protected path from the stash, tracked or untracked, and composes with the verification exclusion', () => {
    const args = quarantineStashArgs('q')
    for (const p of PROTECTED_PATHS) expect(args).toContain(`:(exclude)${p}`)
    expect(args.slice(0, 6)).toEqual(['stash', 'push', '-u', '-m', 'q', '--'])
    const live = quarantineStashArgs('q', { excludeVerification: true })
    expect(live).toContain(':(exclude)verification')
    for (const p of PROTECTED_PATHS) expect(live).toContain(`:(exclude)${p}`)
    const scope = quarantineScope(['verification/a.png', 'TASKS.md'], { verificationWriterLive: true })
    expect(scope.needed).toBe(false)
    expect(scope.protected).toEqual(['TASKS.md'])
  })

  it('a parallel window with dirty protected paths plans rescue + alert ahead of the quarantine', () => {
    const plan = planRemediation({ ...CLEAN, dirtyFiles: DIRTY, parallelDetected: true })
    expect(actions(plan)).toEqual(['rescue-protected-commit', 'alert-protected-paths', 'quarantine-stash'])
    expect(plan[0].targets).toContain('TASKS.md')
  })

  it('ordinary owner work (no parallel window, no reset) leaves a dirty TASKS.md alone', () => {
    expect(planRemediation({ ...CLEAN, dirtyFiles: ['TASKS.md'] })).toEqual([])
  })
})

describe('the plan rescues before anything can overwrite the protected files', () => {
  it('diverged main (+1/-1), no parallel session, dirty TASKS.md: rescue precedes rescue-and-reset', () => {
    const plan = planRemediation({ ...CLEAN, dirtyFiles: ['TASKS.md', 'src/x.ts'], divergence: { ahead: 1, behind: 1 } })
    const order = actions(plan)
    expect(order.indexOf('rescue-protected-commit')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('rescue-protected-commit')).toBeLessThan(order.indexOf('rescue-and-reset'))
    // The unprotected dirt is quarantined, not destroyed by the hard reset.
    expect(order.indexOf('quarantine-stash')).toBeLessThan(order.indexOf('rescue-and-reset'))
    expect(order).toContain('alert-protected-paths')
  })

  it('a damaged TASKS.md goes into the rescue commit with an alert before it is restored from HEAD', () => {
    const plan = planRemediation({ ...CLEAN, dirtyFiles: ['TASKS.md'], tasksParses: false, tasksRecoverable: true })
    const order = actions(plan)
    expect(order.indexOf('rescue-protected-commit')).toBeLessThan(order.indexOf('restore-tasks-from-head'))
    expect(order).toContain('alert-protected-paths')
  })

  it('a torn merge rescues first; abort, reset and restore all wait for the rescue', () => {
    const plan = planRemediation({ ...CLEAN, dirtyFiles: ['TASKS.md'], mergeInProgress: true })
    expect(actions(plan).indexOf('rescue-protected-commit')).toBeLessThan(actions(plan).indexOf('abort-merge'))
    expect([...NEEDS_PROTECTED_SECURED].sort()).toEqual(['abort-merge', 'rescue-and-reset', 'restore-tasks-from-head'])
  })
})

describe('rescueProtectedCommit — a pushed rescue branch through a temporary index', () => {
  let repo
  beforeEach(() => {
    repo = makeRepoFixture({ points: [100] })
  })
  afterEach(() => rmSync(repo.base, { recursive: true, force: true }))

  it('commits the dirty work order without touching HEAD, the index or the working tree, and pushes it', () => {
    appendPoint(repo.root, 1402)
    writeFileSync(join(repo.root, 'src.txt'), 'other dirt\n')
    const head = repo.git('rev-parse', 'HEAD')
    const statusBefore = repo.git('status', '--porcelain')
    const r = rescueProtectedCommit({ repo: repo.root, paths: ['TASKS.md'], now: Date.parse('2026-10-21T11:15:21.622Z'), pid: 4242 })
    expect(r.branch).toBe('rescue/doctor-2026-10-21T11-15-21-622Z-4242')
    expect(r.pushed).toBe(true)
    expect(repo.git('rev-parse', 'HEAD')).toBe(head)
    expect(repo.git('status', '--porcelain')).toBe(statusBefore)
    expect(repo.git('show', `${r.branch}:TASKS.md`)).toContain('- [ ] 1402.')
    expect(repo.git('ls-remote', 'origin', r.ref)).toContain(r.commit)
    expect(repo.git('show', '--name-only', '--format=', r.branch)).toBe('TASKS.md')
  })

  it('two runs in the same second never overwrite each other, and the same bytes reuse one branch', () => {
    const now = Date.parse('2026-10-21T11:15:21.000Z')
    appendPoint(repo.root, 1402)
    const a = rescueProtectedCommit({ repo: repo.root, paths: ['TASKS.md'], now, pid: 1 })
    appendPoint(repo.root, 1403)
    const b = rescueProtectedCommit({ repo: repo.root, paths: ['TASKS.md'], now, pid: 2 })
    expect(a.ref).not.toBe(b.ref)
    expect(repo.git('show', `${a.branch}:TASKS.md`)).not.toContain('1403.')
    expect(repo.git('show', `${b.branch}:TASKS.md`)).toContain('1403.')
    const again = rescueProtectedCommit({ repo: repo.root, paths: ['TASKS.md'], now: now + 1000, pid: 3 })
    expect(again.reused).toBe(true)
    expect(again.ref).toBe(b.ref)
  })

  it('keeps the STAGED version of a protected file that was then removed from the working copy', () => {
    appendPoint(repo.root, 1402, 'Staged only order')
    repo.git('add', 'TASKS.md')
    rmSync(join(repo.root, 'TASKS.md'))
    const r = rescueProtectedCommit({ repo: repo.root, paths: ['TASKS.md'] })
    expect(r.pushed).toBe(true)
    // The working copy (deleted) is what the tree holds at its path; the staged bytes survive beside it.
    expect(repo.git('show', `${r.branch}:${INDEX_RESCUE_DIR}/TASKS.md`)).toContain('- [ ] 1402. Staged only order')
    // The real index is untouched.
    expect(repo.git('diff', '--cached', '--name-only')).toBe('TASKS.md')
  })

  it('reports a push that fails instead of claiming the rescue is secured', () => {
    appendPoint(repo.root, 1402)
    repo.git('remote', 'set-url', 'origin', join(repo.base, 'gone.git'))
    const r = rescueProtectedCommit({ repo: repo.root, paths: ['TASKS.md'] })
    expect(r.pushed).toBe(false)
    expect(r.pushError).toBeTruthy()
  })
})

describe('REPLAY 21.10.2026: append, tick, doctor --repair with the owner gone and an unhandled parallel alert', () => {
  const CLI = repoPath('scripts', 'batch-doctor.mjs')
  let repo
  let mem
  const doctor = () =>
    spawnSync(process.execPath, [CLI, '--repair'], {
      cwd: repo.root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
      env: { ...process.env, HOA_REPO_ROOT: repo.root, FINDINGS_MEMORY_DIR: mem, CLAUDE_SESSION_ID: '' },
    })

  beforeEach(() => {
    repo = makeRepoFixture({ points: [1400] })
    mem = mkdtempSync(join(tmpdir(), 'hoa-doctor-mem-'))
    // 10:31Z — the point is appended (uncommitted) and the carrier already ticked.
    appendPoint(repo.root, 1402, 'A walking villager rear leg trembles')
    writeFileSync(join(repo.root, 'scratch.txt'), 'unattributed\n')
    writeFileSync(
      join(mem, 'findings-carrier.md'),
      '- [x] 2026-10-21T10:31:00.000Z · s · [request] · queued 1402 · Villager leg trembles\n      #spec\n      x\n\n',
    )
    // An unhandled parallel alert naming ANOTHER session; no owner lock at all.
    writeFileSync(join(repo.root, '.claude', 'parallel-alert.json'), JSON.stringify({ at: Date.now(), parallel: [{ sid: 'other-window' }] }))
  })
  afterEach(() => {
    rmSync(repo.base, { recursive: true, force: true })
    rmSync(mem, { recursive: true, force: true })
  })

  it('keeps point 1402 in TASKS.md, secures it on a pushed rescue branch, alerts and never says consistent — twice', () => {
    const first = doctor()
    const out1 = `${first.stdout}${first.stderr}`
    expect(out1).toMatch(/doctor run starting/)
    expect(first.status).toBe(1)
    expect(out1).not.toMatch(/VERDICT: consistent/)
    expect(out1).toMatch(/EXECUTED rescue-protected-commit/)
    // The carrier said "queued 1402" while 1402 was only in the working tree: RED.
    expect(out1).toMatch(/carrier reconciliation: RED[\s\S]*RED point 1402 .* only in the working tree/)
    // Never silently lost: still in the working tree, and on the pushed rescue branch.
    expect(readFileSync(join(repo.root, 'TASKS.md'), 'utf8')).toContain('- [ ] 1402.')
    const rescue = repo.git('for-each-ref', '--format=%(refname:short)', 'refs/heads/rescue/').split('\n').filter(Boolean)
    expect(rescue).toHaveLength(1)
    expect(repo.git('show', `${rescue[0]}:TASKS.md`)).toContain('- [ ] 1402.')
    expect(repo.git('ls-remote', 'origin', `refs/heads/${rescue[0]}`)).not.toBe('')
    // The unprotected dirt went to the quarantine stash; TASKS.md did not.
    expect(existsSync(join(repo.root, 'scratch.txt'))).toBe(false)
    const stashed = execFileSync('git', ['-C', repo.root, 'stash', 'show', '--include-untracked', '--name-only', 'stash@{0}'], { encoding: 'utf8', windowsHide: true })
    expect(stashed).toContain('scratch.txt')
    expect(stashed).not.toContain('TASKS.md')
    // The owner's inbox carries the alert.
    expect(readFileSync(join(mem, 'findings-carrier.md'), 'utf8')).toMatch(/batch-doctor secured unattributed work-order changes on rescue\/doctor-/)

    // The run two seconds later must still see it.
    const second = doctor()
    expect(second.status).toBe(1)
    expect(`${second.stdout}${second.stderr}`).not.toMatch(/VERDICT: consistent/)
    expect(repo.git('for-each-ref', '--format=%(refname:short)', 'refs/heads/rescue/').split('\n').filter(Boolean)).toHaveLength(1)
  }, 240000)

  it('fails closed when the rescue cannot be pushed: nothing overwrites the work order', () => {
    // Diverge main (+1/-1) so a hard reset would be planned, then lose the remote.
    const other = join(repo.base, 'other')
    execFileSync('git', ['clone', '-q', repo.origin, other], { windowsHide: true })
    const og = (...a) => execFileSync('git', ['-C', other, '-c', 'user.name=o', '-c', 'user.email=o@o', ...a], { windowsHide: true })
    writeFileSync(join(other, 'remote.txt'), 'r\n')
    og('add', 'remote.txt')
    og('commit', '-qm', 'remote side')
    og('push', '-q', 'origin', 'main')
    writeFileSync(join(repo.root, 'local.txt'), 'l\n')
    repo.git('add', 'local.txt')
    repo.git('commit', '-qm', 'local side')
    repo.git('fetch', '-q', 'origin')
    repo.git('remote', 'set-url', 'origin', join(repo.base, 'gone.git'))
    const head = repo.git('rev-parse', 'HEAD')
    const run = doctor()
    const out = `${run.stdout}${run.stderr}`
    expect(run.status).toBe(1)
    expect(out).toMatch(/FAILED rescue-protected-commit push/)
    expect(out).toMatch(/REFUSED rescue-and-reset/)
    expect(out).not.toMatch(/VERDICT: consistent/)
    expect(repo.git('rev-parse', 'HEAD')).toBe(head)
    expect(readFileSync(join(repo.root, 'TASKS.md'), 'utf8')).toContain('- [ ] 1402.')
  }, 240000)
})
