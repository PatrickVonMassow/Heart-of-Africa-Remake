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
import { applyPairResolution, gatherEvidence } from './batch-reconcile.mjs'
import { resumeBatch } from './resume-batch.mjs'

const BATCH = 'reconcile-batch'
const SID = 'owner-session'
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

    const resumed = await resumeBatch({ repoDir: repo, batchId: BATCH, sessionId: SID })
    expect(resumed.registry.ok).toBe(true)
    expect(resumed.pair.reading).toBe('healthy')
    expect(resumed.daemonLive).toBe(true)
    const lane = resumed.lanes.find((l) => l.attemptId === 'r1')
    expect(lane?.reading, lane?.reason).toBe('running')
    expect(resumed.adoptions).toEqual([{ attemptId: 'r1', ok: true, reason: null }])
    expect(resumed.refill.ok).toBe(true)
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

    const refused = applyPairResolution({ repoDir: repo, batchId: BATCH, report, sessionId: SID })
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
    await sleep(800)

    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    const lane = report.lanes.find((l) => l.attemptId === 'r1')
    expect(['missing', 'stalled']).toContain(lane?.reading)
    const applied = applyPairResolution({ repoDir: repo, batchId: BATCH, report, sessionId: SID })
    expect(applied.ok, applied.did).toBe(true)
    const again = gatherEvidence({ repoDir: repo, batchId: BATCH })
    expect(again.pair.reading).toBe('no-daemon')
    expect(applyPairResolution({ repoDir: repo, batchId: BATCH, report: again, sessionId: SID }).did).toBe('nothing to do')
    // Refill stays refused while the dead lane is unresolved (M29).
    expect(again.refill.ok).toBe(false)
  }, 20_000)

  it('refuses to apply resolutions for anyone but the lock owner', async () => {
    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    const foreign = applyPairResolution({ repoDir: repo, batchId: BATCH, report: { ...report, pair: { ...report.pair, action: 'clear-copy' } }, sessionId: 'stranger' })
    expect(foreign.ok).toBe(false)
    expect(foreign.did).toMatch(/lock owner/)
  })

  it('refuses a STALE report: a lock or record that moved after gathering is never overwritten', async () => {
    const lockPath = join(repo, '.claude', 'batch-lock.json')
    const lockBefore = readFileSync(lockPath, 'utf8')
    const report = gatherEvidence({ repoDir: repo, batchId: BATCH })
    try {
      // A handover advanced the fence AFTER the report was taken: the write
      // must refuse instead of clobbering the successor's lock.
      writeFileSync(lockPath, JSON.stringify({ ...JSON.parse(lockBefore), fence: FENCE + 1 }))
      const moved = applyPairResolution({ repoDir: repo, batchId: BATCH, report: { ...report, pair: { ...report.pair, action: 'clear-copy' } }, sessionId: SID })
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
      const res = applyPairResolution({ repoDir: repo, batchId: BATCH, report: stale, sessionId: SID })
      expect(res.ok).toBe(false)
      expect(res.did).toMatch(/different daemon record/)
    } finally {
      rmSync(store.daemonRecordPath, { force: true })
    }
  })
})
