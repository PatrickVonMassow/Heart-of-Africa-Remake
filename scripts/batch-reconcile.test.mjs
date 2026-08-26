// SUCCESSOR RECONCILIATION AGAINST A REAL SANDBOX (point 834, step 8): the
// gatherer reads only durable inputs, classifies a live lane as running, adopts
// it through the daemon by operation, reads a killed daemon as the cold record
// it is, refuses to release it while a lane still claims to run, and releases
// it once the contradiction is gone.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { processStartTime } from './batch-singleton.mjs'
import { openStateStore } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { controlRequest, startDaemon, writeLockCopy } from './batch-daemon.mjs'
import { applyPairResolution, gatherEvidence, probeIntentRefs, reconcileProbe } from './batch-reconcile.mjs'
import { resumeBatch } from './resume-batch.mjs'

const BATCH = 'reconcile-batch'
const SID = 'owner-session'
const SUCCESSOR_SID = 'successor-session'
const FENCE = 5

let sandbox, repo, worktree, originDir

const git = (args, cwd) =>
  execFileSync('git', args, { windowsHide: true,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'reconcile-sandbox-'))
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
  git(['checkout', '-q', '-b', 'feat/rec'], worktree)
  git(['push', '-q', 'origin', 'feat/rec'], worktree)
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(
    join(repo, '.claude', 'batch-lock.json'),
    JSON.stringify({ sessionId: SID, pid: process.pid, pidStartedAt: processStartTime(process.pid), leaseUntil: Date.now() + 3_600_000, fence: FENCE }),
  )
  writeFileSync(join(repo, '.claude', 'batch-fence.json'), JSON.stringify({ fence: FENCE, generation: 'gen-reconcile-1' }))
}, 30_000)

afterAll(async () => {
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

describe('reconciliation over a live batch, then over its corpse', () => {
  it('classifies a live lane as running and adopts it through the daemon', async () => {
    const started = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true })
    expect(started.ok, started.reason).toBe(true)
    writeLockCopy({ repoDir: repo, record: started.record, sessionId: SID })
    const attempt = await controlRequest({
      repoDir: repo,
      batchId: BATCH,
      request: {
        cmd: 'start-attempt',
        sessionId: SID,
        fence: FENCE,
        payload: { batchId: BATCH, pointId: 'p1', attemptId: 'r1', branch: 'feat/rec', worktree, adapter: 'stub' },
      },
    })
    expect(attempt.ok, attempt.reason).toBe(true)
    await sleep(2500)

    const sealed = await controlRequest({
      repoDir: repo,
      batchId: BATCH,
      request: { cmd: 'seal-boundary', sessionId: SID, fence: FENCE, payload: { batchId: BATCH, requestId: 'reconcile-boundary' } },
    })
    expect(sealed.ok, sealed.reason).toBe(true)
    writeFileSync(join(repo, '.claude', 'batch-boundary.json'), JSON.stringify({
      v: 1, kind: 'durable-batch-boundary', phase: 'committed', batchId: BATCH,
      sessionId: SID, fence: FENCE, requestId: 'reconcile-boundary',
    }))
    const oldLock = JSON.parse(readFileSync(join(repo, '.claude', 'batch-lock.json'), 'utf8'))
    writeFileSync(join(repo, '.claude', 'batch-lock.json'), JSON.stringify({
      ...oldLock, sessionId: SUCCESSOR_SID, fence: FENCE + 1, leaseUntil: Date.now() + 3_600_000,
    }))

    const resumed = await resumeBatch({ repoDir: repo, batchId: BATCH, sessionId: SUCCESSOR_SID, refill: false })
    expect(resumed.registry.ok).toBe(true)
    expect(resumed.pair.reading).toBe('healthy')
    expect(resumed.daemonLive).toBe(true)
    const lane = resumed.lanes.find((l) => l.attemptId === 'r1')
    expect(lane?.reading, lane?.reason).toBe('running')
    expect(resumed.adoptions).toEqual([{ attemptId: 'r1', ok: true, reason: null }])
    expect(resumed.refill.ok).toBe(true)
    expect(resumed.boundary).toMatchObject({ ok: true, markerFence: FENCE, successorFence: FENCE + 1 })
  }, 30_000)

  it('reads a SIGKILLed daemon as the cold record it is, with its worker lane still accounted', async () => {
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const record = readJsonIfAny(store.daemonRecordPath)
    process.kill(record.pid, 'SIGKILL')
    await sleep(400)

    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    expect(report.pair.reading).toBe('stale-copy')
    expect(report.pair.action).toBe('reconcile-workers-then-release-record-and-clear-copy')
    // The worker is a daemon child and survives the daemon's death; its lane
    // still reads running, which is exactly why the release below must refuse.
    const lane = report.lanes.find((l) => l.attemptId === 'r1')
    expect(lane?.reading).toBe('running')

    const refused = applyPairResolution({ repoDir: repo, batchId: BATCH, report, sessionId: SUCCESSOR_SID })
    expect(refused.ok).toBe(false)
    expect(refused.did).toMatch(/still read running/)
  }, 20_000)

  it('releases the cold record once no lane reads running, idempotently', async () => {
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    // The orphaned worker is stopped the evidence-preserving way: SIGTERM, and
    // its branch stays.
    const lease = readJsonIfAny(join(store.dir, 'attempts', 'r1', 'lease.json'))?.lease
    try {
      process.kill(lease.holder.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
    // Poll until the worker is PROVEN gone: 'stalled' still means a live
    // process, and a live process keeps blocking the release below — so the
    // precondition here is 'missing', nothing weaker.
    let report = null
    let lane = null
    const deadline = Date.now() + 10_000
    for (;;) {
      report = gatherEvidence({ repoDir: repo, batchId: BATCH })
      lane = report.lanes.find((l) => l.attemptId === 'r1')
      if (lane?.reading === 'missing' || Date.now() > deadline) break
      await sleep(300)
    }
    expect(lane?.reading, lane?.reason).toBe('missing')
    const applied = applyPairResolution({ repoDir: repo, batchId: BATCH, report, sessionId: SUCCESSOR_SID })
    expect(applied.ok, applied.did).toBe(true)
    const again = gatherEvidence({ repoDir: repo, batchId: BATCH })
    expect(again.pair.reading).toBe('no-daemon')
    expect(applyPairResolution({ repoDir: repo, batchId: BATCH, report: again, sessionId: SUCCESSOR_SID }).did).toBe('nothing to do')
    // Refill stays refused while the dead lane is unresolved (M29).
    expect(again.refill.ok).toBe(false)
  }, 20_000)

  it('refuses to apply resolutions for anyone but the lock owner', async () => {
    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    const foreign = applyPairResolution({ repoDir: repo, batchId: BATCH, report: { ...report, pair: { ...report.pair, action: 'clear-copy' } }, sessionId: 'stranger' })
    expect(foreign.ok).toBe(false)
    expect(foreign.did).toMatch(/lock owner/)
  })

  it('a takeover that lands INSIDE the mutation window is refused — the revalidation runs under the mutex', () => {
    const lockPath = join(repo, '.claude', 'batch-lock.json')
    const before = readFileSync(lockPath, 'utf8')
    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    // The hook fires after the mutex is entered and before the revalidation —
    // exactly where a bare read-before-write would already have validated and
    // would rename its stale snapshot over the successor's lock.
    reconcileProbe.onMutexEntered = (path) => {
      writeFileSync(path, JSON.stringify({ ...JSON.parse(before), sessionId: 'racing-session', fence: FENCE + 2 }))
    }
    try {
      const raced = applyPairResolution({ repoDir: repo, batchId: BATCH, report: { ...report, pair: { ...report.pair, action: 'clear-copy' } }, sessionId: SUCCESSOR_SID })
      expect(raced.ok).toBe(false)
      expect(raced.did).toMatch(/lock owner/)
      // The successor's lock SURVIVES: nothing renamed a stale snapshot over it.
      expect(JSON.parse(readFileSync(lockPath, 'utf8')).sessionId).toBe('racing-session')
    } finally {
      reconcileProbe.onMutexEntered = null
      writeFileSync(lockPath, before)
    }
  })

  it('refuses to mutate while the lock mutex is held — a takeover mid-swap serializes, never interleaves', () => {
    const mutexDir = join(repo, '.claude', 'batch-lock.json.reaping')
    mkdirSync(mutexDir)
    try {
      const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
      const held = applyPairResolution({ repoDir: repo, batchId: BATCH, report: { ...report, pair: { ...report.pair, action: 'clear-copy' } }, sessionId: SUCCESSOR_SID })
      expect(held.ok).toBe(false)
      expect(held.did).toMatch(/mutex is held/)
    } finally {
      rmSync(mutexDir, { recursive: true, force: true })
    }
  }, 10_000)

  it('mutates nothing while the registry is corrupt or entries are quarantined', () => {
    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    for (const bad of [
      { registry: { ok: false, source: 'reconstruction' }, quarantined: [] },
      { registry: { ok: true, source: 'journal-only' }, quarantined: [{ seq: 3, reason: 'unknown kind' }] },
    ]) {
      const res = applyPairResolution({
        repoDir: repo,
        batchId: BATCH,
        report: { ...report, ...bad, pair: { ...report.pair, action: 'clear-copy' } },
        sessionId: SUCCESSOR_SID,
      })
      expect(res.ok).toBe(false)
      expect(res.did).toMatch(/corrupt or carries quarantined/)
    }
  })

  it('the CLI exits RED while a lane alerts and refill is refused', () => {
    // The suite's end state: the r1 worker is dead but unresolved (missing,
    // alerting), so refill is refused — automation must see red, not green.
    let status = 0
    let out = ''
    try {
      out = execFileSync('node', ['scripts/batch-reconcile.mjs', '--repo', repo, '--batch', BATCH], { windowsHide: true, encoding: 'utf8' })
    } catch (error) {
      status = error.status
      out = `${error.stdout ?? ''}`
    }
    expect(status).toBe(1)
    expect(JSON.parse(out).refill.ok).toBe(false)
  })

  it('the resume-batch CLI exits RED while reconciliation remains unresolved', () => {
    let status = 0
    let out = ''
    try {
      out = execFileSync('node', ['scripts/resume-batch.mjs', '--repo', repo, '--batch', BATCH, '--session', SUCCESSOR_SID], { windowsHide: true, encoding: 'utf8' })
    } catch (error) {
      status = error.status
      out = `${error.stdout ?? ''}`
    }
    expect(status).toBe(1)
    expect(JSON.parse(out).refill.ok).toBe(false)
  })

  it('counts a publication id only as a parsed TRAILER, never as a message occurrence', () => {
    const id = 'pub-trailer-test-1'
    writeFileSync(join(worktree, 'pub.txt'), 'one\n')
    git(['add', '.'], worktree)
    git(['commit', '-q', '-m', `a subject mentioning ${id} in the message body`], worktree)
    git(['push', '-q', 'origin', 'feat/rec'], worktree)
    const tip = git(['rev-parse', 'HEAD'], worktree)
    const intent = { publicationId: id, moves: [{ ref: 'refs/heads/feat/rec', beforeOid: tip, afterOid: tip }] }
    expect(probeIntentRefs(intent, repo)['refs/heads/feat/rec'].trailerFound).toBe(false)
    writeFileSync(join(worktree, 'pub.txt'), 'two\n')
    git(['add', '.'], worktree)
    git(['commit', '-q', '-m', `a rewritten landing\n\nPublication-Id: ${id}`], worktree)
    git(['push', '-q', 'origin', 'feat/rec'], worktree)
    expect(probeIntentRefs(intent, repo)['refs/heads/feat/rec'].trailerFound).toBe(true)
  })

  it('refuses a STALE report: a lock or record that moved after gathering is never overwritten', async () => {
    const lockPath = join(repo, '.claude', 'batch-lock.json')
    const lockBefore = readFileSync(lockPath, 'utf8')
    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    try {
      // A handover advanced the fence AFTER the report was taken: the write
      // must refuse instead of clobbering the successor's lock.
      writeFileSync(lockPath, JSON.stringify({ ...JSON.parse(lockBefore), fence: FENCE + 2 }))
      const moved = applyPairResolution({ repoDir: repo, batchId: BATCH, report: { ...report, pair: { ...report.pair, action: 'clear-copy' } }, sessionId: SUCCESSOR_SID })
      expect(moved.ok).toBe(false)
      expect(moved.did).toMatch(/regather/)
    } finally {
      writeFileSync(lockPath, lockBefore)
    }
    // A DIFFERENT daemon record stands than the one the report judged cold:
    // releasing it would delete a newer daemon's identity.
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    try {
      writeFileSync(
        store.daemonRecordPath,
        JSON.stringify({ v: 1, pid: process.pid, pidStartedAt: processStartTime(process.pid), generation: 'gen-successor', fence: FENCE, launchNonce: 'n', startedAt: Date.now() }),
      )
      const stale = {
        ...report,
        pair: { action: 'reconcile-workers-then-release-record', record: { pid: 424242, pidStartedAt: 1, generation: 'gen-reconcile-1' } },
      }
      const res = applyPairResolution({ repoDir: repo, batchId: BATCH, report: stale, sessionId: SUCCESSOR_SID })
      expect(res.ok).toBe(false)
      expect(res.did).toMatch(/different daemon record/)
    } finally {
      rmSync(store.daemonRecordPath, { force: true })
    }
  })
})
