// THE DAEMON AGAINST A REAL SANDBOX (point 834, step 3): a drill daemon in a
// throwaway repository with a bare origin, a live batch lock owned by this test
// process, and a real stub worker that commits and pushes. Production start
// stays REFUSED — the dark pin — and a drill against this checkout is refused
// too. The parent-death kill itself lives in the drill
// (scripts/batch-daemon-drill.mjs); this file covers the daemon's contract:
// exclusive existence, fenced mutations, idempotent retries, checkpoint
// acknowledgment, cancellation that preserves the branch, drain and restart.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { processStartTime } from './batch-singleton.mjs'
import { markUnverifiedTail } from './batch-schema-core.mjs'
import { ensureFenceStore, openStateStore, readJournal } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { canonicalWorktree, clearLockCopy, controlRequest, startDaemon, writeLockCopy } from './batch-daemon.mjs'
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
  // Only what the SINGLETON's fence file holds. The generation the daemon serves
  // under is the LANE's, minted into its own state store by startDaemon — it
  // cannot live here, because every acquisition rewrites this file from a fixed
  // field set and would erase it.
  writeFileSync(join(repo, '.claude', 'batch-fence.json'), JSON.stringify({ v: 1, fence: FENCE }))
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
    expect(refused.reason).toMatch(/durable lane is off/)
  })

  it('refuses a drill daemon against this checkout', async () => {
    const refused = await startDaemon({ repoDir: REPO_ROOT, batchId: BATCH, drill: true })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/sandbox/)
  })

  it('refuses a drill daemon through a SYMLINK to this checkout — the interlock compares real paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'link-interlock-'))
    try {
      const link = join(dir, 'looks-outside')
      execFileSync('ln', ['-s', REPO_ROOT, link], { windowsHide: true })
      const refused = await startDaemon({ repoDir: link, batchId: BATCH, drill: true })
      expect(refused.ok).toBe(false)
      expect(refused.reason).toMatch(/sandbox/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
    expect(production.out).toMatch(/durable lane is off/)
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
    // The generation is minted, not configured; what matters is that it is a real
    // one and that the store keeps handing out the SAME one.
    expect(record.generation).toMatch(/^[0-9a-f]{32}$/)
    expect(record.generation).toBe(JSON.parse(readFileSync(openStateStore({ repoDir: repo, batchId: BATCH }).fenceStorePath, 'utf8')).generation)
    expect(record.fence).toBe(FENCE)
    expect(record.state).toBe('running')
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
    // Prototype names are not commands: a bare handler index would answer
    // 'constructor' with an inherited function instead of this refusal.
    for (const inherited of ['constructor', 'toString']) {
      const res = await controlRequest({ repoDir: repo, batchId: BATCH, request: { cmd: inherited, sessionId: SID, fence: FENCE, payload: { batchId: BATCH } } })
      expect(res.ok, inherited).toBe(false)
      expect(res.reason, inherited).toMatch(/unknown command/)
    }
  })

  it('authorizes on the server path before dispatch: a broken owner-only boundary is refused and runs no verb', async () => {
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const before = readJournal(store).entries
    const attemptId = 'must-never-dispatch'
    chmodSync(store.dir, 0o777)
    try {
      const refused = await controlRequest({
        repoDir: repo,
        batchId: BATCH,
        request: {
          cmd: 'record-state',
          sessionId: SID,
          fence: FENCE,
          payload: { batchId: BATCH, pointId: 'p-auth', attemptId, state: 'queued', at: Date.now() },
        },
      })
      expect(refused.ok).toBe(false)
      expect(refused.reason).toMatch(/control authorization refused.*owner-only control path/)
    } finally {
      chmodSync(store.dir, 0o700)
    }
    const after = readJournal(store).entries
    expect(after).toHaveLength(before.length)
    expect(after.some((entry) => entry.attemptId === attemptId)).toBe(false)
    // Restoring the boundary restores service; the refusal closed only the
    // unauthorized connection, not the listening daemon.
    expect((await request('status')).ok).toBe(true)
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
    // The REFUSAL did not poison its idempotency key: the identical retry runs
    // the operation again — here into the worktree claim held by a1, a live
    // refusal — instead of answering `alreadyApplied` for work that never ran.
    const retried = await request('start-attempt', { pointId: 'p2', attemptId: 'a2', branch: 'feat/stub', worktree, adapter: 'stub' })
    expect(retried.alreadyApplied).toBeUndefined()
    expect(retried.ok).toBe(false)
    expect(retried.reason).toMatch(/share|claimed/)
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

  it('adopts only a verified live lane: standing lease, live holder, moving heartbeat', async () => {
    const live = await request('adopt-attempt', { attemptId: 'a1', fence: FENCE })
    expect(live.ok, live.reason).toBe(true)
    expect(live.result.worker.pid).toBeGreaterThan(0)
    expect(live.result.worker.leaseId).toBeTruthy()
    // A recorded attempt WITHOUT a live worker under this daemon is
    // reconciliation's case: mere presence in the state map adopts nothing.
    const dead = await request('adopt-attempt', { attemptId: 'cap-b', fence: FENCE })
    expect(dead.ok).toBe(false)
    expect(dead.reason).toMatch(/reconcile/)
  })

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
    // The branch is left intact for inspection: UNMOVED since the worker was
    // fenced — a mere existence check would pass even if the fenced worker
    // kept pushing, which is exactly the failure this case exists to catch.
    const tipAtFencing = git(['rev-parse', 'feat/fenced'], originDir)
    await sleep(2500) // two stub work intervals: time enough for an unfenced worker to push again
    expect(git(['rev-parse', 'feat/fenced'], originDir)).toBe(tipAtFencing)
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

  it('atomically closes admission before counting workers and journals the refusal reason', async () => {
    const reason = 'planned handover boundary'
    const closed = await request('close-admission', { requestId: 'boundary-1', reason })
    expect(closed.ok, closed.reason).toBe(true)
    expect(closed.result).toMatchObject({ admission: { open: false, reason } })
    expect(closed.result.remainingWorkers).toBeGreaterThanOrEqual(0)

    const refused = await request('start-attempt', {
      pointId: 'p4',
      attemptId: 'after-boundary',
      branch: 'feat/after-boundary',
      worktree: worktree2,
      adapter: 'stub',
    })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/worker admission is closed: planned handover boundary/)

    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const closure = readJournal(store).entries.find((entry) => entry.kind === 'command' && entry.name === 'close-admission')
    expect(closure?.payload).toMatchObject({ batchId: BATCH, requestId: 'boundary-1', reason })
    expect((await request('status')).admission).toEqual({ open: false, reason })
  })

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
    expect(journal.entries.some((e) => e.kind === 'daemon-lifecycle' && e.event === 'stop' && e.record?.state === 'stopping')).toBe(true)
    expect(JSON.parse(readFileSync(join(repo, '.claude', 'batch-lock.json'), 'utf8')).daemon).toBeUndefined()
  }, 15_000)

  it('restarts against the same journal, preserving idempotency and closed admission', async () => {
    const restarted = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true })
    expect(restarted.ok, restarted.reason).toBe(true)
    const replayed = await request('start-attempt', { pointId: 'p1', attemptId: 'a1', branch: 'feat/stub', worktree, adapter: 'stub' })
    expect(replayed).toMatchObject({ ok: true, alreadyApplied: true })
    const refused = await request('start-attempt', { pointId: 'p5', attemptId: 'after-restart', branch: 'feat/after-restart', worktree, adapter: 'stub' })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/worker admission is closed: planned handover boundary/)
    expect((await request('status')).admission).toEqual({ open: false, reason: 'planned handover boundary' })
    const down = await request('shutdown', {})
    expect(down.ok).toBe(true)
    await sleep(500)
  }, 20_000)
})

describe('two SIMULTANEOUS daemon starts', () => {
  it('lets exactly one claim the record before anything is journalled', async () => {
    const CC_BATCH = 'concurrent-batch'
    const store = openStateStore({ repoDir: repo, batchId: CC_BATCH })
    // These two race `serve` DIRECTLY, so nothing has seeded this batch's fence
    // store the way startDaemon would; without it both would exit on the missing
    // generation and the race under test would never happen.
    expect(ensureFenceStore(store, { fence: FENCE }).ok).toBe(true)
    const procs = ['nonce-one', 'nonce-two'].map((nonce) =>
      spawn('node', ['scripts/batch-daemon.mjs', 'serve', '--repo', repo, '--batch', CC_BATCH, '--nonce', nonce, '--drill'], {
        windowsHide: true,
        cwd: REPO_ROOT,
        stdio: 'ignore',
      }),
    )
    const exits = []
    procs.forEach((p) => p.on('exit', (code) => exits.push(code)))
    try {
      // Both race the exclusive create; the loser exits without having written
      // a byte of journal. Wait for one loser and a booted winner.
      const deadline = Date.now() + 20_000
      while ((exits.length < 1 || readJournal(store).entries.length < 2) && Date.now() < deadline) await sleep(200)
      expect(exits.length).toBeGreaterThanOrEqual(1)
      const record = readJsonIfAny(store.daemonRecordPath)
      expect(record).toBeTruthy()
      expect(['nonce-one', 'nonce-two']).toContain(record.launchNonce)
      const journal = readJournal(store)
      expect(journal.verdict).toBe('ok')
      // ONE start under ONE writer: no interleaved sequences, no second record.
      expect(journal.entries.filter((e) => e.kind === 'daemon-lifecycle' && e.event === 'start')).toHaveLength(1)
    } finally {
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

describe('a handover fence is journalled before the first entry it authorises', () => {
  const FT_BATCH = 'fence-order-batch'
  const ftRequest = (fence, cmd, payload = {}) =>
    controlRequest({ repoDir: repo, batchId: FT_BATCH, request: { cmd, sessionId: SID, fence, payload: { batchId: FT_BATCH, ...payload } } })

  it('writes the fence transition ahead of an attempt state journalled by the same mutation', async () => {
    const lockPath = join(repo, '.claude', 'batch-lock.json')
    const lockBefore = readFileSync(lockPath, 'utf8')
    const started = await startDaemon({ repoDir: repo, batchId: FT_BATCH, drill: true })
    expect(started.ok, started.reason).toBe(true)
    const store = openStateStore({ repoDir: repo, batchId: FT_BATCH })
    try {
      // The lock moves to the successor fence; the daemon has not journalled
      // that fence yet. The FIRST mutation under it is one whose operation
      // itself journals an attempt state — exactly where the transition used
      // to land BEHIND the entry it authorises.
      writeFileSync(lockPath, JSON.stringify({ ...JSON.parse(lockBefore), fence: FENCE + 1 }))
      const res = await ftRequest(FENCE + 1, 'record-state', { pointId: 'p1', attemptId: 'ft1', state: 'queued', at: Date.now() })
      expect(res.ok, res.reason).toBe(true)
      const journal = readJournal(store)
      expect(journal.verdict).toBe('ok')
      const transition = journal.entries.find((e) => e.kind === 'fence-transition' && e.fence === FENCE + 1)
      const state = journal.entries.find((e) => e.kind === 'attempt-state' && e.attemptId === 'ft1')
      expect(transition, 'the successor fence has a transition').toBeTruthy()
      expect(state).toBeTruthy()
      expect(transition.seq).toBeLessThan(state.seq)
      // The fence-placing reader agrees: no entry reads as written under a
      // fence not in force at its position.
      const transitions = journal.entries.filter((e) => e.kind === 'fence-transition')
      const marked = markUnverifiedTail({ entries: journal.entries, transitions, lastConfirmedSeq: journal.entries.at(-1).seq, currentFence: FENCE + 1 })
      expect(marked.filter((e) => e.quarantine)).toEqual([])
      const down = await ftRequest(FENCE + 1, 'shutdown', {})
      expect(down.ok).toBe(true)
      await sleep(500)
    } finally {
      writeFileSync(lockPath, lockBefore)
      const record = readJsonIfAny(store.daemonRecordPath)
      if (record?.pid) {
        try {
          process.kill(record.pid, 'SIGTERM')
        } catch {
          /* already gone */
        }
      }
      await sleep(300)
    }
  }, 25_000)
})

describe('writeLockCopy against a planted symlink', () => {
  it('refuses to write the daemon copy through a symlinked lock file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-copy-link-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      const target = join(dir, 'elsewhere.json')
      writeFileSync(target, JSON.stringify({ sessionId: SID, fence: FENCE, pid: process.pid, pidStartedAt: processStartTime(process.pid), leaseUntil: Date.now() + 3_600_000 }))
      execFileSync('ln', ['-s', target, join(dir, '.claude', 'batch-lock.json')], { windowsHide: true })
      const res = writeLockCopy({ repoDir: dir, record: { pid: 1, pidStartedAt: 1, generation: 'gen-link-test' }, sessionId: SID })
      expect(res.ok).toBe(false)
      expect(res.reason).toMatch(/symlink/)
      // The planted target survived the refused write untouched.
      expect(JSON.parse(readFileSync(target, 'utf8')).daemon).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('clearLockCopy owns only the stopping daemon copy', () => {
  it('clears its exact copy and refuses a copy naming another generation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-copy-clear-'))
    const lockPath = join(dir, '.claude', 'batch-lock.json')
    const stopping = { pid: 10, pidStartedAt: 20, generation: 'generation-current', state: 'stopping' }
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(lockPath, JSON.stringify({ sessionId: SID, fence: FENCE, daemon: { pid: 10, pidStartedAt: 20, generation: 'generation-current' } }))
      expect(clearLockCopy({ repoDir: dir, record: stopping, sessionId: SID, fence: FENCE }).ok).toBe(true)
      expect(JSON.parse(readFileSync(lockPath, 'utf8')).daemon).toBeUndefined()

      writeFileSync(lockPath, JSON.stringify({ sessionId: SID, fence: FENCE, daemon: { pid: 10, pidStartedAt: 20, generation: 'generation-successor' } }))
      const refused = clearLockCopy({ repoDir: dir, record: stopping, sessionId: SID, fence: FENCE })
      expect(refused.ok).toBe(false)
      expect(JSON.parse(readFileSync(lockPath, 'utf8')).daemon.generation).toBe('generation-successor')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
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
      // Make the append fail by REPLACING the journal with a directory of the
      // same name: opening it for append fails with EISDIR for every uid. A
      // chmod to 0400 would not do — CAP_DAC_OVERRIDE (a root test runner)
      // writes straight through a missing write bit, and the test would then
      // assert nothing.
      renameSync(store.journalPath, `${store.journalPath}.aside`)
      mkdirSync(store.journalPath)
      const failing = await jfRequest('record-state', { pointId: 'p1', attemptId: 'jf1', state: 'queued', at: Date.now() })
      expect(failing.ok).toBe(false)
      expect(failing.reason).toMatch(/journal/)
      // The failure is STICKY: later mutations are refused up front...
      rmSync(store.journalPath, { recursive: true })
      renameSync(`${store.journalPath}.aside`, store.journalPath)
      const after = await jfRequest('record-state', { pointId: 'p1', attemptId: 'jf2', state: 'queued', at: Date.now() })
      expect(after.ok).toBe(false)
      expect(after.reason).toMatch(/refuses every mutation/)
      // ...while status stays readable, and the journal carries NO trace of the
      // refused mutations.
      expect((await jfRequest('status')).ok).toBe(true)
      const journal = readJournal(store)
      expect(journal.entries.some((e) => e.kind === 'attempt-state')).toBe(false)
      // Shutdown after the durable failure: the daemon leaves, but its
      // identity record stays COLD — the stop is unwitnessed by the failed
      // journal, and releasing over it would let a successor daemon start
      // over a journal whose tail lies. The next start is therefore refused
      // until reconciliation releases the record.
      const jfRecord = readJsonIfAny(store.daemonRecordPath)
      const down = await jfRequest('shutdown', {})
      expect(down.ok).toBe(true)
      const exitDeadline = Date.now() + 10_000
      while (Date.now() < exitDeadline) {
        try {
          process.kill(jfRecord.pid, 0)
          await sleep(200)
        } catch {
          break
        }
      }
      expect(existsSync(store.daemonRecordPath)).toBe(true)
      const refused = await startDaemon({ repoDir: repo, batchId: JF_BATCH, drill: true, waitMs: 3000 })
      expect(refused.ok).toBe(false)
      expect(refused.log ?? '').toMatch(/cold daemon record/)
    } finally {
      // Restore the journal if the failing branch left the directory in place.
      try {
        if (existsSync(`${store.journalPath}.aside`)) {
          rmSync(store.journalPath, { recursive: true, force: true })
          renameSync(`${store.journalPath}.aside`, store.journalPath)
        }
      } catch {
        /* the sandbox is removed afterwards either way */
      }
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
