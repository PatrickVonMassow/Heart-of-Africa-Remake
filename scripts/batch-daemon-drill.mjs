#!/usr/bin/env node
// THE DRILL THAT REPRODUCES THE REAL REGRESSION — docs/handover-architecture.md,
// "The drill that reproduces the real regression" (work-order point 834; Sol A19).
//
// On 21.08.2026 an authoring run died WITH ITS PARENT SESSION: the spawning
// session's process group was killed and took the awaited wrapper and, through
// its pipes, the worker. A launcher-client exit, a daemon restart and a normal
// handover are all EASIER than that, so this drill does the hard thing:
//
//   1. a PARENT SESSION process (own process group) acquires a sandbox lock,
//      starts the daemon and a stub worker through it, and then sits
//      mid-authoring, exactly like the session that died;
//   2. the OBSERVER — this process, outside the blast radius — SIGKILLs the
//      parent's whole process group without warning;
//   3. it then proves survival and ADOPTION BY OPERATION, not by reading:
//      the daemon still answers under its recorded identity, the worker's
//      branch gains a pushed SHA that DID NOT EXIST at the kill, a fresh
//      session acquires the lock, presents the NEW fence, gets a checkpoint
//      ACKNOWLEDGED, and completes one lifecycle operation — a cancellation
//      that preserves the branch.
//
// The sandbox is a throwaway repository in tmp; a drill against the real
// checkout is refused by startDaemon itself, and that refusal is pinned by
// scripts/batch-daemon.test.mjs.
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { probePid, processStartTime } from './batch-singleton.mjs'
import { PROCESS_START_TOLERANCE_MS } from './batch-schema-core.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { controlRequest, startDaemon, writeLockCopy } from './batch-daemon.mjs'
import { resumeBatch } from './resume-batch.mjs'

const BATCH = 'parent-death-drill'
const FENCE_BEFORE = 7
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const git = (args, cwd) =>
  execFileSync('git', args, { windowsHide: true,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim()

function buildSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'parent-death-'))
  const originDir = join(sandbox, 'origin.git')
  const repo = join(sandbox, 'repo')
  const worktree = join(sandbox, 'wt')
  execFileSync('git', ['init', '-q', '--bare', originDir], { windowsHide: true })
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { windowsHide: true, cwd: originDir })
  execFileSync('git', ['init', '-q', repo], { windowsHide: true })
  writeFileSync(join(repo, 'seed.txt'), 'seed\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'seed'], repo)
  git(['remote', 'add', 'origin', originDir], repo)
  git(['push', '-q', 'origin', 'HEAD:main'], repo)
  execFileSync('git', ['clone', '-q', originDir, worktree], { windowsHide: true })
  git(['checkout', '-q', '-b', 'feat/drill'], worktree)
  git(['push', '-q', 'origin', 'feat/drill'], worktree)
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(join(repo, '.claude', 'batch-fence.json'), JSON.stringify({ fence: FENCE_BEFORE, generation: 'gen-drill-1' }))
  return { sandbox, originDir, repo, worktree }
}

/** THE PARENT SESSION half, run as its own process group: everything a spawning
 *  session does, then an endless mid-authoring sleep for the observer to kill. */
async function parentSession({ repo, worktree, readyPath }) {
  const sid = 'doomed-session'
  writeFileSync(
    join(repo, '.claude', 'batch-lock.json'),
    JSON.stringify({ sessionId: sid, pid: process.pid, pidStartedAt: processStartTime(process.pid), leaseUntil: Date.now() + 3_600_000, fence: FENCE_BEFORE }),
  )
  const started = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true })
  if (!started.ok) throw new Error(`parent: daemon refused: ${started.reason}`)
  const copied = writeLockCopy({ repoDir: repo, record: started.record, sessionId: sid })
  if (!copied.ok) throw new Error(`parent: ${copied.reason}`)
  const attempt = await controlRequest({
    repoDir: repo,
    batchId: BATCH,
    request: {
      cmd: 'start-attempt',
      sessionId: sid,
      fence: FENCE_BEFORE,
      payload: { batchId: BATCH, pointId: 'p-drill', attemptId: 'a-drill', branch: 'feat/drill', worktree, adapter: 'stub' },
    },
  })
  if (!attempt.ok) throw new Error(`parent: start-attempt refused: ${attempt.reason}`)
  const tmp = `${readyPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify({ record: started.record, attempt: attempt.result }))
  renameSync(tmp, readyPath)
  // Mid-authoring, like the session of 21.08.2026: awaiting a tool call that
  // will never return. The observer kills this whole group without warning.
  for (;;) await sleep(1000)
}

async function parentDeathScenario({ keep }) {
  const checks = []
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail })
    return ok
  }
  const { sandbox, originDir, repo, worktree } = buildSandbox()
  const readyPath = join(sandbox, 'parent-ready.json')
  const logPath = join(sandbox, 'parent.log')
  const out = openSync(logPath, 'a')
  // The parent is its own group leader, so the kill below reaches everything a
  // dying session takes — except what correctly escaped it.
  const parent = spawn(process.execPath, ['scripts/batch-daemon-drill.mjs', '--parent-session', '--repo', repo, '--worktree', worktree, '--ready', readyPath], { windowsHide: true,
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', out, out],
  })
  closeSync(out)
  parent.unref()

  try {
    let ready = null
    const readyDeadline = Date.now() + 30_000
    while (!ready && Date.now() < readyDeadline) {
      ready = readJsonIfAny(readyPath)
      if (!ready) await sleep(200)
    }
    if (!check('parent session reached mid-authoring', Boolean(ready), ready ? '' : readFileSync(logPath, 'utf8').slice(-1500))) {
      return { ok: false, scenario: 'parent-death', checks }
    }
    const record = ready.record

    // Let the worker prove it works BEFORE the kill, so survival is of a running
    // authoring process, not of an idle one. The baseline is the tip the SETUP
    // pushed: waiting from null would return that pre-existing tip immediately
    // and pass without any worker push at all.
    const shaAtSetup = git(['rev-parse', 'feat/drill'], originDir)
    const shaBeforeKill = await waitForNewSha({ originDir, since: shaAtSetup, timeoutMs: 15_000 })
    check('the worker pushed while the parent lived', Boolean(shaBeforeKill) && shaBeforeKill !== shaAtSetup)

    // THE KILL: the whole process group, SIGKILL, no warning — a dying session
    // taking its children.
    process.kill(-parent.pid, 'SIGKILL')
    await sleep(500)
    check('the parent group is dead', probePid(parent.pid)?.exists !== true)

    const daemonProbe = probePid(record.pid)
    check(
      'the daemon survived under its recorded pid and start time',
      daemonProbe?.exists === true && Math.abs((daemonProbe.startedAt ?? 0) - record.pidStartedAt) <= PROCESS_START_TOLERANCE_MS,
    )

    const shaAfterKill = await waitForNewSha({ originDir, since: shaBeforeKill, timeoutMs: 20_000 })
    check('the worker pushed a SHA that did not exist at the kill', Boolean(shaAfterKill) && shaAfterKill !== shaBeforeKill)

    // THE FRESH SESSION: acquires the lock, presenting the NEW fence the next
    // acquisition mints (acquisition is the fence's only writer).
    const successorSid = 'successor-session'
    const newFence = FENCE_BEFORE + 1
    writeFileSync(join(repo, '.claude', 'batch-fence.json'), JSON.stringify({ fence: newFence, generation: 'gen-drill-1' }))
    writeFileSync(
      join(repo, '.claude', 'batch-lock.json'),
      JSON.stringify({
        sessionId: successorSid,
        pid: process.pid,
        pidStartedAt: processStartTime(process.pid),
        leaseUntil: Date.now() + 3_600_000,
        fence: newFence,
        daemon: { pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation },
      }),
    )
    const successorRequest = (cmd, payload) =>
      controlRequest({ repoDir: repo, batchId: BATCH, request: { cmd, sessionId: successorSid, fence: newFence, payload: { batchId: BATCH, ...payload } } })

    // ADOPTION AFTER RECONCILIATION, in that order: the successor gathers the
    // durable evidence first (step 8), and only a lane that reconciliation
    // reads as running is adopted — through the fenced daemon mutation.
    const resumed = await resumeBatch({ repoDir: repo, batchId: BATCH, sessionId: successorSid })
    const lane = resumed.lanes.find((l) => l.attemptId === 'a-drill')
    check('reconciliation read the surviving lane as running before any adoption', lane?.reading === 'running', lane?.reason ?? '')
    const adopted = resumed.adoptions.find((a) => a.attemptId === 'a-drill')
    check('the fresh session adopted the attempt under the new fence, after reconciliation', adopted?.ok === true, adopted?.reason ?? '')

    const checkpoint = await successorRequest('request-checkpoint', { requestId: 'succ-cp-1', waitMs: 15_000 })
    const answer = checkpoint.ok ? checkpoint.result.answers.find((a) => a.attemptId === 'a-drill') : null
    check('a new checkpoint request was ACKNOWLEDGED by that daemon', answer?.acknowledged === true, checkpoint.reason ?? '')
    check('the acknowledged checkpoint was pushed and clean', answer?.pushedOk === true && answer?.dirty === false)

    const tipBeforeCancel = git(['rev-parse', 'feat/drill'], originDir)
    const cancelled = await successorRequest('cancel-attempt', { attemptId: 'a-drill', requestId: 'succ-cx-1', reason: 'drill complete' })
    check('one post-adoption lifecycle operation completed: cancellation', cancelled.ok === true, cancelled.reason ?? '')
    await sleep(300)
    check('the cancellation preserved the branch', git(['rev-parse', 'feat/drill'], originDir) === tipBeforeCancel)

    const down = await successorRequest('shutdown', { drain: true })
    check('the daemon drained on request', down.ok === true)

    // The reply alone proves nothing about what the drain WROTE: the journal
    // must replay clean, and the daemon's stop must carry the SUCCESSOR's
    // fence — a stop under the dead parent's fence would be a write under a
    // credential the lock no longer carries.
    await sleep(1500)
    const journal = readJournal(openStateStore({ repoDir: repo, batchId: BATCH }))
    check('the journal replays clean after the handover shutdown', journal.verdict === 'ok', JSON.stringify(journal.corruption))
    const stop = journal.entries.filter((e) => e.kind === 'daemon-lifecycle' && e.event === 'stop').pop()
    check('the shutdown was journalled under the successor fence', stop?.fence === newFence, `stop fence: ${stop?.fence}`)

    return { ok: checks.every((c) => c.ok), scenario: 'parent-death', checks, sandbox: keep ? sandbox : undefined }
  } finally {
    try {
      process.kill(-parent.pid, 'SIGKILL')
    } catch {
      /* long dead, which is the point */
    }
    const leftover = readJsonIfAny(openStateStore({ repoDir: repo, batchId: BATCH }).daemonRecordPath)
    if (leftover?.pid) {
      await sleep(1000)
      try {
        process.kill(leftover.pid, 'SIGKILL')
      } catch {
        /* already drained */
      }
    }
    if (!keep) rmSync(sandbox, { recursive: true, force: true })
  }
}

async function waitForNewSha({ originDir, since, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let tip = null
    try {
      tip = git(['rev-parse', 'feat/drill'], originDir)
    } catch {
      tip = null
    }
    if (tip && tip !== since) return tip
    if (Date.now() > deadline) return null
    await sleep(300)
  }
}

export async function runDrill({ scenario, keep = false } = {}) {
  if (scenario === 'parent-death') return parentDeathScenario({ keep })
  return { ok: false, reason: `unknown scenario: ${String(scenario)}; this slice carries parent-death (the later drills are 676's remainder)` }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv[0] === '--parent-session') {
    const arg = (name) => argv[argv.indexOf(name) + 1]
    parentSession({ repo: arg('--repo'), worktree: arg('--worktree'), readyPath: arg('--ready') }).catch((error) => {
      console.error(error?.stack || String(error))
      process.exit(1)
    })
  } else {
    runDrill({ scenario: argv.includes('--scenario') ? argv[argv.indexOf('--scenario') + 1] : 'parent-death', keep: argv.includes('--keep') }).then((result) => {
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.ok ? 0 : 1)
    })
  }
}
