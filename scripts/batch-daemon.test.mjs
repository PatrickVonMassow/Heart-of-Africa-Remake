// THE DAEMON AGAINST A REAL SANDBOX (point 834, step 3): a drill daemon in a
// throwaway repository with a bare origin, a live batch lock owned by this test
// process, and a real stub worker that commits and pushes. Production start
// stays REFUSED — the dark pin — and a drill against this checkout is refused
// too. The parent-death kill itself lives in the drill
// (scripts/batch-daemon-drill.mjs); this file covers the daemon's contract:
// exclusive existence, fenced mutations, idempotent retries, checkpoint
// acknowledgment, cancellation that preserves the branch, drain and restart.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { processStartTime } from './batch-singleton.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { canonicalWorktree, controlRequest, startDaemon, writeLockCopy } from './batch-daemon.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const BATCH = 'drill-batch'
const SID = 'test-session'
const FENCE = 7

let sandbox, repo, worktree, worktree2, originDir, record

const git = (args, cwd) =>
  execFileSync('git', args, { windowsHide: true,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim()

const request = (cmd, payload = {}) =>
  controlRequest({ repoDir: repo, batchId: BATCH, request: { cmd, sessionId: SID, fence: FENCE, payload: { batchId: BATCH, ...payload } } })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'daemon-sandbox-'))
  originDir = join(sandbox, 'origin.git')
  repo = join(sandbox, 'repo')
  worktree = join(sandbox, 'wt')
  execFileSync('git', ['init', '-q', '--bare', originDir], { windowsHide: true })
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { windowsHide: true, cwd: originDir })
  execFileSync('git', ['init', '-q', repo], { windowsHide: true })
  writeFileSync(join(repo, 'seed.txt'), 'seed\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'seed'], repo)
  git(['remote', 'add', 'origin', originDir], repo)
  git(['push', '-q', 'origin', 'HEAD:main'], repo)
  execFileSync('git', ['clone', '-q', originDir, worktree], { windowsHide: true })
  git(['checkout', '-q', '-b', 'feat/stub'], worktree)
  git(['push', '-q', 'origin', 'feat/stub'], worktree)
  worktree2 = join(sandbox, 'wt2')
  execFileSync('git', ['clone', '-q', originDir, worktree2], { windowsHide: true })
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(
    join(repo, '.claude', 'batch-lock.json'),
    JSON.stringify({ sessionId: SID, pid: process.pid, pidStartedAt: processStartTime(process.pid), leaseUntil: Date.now() + 3_600_000, fence: FENCE }),
  )
  writeFileSync(join(repo, '.claude', 'batch-fence.json'), JSON.stringify({ fence: FENCE, generation: 'gen-sandbox-1' }))
}, 30_000)

afterAll(async () => {
  try {
    await request('shutdown', {})
  } catch {
    /* already down */
  }
  const store = openStateStore({ repoDir: repo, batchId: BATCH })
  const leftover = readJsonIfAny(store.daemonRecordPath)
  if (leftover?.pid) {
    try {
      process.kill(leftover.pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  rmSync(sandbox, { recursive: true, force: true })
})

describe('the dark pin', () => {
  it('refuses a production start while the steps are not green', async () => {
    const refused = await startDaemon({ repoDir: repo, batchId: BATCH, drill: false })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/not green/)
  })

  it('refuses a drill daemon against this checkout', async () => {
    const refused = await startDaemon({ repoDir: REPO_ROOT, batchId: BATCH, drill: true })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/sandbox/)
  })

  it('enforces both gates in the serving process itself: a direct serve dispatch cannot bypass them', () => {
    const run = (extraArgs) => {
      const res = execFileSync('node', ['scripts/batch-daemon.mjs', 'serve', '--batch', BATCH, '--nonce', 'direct-nonce', ...extraArgs], {
        windowsHide: true,
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { status: 0, out: res }
    }
    // Production serve while the steps are not green: refused by serve itself.
    let production
    try {
      production = run(['--repo', repo])
    } catch (error) {
      production = { status: error.status, out: `${error.stdout}${error.stderr}` }
    }
    expect(production.status).not.toBe(0)
    expect(production.out).toMatch(/not green/)
    // Drill serve against this checkout: refused by serve itself.
    let drill
    try {
      drill = run(['--repo', REPO_ROOT, '--drill'])
    } catch (error) {
      drill = { status: error.status, out: `${error.stdout}${error.stderr}` }
    }
    expect(drill.status).not.toBe(0)
    expect(drill.out).toMatch(/sandbox/)
  })
})

describe('canonicalWorktree — the symlink half of one-worktree/one-attempt', () => {
  it('resolves a symlink alias to the same canonical path as its target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'canon-'))
    try {
      const real = join(dir, 'real-wt')
      mkdirSync(real)
      const link = join(dir, 'alias-wt')
      execFileSync('ln', ['-s', real, link], { windowsHide: true })
      const viaReal = canonicalWorktree(real)
      const viaLink = canonicalWorktree(link)
      expect(viaReal.ok && viaLink.ok).toBe(true)
      expect(viaLink.path).toBe(viaReal.path)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a relative path and a path that does not exist', () => {
    expect(canonicalWorktree('relative/wt').ok).toBe(false)
    expect(canonicalWorktree('/definitely/not/there').ok).toBe(false)
  })
})

describe('the daemon lifecycle in the sandbox', () => {
  it('starts, records its identity, and refuses a second daemon while it lives', async () => {
    const started = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true })
    expect(started.ok, started.reason).toBe(true)
    record = started.record
    expect(record.generation).toBe('gen-sandbox-1')
    expect(record.fence).toBe(FENCE)
    const second = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true })
    expect(second.ok).toBe(false)
    const copied = writeLockCopy({ repoDir: repo, record, sessionId: SID })
    expect(copied.ok).toBe(true)
  }, 20_000)

  it('answers status and refuses a mutation under a stale fence or a foreign session', async () => {
    const status = await request('status')
    expect(status.ok).toBe(true)
    expect(status.journalVerdict).toBe('ok')
    const stale = await controlRequest({
      repoDir: repo,
      batchId: BATCH,
      request: { cmd: 'record-state', sessionId: SID, fence: FENCE - 1, payload: { batchId: BATCH, pointId: 'p1', attemptId: 'x', state: 'queued', at: Date.now() } },
    })
    expect(stale.ok).toBe(false)
    expect(stale.reason).toMatch(/stale fence/)
    const foreign = await controlRequest({
      repoDir: repo,
      batchId: BATCH,
      request: { cmd: 'record-state', sessionId: 'someone-else', fence: FENCE, payload: { batchId: BATCH, pointId: 'p1', attemptId: 'x', state: 'queued', at: Date.now() } },
    })
    expect(foreign.ok).toBe(false)
  })

  it('fences shutdown like every other mutation: no credentials, wrong batch or a stranger cannot drain', async () => {
    const bare = await controlRequest({ repoDir: repo, batchId: BATCH, request: { cmd: 'shutdown', payload: { batchId: BATCH, drain: true } } })
    expect(bare.ok).toBe(false)
    const foreign = await controlRequest({
      repoDir: repo,
      batchId: BATCH,
      request: { cmd: 'shutdown', sessionId: 'someone-else', fence: FENCE, payload: { batchId: BATCH, drain: true } },
    })
    expect(foreign.ok).toBe(false)
    const wrongBatch = await controlRequest({
      repoDir: repo,
      batchId: BATCH,
      request: { cmd: 'shutdown', sessionId: SID, fence: FENCE, payload: { batchId: 'other-batch', drain: true } },
    })
    expect(wrongBatch.ok).toBe(false)
    // The daemon is still alive and serving after all three refusals.
    expect((await request('status')).ok).toBe(true)
  })

  it('starts a stub worker that commits and pushes on its own', async () => {
    const before = git(['rev-parse', 'feat/stub'], originDir)
    const started = await request('start-attempt', { pointId: 'p1', attemptId: 'a1', branch: 'feat/stub', worktree, adapter: 'stub' })
    expect(started.ok, started.reason).toBe(true)
    expect(started.result.pid).toBeGreaterThan(0)
    let after = before
    const deadline = Date.now() + 15_000
    while (after === before && Date.now() < deadline) {
      await sleep(300)
      after = git(['rev-parse', 'feat/stub'], originDir)
    }
    expect(after, 'the worker pushed a new SHA').not.toBe(before)
  }, 20_000)

  it('replays an identical start-attempt as already applied instead of spawning twice', async () => {
    const again = await request('start-attempt', { pointId: 'p1', attemptId: 'a1', branch: 'feat/stub', worktree, adapter: 'stub' })
    expect(again).toMatchObject({ ok: true, alreadyApplied: true })
  })

  it('holds the global cap: with three occupied slots the fourth start is refused', async () => {
    for (const attemptId of ['cap-b', 'cap-c']) {
      const res = await request('record-state', { pointId: 'p9', attemptId, state: 'running', at: Date.now() })
      expect(res.ok, res.reason).toBe(true)
    }
    const fourth = await request('start-attempt', { pointId: 'p2', attemptId: 'a2', branch: 'feat/stub', worktree, adapter: 'stub' })
    expect(fourth.ok).toBe(false)
    expect(fourth.reason).toMatch(/cap/)
    for (const attemptId of ['cap-b', 'cap-c']) {
      const res = await request('record-state', { pointId: 'p9', attemptId, state: 'cancelled', reason: 'cap test over', at: Date.now() })
      expect(res.ok, res.reason).toBe(true)
    }
  })

  it('gets a checkpoint acknowledged with the pushed SHA', async () => {
    const reply = await request('request-checkpoint', { requestId: 'cp-1', waitMs: 15_000 })
    expect(reply.ok, reply.reason).toBe(true)
    const answer = reply.result.answers.find((a) => a.attemptId === 'a1')
    expect(answer).toMatchObject({ acknowledged: true, transferable: true, dirty: false, pushedOk: true })
    expect(git(['rev-parse', 'feat/stub'], originDir)).toBe(answer.sha)
    const repeat = await request('request-checkpoint', { requestId: 'cp-1', waitMs: 15_000 })
    expect(repeat).toMatchObject({ ok: true, alreadyApplied: true })
  }, 20_000)

  it('fences a resumed worker whose lease moved on: it stops, branch intact (M40)', async () => {
    // A second stub on its own branch, so fencing one lane cannot disturb the
    // checkpoint lane above.
    git(['checkout', '-q', '-b', 'feat/fenced'], worktree2)
    git(['push', '-q', 'origin', 'feat/fenced'], worktree2)
    const started = await request('start-attempt', { pointId: 'p3', attemptId: 'f1', branch: 'feat/fenced', worktree: worktree2, adapter: 'stub' })
    expect(started.ok, started.reason).toBe(true)
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const attemptDir = join(store.dir, 'attempts', 'f1')
    const leasePath = join(attemptDir, 'lease.json')
    const lease = readJsonIfAny(leasePath).lease
    // The daemon re-granted this attempt elsewhere: same shape, other lease id.
    writeFileSync(leasePath, `${JSON.stringify({ lease: { ...lease, leaseId: 'someone-elses-grant' } })}\n`)
    let status = null
    const deadline = Date.now() + 15_000
    while (status?.phase !== 'fenced' && Date.now() < deadline) {
      await sleep(250)
      status = readJsonIfAny(join(attemptDir, 'status.json'))
    }
    expect(status?.phase, JSON.stringify(status)).toBe('fenced')
    expect(status.reason).toMatch(/not the lease that stands/)
    // The branch is left intact for inspection: still on the remote, unmoved
    // since the worker was fenced.
    expect(git(['rev-parse', 'feat/fenced'], originDir)).toBeTruthy()
  }, 25_000)

  it('cancels the attempt, preserves the branch, and journals the last pushed SHA', async () => {
    const tip = git(['rev-parse', 'feat/stub'], originDir)
    const cancelled = await request('cancel-attempt', { attemptId: 'a1', requestId: 'cx-1', reason: 'drill over' })
    expect(cancelled.ok, cancelled.reason).toBe(true)
    expect(cancelled.result.branchPreserved).toBe(true)
    await sleep(300)
    expect(git(['rev-parse', 'feat/stub'], originDir)).toBe(tip)
    // The on-disk lease was REVOKED before any signal: even a worker that had
    // resisted its signals would find every further push fenced, and the dead
    // worker probes gone before anything was released.
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const leaseFile = readJsonIfAny(join(store.dir, 'attempts', 'a1', 'lease.json'))
    expect(leaseFile.lease).toBe(null)
    expect(leaseFile.revokedAt).toBeGreaterThan(0)
  }, 20_000)

  it('drains: seals the snapshot, releases the record, and the journal replays clean', async () => {
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const reply = await request('shutdown', { drain: true })
    expect(reply.ok).toBe(true)
    const deadline = Date.now() + 10_000
    while (existsSync(store.daemonRecordPath) && Date.now() < deadline) await sleep(200)
    expect(existsSync(store.daemonRecordPath)).toBe(false)
    const snapshot = JSON.parse(readFileSync(store.snapshotPath, 'utf8'))
    expect(snapshot.sealed).toBe(true)
    const journal = readJournal(store)
    expect(journal.verdict).toBe('ok')
    expect(journal.entries.some((e) => e.kind === 'daemon-lifecycle' && e.event === 'stop')).toBe(true)
  }, 15_000)

  it('restarts against the same journal and still refuses the replayed start-attempt key', async () => {
    const restarted = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true })
    expect(restarted.ok, restarted.reason).toBe(true)
    const replayed = await request('start-attempt', { pointId: 'p1', attemptId: 'a1', branch: 'feat/stub', worktree, adapter: 'stub' })
    expect(replayed).toMatchObject({ ok: true, alreadyApplied: true })
    const down = await request('shutdown', {})
    expect(down.ok).toBe(true)
    await sleep(500)
  }, 20_000)
})

describe('a durably failing journal fails closed', () => {
  const JF_BATCH = 'journal-fail-batch'
  const jfRequest = (cmd, payload = {}) =>
    controlRequest({ repoDir: repo, batchId: JF_BATCH, request: { cmd, sessionId: SID, fence: FENCE, payload: { batchId: JF_BATCH, ...payload } } })

  it('refuses the failing mutation and every one after it, instead of acknowledging over missing bytes', async () => {
    const started = await startDaemon({ repoDir: repo, batchId: JF_BATCH, drill: true })
    expect(started.ok, started.reason).toBe(true)
    const store = openStateStore({ repoDir: repo, batchId: JF_BATCH })
    try {
      // Take the journal's write bit away: the next append is refused by the
      // filesystem, which stands in for disk-full and every other durable no.
      chmodSync(store.journalPath, 0o400)
      const failing = await jfRequest('record-state', { pointId: 'p1', attemptId: 'jf1', state: 'queued', at: Date.now() })
      expect(failing.ok).toBe(false)
      expect(failing.reason).toMatch(/journal/)
      // The failure is STICKY: later mutations are refused up front...
      chmodSync(store.journalPath, 0o600)
      const after = await jfRequest('record-state', { pointId: 'p1', attemptId: 'jf2', state: 'queued', at: Date.now() })
      expect(after.ok).toBe(false)
      expect(after.reason).toMatch(/refuses every mutation/)
      // ...while status stays readable, and the journal carries NO trace of the
      // refused mutations.
      expect((await jfRequest('status')).ok).toBe(true)
      const journal = readJournal(store)
      expect(journal.entries.some((e) => e.kind === 'attempt-state')).toBe(false)
    } finally {
      chmodSync(store.journalPath, 0o600)
      const record = readJsonIfAny(store.daemonRecordPath)
      if (record?.pid) {
        try {
          process.kill(record.pid, 'SIGTERM')
        } catch {
          /* already gone */
        }
      }
      await sleep(500)
    }
  }, 30_000)
})
