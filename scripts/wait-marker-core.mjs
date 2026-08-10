// THE WAIT MARKER A HOOK SETS (point 592) — the pure decision half.
//
// WHY: measured over six days (09.08.2026), 1189 responses — 3.6 % of the whole
// window's weighted spend — were bare idle holders: a model turn that does
// nothing except tell the no-idle-stop guard that the session is still there.
// The command exists only because `batch-progress-guard` refuses a silent stop,
// and it is the cheapest turn that satisfies it. A marker a HOOK writes does the
// same job for nothing, because a hook costs no model turn at all.
//
// WHAT IT MUST NOT DO, and the whole reason this file is pure and separate: the
// idle guard may not go BLIND. It exists because the batch stood still for five
// and a half hours on the night of 28.07.2026, and a marker that says "waiting"
// whenever anyone asks would hand that back. So the marker written here is the
// SAME `batch-in-flight` declaration a session writes by hand — same file, same
// shape, same evidence, re-probed by the guard at every single turn end — and it
// is written ONLY where the evidence genuinely exists:
//
//   - this session OWNS the batch (a non-owner declares nothing, ever),
//   - the batch is not paused,
//   - a verify RUN RECORD says a run is going, and its wrapper process is alive,
//   - that run's LOG has been written to within LOG_FRESH_MS,
//   - and the session has not already declared something by hand — a hook never
//     overwrites a person's declaration, only its own.
//
// And the mirror duty, which is what keeps the guard sharp: when the run the
// hook's own marker names has FINISHED, the hook CLEARS it. The wait is over,
// the result is now the session's next action, and the guard should block a stop
// again — exactly as it does when a hand-declared wait ends.
//
// The IO (reading the record, writing the declaration, extending the lease)
// lives in scripts/wait-marker.mjs; the hook that calls it is duty (8) of
// scripts/lock-heartbeat-hook.mjs.

/**
 * How recently a run's log must have been written to for the run to count as
 * evidence. Generous: a browser suite can spend minutes inside one check
 * without printing, and `enrichments` alone runs 951 s. Short enough that a
 * wedged run stops holding a stop open within one suite's worth of silence.
 */
export const LOG_FRESH_MS = 10 * 60 * 1000

/** Marks a declaration as this mechanism's own, so it is told from a person's. */
export const MARKER_SOURCE = 'wait-marker-hook'

/**
 * WHAT SHOULD THE HOOK DO ON THIS TOOL CALL?
 *
 * Returns `{ action, reason }` and, for `declare`, the `waitingOn` sentence and
 * the `evidence` the declaration carries. `action` is one of:
 *   'declare' — write/refresh the hook's marker for a provably running verify run
 *   'clear'   — the hook's OWN marker names a run that is over; withdraw it
 *   'none'    — do nothing, and `reason` says why
 *
 * Every uncertain case answers 'none'. A hook that guesses "probably still
 * running" is the blind guard this must not become.
 */
export function waitMarkerDecision({
  sid = '',
  ownsBatch = false,
  paused = false,
  record = null,
  recordLive = false,
  logMtime = null,
  declaration = null,
  now = Date.now(),
  logFreshMs = LOG_FRESH_MS,
} = {}) {
  const mine = declaration && declaration.source === MARKER_SOURCE
  const declaredRun = mine ? declaration.runLog ?? null : null

  if (!sid) return { action: 'none', reason: 'no-session' }
  if (paused) return { action: 'none', reason: 'paused' }
  if (!ownsBatch) return { action: 'none', reason: 'not-owner' }

  const runOver = !record || !recordLive
  if (runOver) {
    // The hook withdraws what the hook wrote, and nothing else. A stale marker of
    // its own would keep a stop open after the result had landed — which is the
    // moment the session is supposed to ACT, not to wait.
    if (mine) return { action: 'clear', reason: record ? 'run-finished' : 'run-record-gone', runLog: declaredRun }
    return { action: 'none', reason: record ? 'run-finished' : 'no-run' }
  }

  if (typeof logMtime !== 'number' || !Number.isFinite(logMtime)) {
    return { action: 'none', reason: 'log-unreadable' }
  }
  if (now - logMtime > logFreshMs) {
    // The process lives but is writing nothing. That is a wedge, not a wait, and
    // the guard must be free to say so.
    return { action: 'none', reason: 'log-quiet' }
  }

  if (declaration && !mine) return { action: 'none', reason: 'declared-by-hand' }
  if (mine && declaredRun === (record.log ?? null)) return { action: 'none', reason: 'already-marked' }

  return {
    action: 'declare',
    reason: mine ? 'run-changed' : 'run-live',
    runLog: record.log ?? null,
    waitingOn: describeRun(record),
    evidence: [{ kind: 'log', path: record.log ?? null }],
  }
}

/** The sentence the declaration carries, and the one the guard echoes back to
 *  the session: what is running, and what the receipt will be read from. */
export function describeRun(record) {
  const command = String(record?.command ?? 'a verify run').trim() || 'a verify run'
  const expected = Number(record?.expectedRuntimeMs)
  const when = Number.isFinite(expected) && expected > 0 ? `, expected ${Math.round(expected / 60000)} min` : ''
  return `${command} (background regression${when}) — read it with \`node scripts/verify/run-wait.mjs --receipt\``
}

/**
 * The declaration body, in exactly the shape `scripts/batch-in-flight.mjs`
 * writes it (v:1, the lock's process identity, the evidence list) plus the two
 * fields that make it identifiable as the hook's: `source` and `runLog`. The
 * guard reads it through the same `assessInFlight` either way, which is the
 * point — it accepts the hook's marker exactly as it accepts today's turn.
 */
export function markerDeclaration({ sid, lock = null, decision, now = Date.now() }) {
  return {
    v: 1,
    sessionId: sid,
    pid: typeof lock?.pid === 'number' ? lock.pid : null,
    pidStartedAt: typeof lock?.pidStartedAt === 'number' ? lock.pidStartedAt : null,
    at: now,
    waitingOn: decision.waitingOn,
    evidence: decision.evidence,
    // A background verification is not an agent slot, so the pool cap has
    // nothing to answer for here (point 427's `--slots-free` reason).
    slotsFree: '',
    source: MARKER_SOURCE,
    runLog: decision.runLog,
  }
}
