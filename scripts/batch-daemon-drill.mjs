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
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, renameSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { acquire, probePid, processStartTime } from './batch-singleton.mjs'
import { PROCESS_START_TOLERANCE_MS, validateMutation } from './batch-schema-core.mjs'
import { IDLE_WINDOW_MS } from './batch-ownership-core.mjs'
import { LEASE_MS } from './batch-lease-core.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { attemptPaths, readJsonIfAny } from './detached-agent.mjs'
import { controlRequest, startDaemon, writeLockCopy } from './batch-daemon.mjs'
import { resumeBatch } from './resume-batch.mjs'
import { gatherEvidence } from './batch-reconcile.mjs'
import { successorBoundaryVerdict } from './batch-reconcile-core.mjs'

const BATCH = 'parent-death-drill'
const FENCE_BEFORE = 7
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** THE EXACT reason `validateMutation` emits for the staleness described by
 *  `expectation` — or null when that expectation does not describe a stale
 *  credential at all.
 *
 *  ASKED OF THE VALIDATOR, NOT RE-TYPED. This function used to spell both
 *  refusals out as literals, which made the drill's judge only as correct as a
 *  copy that nothing keeps in step: reword `validateMutation` and every stale
 *  probe fails for the wrong reason, or — worse — a judge left matching an
 *  obsolete string certifies nothing while reporting green. It also cost a
 *  round-16 reviewer its verdict, because confirming the copy character for
 *  character meant reading a file outside the pass's file set. So the
 *  expectation is now PRODUCED by calling the validator on a presentation that
 *  differs from its lock in EXACTLY the named credential and in nothing else.
 *  Both sides move together, and there is no copy left to drift. The wording
 *  itself is pinned where a literal belongs — in the test.
 *
 *  The fence values are the REAL ones the drill minted, not a pattern: the
 *  anchored regex this replaced accepted `stale fence: presented <any>, the
 *  lock carries <any>`, so a daemon validating against the WRONG epoch could
 *  answer with a stale-SHAPED reason carrying unrelated, equal or leading-zero
 *  numbers and satisfy the check (round-15 review). An exact string cannot be
 *  satisfied by the wrong numbers, and it also ends the anchoring question for
 *  good — the round-14 finding that `$` matches before a final newline cannot
 *  recur against `===`. */
export function expectedStaleRefusal(expectation) {
  const { kind, presented, carried } = expectation ?? {}
  // Every field the validator inspects BEFORE the staleness in question is
  // deliberately valid and identical on both sides, so the refusal that comes
  // back can only be the one this expectation is about — never an earlier
  // guard's answer wearing the same return shape.
  const refusalFor = (presentation, lock) => {
    const verdict = validateMutation({ presented: presentation, lock, now: 1 })
    return verdict.ok ? null : verdict.reason
  }
  if (kind === 'session') {
    return refusalFor({ sessionId: 'drill-presented-session', fence: 1 }, { sessionId: 'drill-lock-session', fence: 1 })
  }
  if (kind !== 'fence') return null
  // A fence is stale only if it DIFFERS from the one the lock carries; equal
  // values describe a valid presentation, which validateMutation never refuses
  // for staleness, so no expected reason exists. A fence below 1 is not a
  // usable fence at all: the validator refuses it for its SHAPE, long before it
  // compares anything, and expecting that refusal would let a probe pass on
  // evidence about the wrong thing entirely.
  if (!Number.isInteger(presented) || !Number.isInteger(carried)) return null
  if (presented === carried || presented < 1 || carried < 1) return null
  return refusalFor({ sessionId: 'drill-session', fence: presented }, { sessionId: 'drill-session', fence: carried })
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

/** `git` throws on a ref that is gone — which is exactly one of the answers the
 *  branch check needs — so ref reads go through this instead. */
const refTip = (ref, cwd) => {
  try {
    return git(['rev-parse', '--verify', `${ref}^{commit}`], cwd) || null
  } catch {
    return null
  }
}

const isAncestor = (ancestor, descendant, cwd) => {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant], cwd)
    return true
  } catch {
    return false
  }
}

/** THE REF, ONCE NOTHING IS WRITING IT ANY MORE — read rather than timed.
 *
 *  A cancellation that returned `ok` has already PROVEN its worker dead, so the
 *  ref is settled by then; this only bounds a push that was already in flight
 *  when the signal arrived. Two consecutive agreeing reads is the quiescence
 *  condition, and it is a condition on the STATE, which a fixed sleep never was.
 */
async function settledTip(ref, cwd, { stableForMs = 250, timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = refTip(ref, cwd)
  for (;;) {
    await sleep(stableForMs)
    const next = refTip(ref, cwd)
    if (next === last) return { tip: next, settled: true }
    last = next
    if (Date.now() > deadline) return { tip: next, settled: false }
  }
}

/** DID THE CANCELLATION HARM THE BRANCH? — the question this check names, and
 *  the only one it may answer.
 *
 *  Equality was the wrong test, because `feat/drill` moves on its own while the
 *  drill reads it: the stub worker commits and pushes on its own cadence, and an
 *  ACCEPTED checkpoint pushes as well. That is why this surfaced in the NEGATIVE
 *  CONTROL first — the neutered daemon takes both stale probes and spends their
 *  two-second waits inside exactly this window — and it made every gate reading
 *  the drill a coin flip. The 300 ms sleep that stood here bounded none of it:
 *  it timed an interval instead of waiting on the state being judged.
 *
 *  What cancellation must never do is DELETE the branch or REWIND it (M43,
 *  "cancellation preserves the branch"). Preservation is therefore ANCESTRY: the
 *  ref still resolves, and everything reachable before is still reachable now. A
 *  push that lands afterwards EXTENDS the branch, which is preservation rather
 *  than a breach of it. Anything unknown fails closed.
 */
export function branchPreserved({ tipBefore = null, tipAfter = null, beforeIsAncestorOfAfter = null } = {}) {
  if (!tipBefore) return { ok: false, why: 'no tip was read before the cancellation, so preservation cannot be judged' }
  if (!tipAfter) return { ok: false, why: `the branch is GONE after the cancellation (it was ${tipBefore})` }
  if (tipAfter === tipBefore) return { ok: true, why: '' }
  if (beforeIsAncestorOfAfter === true) {
    return { ok: true, why: `the branch ADVANCED ${tipBefore} -> ${tipAfter}; every earlier commit is still reachable` }
  }
  return { ok: false, why: `the branch was REWRITTEN ${tipBefore} -> ${tipAfter}; the earlier tip is no longer reachable from it` }
}

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

    const tipBeforeCancel = refTip('feat/drill', originDir)
    const cancelled = await successorRequest('cancel-attempt', { attemptId: 'a-drill', requestId: 'succ-cx-1', reason: 'drill complete' })
    check('one post-adoption lifecycle operation completed: cancellation', cancelled.ok === true, cancelled.reason ?? '')
    // Wait on the ref settling, not on a clock: a cancellation that answered
    // `ok` has proven its worker dead, and this bounds only a push already in
    // flight when the signal reached it.
    const settled = await settledTip('feat/drill', originDir)
    const preserved = branchPreserved({
      tipBefore: tipBeforeCancel,
      tipAfter: settled.tip,
      beforeIsAncestorOfAfter: tipBeforeCancel && settled.tip ? isAncestor(tipBeforeCancel, settled.tip, originDir) : null,
    })
    check(
      'the cancellation preserved the branch',
      preserved.ok && settled.settled,
      settled.settled ? preserved.why : `the branch never stopped moving after the cancellation (last seen ${settled.tip})`,
    )

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

const REAL_FAILURE_SCENARIOS = new Set([
  'worker-crash', 'stall', 'push-failure', 'dirty-worktree',
  'marker-deletion', 'daemon-restart', 'checkpoint-timeout',
])

/** Exercise the named failure through a real drill daemon, its real detached
 * stub worker, and the same durable files production reconciliation reads.
 * The pure matrix remains the first, cheap check; it is never the proof. */
async function realFailureScenario(scenario, pure) {
  const checks = [{ name: 'the cheap decision-layer check passes beneath the real drill', ok: pure.ok === true, detail: pure.checks?.map((item) => item.detail).filter(Boolean).join('; ') ?? '' }]
  const check = (name, ok, detail = '') => checks.push({ name, ok: ok === true, detail })
  const { sandbox, repo, worktree } = buildSandbox()
  const batchId = `failure-${scenario}`
  const sessionId = `session-${scenario}`
  const lockPath = join(repo, '.claude', 'batch-lock.json')
  const fencePath = join(repo, '.claude', 'batch-fence.json')
  let daemonRecord = null
  let workerHolder = null
  let workerStopped = false
  const request = (cmd, payload = {}, timeoutMs = 5000) => controlRequest({
    repoDir: repo, batchId, timeoutMs,
    request: { cmd, sessionId, fence: readJsonIfAny(lockPath)?.fence, payload: { batchId, ...payload } },
  })
  try {
    const acquired = acquire(sessionId, {
      lockPath, fencePath, pid: process.pid, pidStartedAt: processStartTime(process.pid),
    })
    check('a real coordinator acquired the sandbox fence', acquired === 'acquired', String(acquired))
    const started = await startDaemon({ repoDir: repo, batchId, drill: true })
    daemonRecord = started.record ?? null
    check('a real daemon process started and claimed durable state', started.ok === true && probePid(daemonRecord?.pid).exists === true, started.reason ?? '')
    if (!started.ok) return { ok: false, mode: 'real-path', scenario, checks }
    const copied = writeLockCopy({ repoDir: repo, record: daemonRecord, sessionId })
    check('the coordinator recorded the real daemon identity', copied.ok === true, copied.reason ?? '')

    const needsWorker = !['marker-deletion', 'daemon-restart'].includes(scenario)
    if (needsWorker) {
      const launched = await request('start-attempt', {
        pointId: 'p-drill', attemptId: 'a-drill', branch: 'feat/drill', worktree, adapter: 'stub',
      }, 10_000)
      check('the daemon spawned the real detached worker', launched.ok === true && Number.isInteger(launched.result?.pid), launched.reason ?? '')
      const store = openStateStore({ repoDir: repo, batchId })
      const paths = attemptPaths(join(store.dir, 'attempts', 'a-drill'))
      const deadline = Date.now() + 10_000
      while ((!existsSync(paths.heartbeatPath) || !readJsonIfAny(paths.leasePath)?.lease?.holder) && Date.now() < deadline) await sleep(100)
      workerHolder = readJsonIfAny(paths.leasePath)?.lease?.holder ?? null
      check('the worker wrote its real lease and heartbeat files', Boolean(workerHolder) && existsSync(paths.heartbeatPath), JSON.stringify(workerHolder))

      if (scenario === 'worker-crash') {
        process.kill(workerHolder.pid, 'SIGKILL')
        const deadBy = Date.now() + 5000
        while (probePid(workerHolder.pid).exists && Date.now() < deadBy) await sleep(100)
        const lane = gatherEvidence({ repoDir: repo, batchId }).lanes.find((item) => item.attemptId === 'a-drill')
        check('SIGKILLing the actual worker makes production reconciliation alert it as missing', lane?.reading === 'missing' && lane?.alert === true, lane?.reason ?? '')
      } else if (scenario === 'stall') {
        process.kill(workerHolder.pid, 'SIGSTOP')
        workerStopped = true
        const stale = new Date(Date.now() - 11 * 60 * 1000)
        utimesSync(paths.heartbeatPath, stale, stale)
        const lane = gatherEvidence({ repoDir: repo, batchId }).lanes.find((item) => item.attemptId === 'a-drill')
        check('stopping the actual worker and aging its heartbeat makes production reconciliation report stalled', lane?.reading === 'stalled' && lane?.alert === true, lane?.reason ?? '')
      } else if (scenario === 'push-failure') {
        git(['remote', 'set-url', 'origin', join(sandbox, 'missing-origin.git')], worktree)
        const reply = await request('request-checkpoint', { requestId: 'push-failure', waitMs: 5000 }, 10_000)
        const answer = reply.result?.answers?.find((item) => item.attemptId === 'a-drill')
        check('the real worker checkpoint attempts a push and reports the broken remote', reply.ok === true && answer?.acknowledged === true && answer?.pushedOk === false && answer?.transferable === false, JSON.stringify(answer ?? reply))
      } else if (scenario === 'dirty-worktree') {
        writeFileSync(join(worktree, 'uncommitted-drill.txt'), 'dirty\n')
        const reply = await request('request-checkpoint', { requestId: 'dirty-worktree', waitMs: 5000 }, 10_000)
        const answer = reply.result?.answers?.find((item) => item.attemptId === 'a-drill')
        check('the real worker checkpoint reads the dirtied worktree and blocks transfer', reply.ok === true && answer?.acknowledged === true && answer?.dirty === true && answer?.transferable === false, JSON.stringify(answer ?? reply))
      } else if (scenario === 'checkpoint-timeout') {
        process.kill(workerHolder.pid, 'SIGSTOP')
        workerStopped = true
        const reply = await request('request-checkpoint', { requestId: 'checkpoint-timeout', waitMs: 250 }, 5000)
        const answer = reply.result?.answers?.find((item) => item.attemptId === 'a-drill')
        check('the real stopped worker misses the daemon checkpoint deadline and remains non-transferable', reply.ok === true && answer?.acknowledged === false && answer?.transferable === false, JSON.stringify(answer ?? reply))
      }
    } else if (scenario === 'marker-deletion') {
      const fence = readJsonIfAny(lockPath).fence
      const sealed = await request('seal-boundary', { requestId: 'deleted-marker' })
      const markerPath = join(repo, '.claude', 'batch-boundary.json')
      writeFileSync(markerPath, `${JSON.stringify({ kind: 'durable-batch-boundary', phase: 'committed', batchId, fence, requestId: 'deleted-marker', at: Date.now() })}\n`)
      unlinkSync(markerPath)
      const journal = readJournal(openStateStore({ repoDir: repo, batchId }))
      const sealedFence = journal.entries.filter((entry) => entry.kind === 'command' && entry.name === 'seal-boundary').at(-1)?.fence ?? null
      const verdict = successorBoundaryVerdict({ marker: null, batchId, lock: readJsonIfAny(lockPath), sealedFence })
      check('deleting the real marker after the daemon seal makes successor reconciliation quarantine the boundary', sealed.ok === true && verdict.ok === false && verdict.quarantine === true && /marker deletion/.test(verdict.reason), verdict.reason)
    } else if (scenario === 'daemon-restart') {
      const firstPid = daemonRecord.pid
      const firstGeneration = daemonRecord.generation
      const down = await request('shutdown', { drain: true }, 10_000)
      const store = openStateStore({ repoDir: repo, batchId })
      const stoppedBy = Date.now() + 5000
      while (existsSync(store.daemonRecordPath) && Date.now() < stoppedBy) await sleep(100)
      const restarted = await startDaemon({ repoDir: repo, batchId, drill: true })
      daemonRecord = restarted.record ?? daemonRecord
      const journal = readJournal(store)
      check('the real daemon restarts on its durable journal with the same generation and a new process', down.ok === true && restarted.ok === true && daemonRecord.pid !== firstPid && daemonRecord.generation === firstGeneration && journal.entries.filter((entry) => entry.kind === 'daemon-lifecycle' && entry.event === 'start').length === 2, restarted.reason ?? '')
      writeLockCopy({ repoDir: repo, record: daemonRecord, sessionId })
    }
    return { ok: checks.every((item) => item.ok), mode: 'real-path', scenario, checks }
  } catch (error) {
    check('the real-path drill completed without an infrastructure exception', false, error?.stack ?? String(error))
    return { ok: false, mode: 'real-path', scenario, checks }
  } finally {
    if (workerStopped && workerHolder?.pid && probePid(workerHolder.pid).exists) {
      try { process.kill(workerHolder.pid, 'SIGCONT') } catch { /* already gone */ }
    }
    try { await request('shutdown', { drain: true }, 10_000) } catch { /* daemon may be the injected failure */ }
    await sleep(300)
    for (const identity of [workerHolder, daemonRecord]) {
      if (!identity?.pid) continue
      const probe = probePid(identity.pid)
      if (probe.exists && Number.isFinite(identity.pidStartedAt) && Math.abs((probe.startedAt ?? 0) - identity.pidStartedAt) <= PROCESS_START_TOLERANCE_MS) {
        try { process.kill(identity.pid, 'SIGKILL') } catch { /* already gone */ }
      }
    }
    rmSync(sandbox, { recursive: true, force: true })
  }
}

/** `neuterEpoch` is the NEGATIVE CONTROL: the same scenario against a real
 *  daemon whose epoch enforcement is off (a drill-only startDaemon/serve flag).
 *  Such a run must come back red at the two stale-refusal checks — a drill
 *  that stays green over it does not call the thing it claims to prove. */
export async function runDrill({ scenario, keep = false, neuterEpoch = false } = {}) {
  if (scenario === 'parent-death') return parentDeathScenario({ keep, neuterEpoch })
  const { FAILURE_DRILL_SCENARIOS, runFailureDrill } = await import('./batch-daemon-failure-drills.mjs')
  if (FAILURE_DRILL_SCENARIOS.includes(scenario)) {
    const pure = runFailureDrill(scenario)
    return REAL_FAILURE_SCENARIOS.has(scenario) ? realFailureScenario(scenario, pure) : pure
  }
  return { ok: false, reason: `unknown scenario: ${String(scenario)}; known scenarios: parent-death, ${FAILURE_DRILL_SCENARIOS.join(', ')}` }
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
