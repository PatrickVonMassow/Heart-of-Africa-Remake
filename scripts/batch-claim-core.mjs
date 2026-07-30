// TAKING THE BATCH BACK INTO THE WINDOW THE USER IS SITTING AT (point 395,
// user 28.07.2026) — the decision half, pure and dependency-injected.
//
// WHY: the night belongs to fresh headless sessions, and that is where the
// context saving comes from. What was missing is the way BACK. The user returns
// to a window that has been silent for hours, types `/clear` and says "I am
// back" — and that window resolves as a non-owner and correctly STANDS DOWN
// (scripts/batch-resume-hook.mjs), while the night session keeps the lock and
// keeps working. There was no door.
//
// THE SHAPE, deliberately the one the boundary and the in-flight declaration
// already use: the returning window records a CLAIM; the live owner sees it at
// its next Stop hook, FINISHES what it is doing, and only then releases the lock;
// the claiming window acquires at its next check. With no owner at all the claim
// is satisfied at once — there is nobody to wait for.
//
// IT IS A REQUEST, NEVER A TRANSFER. Nothing here writes the lock: ownership is
// still gained ONLY through `acquire` in scripts/batch-singleton.mjs, whose
// test-and-set is what makes two racing claims resolve to exactly one owner. A
// claim can therefore never produce a second driving session — the failure this
// whole apparatus exists to prevent (the e9407cae incident).
//
// FOUR BOUNDS, each measurable rather than a matter of taste:
//   1. IT IS BOUNDED BY THE THING IT WAITS FOR, not by a clock somebody has to
//      feed (point 434 (6), 30.07.2026 — see `assessClaim`). A claim file left by
//      a window that was closed must never hand the batch to nobody, and the
//      reader that answers that is the pid probe of bound 2, not the calendar.
//      The wall clock survives only where there is nobody left to wait for: with
//      the lock free and the claim untaken, `CLAIM_MAX_AGE_MS` is the TAKE-UP
//      window after which the ordinary handover takes over again.
//   2. THE CLAIMANT MUST BE ALIVE, and alive by IDENTITY: the recorded pid must
//      exist AND have started when the claim says it did. A reused pid is a
//      stranger. This is the same rule `checkEvidence` applies to a declared
//      background run, and it reuses `resolveOwnership` for "is this claim mine"
//      rather than inventing a second notion of liveness beside the lock's.
//   3. ONE CLAIM AT A TIME. A second window cannot overwrite a live claim by a
//      first (`claimWriteDecision`), and even if both were somehow recorded, the
//      atomic acquire still admits exactly one owner.
//   4. THE OWNER RELEASES ONLY AT A CLEAN MOMENT. Never mid-merge, never with a
//      delegated agent still building or a verification running — the evidence
//      for that is `assessInFlight` (scripts/batch-in-flight-core.mjs), not a new
//      guess. A wrongly withheld release costs the user one more turn; a release
//      mid-merge costs the work.
//
// Where two verdicts are close this file chooses NOT to release: the owner
// keeping the batch for another turn is a nuisance, a half-finished merge is a
// repair job.
import { resolveOwnership, PID_START_TOLERANCE_MS } from './batch-singleton.mjs'

/**
 * THE TAKE-UP WINDOW: how long a claim stays honourable once there is nobody
 * left to wait for — the lock free (or its owner gone) and the claim not yet
 * taken. Past it the ordinary handover applies again, so a claim can never leave
 * the batch ownerless.
 *
 * IT IS NO LONGER THE CLAIM'S LIFETIME (point 434 (6a), 30.07.2026). As a flat
 * expiry it was shorter than the owner's own gap between clean turn ends: the
 * owner is inside a 40-minute suite, the claim ages out unseen, the takeover
 * silently fails, and keeping it alive needed a background refresher that itself
 * died silently (measured 29.07.2026 20:00, session 10a2d2e0 — a watcher hit a
 * 60-minute timeout and the claim would have lapsed at 20:29 with nobody the
 * wiser). While a live owner still holds the lock the claim therefore does NOT
 * age: it is honoured for as long as the window that wrote it is alive, which is
 * a fact a probe reads rather than a deadline anybody feeds.
 *
 * Calibratable via HOA_CLAIM_MAX_MIN (scripts/batch-claim.mjs).
 */
export const CLAIM_MAX_AGE_MS = 30 * 60 * 1000

/**
 * A claim that carries its own ISSUER is a machine errand with a lifetime of its
 * own, and it keeps the wall clock. PURE.
 *
 * The chat watcher's responder claim (`by: 'chat-watcher'`,
 * scripts/chat-watcher-core.mjs) names the WATCHER's process, which lives for
 * hours while the errand it stands for is capped at ten minutes — so its pid is
 * not a bound on the wait and the clock is the only one it has. A window's own
 * takeover claim names the window that will TAKE the batch, and that pid is the
 * honest bound. The distinction is in the record, not in a caller's flag.
 */
export function claimIsBounded(claim) {
  return typeof claim?.by === 'string' && claim.by.trim() !== ''
}

/** What the git probe answers when it could not find OUT (a timeout under load, a
 *  git that would not run) — as opposed to `null`, which means it looked and found
 *  nothing half-done. The two must not collapse into one value: "I could not look"
 *  read as "all clear" releases the batch mid-merge, and that is the one outcome
 *  this whole family exists to prevent. `releaseDecision` maps it to `wait`, and
 *  the bound that keeps a too-timid verdict from stranding anything is the claim's
 *  own expiry. Lives here, not in the IO half, so the pure decision function owns
 *  the value it interprets. */
export const GIT_STATE_UNVERIFIABLE = 'unverifiable'

/**
 * JUDGE A CLAIM. PURE — the pid probe is injected.
 *
 * Inputs:
 *   claim     — the parsed claim file ({ sessionId, pid, pidStartedAt, at, … }) or null
 *   sid       — the session ASKING (the owner's Stop hook, a starting session, the
 *               claimant's own CLI)
 *   ancestor  — { pid, startedAt } of the claude process the asking session runs
 *               under, or null. For the OWNER this is its own lock's recorded
 *               process, which costs nothing and closes the one hole a bare
 *               session-id compare leaves: a context compaction renames the
 *               session, so the owner's own claim would otherwise read as a
 *               stranger's and it would release the batch to itself.
 *   ownerSid  — who holds the lock right now, when known
 *   ownerHolding — is a live owner still holding the lock, i.e. is there anybody
 *               to WAIT for? While there is, the claim does not age (point 434
 *               (6a)); once there is not, `maxAgeMs` is the take-up window. It
 *               defaults to FALSE, so a caller that cannot answer gets the
 *               bounded reading — the direction that can never strand the batch.
 *   now, maxAgeMs, probePid, tolerance
 *
 * Returns { honour, mine, reason, ageMs, claimantSid, releasedAt }. `honour` true
 * is the ONLY value that changes anybody's behaviour; every other path leaves the
 * batch exactly as it was.
 *
 * A RELEASED CLAIM IS NOT A CLAIM (point 434 (6c), measured 30.07.2026
 * 10:10-10:16). A record with `releasedAt` AND `releasedBy` both set was still
 * honoured: the owning session released to it, the claiming window never took
 * it, and the batch then ran for an hour with NO lock at all while every guard
 * and heartbeat behaved as though it were owned — and the boundary that followed
 * released to the same dead claim a second time (`.claude/boundary.log`: two
 * RELEASED lines, no HANDOVER). The stamp means the hand-over already happened,
 * so the reader must treat it as ABSENT: nothing is released to it twice, it
 * reserves nothing, and a new claim may be written straight over it. What the
 * claimant loses is the reservation — the lock is FREE and its own re-run of
 * `batch-claim.mjs --session <id>` still takes it — and what the batch gains is
 * that a release with no live taker falls back to the ordinary handover instead
 * of leaving the batch ownerless.
 */
export function assessClaim({
  claim,
  sid = '',
  ancestor = null,
  ownerSid = '',
  ownerHolding = false,
  now,
  maxAgeMs = CLAIM_MAX_AGE_MS,
  probePid = null,
  tolerance = PID_START_TOLERANCE_MS,
} = {}) {
  const out = (honour, reason, extra = {}) => ({
    honour,
    mine: false,
    reason,
    ageMs: null,
    claimantSid: null,
    releasedAt: null,
    ...extra,
  })
  if (!claim || typeof claim !== 'object') return out(false, 'no-claim')
  if (typeof claim.at !== 'number' || typeof claim.sessionId !== 'string' || !claim.sessionId) {
    return out(false, 'malformed')
  }
  const base = {
    claimantSid: claim.sessionId,
    releasedAt: typeof claim.releasedAt === 'number' ? claim.releasedAt : null,
  }
  const ageMs = now - claim.at
  // A claim from the future is a clock nobody here can reason about → ignore it.
  // Costs one re-claim; the other direction hands the batch over on a bad stamp.
  if (!(ageMs >= 0)) return out(false, 'clock-skew', { ...base, ageMs })

  // Ours? By the lock's own identity rules — session id first, the claude process
  // second — so a compaction that mints a new id never orphans a claim this very
  // window wrote, while a genuinely second window still fails it. Asked BEFORE the
  // released check so the claimant still recognises (and clears) its own record.
  if (resolveOwnership({ lock: claim, sessionId: sid, ancestor, tolerance }).mine) {
    return out(false, 'own-claim', { ...base, ageMs, mine: true })
  }
  if (ownerSid && claim.sessionId === ownerSid) return out(false, 'claimant-is-owner', { ...base, ageMs })

  // ALREADY HANDED OVER → absent, for everybody but its own writer (see above).
  if (base.releasedAt !== null || (typeof claim.releasedBy === 'string' && claim.releasedBy.trim() !== '')) {
    return out(false, 'released', { ...base, ageMs })
  }

  // LIVENESS BY IDENTITY, never by existence: a claim from a window that has been
  // closed must not move the batch, and a pid the OS handed to somebody else is
  // not the claimant. THIS is the bound that replaced the flat expiry.
  const pid = Number(claim.pid)
  if (!Number.isInteger(pid) || pid <= 0) return out(false, 'claimant-unidentified', { ...base, ageMs })
  const probe = probePid ? probePid(pid) : null
  if (!probe || probe.exists !== true) return out(false, 'claimant-dead', { ...base, ageMs })
  if (typeof claim.pidStartedAt !== 'number') return out(false, 'claimant-no-start-time', { ...base, ageMs })
  if (typeof probe.startedAt !== 'number') {
    return out(false, 'claimant-start-time-unverifiable', { ...base, ageMs })
  }
  if (Math.abs(probe.startedAt - claim.pidStartedAt) > tolerance) {
    return out(false, 'claimant-pid-reused', { ...base, ageMs })
  }

  // THE CLOCK, where and only where nothing else bounds the wait: an errand claim
  // that carries its own issuer, or a claim with no live owner left to wait for.
  if ((claimIsBounded(claim) || ownerHolding !== true) && ageMs > maxAgeMs) {
    return out(false, 'expired', { ...base, ageMs })
  }
  return out(true, 'honour', { ...base, ageMs })
}

/**
 * MAY THE OWNER RELEASE NOW? PURE.
 *
 * A merge, a delegated agent still building and a running verification are all
 * things that must never be cut in half, so an honoured claim WAITS for them
 * rather than overriding them. The in-flight evidence is the existing one
 * (`assessInFlight().live`) — this file does not invent a second way to ask
 * whether work is still running.
 *
 * An UNVERIFIABLE git state waits too. A probe that timed out under load says
 * nothing about the checkout, and reading it as "nothing half-done" is precisely
 * the release-mid-merge this file's closing rule forbids. The cost of the timid
 * direction is bounded: the claim keeps standing until the next turn end, and it
 * expires on its own, so nothing is stranded.
 *
 * Returns { verdict: 'none' | 'wait' | 'release', reason }.
 */
export function releaseDecision({ assessment, inFlightLive = false, gitOperation = null } = {}) {
  if (!assessment || assessment.honour !== true) {
    return { verdict: 'none', reason: assessment?.reason ?? 'no-claim' }
  }
  if (inFlightLive === true) return { verdict: 'wait', reason: 'work-in-flight' }
  const op = typeof gitOperation === 'string' && gitOperation.trim() ? gitOperation.trim() : null
  if (op === GIT_STATE_UNVERIFIABLE) return { verdict: 'wait', reason: 'git-state-unverifiable' }
  if (op) return { verdict: 'wait', reason: `git-${op}` }
  return { verdict: 'release', reason: 'clean' }
}

/**
 * MAY THIS SESSION TAKE THE FREE LOCK, OR IS IT RESERVED? PURE.
 *
 * The counterpart to `releaseDecision`, and the reason the release does not turn
 * into churn. Once the owner has let go, the lock lies free for as long as it
 * takes the claiming window to run its next command — and ANY other window that
 * reaches an acquire in that gap takes it: the launcher's spawn, a stood-down
 * third window's turn end. It would then see the very claim that freed the lock,
 * judge the moment clean, release again, and say "handed back" once more. Every
 * site that acquires therefore asks this first.
 *
 * `honour` is exactly the reservation: `assessClaim` answers `mine` (never
 * `honour`) for the claimant's OWN claim, so the window the batch is waiting for
 * still acquires — which is the whole point of freeing it.
 *
 * Returns { acquire, reason, claimantSid }.
 */
export function reservationDecision({ assessment } = {}) {
  const a = assessment ?? null
  if (a && a.honour === true) {
    return { acquire: false, reason: 'reserved', claimantSid: a.claimantSid ?? null }
  }
  return { acquire: true, reason: a?.mine === true ? 'own-claim' : (a?.reason ?? 'no-claim'), claimantSid: a?.claimantSid ?? null }
}

/**
 * MAY THIS SESSION RECORD A CLAIM? PURE.
 *
 * 'refresh' — the pending claim is already ours (re-stating the wait is free)
 * 'refuse'  — another live session claimed first; first claim wins while it lives
 * 'write'   — nothing honourable is pending
 *
 * The refusal is what keeps two returning windows from both being told the batch
 * is coming to them. It is not the safety property — the atomic acquire is — but
 * being told the truth up front beats discovering it at a lost race.
 */
export function claimWriteDecision({
  existing,
  sid,
  ancestor = null,
  ownerHolding = false,
  now,
  maxAgeMs = CLAIM_MAX_AGE_MS,
  probePid = null,
  tolerance = PID_START_TOLERANCE_MS,
} = {}) {
  if (!sid) return { action: 'refuse', reason: 'no-session-id', claimantSid: null, ageMs: null }
  const a = assessClaim({ claim: existing, sid, ancestor, ownerHolding, now, maxAgeMs, probePid, tolerance })
  if (a.mine) return { action: 'refresh', reason: 'own-claim', claimantSid: a.claimantSid, ageMs: a.ageMs }
  if (a.honour) {
    return { action: 'refuse', reason: 'claimed-by-other', claimantSid: a.claimantSid, ageMs: a.ageMs }
  }
  return { action: 'write', reason: a.reason, claimantSid: a.claimantSid, ageMs: a.ageMs }
}

/** The one line the guard puts in the boundary log and in its message, and the
 *  CLI prints. A released record says so in words, because it was HONOURED twice
 *  in a row on 30.07.2026 while every line about it looked ordinary. */
export function describeClaim(assessment) {
  if (!assessment || !assessment.claimantSid) return 'no claim'
  const mins = Number.isFinite(assessment.ageMs) ? Math.round(assessment.ageMs / 60000) : null
  const age = mins === null ? '' : ` (claimed ${mins} min ago)`
  const released =
    typeof assessment.releasedAt === 'number'
      ? ', ALREADY released for it — the hand-over happened, this record is spent'
      : ''
  return `session ${assessment.claimantSid}${age} — ${assessment.reason}${released}`
}
