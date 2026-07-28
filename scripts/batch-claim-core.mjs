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
//   1. IT EXPIRES. A claim file left by a window that was closed hours ago must
//      never hand the batch to nobody — past `CLAIM_MAX_AGE_MS` it is ignored,
//      whatever it says.
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

/** How long a claim stays honourable. Wide enough that a session inside a long
 *  tool call still reaches its next Stop hook and sees it; short enough that a
 *  window closed after claiming loses the batch back to the launcher within the
 *  half hour instead of stranding it. Calibratable via HOA_CLAIM_MAX_MIN
 *  (scripts/batch-claim.mjs). */
export const CLAIM_MAX_AGE_MS = 30 * 60 * 1000

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
 *   now, maxAgeMs, probePid, tolerance
 *
 * Returns { honour, mine, reason, ageMs, claimantSid, releasedAt }. `honour` true
 * is the ONLY value that changes anybody's behaviour; every other path leaves the
 * batch exactly as it was.
 */
export function assessClaim({
  claim,
  sid = '',
  ancestor = null,
  ownerSid = '',
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
  if (ageMs > maxAgeMs) return out(false, 'expired', { ...base, ageMs })

  // Ours? By the lock's own identity rules — session id first, the claude process
  // second — so a compaction that mints a new id never orphans a claim this very
  // window wrote, while a genuinely second window still fails it.
  if (resolveOwnership({ lock: claim, sessionId: sid, ancestor, tolerance }).mine) {
    return out(false, 'own-claim', { ...base, ageMs, mine: true })
  }
  if (ownerSid && claim.sessionId === ownerSid) return out(false, 'claimant-is-owner', { ...base, ageMs })

  // LIVENESS BY IDENTITY, never by existence: a claim from a window that has been
  // closed must not move the batch, and a pid the OS handed to somebody else is
  // not the claimant.
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
 * Returns { verdict: 'none' | 'wait' | 'release', reason }.
 */
export function releaseDecision({ assessment, inFlightLive = false, gitOperation = null } = {}) {
  if (!assessment || assessment.honour !== true) {
    return { verdict: 'none', reason: assessment?.reason ?? 'no-claim' }
  }
  if (inFlightLive === true) return { verdict: 'wait', reason: 'work-in-flight' }
  const op = typeof gitOperation === 'string' && gitOperation.trim() ? gitOperation.trim() : null
  if (op) return { verdict: 'wait', reason: `git-${op}` }
  return { verdict: 'release', reason: 'clean' }
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
  now,
  maxAgeMs = CLAIM_MAX_AGE_MS,
  probePid = null,
  tolerance = PID_START_TOLERANCE_MS,
} = {}) {
  if (!sid) return { action: 'refuse', reason: 'no-session-id', claimantSid: null, ageMs: null }
  const a = assessClaim({ claim: existing, sid, ancestor, now, maxAgeMs, probePid, tolerance })
  if (a.mine) return { action: 'refresh', reason: 'own-claim', claimantSid: a.claimantSid, ageMs: a.ageMs }
  if (a.honour) {
    return { action: 'refuse', reason: 'claimed-by-other', claimantSid: a.claimantSid, ageMs: a.ageMs }
  }
  return { action: 'write', reason: a.reason, claimantSid: a.claimantSid, ageMs: a.ageMs }
}

/** The one line the guard puts in the boundary log and in its message, and the
 *  CLI prints. */
export function describeClaim(assessment) {
  if (!assessment || !assessment.claimantSid) return 'no claim'
  const mins = Number.isFinite(assessment.ageMs) ? Math.round(assessment.ageMs / 60000) : null
  const age = mins === null ? '' : ` (claimed ${mins} min ago)`
  const released =
    typeof assessment.releasedAt === 'number' ? ', already released for it' : ''
  return `session ${assessment.claimantSid}${age} — ${assessment.reason}${released}`
}
