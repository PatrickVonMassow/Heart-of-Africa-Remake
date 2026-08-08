// THE LEASE AND THE FENCE — pure decision core (layer 1 of
// docs/batch-resilience.md §3). Side-effect free, so the Vitest layer can sweep
// every rule without a filesystem (scripts/batch-lease-core.test.mjs). The I/O
// lives in scripts/batch-singleton.mjs (lock + fence file) and in
// scripts/board-first-guard.mjs (the one PreToolUse chokepoint).
//
// WHY (the night of 29./30.07.2026): work stopped at 21:50 and the state at
// 04:19 was byte-for-byte the same. Every layer could OBSERVE the stall while
// none could ACT, and where authority existed a condition kept it from reaching.
// The answer is not a better observer but a LEASE: ownership of the batch ends by
// arithmetic, at a moment both sides can compute from the same numbers, with no
// probe, no judgement and no condition in between.
//
// FOUR RULES THIS MODULE ENCODES
//
// 1. RENEWAL IS PRE-, NEVER POST-ToolUse. The existing heartbeat fires AFTER a
//    call returns, so a lease renewed by it would have to outlive the longest
//    single call — and this repository legitimately runs 30-40 minute suites and
//    has recorded 87 minutes of silence with work advancing. Renewing BEFORE the
//    long call keeps the window short and the reader side pure arithmetic.
//
// 2. THE FENCE IS NOT IN THE LOCK FILE. `acquire` DELETES the lock on a takeover
//    and a corrupt one reads as null, so a high-water mark kept there would be
//    lost exactly when it matters and a fresh start at fence=1 would re-admit the
//    old owner's writes. It lives in its own never-deleted, monotonic, max-wins
//    file; the lock carries only a COPY of its holder's number, which lets a
//    deleted fence file be re-seeded upward rather than downward.
//
// 3. AN EXPIRED LEASE IS NECESSARY BUT NOT SUFFICIENT (point 556, 08.08.2026).
//    Arithmetic decides when ownership ENDS; it does not decide alone that the
//    batch may be TAKEN. A session obeying the waiting rule sits inside ONE
//    long-blocking call and cannot renew from in there, so its lease runs out
//    precisely while it is most productive — measured at the 63rd minute, against
//    a live pid and declared work that had moved two minutes earlier, both of
//    which the tick had already read and printed. `leaseTakeoverDecision` makes
//    the takeover ask them, and `DECLARED_WAIT_LEASE_MS` is how such a wait says
//    in advance that it will be long. This is NOT the probing rule 1 refuses: the
//    acquire door still compares numbers, and the corroboration lives in the one
//    reader that already holds the signals.
//
// 4. A SESSION IS ONLY EVER FENCED OUT BY ITS OWN RECORD. Staleness is
//    `heldFence < currentFence` for a session that DEMONSTRABLY held a fence.
//    A session that never held one is never blocked — an attended window, a
//    fresh clone, a session that never drove the batch. Being wrong toward
//    "allow" costs a stale board; being wrong toward "deny" costs a block-loop,
//    which this project has already paid ~30 turns for once.

// ONE classifier for both PreToolUse gates (point 473): the board-first deny and
// this chokepoint judge a shell call the same way — per segment, on the command
// HEAD, with quoted text deciding nothing. `expandSegments` also unwraps what
// CARRIES a command (`bash -c "…"`, `eval`, `$( … )`), because at THIS gate the
// safe direction is the conservative one: the old string regexes saw through a
// wrapper by accident, and losing that would let a dispossessed session push
// shared history through any shell (four-eyes review, 30.07.2026).
import {
  expandSegments,
  isMutatingSegment,
  gitSubcommand,
  segmentInvokesScript,
  segmentMentionsFile,
} from './command-classify-core.mjs'

/**
 * HOW LONG ONE RENEWAL BUYS.
 *
 * SIXTY MINUTES, and the size follows from rule 1 above: because the lease is
 * renewed BEFORE a call rather than after it, the window must OUTLIVE the longest
 * legitimate single tool call — the thing the demolished `WEDGED_MS` valve was
 * calibrated against from this project's own 43 transcripts / 32 440 tool calls
 * (p99 8.9 min · p99.9 10.0 min · longest undeclared unattended call 27.8 min),
 * plus the longest declared one, the LARGE browser regression at 30-40 minutes.
 * With renewals at most `LEASE_RENEW_INTERVAL_MS` apart the guaranteed coverage
 * is 55 minutes: ~2.0x the longest measured undeclared call and 1.4x the LARGE
 * regression. Below that a running verification could lose the batch mid-run,
 * which docs/batch-resilience.md §5 forbids outright.
 *
 * It stays far under the demolished four-hour valve, and the ladder above it is
 * monotone: the external GitHub-Actions watcher judges repository OUTPUT at 120
 * minutes, so the local arithmetic always acts first.
 */
export const LEASE_MS = 60 * 60 * 1000

/**
 * The lease is rewritten at most this often. WITHOUT this the lock file would be
 * written twice per tool call (PreToolUse renewal + PostToolUse heartbeat) on the
 * hot path — and this exact file has a measured failure mode there: on
 * 28.07.2026 three writes within milliseconds produced `EPERM … rename
 * batch-lock.json.tmp -> batch-lock.json` five times, because a real-time scanner
 * holds the target of the rename. The defence adopted then was to write the lock
 * LESS; a renewal on every call would undo it.
 */
export const LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000

/**
 * HOW LONG A DECLARED WAIT KEEPS THE BATCH — and WHY THIS AND NOT A START-OF-CALL
 * RENEWAL (point 556, the second half of its final state).
 *
 * Point 556 offered two mechanisms and demanded that the chosen one be written
 * down with its reason: refresh the lease at call START as well as at completion,
 * or let a DECLARED in-flight wait extend it. THE DECLARED WAIT IS CHOSEN, because
 * only it can hold for a call that blocks for HOURS. A renewal — wherever it is
 * written — buys exactly one `LEASE_MS`, so a call that blocks longer than the
 * window ages its own lease to expiry however often the renewal fires; that is the
 * arithmetic that dispossessed a live owner on 08.08.2026 at the 63rd minute of one
 * blocking poll. (The renewal already IS at call start: `board-first-guard.mjs`
 * runs `renewLease` in PreToolUse. Adding a second one at completion would change
 * nothing about a call that never completes, which is precisely the case at issue.)
 *
 * FOUR HOURS, pinned to `LAUNCHER_WORK_MAX_AGE_MS` in batch-in-flight-core.mjs —
 * the window in which the launcher still treats a declaration as CURRENT. Longer
 * would keep the batch on paperwork the launcher no longer reads; shorter would
 * expire a wait the launcher still believes in. The two are asserted equal in the
 * test suite rather than imported across, because the dependency would run
 * backwards (batch-in-flight-core → batch-singleton → this module).
 *
 * IT IS NOT AN UNCONDITIONAL FOUR HOURS. The spec says the wait extends the lease
 * "for as long as its own evidence keeps advancing", so the extension is recorded
 * on the lock as `declaredWait: { at, until }` and `declaredWaitStale` lets the one
 * reader that HAS the evidence — the launcher — end it early when the declared work
 * stops moving. Every other reader compares numbers, exactly as before.
 */
export const DECLARED_WAIT_LEASE_MS = 4 * 60 * 60 * 1000

/**
 * HOW LONG ADVANCING WORK MAY OUTVOTE THE LEASE ARITHMETIC (four-eyes review of
 * point 556, confirmed finding 1).
 *
 * The corroboration of `leaseTakeoverDecision` is a safety net for an UNDECLARED
 * long call — a declared wait extends the lease outright and never reaches it. A
 * net with no bound is a hole: an owner wedged with something still producing in
 * the background would skip every tick for ever, and since the skip also ends the
 * launcher's repetition count nobody would be told either. ONE FURTHER WINDOW is
 * the bound, so total silence stays inside two hours — the point at which the
 * external repository-output watcher acts regardless, which keeps the ladder
 * monotone (renew 5 < lease 60 < override +60 ≤ watcher 120).
 */
export const TAKEOVER_OVERRIDE_MAX_MS = LEASE_MS

/** How many past fence holders the fence file remembers. Bounded on purpose: the
 *  file is never deleted, so an unbounded list would grow for the life of the
 *  repository. Twenty-four covers days of takeovers; beyond it a session reads as
 *  "never held a fence", which is the fail-OPEN direction. */
export const FENCE_HOLDER_HISTORY = 24

// --- The lease -----------------------------------------------------------------

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * WHEN DOES THIS LOCK'S OWNERSHIP END? PURE.
 *
 * A lock written by a build that predates the lease carries no `leaseUntil`, and
 * it MUST NOT need a migration step somebody has to remember: the session that
 * merges this code is a live owner holding exactly such a lock. So a missing
 * `leaseUntil` reads as an IMPLICIT lease of `claimedAt + leaseMs` — the same
 * shape the demolished age valve had, expressed as the one number everything
 * else now compares against. Its first PreToolUse call writes a real one.
 *
 * Returns epoch ms, or null when the lock carries no usable timestamp at all
 * (then no lease statement can be made and the caller must not invent one).
 */
export function leaseUntilOf(lock, { leaseMs = LEASE_MS } = {}) {
  if (!lock || typeof lock !== 'object') return null
  const explicit = num(lock.leaseUntil)
  if (explicit !== null) return explicit
  const claimed = num(lock.claimedAt)
  return claimed === null ? null : claimed + leaseMs
}

/**
 * HAS THE LEASE RUN OUT? PURE ARITHMETIC, AND DELIBERATELY NOTHING ELSE.
 *
 * There is NO probing at this door (docs/batch-resilience.md §3, layer 1). The
 * first revision of that design let a declared in-flight wait extend the lease
 * "while the declared work is provably moving", which put the judgement straight
 * back in. Declared work extends the lease by WRITING a longer `leaseUntil`; the
 * reader only compares two numbers.
 *
 * An unreadable lease is NOT expired — a lock we cannot understand must never
 * cost a live owner the batch.
 */
export function leaseExpired(lock, { now, leaseMs = LEASE_MS } = {}) {
  const until = leaseUntilOf(lock, { leaseMs })
  const t = num(now)
  if (until === null || t === null) return false
  return t > until
}

/**
 * MAY THIS RENEWAL BE SKIPPED? PURE. See `LEASE_RENEW_INTERVAL_MS`: the renewal
 * is on the per-tool-call path, and the lock is a file this project has already
 * been bitten for writing too often. A lease with more than
 * `leaseMs - renewIntervalMs` left is fresh enough; anything else is rewritten,
 * including a lock that carries no explicit lease yet.
 */
export function shouldRenewLease({ lock, now, leaseMs = LEASE_MS, renewIntervalMs = LEASE_RENEW_INTERVAL_MS } = {}) {
  const t = num(now)
  if (t === null) return false
  if (!lock || typeof lock !== 'object') return false
  const explicit = num(lock.leaseUntil)
  if (explicit === null) return true // never leased → write one now
  return explicit - t < leaseMs - renewIntervalMs
}

/** The lock as it reads after a renewal. PURE — the caller does the writing.
 *  Nothing else on the lock is touched: `claimedAt` in particular stays where it
 *  was, because bumping it here would silently withdraw a taken handover. */
export function renewedLock(lock, { now, leaseMs = LEASE_MS } = {}) {
  const t = num(now)
  if (!lock || typeof lock !== 'object' || t === null) return lock
  return { ...lock, leaseUntil: t + leaseMs }
}

/**
 * DOES A DECLARED WAIT STILL CARRY THIS LOCK? PURE.
 *
 * True only inside the stretch a declared wait BOUGHT: past the moment an ordinary
 * lease taken at the declaration would have run out (`at + leaseMs`) and still
 * inside what the declaration asked for (`until`). Judged on the two numbers the
 * extension recorded, never on `claimedAt` — that one moves with every heartbeat,
 * so an arithmetic hung on it would drift with the owner's own tool calls.
 *
 * Outside that stretch there is nothing conditional about the lease and the
 * ordinary expiry is the whole story.
 */
export function inDeclaredWaitWindow(lock, { now, leaseMs = LEASE_MS } = {}) {
  if (!lock || typeof lock !== 'object') return false
  const dw = lock.declaredWait
  if (!dw || typeof dw !== 'object') return false
  const at = num(dw.at)
  const until = num(dw.until)
  const t = num(now)
  if (at === null || until === null || t === null) return false
  return t > at + leaseMs && t <= until
}

/**
 * THE LAUNCHER'S TAKEOVER VERDICT. PURE, TOTAL, AND THE WHOLE OF POINT 556's
 * FIRST CLAUSE.
 *
 * MEASURED 08.08.2026, 05:45Z: the launcher logged `LEASE EXPIRED: 5551713b…
 * (pid 4048953) has not renewed for 63 min — taking the batch` and spawned a
 * second session while that owner was ALIVE, mid-verification, with its delegated
 * agent's worktree active. The tick HAD both corroborating signals and printed
 * them itself in the same breath — the pid was alive and the declared work had
 * moved two minutes earlier — and took the batch anyway, because the lease branch
 * asked nothing else. Two sessions then shared one repository.
 *
 * So an expired lease alone no longer dispossesses. It is a NECESSARY condition;
 * the takeover additionally requires that a corroborating signal come back
 * NEGATIVE:
 *   - the pid is dead, or its identity cannot be established at all, OR
 *   - the declared work is not advancing (which includes: nothing was declared).
 * With a live pid AND advancing declared work the tick SKIPS and says so, naming
 * the lease age it overrode.
 *
 * WHY NOT "live pid alone": a wedged process breathes. The whole reason the lease
 * exists is that a pid probe cannot tell working from wedged, so the pid may only
 * ever CORROBORATE evidence of work, never stand in for it. And why the pair is
 * safe: an owner that wants this protection must have DECLARED its wait
 * (`batch-in-flight.mjs --waiting-on`), which is the house rule for any wait long
 * enough to matter, and that declaration is only honoured while a probe confirms
 * the work is still moving. A silent owner with nothing declared is dispossessed
 * exactly as before — the recovery this mechanism exists for is untouched.
 *
 * Inputs (all already read by the tick before it reaches this door):
 *   leaseAgeMs      — how long the lease has been out, for the message
 *   pidIdentifiable — could the lock's process be identified at all
 *   pidLive         — that same process exists and is not a reused number
 *   workAdvancing   — `assessOwnerWork(...).advancing`
 *   pid, workSummary — for the sentence only, never for the verdict
 *
 * Returns { take, reason, why }. `why` is prose for the log; `reason` is the key.
 */
export function leaseTakeoverDecision({
  leaseAgeMs = null,
  pid = null,
  pidIdentifiable = false,
  pidLive = false,
  workAdvancing = false,
  workJudgedOn = 'none',
  workSummary = '',
  overrideMaxMs = TAKEOVER_OVERRIDE_MAX_MS,
} = {}) {
  const ageMin = num(leaseAgeMs) === null ? null : Math.round(leaseAgeMs / 60000)
  const age = ageMin === null ? 'an expired lease' : `a lease ${ageMin} min out`
  const who = num(pid) === null ? 'the owner' : `pid ${pid}`
  if (pidIdentifiable !== true) {
    return { take: true, reason: 'pid-unidentifiable', why: `${age} and no identifiable owner process — taking the batch` }
  }
  if (pidLive !== true) {
    return { take: true, reason: 'pid-dead', why: `${age} and ${who} is gone — taking the batch` }
  }
  if (workAdvancing !== true) {
    return {
      take: true,
      reason: 'work-not-advancing',
      why: `${age} and nothing the owner declared is still moving — taking the batch`,
    }
  }
  // A BREATHING PROCESS IS NOT PRODUCED WORK (four-eyes review of point 556,
  // confirmed finding 1). `assessOwnerWork.advancing` is true if ANY answerable
  // item checks out, and a declared `--pid` item checks out for merely EXISTING —
  // which this repository's own vocabulary calls "a live process (nothing
  // produced) — the weakest". Corroborating an expired lease with that would let a
  // wedged owner whose declared child hangs alive-but-idle hold the batch on every
  // tick forever: the exact mirror of the failure point 556 fixes, and one that
  // used to resolve within the hour. Only work that PRODUCED something may outvote
  // the arithmetic — a commit, a written file (`git`), or a log still being
  // written (`log`, weak but genuinely output).
  if (workJudgedOn === 'process' || workJudgedOn === 'none') {
    return {
      take: true,
      reason: 'work-breathing-only',
      why:
        `${age} and the declared work is judged on a live process alone — nothing produced. ` +
        'A breathing pid corroborates nothing; taking the batch.',
    }
  }
  // …AND THE OVERRIDE IS BOUNDED (same finding). Even produced output must not
  // outvote the arithmetic without end, or "the batch must not be able to stand
  // still" becomes "unless something in the repository is still moving", and the
  // launcher's own escalation would be the only remaining alarm. One further whole
  // window: total silence stays inside two hours, which is where the external
  // repository-output watcher acts anyway, so the ladder stays monotone and the
  // local layer never becomes the last thing between a stall and a human.
  const cap = num(overrideMaxMs)
  if (cap !== null && num(leaseAgeMs) !== null && leaseAgeMs > cap) {
    return {
      take: true,
      reason: 'override-expired',
      why:
        `${age} — past the ${Math.round(cap / 60000)} min for which advancing work may outvote the lease. ` +
        `The work still moves (${workSummary || 'no summary'}), but an owner silent this long is taken over anyway.`,
    }
  }
  return {
    take: false,
    reason: 'live-owner-working',
    why:
      `NOT taking the batch despite ${age}: ${who} is alive AND the declared work has PRODUCED something` +
      `${workSummary ? ` — ${workSummary}` : ''}. An expired lease alone does not dispossess a live owner ` +
      '(point 556): the owner is inside one long-blocking call, which is what the waiting rule prescribes.',
  }
}

/**
 * HAS A DECLARED WAIT STOPPED EARNING ITS EXTENSION? PURE.
 *
 * The other half of the same honesty: a declared wait extends the lease only "for
 * as long as its own evidence keeps advancing", so a reader that HAS the evidence
 * ends the extension the moment the work stops moving, instead of letting four
 * hours of paperwork hold a batch nobody is driving. A reader WITHOUT the evidence
 * (`workAdvancing` undefined) never ends it — being wrong toward "the owner keeps
 * it" costs a delayed recovery, being wrong the other way costs the incident.
 *
 * IT NEEDS A DECLARATION STILL ON FILE (`workDeclared`), and that clause is not a
 * detail — without it this function reintroduces the very bug point 556 fixes, one
 * step later. Consider a session that declares a wait, sees its agent finish, and
 * then starts a 40-minute regression inside one call: its lease is still the
 * four-hour extension, so the PreToolUse renewal has nothing to write, and with no
 * declaration left `workAdvancing` is false — the launcher would take the batch
 * mid-regression on the strength of a wait that was over. So a wait that is over
 * simply stops being conditional; what bounds the owner from there is the ordinary
 * arithmetic, and being over-generous by the remainder of one declared window is
 * the direction this whole point argues for.
 */
export function declaredWaitStale(lock, { now, leaseMs = LEASE_MS, workAdvancing, workDeclared } = {}) {
  if (workAdvancing === undefined || workAdvancing === null) return false
  if (workDeclared !== true) return false
  if (!inDeclaredWaitWindow(lock, { now, leaseMs })) return false
  return workAdvancing !== true
}

// --- The fence -----------------------------------------------------------------
//
// (`renewalDecision`, which needs both halves, sits below the fence section.)

/** The fence file's shape, normalised. An unreadable file yields fence 0 and no
 *  holders, i.e. "nothing known" — which blocks nobody. */
export function normaliseFence(state) {
  const s = state && typeof state === 'object' ? state : {}
  const fence = num(s.fence)
  const holders = Array.isArray(s.holders) ? s.holders : []
  const t = s.lastTakeover
  return {
    fence: fence !== null && fence > 0 ? Math.floor(fence) : 0,
    holder: typeof s.holder === 'string' ? s.holder : '',
    holders: holders
      .filter((h) => h && typeof h.sessionId === 'string' && num(h.fence) !== null)
      .map((h) => ({ sessionId: h.sessionId, fence: Math.floor(h.fence), at: num(h.at) ?? 0 })),
    // WHO WAS DISPOSSESSED, AND WHY (point 556, third clause). The fence file
    // already recorded THAT the mark moved; it never recorded the reason, so a
    // fenced-out session could learn it only from a denied merge. An unreadable or
    // absent record normalises to null and tells nobody anything.
    lastTakeover:
      t && typeof t === 'object' && typeof t.from === 'string' && t.from
        ? {
            from: t.from,
            fence: num(t.fence) === null ? 0 : Math.floor(t.fence),
            reason: typeof t.reason === 'string' ? t.reason : '',
            at: num(t.at) ?? 0,
          }
        : null,
  }
}

/**
 * THE NEXT FENCE NUMBER. PURE, MONOTONIC, MAX-WINS.
 *
 * `priorFence` is the number carried by the lock being replaced. It is what makes
 * the mark survive its own file: delete `batch-fence.json` and the next acquire
 * still seeds from the outgoing owner's copy, so the counter can never be reset
 * to a value that would re-admit a dispossessed session's writes
 * (docs/batch-resilience.md §8, "a fence file that was deleted does not lower the
 * high-water mark").
 */
export function nextFence({ fenceState, priorFence } = {}) {
  const cur = normaliseFence(fenceState).fence
  const prior = num(priorFence)
  return Math.max(cur, prior !== null && prior > 0 ? Math.floor(prior) : 0) + 1
}

/** The fence file as it reads after granting `fence` to `sessionId`. PURE.
 *  Max-wins: a grant can never lower the mark, even if a caller passes an old
 *  number. */
export function grantedFenceState({
  fenceState,
  sessionId,
  fence,
  now,
  takeover = null,
  historyLimit = FENCE_HOLDER_HISTORY,
} = {}) {
  const cur = normaliseFence(fenceState)
  const sid = typeof sessionId === 'string' ? sessionId : ''
  const n = Math.max(cur.fence, num(fence) ?? 0)
  const at = num(now) ?? 0
  const holders = [...cur.holders.filter((h) => h.sessionId !== sid), ...(sid ? [{ sessionId: sid, fence: n, at }] : [])]
  // A grant that took the batch FROM somebody records that, so the dispossessed
  // session can be told at its next hook rather than at a denied merge. A grant
  // that took it from nobody (a free lock) leaves the previous record standing —
  // it belongs to whoever was last dispossessed and is dropped when that session
  // has been told.
  const took =
    takeover && typeof takeover === 'object' && typeof takeover.from === 'string' && takeover.from && takeover.from !== sid
      ? { from: takeover.from, fence: n, reason: typeof takeover.reason === 'string' ? takeover.reason : '', at }
      : cur.lastTakeover
  return {
    v: 1,
    fence: n,
    holder: sid || cur.holder,
    at,
    holders: holders.slice(-Math.max(1, historyLimit)),
    ...(took ? { lastTakeover: took } : {}),
  }
}

/** The highest fence this session was ever granted, or null if it never held one. */
export function fenceHeldBy(fenceState, sessionId) {
  const sid = typeof sessionId === 'string' ? sessionId : ''
  if (!sid) return null
  const cur = normaliseFence(fenceState)
  let best = null
  for (const h of cur.holders) {
    if (h.sessionId === sid && (best === null || h.fence > best)) best = h.fence
  }
  return best
}

/**
 * IS THIS SESSION'S FENCE STALE? PURE.
 *
 * Stale means: it HELD a fence and the mark has moved past it — i.e. somebody
 * else took the batch in the meantime. Three non-obvious consequences, each
 * deliberate:
 *   - a session that never held a fence is NEVER stale (`held === null`), so the
 *     gate cannot fire on a window that has nothing to do with the batch;
 *   - a compaction, which mints a new session id under the same process, leaves
 *     the NEW id unknown → not stale, and the OLD id at `held === current` →
 *     also not stale. Ownership by process is unaffected by the fence;
 *   - a missing or unreadable fence file yields current 0 and no holders, so
 *     nothing is stale. A fence we cannot read must never block anybody.
 */
export function fenceStatus({ fenceState, sessionId } = {}) {
  const cur = normaliseFence(fenceState)
  const held = fenceHeldBy(fenceState, sessionId)
  const stale = held !== null && cur.fence > held
  // The recorded reason is surfaced ONLY to the session it names: it is the one
  // fact a dispossessed owner cannot work out for itself, and it is nobody else's.
  const takeover = stale && cur.lastTakeover && cur.lastTakeover.from === sessionId ? cur.lastTakeover : null
  return { current: cur.fence, held, stale, takeover }
}

/**
 * TELL A DISPOSSESSED SESSION THAT IT LOST THE BATCH, AND WHY. PURE, TOTAL.
 *
 * Point 556, third clause: "a takeover that DOES happen against a live owner tells
 * that owner — the fenced session must learn at its next hook that it no longer
 * owns the batch and why, rather than discovering it at the merge; it had a
 * verification worth handing over." Until now the fence spoke only when the
 * session tried one of four guarded calls, so an owner mid-regression learned
 * nothing until it went to merge what it had just proven.
 *
 * It speaks ONCE per fence number (`announcedFence` is what this session was last
 * told), because the carrier is `additionalContext` on a PostToolUse hook and that
 * is re-sent with every later request — a line repeated per tool call would be paid
 * for all session. It stands down for a paused batch and for any session that never
 * held a fence, like every guard in this repository.
 *
 * Returns { notify, fence, context }.
 */
export function dispossessionNotice({ fenceState, sessionId, announcedFence = 0, paused = false } = {}) {
  try {
    if (paused === true) return { notify: false, fence: 0, context: '' }
    const status = fenceStatus({ fenceState, sessionId })
    if (!status.stale) return { notify: false, fence: 0, context: '' }
    const already = num(announcedFence) ?? 0
    if (already >= status.current) return { notify: false, fence: status.current, context: '' }
    const why = status.takeover?.reason ? ` The reason recorded by the takeover: ${status.takeover.reason}.` : ''
    return {
      notify: true,
      fence: status.current,
      context: [
        `THE BATCH IS NO LONGER YOURS. This session held fence ${status.held}; the batch has since been taken ` +
          `over and stands at fence ${status.current}.${why}`,
        'Nothing was killed — you are still running, and everything you have in flight is still yours to finish ' +
          'and to COMMIT. What you may no longer do is merge, push, tick the work order or publish the board; ' +
          'the current owner does that, and the PreToolUse fence refuses those four families outright.',
        'You are told here, at your next hook, rather than at the merge, because work worth handing over is ' +
          'worth handing over while it is still fresh: commit and push what you have on its branch, and say in ' +
          'your last message what was verified and what is left.',
        'To take the batch back through the sanctioned channel: `node scripts/batch-claim.mjs --session <this ' +
          'session id>`. `node scripts/batch-doctor.mjs` reports who owns it now.',
      ].join('\n'),
    }
  } catch {
    return { notify: false, fence: 0, context: '' }
  }
}

/**
 * MAY THIS SESSION RENEW ITS LEASE? PURE. The whole PreToolUse renewal rule in
 * one function, so the hook file only does I/O.
 *
 * A STALE FENCE REFUSES THE RENEWAL (docs/batch-resilience.md §8, "a renewal
 * under a stale fence is refused"). Without that clause a woken owner whose lock
 * somehow still named it would renew its way back into a live lease and start
 * writing again beside the successor — the fence would then merely have recorded
 * the takeover instead of enforcing it.
 *
 * Returns { renew, reason } — the reason is for the log, never for a decision.
 */
export function renewalDecision({
  lock,
  sessionId,
  fenceState,
  now,
  leaseMs = LEASE_MS,
  renewIntervalMs = LEASE_RENEW_INTERVAL_MS,
} = {}) {
  if (!lock || typeof lock !== 'object') return { renew: false, reason: 'no-lock' }
  const sid = typeof sessionId === 'string' ? sessionId : ''
  if (!sid || lock.sessionId !== sid) return { renew: false, reason: 'not-owner' }
  if (fenceStatus({ fenceState, sessionId: sid }).stale) return { renew: false, reason: 'fence-stale' }
  if (!shouldRenewLease({ lock, now, leaseMs, renewIntervalMs })) return { renew: false, reason: 'still-fresh' }
  return { renew: true, reason: 'renewed' }
}

// --- The chokepoint ------------------------------------------------------------

/** Scripts whose whole job is to publish the board the user reads. */
const BOARD_PUBLISH_SCRIPTS = ['board-publish.mjs', 'dashboard-publish.mjs', 'board.mjs']

/** Scripts that MERGE `.claude/dashboard-state.json` as their normal operation. */
const DASHBOARD_STATE_SCRIPTS = ['focus.mjs', 'dashboard-sync.mjs', 'board-queue.mjs']

/** The work order and its archive — the tick and the archive move. */
const TASKS_FILES = ['TASKS.md', 'tasks-archive.md']

/** git verbs that move SHARED history — read off the subcommand, so neither
 *  `git log --merges` nor a quoted "push" is ever a hit. */
const GIT_SHARED_HISTORY = new Set(['merge', 'push'])

const asPosix = (p) => String(p ?? '').replace(/\\/g, '/')

/**
 * WHICH FENCE-GUARDED FAMILY DOES THIS TOOL CALL BELONG TO? PURE.
 *
 * Deliberately NOT "every state-changing call": these four are the paths that
 * have NO guard of their own today (docs/batch-resilience.md §3, layer 1). The
 * lock's own writers — heartbeat, markHandover, updateOwnLock, withdrawHandover,
 * clearOwnBoundary — are already sessionId-guarded and need nothing, and neither
 * does `batch-claim` (own expiry plus pid probe). Without this chokepoint the
 * fence would protect only the file that was already protected, and the woken
 * owner would still push to main.
 *
 * Returns null (not guarded) or { kind, what }.
 */
export function fenceGuardedAction({ toolName, command, filePath } = {}) {
  const tool = String(toolName ?? '')
  const path = asPosix(filePath)
  // A PATH ALONE IS NOT AN ACTION: `Read`, `Grep` and `Glob` carry file paths
  // too, and a gate that refuses to let a fenced-out session READ the work order
  // would tell it it is dispossessed by denying it the only way to find out.
  if (path && (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')) {
    if (TASKS_FILES.some((f) => path === f || path.endsWith(`/${f}`))) {
      return { kind: 'tasks', what: 'an edit of the work order (the tick / the archive move)' }
    }
    if (path.endsWith('dashboard-state.json')) {
      return { kind: 'dashboard-state', what: 'a write to .claude/dashboard-state.json' }
    }
  }
  if (tool !== 'Bash' && tool !== 'PowerShell') return null
  // FAIL CLOSED ON AN UNREADABLE NESTING (four-eyes review round 2): past the
  // unwrapping depth the classifier stops looking, and "we stopped looking" is
  // not a licence to move shared history. The idle-claim gate shrugs at the same
  // input — it may under-block; this one may not.
  let tooDeep = false
  const segments = expandSegments(command, { onTruncate: () => (tooDeep = true) })
  for (const segment of segments) {
    if (GIT_SHARED_HISTORY.has(gitSubcommand(segment))) {
      // A dispossessed session may still commit locally; what it may not do is
      // move shared history. `git push` is matched in every form rather than only
      // where "main" appears literally — `git push origin HEAD:main` names the
      // branch nowhere a regex can rely on, and the safe direction for a session
      // that has already lost the batch is not to write to the remote at all.
      return { kind: 'git-main', what: 'a `git merge` / `git push` (shared history)' }
    }
    if (segmentInvokesScript(segment, BOARD_PUBLISH_SCRIPTS)) {
      return { kind: 'board-publish', what: 'a board publish' }
    }
    if (segmentInvokesScript(segment, DASHBOARD_STATE_SCRIPTS)) {
      return { kind: 'dashboard-state', what: 'a merge into .claude/dashboard-state.json' }
    }
    if (segmentInvokesScript(segment, ['tasks-archive.mjs', 'tasks-archive-guard.mjs'])) {
      return { kind: 'tasks', what: 'an archive move in the work order' }
    }
    if (segmentMentionsFile(segment, TASKS_FILES) && isMutatingSegment(segment)) {
      return { kind: 'tasks', what: 'a write to the work order' }
    }
  }
  if (tooDeep) {
    return { kind: 'nested', what: 'a command wrapped deeper than this gate can read' }
  }
  return null
}

/**
 * THE CHOKEPOINT'S VERDICT. PURE, and total by contract — the wrapper's
 * fail-open must not depend on luck.
 *
 * Returns { block, reason, kind }. It blocks only where ALL of these hold:
 *   - the batch is not paused,
 *   - this session demonstrably held a fence and the mark has moved past it,
 *   - and the call belongs to one of the four unguarded families.
 */
export function fenceDecision({ fenceState, sessionId, toolName, command, filePath, paused = false } = {}) {
  try {
    if (paused === true) return { block: false, reason: '', kind: null }
    const status = fenceStatus({ fenceState, sessionId })
    if (!status.stale) return { block: false, reason: '', kind: null }
    const action = fenceGuardedAction({ toolName, command, filePath })
    if (!action) return { block: false, reason: '', kind: null }
    return {
      block: true,
      kind: action.kind,
      reason:
        'FENCED OUT — this session no longer owns the batch. It held fence ' +
        `${status.held}; the batch has since been taken over and stands at fence ${status.current}. ` +
        `${status.takeover?.reason ? `The takeover recorded: ${status.takeover.reason}\n` : ''}` +
        `The call refused is ${action.what}.\n` +
        'This is not a permission problem and not a bug: the batch lease expired while this session was ' +
        'silent, another session took over, and two sessions writing the work order, the shared git ' +
        'history or the board is the incident the singleton exists to prevent (docs/batch-resilience.md ' +
        '§3, layer 1).\nWhat to do:\n' +
        '  - Do NOT merge, push, tick the work order or publish the board. The current owner does that.\n' +
        '  - Reads, local commits and everything outside those four paths are untouched.\n' +
        '  - To take the batch back through the sanctioned channel:\n' +
        '      node scripts/batch-claim.mjs --session <this session id>\n' +
        '  - `node scripts/batch-doctor.mjs` reports who owns it now.',
    }
  } catch {
    return { block: false, reason: '', kind: null }
  }
}
