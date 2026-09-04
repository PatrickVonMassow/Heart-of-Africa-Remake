#!/usr/bin/env node
// CHAOS DRILL for point 1048, union entry U21 — the two measured wedges of
// 02.–04.09.2026 replayed against the REAL actors, not against a recreation of
// their aftermath.
//
// Fixture one is the night of 02./03.09.: last first-parent commit 23:05, a
// session that kept making tool calls every ten minutes so its heartbeat never
// aged, a finished verification whose record still claimed a generous lease,
// ten stacked eternal waits, and no queue movement until 00:52. It drives the
// real emergency lane — `runEmergency` — with a real wedged process as the
// owner and real wait leases behind real pids, and asserts the ladder the union
// promises: ONE soft recovery at the threshold, a hard recovery inside the U5
// two-hour bound, the owner's own waits retired and nobody else's, a successor
// launched, and the episode ending the moment the queue moves again.
//
// Fixture two is 04.09., 17:45–17:47: after `batch-boundary --commit` the
// boundary refused every tool call while `ci-status-guard` refused every turn
// end and prescribed exactly the refused wait. It runs the real
// `gatherCiStatusInputs` against a sealed boundary in an isolated repository
// root and asserts the guard now stands down — with a negative control, because
// a guard that always stands down would pass the same assertion.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import {
  EMERGENCY_COOLDOWN_MS,
  EMERGENCY_HARD_DEADLINE_MS,
  EMERGENCY_THRESHOLD_MS,
} from './batch-emergency-core.mjs'
import { probePid } from './batch-singleton.mjs'
import { runEmergency, verificationProcessAlive } from './batch-emergency.mjs'
import { readRegistry, writeRegistry } from './wait-lease.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// The measured wake-up interval of the wedged session: ten minutes of tool
// calls, which is what kept every heartbeat fresh and every launcher tick green.
const WEDGE_WAKE_MS = 10 * 60_000
const STACKED_WAITS = 10

const spawnSleeper = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore', windowsHide: true,
})

const waitForExit = (child, timeoutMs) => new Promise((resolve) => {
  if (child.exitCode !== null || child.signalCode !== null) return resolve()
  const timer = setTimeout(resolve, timeoutMs)
  child.once('exit', () => { clearTimeout(timer); resolve() })
})

/**
 * FIXTURE ONE — the busy wedge of 02./03.09.2026 through the real lane.
 */
async function wedgeFixture(dir) {
  const statePath = join(dir, 'state.json')
  const logPath = join(dir, 'strikes.jsonl')
  const leasePath = join(dir, 'wait-leases.json')
  const now = Date.now()
  // 23:05 was the last first-parent commit; the first hourly emergency tick past
  // the threshold therefore lands exactly one threshold later.
  const progressAt = now - EMERGENCY_THRESHOLD_MS
  const sleeper = spawnSleeper()
  // The finished verification whose record still claimed the batch was working.
  const verificationScript = join(dir, 'run-logged.mjs')
  const verificationLog = join(dir, 'probe.log')
  writeFileSync(verificationScript, 'setInterval(() => {}, 1000)\n')
  writeFileSync(verificationLog, 'measured output\n')
  const verificationSleeper = spawn(process.execPath, [verificationScript, '--log-file', verificationLog], {
    stdio: 'ignore', windowsHide: true,
  })
  const verificationRecord = {
    pid: verificationSleeper.pid, log: verificationLog, status: 'running', startedAt: now,
  }
  writeFileSync(`${verificationLog}.run.json`, JSON.stringify(verificationRecord))

  // THE TEN STACKED WAITS, each behind a real pid, plus one wait of an
  // UNRELATED session: recovery must retire the wedge's own group by identity
  // and leave the stranger alone.
  const ownedWaits = Array.from({ length: STACKED_WAITS }, () => spawnSleeper())
  const strangerWait = spawnSleeper()
  const leaseFor = (child, sessionId, index) => {
    const identity = probePid(child.pid)
    return {
      sessionId,
      runId: `${sessionId}-wait-${index}`,
      pid: child.pid,
      pidStartedAt: identity.startedAt ?? null,
      subject: 'npm exec vitest',
      startedAt: progressAt + index * 1000,
    }
  }
  const leases = [
    ...ownedWaits.map((child, index) => leaseFor(child, 'chaos-wedged-owner', index)),
    leaseFor(strangerWait, 'unrelated-session', 0),
  ]
  writeRegistry({ leases }, leasePath)

  const reportAt = (end) => {
    // Foreground tool calls every ten minutes, from the last commit to now: the
    // activity that made the wedge look alive to every component that watched
    // liveness instead of progress.
    const timeline = []
    for (let start = progressAt - 1; start < end; start += WEDGE_WAKE_MS) {
      timeline.push({
        start,
        end: Math.min(end, start + WEDGE_WAKE_MS),
        className: ACTIVITY_CLASSES.FOREGROUND,
        cause: 'wedged-owner-keeps-making-tool-calls',
      })
    }
    return {
      window: { start: progressAt - 1, end },
      batchProgress: [{ at: progressAt, kind: 'first-parent-commit', value: 'a1b2c3d' }],
      verificationLeases: [{
        record: join(dir, 'wedged-large.log.run.json'),
        command: 'verify --plan large',
        status: 'running',
        startedAt: progressAt - 60_000,
        progressAt,
        // Deliberately future-dated: old output cannot keep a wedge alive merely
        // because a stale record claims a generous bound.
        leaseUntil: end + EMERGENCY_THRESHOLD_MS,
        processAlive: true,
      }],
      timeline,
    }
  }
  const commands = []
  const execute = (_exe, args) => { commands.push(args.join(' ')); return '' }

  try {
    const identity = probePid(sleeper.pid)
    if (!identity.exists || !Number.isFinite(identity.startedAt)) throw new Error('could not prove the chaos owner process')
    const lock = { sessionId: 'chaos-wedged-owner', pid: sleeper.pid, pidStartedAt: identity.startedAt, fence: 3 }
    let liveVerificationProbe = false
    const probeDeadline = Date.now() + 2000
    while (!liveVerificationProbe && Date.now() < probeDeadline) {
      liveVerificationProbe = verificationProcessAlive(
        verificationRecord,
        `${verificationLog}.run.json`,
        verificationLog,
      )
      if (!liveVerificationProbe) await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const common = {
      statePath,
      logPath,
      execute,
      getLock: () => lock,
      getProcesses: () => ({}),
      revoke: () => ({ revoked: true, reason: 'drill-revoked' }),
      releaseLock: () => true,
      // The real registry reader, over this fixture's own file.
      getWaitLeases: () => readRegistry(leasePath).leases ?? [],
    }
    const soft = runEmergency({
      ...common,
      now,
      inputs: { workablePoints: [1048], paused: false, veto: null, state: {}, report: reportAt(now) },
    })
    const persisted = JSON.parse(readFileSync(statePath, 'utf8'))
    // The next tick the cooldown allows — 00:50 in the measured night, still
    // fifteen minutes inside the two-hour deadline.
    const hardAt = now + EMERGENCY_COOLDOWN_MS + 1
    const hard = runEmergency({
      ...common,
      now: hardAt,
      inputs: { workablePoints: [1048], paused: false, veto: null, state: persisted, report: reportAt(hardAt) },
    })
    await waitForExit(sleeper, 2000)
    await Promise.all(ownedWaits.map((child) => waitForExit(child, 2000)))
    const dead = !probePid(sleeper.pid).exists
    const rows = readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse)

    // THE QUEUE MOVES AGAIN: one commit lands, and the very next tick of the
    // same lane observes instead of striking. The episode is keyed to the
    // progress boundary, so real progress ends it without anyone clearing state.
    const movedAt = hardAt + 5 * 60_000
    const movedProgressAt = hardAt + 60_000
    const afterMove = runEmergency({
      ...common,
      now: movedAt,
      dryRun: true,
      inputs: {
        workablePoints: [1048],
        paused: false,
        veto: null,
        state: JSON.parse(readFileSync(statePath, 'utf8')),
        report: {
          window: { start: progressAt - 1, end: movedAt },
          batchProgress: [
            { at: progressAt, kind: 'first-parent-commit', value: 'a1b2c3d' },
            { at: movedProgressAt, kind: 'first-parent-commit', value: 'e4f5g6h' },
          ],
          verificationLeases: [],
          timeline: [],
        },
      },
    })

    return {
      softAction: soft.decision.action,
      hardAction: hard.decision.action,
      // The bound the union states and this drill is here to hold the lane to.
      hardDeadlineAt: hard.decision.hardDeadlineAt,
      hardWithinStatedBound: hardAt < progressAt + EMERGENCY_HARD_DEADLINE_MS,
      hardStalledMs: hard.decision.stalledMs,
      ownerTerminated: dead,
      restartAttempts: commands.filter((line) => /batch-autostart\.mjs/.test(line)).length,
      strikeRecords: rows.length,
      // ONE EPISODE, ONE DEFERRAL (union entries U7 and U9). Two strikes against
      // the same wedge share one intent and one id; a second intent would mean
      // the queue was excepted twice for a single standstill.
      intentRecords: rows.filter((row) => row.phase === 'intent').length,
      outcomeRecords: rows.filter((row) => row.phase === 'outcome').length,
      distinctStrikeIds: new Set(rows.map((row) => row.id)).size,
      busyActivityIgnored: soft.decision.progressAt === progressAt && hard.decision.progressAt === progressAt,
      liveVerificationProbe,
      waitsRetired: ownedWaits.filter((child) => !probePid(child.pid).exists).length,
      strangerWaitLeftAlive: probePid(strangerWait.pid).exists,
      restoredWithoutHuman: hard.restored && dead,
      queueMovedAction: afterMove.decision.action,
      queueMovedReason: afterMove.decision.reason,
      measuredMs: Date.now() - now,
    }
  } finally {
    for (const child of [sleeper, verificationSleeper, strangerWait, ...ownedWaits]) {
      try { process.kill(child.pid, 'SIGKILL') } catch { /* already ended by the real strike */ }
    }
  }
}

/**
 * FIXTURE TWO — the 17:45–17:47 guard deadlock through the real CI guard.
 *
 * `gatherCiStatusInputs` reads its boundary from the repository root, so the
 * fixture gives it a root of its own (`HOA_REPO_ROOT`) instead of touching the
 * live one. The real module is imported and the real function called.
 */
function deadlockFixture(dir) {
  const root = join(dir, 'sealed-repo')
  mkdirSync(join(root, '.claude'), { recursive: true })
  const runner = join(dir, 'ask-ci-guard.mjs')
  const guard = join(HERE, 'ci-status-guard.mjs')
  // The stand-down is the FIRST thing this guard decides after the pause file.
  // Everything past it needs a GitHub remote this isolated root deliberately
  // does not have, so the probe reports a throw as its own outcome: "the guard
  // ran on past the boundary check" is exactly what the negative control has to
  // establish, and it needs no network to establish it.
  writeFileSync(runner, [
    `import { gatherCiStatusInputs } from ${JSON.stringify(guard)}`,
    'let verdict',
    'try {',
    '  const got = await gatherCiStatusInputs({ sessionId: process.argv[2], readOnly: true })',
    '  verdict = { applicable: got.applicable, cause: got.cause ?? null }',
    '} catch {',
    "  verdict = { applicable: null, cause: 'ran-past-the-boundary-check' }",
    '}',
    'process.stdout.write(JSON.stringify(verdict))',
    '',
  ].join('\n'))

  const ask = (sessionId) => {
    const run = spawnSync(process.execPath, [runner, sessionId], {
      encoding: 'utf8', windowsHide: true, timeout: 60_000,
      env: { ...process.env, HOA_REPO_ROOT: root },
      cwd: root,
    })
    if (run.status !== 0) throw new Error(`ci-guard probe failed: ${run.stderr || run.stdout}`)
    return JSON.parse(run.stdout)
  }

  // NEGATIVE CONTROL FIRST, with no marker at all: whatever this root makes the
  // guard say, it must not be "committed-boundary".
  const withoutBoundary = ask('drill-session')

  const marker = {
    phase: 'committed',
    sessionId: 'drill-session',
    point: 1048,
    cause: 'point',
    at: Date.now(),
  }
  writeFileSync(join(root, '.claude', 'batch-boundary.json'), JSON.stringify(marker))
  const sealed = ask('drill-session')
  // The seal belongs to ONE session: a different session at the same moment is
  // not standing on a boundary and must still be judged.
  const otherSession = ask('some-other-session')

  return {
    sealedApplicable: sealed.applicable,
    sealedCause: sealed.cause,
    withoutBoundaryCause: withoutBoundary.cause,
    withoutBoundarySealed: withoutBoundary.cause === 'committed-boundary',
    otherSessionSealed: otherSession.cause === 'committed-boundary',
  }
}

const dir = mkdtempSync(join(tmpdir(), 'hoa-emergency-drill-'))
process.env.HOA_WAIT_LEASE_PATH = join(dir, 'wait-leases.json')
try {
  const wedge = await wedgeFixture(dir)
  const deadlock = deadlockFixture(dir)
  const result = { wedge, deadlock }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  const failures = []
  if (wedge.softAction !== 'soft-recover') failures.push('the first strike was not soft')
  if (wedge.hardAction !== 'hard-recover') failures.push('the second strike did not recover hard')
  if (!wedge.hardWithinStatedBound) failures.push('the hard recovery fell outside the stated two-hour bound')
  if (!wedge.busyActivityIgnored) failures.push('busy tool calls moved the progress clock')
  if (!wedge.liveVerificationProbe) failures.push('the verification probe never proved a live process')
  if (!wedge.restoredWithoutHuman) failures.push('the batch was not restored without a human')
  if (wedge.waitsRetired !== STACKED_WAITS) failures.push(`only ${wedge.waitsRetired} of ${STACKED_WAITS} stacked waits were retired`)
  if (!wedge.strangerWaitLeftAlive) failures.push('recovery killed a wait belonging to another session')
  if (wedge.restartAttempts !== 2) failures.push('the successor was not launched once per strike')
  if (wedge.intentRecords !== 1) failures.push(`one wedge opened ${wedge.intentRecords} recovery intents`)
  if (wedge.outcomeRecords !== 2) failures.push('the two strikes did not each record an outcome')
  if (wedge.distinctStrikeIds !== 1) failures.push('the escalation left the episode it started in')
  if (wedge.queueMovedAction !== 'observe') failures.push('the episode did not end when the queue moved')
  if (deadlock.sealedApplicable !== false || deadlock.sealedCause !== 'committed-boundary') {
    failures.push('a committed boundary did not stand the CI guard down')
  }
  if (deadlock.withoutBoundarySealed) failures.push('the CI guard claimed a boundary that was never taken')
  if (deadlock.otherSessionSealed) failures.push("one session's boundary stood another session's guard down")
  if (failures.length) {
    process.stderr.write(`batch-emergency-drill: ${failures.join('; ')}\n`)
    process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`batch-emergency-drill: ${error?.message ?? error}\n`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
