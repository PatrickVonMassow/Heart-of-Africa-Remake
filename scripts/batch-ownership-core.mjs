// THE OWNERSHIP VERDICT — ONE function, and deliberately only one (point 612,
// with the cross-point ruling of point 614).
//
// WHY IT IS ONE FUNCTION. Point 612 ("an idle owner loses the lock after a short
// idle window") and open point 517 ("the launcher EXTENDS the lease while
// evidence advances") pull the SAME `leaseUntil` arithmetic in opposite
// directions. Built as two independent patches, whichever landed second would
// silently undo the first. So the whole question — does this lock still belong to
// its owner, and until when — is answered HERE, by `ownershipVerdict` over
// `effectiveLeaseUntil`, and 517's extension is expressed INSIDE
// `effectiveLeaseUntil` rather than as a second competing code path. The impure
// half (`assessOwner` in scripts/batch-singleton.mjs) reads files and probes pids
// and then asks this module; it decides nothing itself.
//
// WHAT 612 MEASURED, twice on 10.08.2026:
//
//   13:20  the outgoing session hands over correctly, the lock is released;
//          the launcher would not look again before 13:31; an unattended window
//          takes the free lock at 13:28 and sits idle. 30 minutes, nothing broken.
//   13:57  `HANDOVER point 613` in `.claude/boundary.log`, the lock marked
//          handed over. The ticks at 14:01, 14:16 and 14:31 ALL logged
//          `skip: owner alive (pid-alive; heartbeat 5..20 min old, pid 939)` and
//          spawned nobody. 35 minutes idle, and BOTH halves of 612 in one
//          incident.
//
// TWO PROPERTIES FOLLOW, and they are the whole of this module's novelty:
//
// 1. AN EXPLICIT HANDOVER OUTRANKS EVERY LIVENESS HEURISTIC, at any age. The
//    owner has DECLARED that it is finished; liveness answers a question nobody
//    asked. The old rule additionally demanded `claimedAt <= handedOverAt`, and
//    that is exactly what failed: any later write of the lock — a late PostToolUse
//    heartbeat whose withdrawal was judged NON-causal, an `updateOwnLock` — stamps
//    `claimedAt` past the mark WITHOUT deleting it, and the handover silently
//    stops counting while the flag still sits in the file. A handover is now
//    withdrawn ONLY by deleting it (`withdrawHandover`, and `heartbeat` where
//    `withdrawalIsCausal` says the work really came after), which is an explicit
//    act that leaves an honest lock behind. The 15-minute wait for a live process
//    goes with it: a handover is an EVENT the launcher reacts to in seconds.
//
// 2. PID LIVENESS IS NOT SESSION LIVENESS. Pid 939 in the incident is the
//    attended VS Code window's `claude` process: it started on 09.08., survives
//    `/clear`, and hosts EVERY session in that window — so successive sessions all
//    write the SAME pid into the lock and the pid-alive branch can never observe a
//    dead one. `pidStartedAt` records the container process's start, not the
//    session's, so even the pid-reuse check cannot tell two sessions apart. A live
//    pid may therefore only ever CORROBORATE evidence; it may never BE the
//    evidence. That is what the idle window below enforces.
//
// Pure and total. Its sweep is scripts/batch-ownership-core.test.mjs.
import { LEASE_MS, declaredWaitStale, leaseTakeoverDecision, leaseUntilOf } from './batch-lease-core.mjs'

/**
 * HOW LONG AN OWNER MAY DO NOTHING AT ALL BEFORE IT STOPS OWNING THE BATCH.
 *
 * Five minutes, the starting value point 612 names, and calibratable — the impure
 * caller may override it (scripts/batch-singleton.mjs reads `HOA_IDLE_WINDOW_MIN`)
 * so the window can be widened without a code change.
 *
 * IT IS NOT A WEDGE DETECTOR, and the difference matters. It never asks whether
 * the owner is stuck; it asks whether the owner has said anything. The escape is
 * explicit and cheap: DECLARE the wait (`node scripts/batch-in-flight.mjs
 * --waiting-on …`) and the window does not apply at all, because a declaration is
 * the owner stating in advance that a long silence is expected.
 *
 * WHO CAN ACTUALLY LOSE THE BATCH TO IT — precisely, because the third clause of
 * `idleVerdict` narrows this a long way and the sentence that used to stand here
 * over-claimed. ONLY a session whose FIRST call since taking the lock is the long
 * one: a 30-40 minute regression entered before any other tool call has completed,
 * undeclared. Once ANY call has completed, `claimedAt` has moved past `acquiredAt`
 * and this window no longer applies at all — what bounds such a session from there
 * is the ordinary lease, unchanged. Nothing is killed either way: the dispossessed
 * session keeps running, keeps its work, and is refused only merge, push, the tick
 * and the board publish (the fence).
 *
 * The remaining gap is deliberate and filed separately: an owner that works ONCE
 * and then idles holds the batch for the whole lease. Closing that needs a middle
 * rule with a renewal stamp of its own — `leaseUntil` cannot serve, being polluted
 * by the ±4 h declared-wait extensions — and it is not this window's job.
 *
 * It coincides with `DEAD_CONFIRM_MS` on purpose: a state change inside the
 * window is what "fresh heartbeat" already meant, so the two are one rule read
 * from its two sides rather than two thresholds that can drift apart.
 */
export const IDLE_WINDOW_MS = 5 * 60 * 1000

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * WHEN DOES THIS OWNERSHIP END? PURE, and THE one place that computes it.
 *
 * Today that is the lock's own lease (`leaseUntilOf`, which reads an implicit
 * `claimedAt + leaseMs` for a lock written before leases existed). The reason this
 * trivial wrapper exists at all is point 614's ruling: point 517 will let the
 * launcher EXTEND the lease while an owner's evidence keeps advancing, and that
 * extension belongs HERE — one function returning one number — not beside the idle
 * rule as a second arithmetic. `evidence` is already in the signature so the
 * extension has a place to be expressed without changing a single caller.
 *
 * Returns epoch ms, or null when the lock carries no usable timestamp at all.
 */
export function effectiveLeaseUntil(lock, { now = null, leaseMs = LEASE_MS, evidence = null } = {}) {
  const base = leaseUntilOf(lock, { leaseMs })
  // POINT 517'S SLOT. It will read `evidence` (advancing work, its last observed
  // advance) and return a LATER number than `base`, never an earlier one — an
  // extension may only ever lengthen ownership, or it would become a second way to
  // dispossess an owner and the two rules would fight. Until then the lock's own
  // lease is the whole answer, and `evidence`/`now` are accepted and ignored.
  void evidence
  void now
  return base
}

/**
 * HAS THIS OWNER GONE QUIET? PURE, and the whole of point 612's second repair.
 *
 * Idle means ALL of:
 *   - nothing was DECLARED in flight (`batch-in-flight.mjs`), and
 *   - no evidence of progress is known to be advancing, and
 *   - the owner has NOT COMPLETED A SINGLE TOOL CALL since it took the lock, and
 *   - that silence is longer than the window.
 *
 * THE THIRD CLAUSE IS NOT DECORATION, and it is where this rule stops short of
 * point 612's broadest wording ("nor produced a state change within a short idle
 * window"). Measured on this project's own transcripts, a single tool call runs
 * past five minutes about once in a hundred (docs the lease was calibrated
 * against: p99 8.9 min, p99.9 10.0 min, longest undeclared unattended call 27.8
 * min), and the LARGE regression is one call of 30-40 minutes. A window applied to
 * every silence would therefore dispossess working sessions ROUTINELY and spawn a
 * successor beside each — which is the 24.07.2026 double-spawn this repository
 * already paid for once, reintroduced as an everyday event.
 *
 * The measured failure of 10.08.2026 is narrower and exactly expressible: a window
 * took the FREE lock at session start (14:11) and sat there until a user prompt
 * (14:32) without ever running anything. A session that has completed even one
 * tool call has moved `claimedAt` past `acquiredAt` and is bounded from there by
 * the ordinary lease, as before; a session that has completed NONE has done
 * nothing but reserve the batch, and five minutes of that is enough.
 *
 * `workedSinceClaim` is therefore tri-state: false (provably nothing since the
 * claim), true (something), and null/undefined where the lock is too old to carry
 * `acquiredAt` — unknown never dispossesses anybody, which needs no migration.
 *
 * A STATE CHANGE IS THE OWNER'S OWN, AND NOTHING ELSE COUNTS (612's refinement,
 * from the second model's blind enumeration). `lastStateChangeAt` may only ever be
 * fed something the OWNER wrote — its heartbeat, a commit of its own, a board
 * write. It may NOT be fed file timestamps: the launcher today prints `declared
 * work advancing — worktree … active 1 min ago (working files|git metadata)` off
 * mtimes alone, so a leaked dev server or a file watcher touching a worktree would
 * keep a dead-idle owner "active" for as long as the takeover override (1 h) or the
 * work-max-age (4 h) allows. An idle window fed by an mtime is an idle window
 * defeated by a process nobody is watching. `assessOwnerWork(...).advancing` is
 * exactly such a signal and is deliberately NOT consulted here — only its
 * `declared`, which is a declaration the owner wrote.
 *
 * The boundary is closed at the window: EXACTLY `idleWindowMs` of silence is still
 * ownership, one millisecond more is not.
 *
 * It is deliberately free of the lock: a CLAIM record that reserves the batch
 * without working (work-order point 616) is the same arithmetic over the same three
 * inputs, and can be asked here rather than getting an idle rule of its own.
 */
export function idleVerdict({
  now,
  lastStateChangeAt,
  idleWindowMs = IDLE_WINDOW_MS,
  workDeclared = false,
  workedSinceClaim = null,
  paused = false,
} = {}) {
  const t = num(now)
  const last = num(lastStateChangeAt)
  const win = num(idleWindowMs)
  if (paused === true) return { idle: false, reason: 'batch-paused', silentMs: null }
  // An unreadable clock or an unreadable lock must never cost an owner the batch.
  if (t === null || last === null || win === null || win <= 0) {
    return { idle: false, reason: 'unreadable', silentMs: null }
  }
  const silentMs = t - last
  if (workDeclared === true) return { idle: false, reason: 'work-declared', silentMs }
  if (workedSinceClaim !== false) {
    return { idle: false, reason: workedSinceClaim === true ? 'has-worked' : 'claim-age-unknown', silentMs }
  }
  if (silentMs <= win) return { idle: false, reason: 'within-window', silentMs }
  return { idle: true, reason: 'idle', silentMs }
}

/**
 * HAS THIS OWNER DONE ANYTHING AT ALL SINCE IT TOOK THE LOCK? PURE, tri-state.
 *
 * `acquire` stamps `acquiredAt` and `claimedAt` with the same moment; every
 * completed tool call then moves `claimedAt` alone (`heartbeat`). So a `claimedAt`
 * still equal to `acquiredAt` is a session that reserved the batch and has not run
 * one thing. `null` where the lock predates `acquiredAt` — unknown, never idle.
 */
/**
 * IS A DECLARED WAIT RECORDED ON THE LOCK ITSELF, and still running? PURE.
 *
 * `extendLease --declaredWait` writes `declaredWait: { at, until }` onto the lock,
 * which is a declaration EVERY reader can see — unlike `batch-in-flight.json`,
 * which only the launcher reads. The idle rule honours both, or a session that
 * declared its wait the sanctioned way and then blocked for hours without writing
 * anything would be dispossessed by a door that never asked.
 */
export function lockDeclaresWait(lock, now) {
  const dw = lock && typeof lock === 'object' ? lock.declaredWait : null
  if (!dw || typeof dw !== 'object') return false
  const until = num(dw.until)
  const t = num(now)
  return until !== null && t !== null && t <= until
}

export function workedSinceClaim(lock) {
  const acquired = num(lock?.acquiredAt)
  const claimed = num(lock?.claimedAt)
  if (acquired === null || claimed === null) return null
  return claimed > acquired
}

/**
 * THE OWNERSHIP VERDICT. PURE, TOTAL, and the single decision point.
 *
 * Returns `{ settled: true, owns, reason, detail? }` where this module can answer,
 * and `{ settled: false }` where it deliberately makes no statement — the pid
 * branches of `assessOwner` (a legacy lock with no pid, a dead pid, a recycled
 * one) are probe semantics and stay with the module that owns the probe.
 *
 * The order is the order of authority, and each step is there because something
 * once got it wrong:
 *   1. no usable lock                → nobody owns it
 *   2. an explicit HANDOVER          → the owner said it is finished (property 1)
 *   3. a state change inside the window → alive, and no probe is needed
 *   4. a heartbeat from before this boot → no claude process survives a reboot
 *   5. the LEASE, with point 556's corroboration
 *   6. the IDLE window               → property 2: a breathing pid is not an owner
 */
export function ownershipVerdict({
  lock,
  now,
  bootTime = null,
  corroboration = null,
  work = null,
  ownerActivityAt = null,
  paused = false,
  idleWindowMs = IDLE_WINDOW_MS,
  leaseMs = LEASE_MS,
} = {}) {
  if (!lock || typeof lock !== 'object' || typeof lock.claimedAt !== 'number') {
    return { settled: true, owns: false, reason: 'no-lock' }
  }

  // 2. THE HANDOVER OUTRANKS EVERYTHING (property 1). No grace, no comparison
  // against `claimedAt`, no pid: the mark is the owner's own statement, written
  // only after the Stop chain confirmed a session-bound marker, a verifiably
  // closed point and an armed launcher. It is withdrawn by DELETING it, never by
  // outdating it — see the header for the incident that distinction cost.
  if (lock.handedOver === true && typeof lock.handedOverAt === 'number') {
    return { settled: true, owns: false, reason: 'handed-over' }
  }

  const t = num(now)
  // THE OWNER'S LAST STATE CHANGE is `claimedAt`, which every completed tool call
  // stamps — the one timestamp the owner writes because it DID something. A caller
  // holding a NEWER owner-attributable moment (a commit by this session, a board
  // write) passes `ownerActivityAt`, and only the later of the two is used: an
  // activity stamp may extend ownership, never shorten it. It must never be a file
  // mtime — see `idleVerdict`. The lease is deliberately NOT folded in either,
  // because a PreToolUse renewal is written at the START of a call and would report
  // a 40-minute silence as a fresh one.
  const activity = num(ownerActivityAt)
  const changedAt = activity !== null && activity > lock.claimedAt ? activity : lock.claimedAt

  // 3. A STATE CHANGE INSIDE THE WINDOW PROVES LIFE OUTRIGHT — no pid probe, and
  // a reboot does not override it (a re-claimed post-boot session writes one).
  if (t !== null && t - changedAt < idleWindowMs) {
    return { settled: true, owns: true, reason: 'fresh-heartbeat' }
  }

  // 4. A heartbeat from BEFORE this boot cannot have a living writer.
  if (typeof bootTime === 'number' && lock.claimedAt < bootTime) {
    return { settled: true, owns: false, reason: 'heartbeat-predates-boot' }
  }

  // 5. THE LEASE (point 434), NECESSARY BUT NOT SUFFICIENT since point 556. The
  // end of ownership is read from `effectiveLeaseUntil` and nowhere else, so
  // point 517's extension lands in exactly one place.
  const until = effectiveLeaseUntil(lock, { now, leaseMs })
  const expired = until !== null && t !== null && t > until
  // A dead declared wait does not dispossess on the spot: it withdraws the
  // extension, and the ORDINARY lease applies again from the owner's last
  // heartbeat (four-eyes review of 556, finding 3).
  const waitDied =
    !expired &&
    declaredWaitStale(lock, { now, leaseMs, workAdvancing: work?.advancing, workDeclared: work?.declared }) &&
    t !== null &&
    t > lock.claimedAt + leaseMs
  if (expired || waitDied) {
    const verdict = leaseTakeoverDecision({
      leaseAgeMs: (() => {
        if (waitDied) return t - (lock.claimedAt + leaseMs)
        return until !== null && t !== null ? t - until : null
      })(),
      pid: corroboration?.pid ?? null,
      pidIdentifiable: corroboration?.identifiable === true,
      pidLive: corroboration?.live === true,
      workAdvancing: waitDied ? false : work?.advancing === true,
      workJudgedOn: waitDied ? 'none' : (work?.corroboratedBy ?? work?.judgedOn ?? 'none'),
      workSummary: work?.summary ?? '',
    })
    return verdict.take
      ? { settled: true, owns: false, reason: waitDied ? 'declared-wait-stale' : 'lease-expired', detail: verdict.why }
      : { settled: true, owns: true, reason: 'lease-expired-owner-working', detail: verdict.why }
  }

  // 6. THE IDLE WINDOW (point 612). It sits AFTER the lease so an owner that ran
  // out of lease is still reported as `lease-expired` with its corroboration; what
  // it adds is the case in between — silent for minutes, lease still running, and
  // until now held by nothing but a breathing pid.
  const idle = idleVerdict({
    now,
    lastStateChangeAt: changedAt,
    idleWindowMs,
    // `declared`, never `advancing`: the first is a declaration the owner wrote,
    // the second is partly file mtimes and would let a stray watcher hold the batch.
    workDeclared: work?.declared === true || lockDeclaresWait(lock, now),
    workedSinceClaim: workedSinceClaim(lock),
    paused,
  })
  if (idle.idle) {
    return {
      settled: true,
      owns: false,
      reason: 'idle',
      detail:
        `the owner took the lock ${Math.round(idle.silentMs / 60000)} min ago and has not completed one tool call ` +
        `since, with nothing declared in flight (idle window ${Math.round(idleWindowMs / 60000)} min). ` +
        'Its process may well still be alive — one claude process hosts every session of a window, so a live pid ' +
        'says nothing about whether a SESSION is working. Nothing is killed; the owner simply stops owning the ' +
        'batch, and it keeps the batch the moment it does anything at all.',
    }
  }

  return { settled: false }
}
