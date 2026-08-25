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
import { acquire, probePid, processStartTime } from './batch-singleton.mjs'
import { PROCESS_START_TOLERANCE_MS } from './batch-schema-core.mjs'
import { IDLE_WINDOW_MS } from './batch-ownership-core.mjs'
import { LEASE_MS } from './batch-lease-core.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { attemptPaths, readJsonIfAny } from './detached-agent.mjs'
import { controlRequest, startDaemon, writeLockCopy } from './batch-daemon.mjs'
import { resumeBatch } from './resume-batch.mjs'

const BATCH = 'parent-death-drill'
const FENCE_BEFORE = 7
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** THE EXACT reason `validateMutation` emits for the staleness described by
 *  `expectation` — or null when that expectation does not describe a stale
 *  credential at all. Built from the REAL fence values the drill minted, not
 *  matched by pattern: the anchored regex it replaces accepted
 *  `stale fence: presented <any>, the lock carries <any>`, so a daemon
 *  validating against the WRONG epoch could answer with a stale-SHAPED reason
 *  carrying unrelated, equal or leading-zero numbers and satisfy the check
 *  (round-15 review). An exact string cannot be satisfied by the wrong numbers,
 *  and it also ends the anchoring question for good — the round-14 finding that
 *  `$` matches before a final newline cannot recur against `===`. */
export function expectedStaleRefusal(expectation) {
  const { kind, presented, carried } = expectation ?? {}
  if (kind === 'session') return 'the lock names another session'
  if (kind !== 'fence') return null
  // A fence is stale only if it DIFFERS from the one the lock carries; equal
  // values describe a valid presentation, which validateMutation never refuses
  // for staleness, so no expected reason exists.
  if (!Number.isInteger(presented) || !Number.isInteger(carried) || presented === carried) return null
  return `stale fence: presented ${presented}, the lock carries ${carried}`
}

/** What each probe's ONE stale credential is called in its verdict. */
const CREDENTIAL = { session: 'the session identity', fence: 'the fence' }

/**
 * JUDGES a stale probe's reply: passed only when the daemon REFUSED with the
 * EXACT reason the ONE stale credential that probe presents must produce.
 *
 * THE EXPECTATION IS LOAD-BEARING, twice over.
 * `validateMutation` checks the session id BEFORE the fence, so a probe that
 * presents BOTH credentials stale is refused on the fence alone by a daemon
 * that never looks at session ids — and an either-refusal judge passed it
 * (round-14). Each probe therefore presents exactly one stale credential and
 * names it here, so a fence refusal can no longer answer for the session probe
 * nor the reverse.
 * And the fence expectation carries the REAL numbers, so a refusal quoting an
 * epoch this drill never minted is not evidence either (round-15).
 *
 * Pure and exported so the judge itself is testable against the daemon this
 * drill must catch — one that accepts the dead credentials. A probe that was
 * accepted proves the daemon ignores that credential; one that failed for any
 * OTHER reason (a timeout, a socket error, a different validation failure)
 * proves nothing and is refused as evidence too.
 */
export function staleProbeRefused(reply, expectation) {
  const expected = expectedStaleRefusal(expectation)
  if (expected === null) return { ok: false, why: `no staleness is described by ${JSON.stringify(expectation ?? null)}` }
  const credential = CREDENTIAL[expectation.kind]
  if (reply?.ok === true) return { ok: false, why: `accepted — the daemon does not enforce ${credential}` }
  const reason = reply?.reason ?? ''
  if (reason !== expected) {
    return {
      ok: false,
      why: `failed, but not for the staleness of ${credential}: expected ${JSON.stringify(expected)}, got ${reason ? JSON.stringify(reason) : '(no reason)'}`,
    }
  }
  return { ok: true, why: `refusal reason: ${reason}` }
}

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
  // Only what the SINGLETON's fence file legitimately holds: a number for the
  // parent's acquisition to advance past. The generation the daemon needs is the
  // lane's own, minted in its state store — hand-seeding it here was what let the
  // drill pass over a fence file no real acquisition had ever written.
  writeFileSync(join(repo, '.claude', 'batch-fence.json'), JSON.stringify({ v: 1, fence: FENCE_BEFORE }))
  return { sandbox, originDir, repo, worktree }
}

/** THE PARENT SESSION half, run as its own process group: everything a spawning
 *  session does, then an endless mid-authoring sleep for the observer to kill. */
async function parentSession({ repo, worktree, readyPath, neuterEpoch = false }) {
  const sid = 'doomed-session'
  // THE PARENT'S LOCK IS ACQUIRED, NOT WRITTEN. A hand-built lock is not the
  // shape acquisition produces — it carried no `claimedAt`, so every later
  // ownership read judged it as "no lock" and the successor's real acquisition
  // could not reap it. The drill is about what happens to a REAL owner.
  const acquired = acquire(sid, {
    lockPath: join(repo, '.claude', 'batch-lock.json'),
    fencePath: join(repo, '.claude', 'batch-fence.json'),
    pid: process.pid,
    pidStartedAt: processStartTime(process.pid),
  })
  if (acquired !== 'acquired') throw new Error(`parent: could not acquire the drill lock: ${acquired}`)
  const parentFence = readJsonIfAny(join(repo, '.claude', 'batch-lock.json'))?.fence
  if (!Number.isInteger(parentFence)) throw new Error('parent: acquisition minted no fence')
  const started = await startDaemon({ repoDir: repo, batchId: BATCH, drill: true, neuterEpoch })
  if (!started.ok) throw new Error(`parent: daemon refused: ${started.reason}`)
  const copied = writeLockCopy({ repoDir: repo, record: started.record, sessionId: sid })
  if (!copied.ok) throw new Error(`parent: ${copied.reason}`)
  const attempt = await controlRequest({
    repoDir: repo,
    batchId: BATCH,
    request: {
      cmd: 'start-attempt',
      sessionId: sid,
      fence: parentFence,
      payload: { batchId: BATCH, pointId: 'p-drill', attemptId: 'a-drill', branch: 'feat/drill', worktree, adapter: 'stub' },
    },
  })
  if (!attempt.ok) throw new Error(`parent: start-attempt refused: ${attempt.reason}`)
  // THE READY FILE CARRIES ONLY WHAT DIES WITH THIS SESSION: the fence its
  // acquisition minted, which the stale probes must later present as the dead
  // credential. Daemon record and worker identity are deliberately NOT exported
  // — a drill handed them out-of-band would prove adoption of a takeover it was
  // given, not of one it found. The observer and the successor read both where
  // a real fresh session reads them: the durable state the daemon wrote
  // (cross-vendor review of point 834, B1).
  const tmp = `${readyPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify({ fence: parentFence }))
  renameSync(tmp, readyPath)
  // Mid-authoring, like the session of 21.08.2026: awaiting a tool call that
  // will never return. The observer kills this whole group without warning.
  for (;;) await sleep(1000)
}

async function parentDeathScenario({ keep, neuterEpoch = false }) {
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
  const parent = spawn(process.execPath, ['scripts/batch-daemon-drill.mjs', '--parent-session', '--repo', repo, '--worktree', worktree, '--ready', readyPath, ...(neuterEpoch ? ['--neuter-epoch'] : [])], { windowsHide: true,
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', out, out],
  })
  closeSync(out)
  parent.unref()
  // The start time recorded NOW is what makes every later signal to this pid
  // identity-checked: after the group dies, the bare number can be recycled by
  // an unrelated process, and a signal to a bare number is not cleanup.
  const parentStartedAt = processStartTime(parent.pid)
  const sameRecordedProcess = (pid, startedAt) => {
    const probe = probePid(pid)
    return probe?.exists === true && Number.isFinite(startedAt) && Math.abs((probe.startedAt ?? 0) - startedAt) <= PROCESS_START_TOLERANCE_MS
  }

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
    // The fence the DEAD session held, as its own acquisition minted it — not a
    // constant the drill assumes. Everything below that must be refused is
    // refused against this number.
    const deadFence = ready.fence
    if (!check('the parent reported the fence its acquisition minted', Number.isInteger(deadFence), String(deadFence))) {
      return { ok: false, scenario: 'parent-death', checks }
    }
    // THE DAEMON'S IDENTITY COMES FROM DURABLE STATE, read before the kill so
    // survival can be judged against what stood WHILE THE PARENT LIVED — the
    // parent hands nothing over. This is the same file a fresh session's
    // reconciliation reads, and the baseline the discovery check below must
    // independently rediscover.
    const store = openStateStore({ repoDir: repo, batchId: BATCH })
    const recordBefore = readJsonIfAny(store.daemonRecordPath)
    if (
      !check(
        'the state store names the daemon before the kill',
        Number.isInteger(recordBefore?.pid) && Number.isFinite(recordBefore?.pidStartedAt) && typeof recordBefore?.generation === 'string',
        JSON.stringify(recordBefore),
      )
    ) {
      return { ok: false, scenario: 'parent-death', checks }
    }
    const sameDaemonIdentity = (r) =>
      r?.pid === recordBefore.pid && r?.pidStartedAt === recordBefore.pidStartedAt && r?.generation === recordBefore.generation
    // THE WORKER'S IDENTITY, pinned the same way: pid AND start time, from the
    // lease the daemon granted at spawn — durable state, not a handover. A new
    // pushed SHA alone cannot tell a SURVIVING worker from a REPLACED one: a
    // daemon that let its worker die with the parent and quietly spawned a
    // fresh one would keep pushing too (cross-vendor review of point 834, B2).
    // Survival means THIS process, checked against this identity on both sides
    // of the kill.
    const workerHolder = readJsonIfAny(attemptPaths(join(store.dir, 'attempts', 'a-drill')).leasePath)?.lease?.holder
    if (
      !check(
        'the durable lease names the worker the daemon spawned',
        Number.isInteger(workerHolder?.pid) && Number.isFinite(workerHolder?.pidStartedAt),
        JSON.stringify(workerHolder),
      )
    ) {
      return { ok: false, scenario: 'parent-death', checks }
    }
    check('the worker is alive under its lease identity before the kill', sameRecordedProcess(workerHolder.pid, workerHolder.pidStartedAt))

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

    // THE BASELINE FOR POST-DEATH WORK IS TAKEN HERE, after the death is
    // CONFIRMED — not from the pre-kill sample. A push that landed between that
    // earlier sample and the delivery of SIGKILL was work done while the parent
    // still lived, and counting it as post-kill progress let the check below go
    // green over a worker that did nothing after the death (round-15 review).
    // Read fresh from origin: anything past this value was pushed by a process
    // that outlived its parent.
    const shaAtDeath = git(['rev-parse', 'feat/drill'], originDir)

    const daemonProbe = probePid(recordBefore.pid)
    check(
      'the daemon survived under its recorded pid and start time',
      daemonProbe?.exists === true && Math.abs((daemonProbe.startedAt ?? 0) - recordBefore.pidStartedAt) <= PROCESS_START_TOLERANCE_MS,
    )
    // A daemon that DIED with the parent and was replaced would answer the probe
    // at a fresh pid and rewrite the record; the record still carrying the
    // pre-kill identity is what pins survival to the same process the parent
    // started — and it is the identity discovery must independently find.
    check(
      'the durable record after the kill still names that same daemon',
      sameDaemonIdentity(readJsonIfAny(store.daemonRecordPath)),
      JSON.stringify(readJsonIfAny(store.daemonRecordPath)),
    )

    const shaAfterKill = await waitForNewSha({ originDir, since: shaAtDeath, timeoutMs: 20_000 })
    check(
      'the worker pushed a SHA that did not exist when the parent died',
      Boolean(shaAfterKill) && shaAfterKill !== shaAtDeath,
      `at death ${shaAtDeath}, after ${shaAfterKill}`,
    )
    // Checked AFTER the post-kill push was observed: the process at the lease's
    // pid still carries the lease's start time, so the worker that pushed is
    // the one spawned before the kill — continued output from a replacement
    // cannot satisfy this.
    check(
      'the pushing worker is the same process the daemon spawned before the kill',
      sameRecordedProcess(workerHolder.pid, workerHolder.pidStartedAt),
    )

    // THE FRESH SESSION: acquires the lock through THE REAL ACQUISITION PATH, and
    // presents whatever fence that path mints. This used to be two hard-coded
    // writes of `batch-fence.json` and `batch-lock.json` with `FENCE_BEFORE + 1`,
    // which simulated the outcome of a takeover and therefore could not detect a
    // broken one: an acquisition that minted no number, reused the dispossessed
    // one, or lost the race would all have passed (cross-vendor review of point
    // 834). The successor now takes the batch off the dead session exactly as a
    // real one does — which is also the only way this drill proves that a
    // SIGKILLed owner's lock can be reaped at all.
    const successorSid = 'successor-session'
    const lockPath = join(repo, '.claude', 'batch-lock.json')
    const fencePath = join(repo, '.claude', 'batch-fence.json')
    // THE ONE THING THE DRILL FAST-FORWARDS IS TIME. A state change inside the
    // idle window proves life outright and WITHOUT a pid probe (rule 3 of
    // ownershipVerdict) — deliberately, because a session mid-tool-call writes no
    // heartbeat. A session killed seconds ago therefore still reads alive, and a
    // real successor waits that window out. The drill injects the clock instead
    // of sleeping five minutes; everything the acquisition then does — the dead-pid
    // assessment, the reap mutex, the unlink and recreate, the fence mint — runs
    // for real against the real lock the parent acquired.
    const successorNow = Date.now() + IDLE_WINDOW_MS + LEASE_MS + 60_000
    const outcome = acquire(successorSid, {
      lockPath,
      fencePath,
      now: successorNow,
      pid: process.pid,
      pidStartedAt: processStartTime(process.pid),
    })
    check('the fresh session acquired the dead owner\'s lock through the real path', outcome === 'acquired', String(outcome))
    const successorLock = readJsonIfAny(lockPath)
    const newFence = successorLock?.fence
    // The fence is the whole point of the acquisition: a takeover that does not
    // SUPERSEDE the dispossessed number leaves the dead session's credentials
    // valid, and the two negative probes below would then pass for the wrong
    // reason — because nothing had changed, not because the daemon enforces it.
    check(
      'that acquisition minted a fence strictly above the dispossessed one',
      Number.isInteger(newFence) && newFence > deadFence,
      `fence ${JSON.stringify(newFence)} against ${deadFence}`,
    )
    // DISCOVERY IS THE SUCCESSOR'S OWN WORK. Acquisition hands over a bare lock
    // — proven bare here, because a lock that already named the daemon would
    // make the discovery below a no-op and this drill a simulation again. The
    // record then reaches the lock only the way it reaches a real fresh
    // session's: reconciliation reads the store, classifies the pair as
    // unadopted, and writes the copy FROM THE RECORD under the reap mutex
    // (write-copy-from-record). Nothing the dead parent knew flows in.
    check(
      'acquisition handed the successor no daemon identity — discovery must find it',
      successorLock?.daemon === undefined,
      JSON.stringify(successorLock?.daemon),
    )
    const resumed = await resumeBatch({ repoDir: repo, batchId: BATCH, sessionId: successorSid })
    check(
      'the fresh session DISCOVERED the surviving daemon in durable state',
      resumed.pair?.reading === 'unadopted' && sameDaemonIdentity(resumed.pair?.record),
      `reading ${resumed.pair?.reading}, record ${JSON.stringify(resumed.pair?.record)}`,
    )
    const lockAfterDiscovery = readJsonIfAny(lockPath)
    check(
      'discovery wrote the daemon copy from the record, through the pair resolution',
      resumed.applied?.ok === true && sameDaemonIdentity(lockAfterDiscovery?.daemon),
      JSON.stringify({ applied: resumed.applied ?? null, daemon: lockAfterDiscovery?.daemon ?? null }),
    )
    // ADOPTION AFTER RECONCILIATION, in that order: the successor gathers the
    // durable evidence first (step 8), and only a lane that reconciliation
    // reads as running is adopted — through the fenced daemon mutation.
    const lane = resumed.lanes.find((l) => l.attemptId === 'a-drill')
    check('reconciliation read the surviving lane as running before any adoption', lane?.reading === 'running', lane?.reason ?? '')
    const adopted = resumed.adoptions.find((a) => a.attemptId === 'a-drill')
    check('the fresh session adopted the attempt under the new fence, after reconciliation', adopted?.ok === true, adopted?.reason ?? '')
    const successorRequest = (cmd, payload) =>
      controlRequest({ repoDir: repo, batchId: BATCH, request: { cmd, sessionId: successorSid, fence: newFence, payload: { batchId: BATCH, ...payload } } })

    // THE NEGATIVE HALF OF THE FENCE, without which this drill would pass on a
    // daemon that ignores the credentials entirely: the dead session's id, and
    // the superseded fence, must EACH be refused on their own.
    // The acquisition above installed those credentials for real; these two
    // probes are what prove the daemon actually reads them.
    //
    // ONE STALE CREDENTIAL PER PROBE, and this is the round-14 repair (P1). The
    // dead-session probe used to present the dead fence TOO. `validateMutation`
    // checks the session id first and the fence second, so a daemon that never
    // looks at session ids still refused that probe — for the fence — and the
    // drill passed the very defect it exists to catch. Each probe now presents
    // exactly ONE stale credential beside a VALID one, and is judged against the
    // refusal that credential alone produces.
    //
    // REFUSED MEANS REFUSED FOR THAT STALENESS, not merely "did not succeed": a
    // probe that timed out, or failed against a daemon that had already accepted
    // the stale write, proves nothing — and `ok !== true` alone would have
    // passed both. `staleProbeRefused` (above, unit-tested against an accepting
    // daemon's reply) is the judge, so a daemon ignoring either credential
    // cannot hide behind any other failure of the probe itself.
    const staleSession = staleProbeRefused(
      await controlRequest({
        repoDir: repo,
        batchId: BATCH,
        // The DEAD session id under the CURRENT fence: only the session check can refuse this.
        request: { cmd: 'request-checkpoint', sessionId: 'doomed-session', fence: newFence, payload: { batchId: BATCH, requestId: 'stale-cp-1', waitMs: 2000 } },
      }),
      { kind: 'session' },
    )
    check("the dead session's id is REFUSED after the takeover, under the LIVE fence", staleSession.ok, staleSession.why)
    const staleFence = staleProbeRefused(
      await controlRequest({
        repoDir: repo,
        batchId: BATCH,
        // The SUPERSEDED fence under the LIVE session id: only the fence check can refuse this.
        request: { cmd: 'request-checkpoint', sessionId: successorSid, fence: deadFence, payload: { batchId: BATCH, requestId: 'stale-cp-2', waitMs: 2000 } },
      }),
      // The REAL numbers: the fence this probe presents, and the one the lock
      // actually carries after the takeover.
      { kind: 'fence', presented: deadFence, carried: newFence },
    )
    check('the superseded fence is REFUSED even under the live session id', staleFence.ok, staleFence.why)

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
    // Cleanup signals only processes whose recorded identity still stands: a
    // confirmed-dead group is never re-killed, because after death the bare
    // pid — and with it the process-group id — can belong to a stranger.
    if (sameRecordedProcess(parent.pid, parentStartedAt)) {
      try {
        process.kill(-parent.pid, 'SIGKILL')
      } catch {
        /* died between probe and signal */
      }
    }
    const leftover = readJsonIfAny(openStateStore({ repoDir: repo, batchId: BATCH }).daemonRecordPath)
    if (leftover?.pid) {
      await sleep(1000)
      if (sameRecordedProcess(leftover.pid, leftover.pidStartedAt)) {
        try {
          process.kill(leftover.pid, 'SIGKILL')
        } catch {
          /* drained between probe and signal */
        }
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

/** `neuterEpoch` is the NEGATIVE CONTROL: the same scenario against a real
 *  daemon whose epoch enforcement is off (a drill-only startDaemon/serve flag).
 *  Such a run must come back red at the two stale-refusal checks — a drill
 *  that stays green over it does not call the thing it claims to prove. */
export async function runDrill({ scenario, keep = false, neuterEpoch = false } = {}) {
  if (scenario === 'parent-death') return parentDeathScenario({ keep, neuterEpoch })
  return { ok: false, reason: `unknown scenario: ${String(scenario)}; this slice carries parent-death (the later drills are 676's remainder)` }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv[0] === '--parent-session') {
    const arg = (name) => argv[argv.indexOf(name) + 1]
    parentSession({ repo: arg('--repo'), worktree: arg('--worktree'), readyPath: arg('--ready'), neuterEpoch: argv.includes('--neuter-epoch') }).catch((error) => {
      console.error(error?.stack || String(error))
      process.exit(1)
    })
  } else {
    runDrill({
      scenario: argv.includes('--scenario') ? argv[argv.indexOf('--scenario') + 1] : 'parent-death',
      keep: argv.includes('--keep'),
      neuterEpoch: argv.includes('--neuter-epoch'),
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.ok ? 0 : 1)
    })
  }
}
