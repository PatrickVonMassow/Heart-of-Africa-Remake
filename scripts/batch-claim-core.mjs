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
import { resolveOwnership, PID_START_TOLERANCE_MS, LAUNCHER_TICK_MS } from './batch-singleton.mjs'

/** THE PICK-UP WINDOW, counted in LAUNCHER TICKS (point 446). The half of the
 *  handshake that lies with the other side is the pick-up, and the acquirer that
 *  can steal it is the launcher — so the window is expressed in the unit that
 *  measures that risk: how many ticks may pass before the launcher is allowed to
 *  take a freed lock for itself. Two is the smallest count that survives a tick
 *  falling immediately after the release, and a slower launcher lengthens the
 *  window with itself rather than losing it. */
export const PICKUP_WINDOW_TICKS = 2

/**
 * THE TAKE-UP WINDOW: how long a claim stays honourable once there is nobody
 * left to wait for — the lock free (or its owner gone) and the claim not yet
 * taken. Past it the ordinary handover applies again, so a claim can never leave
 * the batch ownerless. The same window bounds the reservation a RELEASED claim
 * holds on the freed lock (point 461), counted from the RELEASE — the moment
 * there is nobody left to wait for — so a window left open but never taking what
 * it asked for cannot hold the batch either. `HANDOVER_GRACE_MS` is deliberately
 * NOT reused for it: that one means the pid-alive handover before a successor
 * takeover, and overloading it would couple two calibrations.
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
 * IT IS TWO LAUNCHER TICKS (point 446, 30.07.2026). The number was a flat half
 * hour that happened to equal them; the incident it is measured against is a
 * launcher tick landing in the gap between a release and the claiming window's
 * next command, so the window is now DERIVED from the tick — a launcher slowed
 * down must not silently shrink the pick-up window to less than one tick.
 *
 * Calibratable via HOA_CLAIM_MAX_MIN (scripts/batch-claim.mjs).
 */
export const CLAIM_MAX_AGE_MS = PICKUP_WINDOW_TICKS * LAUNCHER_TICK_MS

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

/**
 * IS THERE ANYBODY TO WAIT FOR — the input `assessClaim` suspends its clock on.
 * PURE, so both readers derive it the same way and cannot drift apart.
 *
 * IT IS NOT LOCK EXISTENCE (four-eyes review, Fable 5, 30.07.2026, finding 1).
 * Derived as `!!lock?.sessionId` it also matched the LAUNCHER's `pending-spawn`
 * placeholder, whose session id is a `launcher-<uuid>` and whose process is a
 * `claude -p` still booting. That produced a loop out of the crash path: the
 * launcher reads the claim with no owner (`ownerHolding` false), finds it
 * expired, reaps the dead owner and spawns — and the successor's resume hook
 * then read `ownerHolding` off the launcher's OWN pending lock, honoured the
 * claim with no aging, stood down without converting the pending spawn, and the
 * next tick spawned again. Two readers disagreeing about one state is the
 * disease this point was written for, so the predicate demands what the words
 * mean: a LIVE SESSION owner, and never the claimant itself.
 *
 * `alive` is the caller's `assessOwner(...).alive` — the lock's own liveness
 * rule, not a second one invented here.
 */
export function ownerIsHolding({ lock = null, claimantSid = '', alive = false } = {}) {
  if (!lock || typeof lock.sessionId !== 'string' || !lock.sessionId) return false
  if (lock.kind === 'pending-spawn') return false
  if (claimantSid && lock.sessionId === claimantSid) return false
  return alive === true
}

/** What the git probe answers when it could not find OUT (a timeout under load, a
 *  git that would not run) — as opposed to `null`, which means it looked and found
 *  nothing half-done. The two must not collapse into one value: "I could not look"
 *  read as "all clear" releases the batch mid-merge, and that is the one outcome
 *  this whole family exists to prevent. `releaseDecision` maps it to `wait`, and
 *  the bound that keeps a too-timid verdict from stranding anything is the
 *  claimant's own lifetime — the wall clock only for an errand claim carrying an
 *  issuer (`claimIsBounded`). Lives here, not in the IO half, so the pure decision function owns
 *  the value it interprets. */
export const GIT_STATE_UNVERIFIABLE = 'unverifiable'

/**
 * IS THE CLAIMANT STILL THE PROCESS IT SAYS IT IS? PURE — the probe is injected.
 *
 * LIVENESS BY IDENTITY, never by existence: a claim from a window that has been
 * closed must not move the batch, and a pid the OS handed to somebody else is a
 * stranger. Shared by the two branches that need it — the honour path and the
 * reservation a RELEASED claim holds (point 461) — so a reservation can never
 * outlive a claimant the honour path would already have read as gone, which is
 * the one way a reservation could stall the batch.
 *
 * Returns { alive, reason }; `reason` names the failing half and is what
 * `assessClaim` reports.
 */
export function claimantLiveness({ claim, probePid = null, tolerance = PID_START_TOLERANCE_MS } = {}) {
  const pid = Number(claim?.pid)
  if (!Number.isInteger(pid) || pid <= 0) return { alive: false, reason: 'claimant-unidentified' }
  const probe = probePid ? probePid(pid) : null
  if (!probe || probe.exists !== true) return { alive: false, reason: 'claimant-dead' }
  if (typeof claim.pidStartedAt !== 'number') return { alive: false, reason: 'claimant-no-start-time' }
  if (typeof probe.startedAt !== 'number') return { alive: false, reason: 'claimant-start-time-unverifiable' }
  if (Math.abs(probe.startedAt - claim.pidStartedAt) > tolerance) {
    return { alive: false, reason: 'claimant-pid-reused' }
  }
  return { alive: true, reason: 'alive' }
}

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
 * Returns { honour, reserve, mine, reason, ageMs, claimantSid, releasedAt }.
 * `honour` true is the ONLY value that releases anything; `reserve` true holds a
 * FREE lock and moves nothing. Every other path leaves the batch exactly as it was.
 *
 * A RELEASED CLAIM IS NEVER HONOURED AGAIN, BUT IT STILL HOLDS THE DOOR
 * (point 434 (6c) + point 461, both measured 30.07.2026). Two incidents, one
 * record:
 *   - 10:10-10:16 — a record with `releasedAt` AND `releasedBy` set was still
 *     HONOURED. The owner released to it, the claiming window never took it, and
 *     the batch ran for an hour with NO lock while every guard behaved as though
 *     it were owned; the boundary that followed released to the same dead claim a
 *     second time (`.claude/boundary.log`: two RELEASED lines, no HANDOVER). So a
 *     released record is never honourable again — nothing releases to it twice.
 *   - 17:10-17:16 — reading it as plain ABSENT made it reserve nothing, so the
 *     RELEASING session re-acquired the lock it had just freed at its own next
 *     turn end (`acquiredAt` 17:11), and the user's window had to WIN A RACE
 *     against automated acquirers — which is exactly the window that is answering
 *     the user rather than polling. It lost by six minutes.
 * The resolution keeps both: unhonourable AND reserving. While its claimant is
 * PROVABLY alive — the same pid + start-time identity probe the honour path runs,
 * never a deadline — no OTHER window may take the freed lock (`reservationDecision`),
 * and the claimant's own path is untouched because the own-claim branch is asked
 * BEFORE this one. A dead or closed claimant frees the lock INSTANTLY, so the
 * batch can never idle out a reservation, and the take-up window (`maxAgeMs`,
 * counted from the RELEASE — that is the moment there is nobody left to wait for)
 * caps a window that stays open but never takes what it asked for. An ERRAND claim
 * (`claimIsBounded`) reserves nothing here: its pid names its ISSUER, not its
 * taker, so it proves nothing about anybody waiting. A new claim may still be
 * written straight over a released record.
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
    reserve: false,
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

  // ALREADY HANDED OVER → never honourable again, for everybody but its own
  // writer (see above). It still RESERVES the free lock while its claimant is
  // provably alive (point 461): the same identity probe, no second notion of
  // liveness, and no deadline anybody has to feed.
  if (base.releasedAt !== null || (typeof claim.releasedBy === 'string' && claim.releasedBy.trim() !== '')) {
    // An ERRAND claim's pid names its ISSUER rather than its taker, so it proves
    // nobody is waiting. Asked first: it needs no probe at all.
    if (claimIsBounded(claim)) return out(false, 'released', { ...base, ageMs })
    // THE TAKE-UP WINDOW, counted from the RELEASE: that is the moment there is
    // nobody left to wait for, and counting from `claim.at` instead would expire
    // every reservation a long-held batch produces before it ever began. Without a
    // usable stamp — `releasedBy` alone, or a stamp from the future, which is a
    // clock nobody here can reason about — there is no window to measure, and the
    // reading that cannot strand the batch is the one that reserves nothing.
    // Checked BEFORE the probe: a long-expired record then costs no OS call
    // (four-eyes review, Fable 5, 30.07.2026, finding 4).
    const sinceRelease = base.releasedAt === null ? null : now - base.releasedAt
    if (sinceRelease === null || !(sinceRelease >= 0) || sinceRelease > maxAgeMs) {
      return out(false, 'released', { ...base, ageMs })
    }
    // A dead or closed claimant frees the lock INSTANTLY — the probe decides, so
    // a reservation can never idle the batch out.
    if (!claimantLiveness({ claim, probePid, tolerance }).alive) return out(false, 'released', { ...base, ageMs })
    return out(false, 'released-reserved', { ...base, ageMs, reserve: true })
  }

  // LIVENESS BY IDENTITY — the bound that replaced the flat expiry.
  const live = claimantLiveness({ claim, probePid, tolerance })
  if (!live.alive) return out(false, live.reason, { ...base, ageMs })

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
 * ends with the claimant's own process, so nothing is stranded.
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
 * TWO STATES RESERVE, and the second one is point 461. `honour` is the pending
 * claim nobody has released to yet; `reserve` is the claim that HAS been released
 * to and whose claimant is still alive — the gap the incident of 17:10 fell
 * through, when the releasing session itself re-acquired the lock it had just
 * freed. Neither is the claimant's own claim: `assessClaim` answers `mine` (never
 * `honour`, never `reserve`) for that, so the window the batch is waiting for
 * still acquires — which is the whole point of freeing it.
 *
 * Returns { acquire, reason, claimantSid }.
 */
export function reservationDecision({ assessment } = {}) {
  const a = assessment ?? null
  if (a && a.honour === true) {
    return { acquire: false, reason: 'reserved', claimantSid: a.claimantSid ?? null }
  }
  if (a && a.reserve === true) {
    return { acquire: false, reason: 'reserved-released', claimantSid: a.claimantSid ?? null }
  }
  return { acquire: true, reason: a?.mine === true ? 'own-claim' : (a?.reason ?? 'no-claim'), claimantSid: a?.claimantSid ?? null }
}

/**
 * MAY THE LAUNCHER TAKE A FREE LOCK FOR ITSELF RIGHT NOW? PURE — the probe is
 * injected, the claim is passed in, nothing here reads a file.
 *
 * THE SECOND HALF OF A HANDSHAKE LIES WITH THE OTHER SIDE (point 446, measured
 * 30.07.2026). The takeover is two steps: a window claims the batch, the owner
 * releases at its next clean turn end, and the window PICKS IT UP. On 30.07.2026
 * the release landed at 10:16 into a session the Claude outage had just killed,
 * and twenty minutes later the launcher took the free lock for itself — correct
 * by its rules and against the user's intent. Point 434 had made the claim
 * non-lapsing BEFORE the release; afterwards it was spent and the first to grab
 * won, and the launcher is by far the most reliable grabber: it ticks whether
 * anybody is at a keyboard or not.
 *
 * So the launcher asks ONE question, and it is this one. The verdicts are the
 * claim vocabulary the other doors already share (`assessClaim` →
 * `reservationDecision`) — no second reading of liveness, no second calendar:
 *   spawn=false 'reserved'          — a claim nobody has released to yet stands
 *   spawn=false 'reserved-released' — the release HAPPENED and the claimant's
 *                                     window is provably alive: the free lock is
 *                                     held for its pick-up, for the window of
 *                                     `PICKUP_WINDOW_TICKS` ticks counted from
 *                                     the release
 *   spawn=true  everything else     — no claim, a dead or closed claimant, a
 *                                     recycled pid, an elapsed window, a
 *                                     malformed record or a clock nobody can
 *                                     reason about
 * The batch can therefore never end up ownerless: every way for the window to
 * fail its half — the process is gone, the pick-up never comes — ends in a
 * spawn, and an unclaimed free lock is taken at once, exactly as before.
 *
 * `message` is the line the launcher LOGS, built here so the reason a tick did
 * not spawn is provable in the fast layer rather than read out of a log by hand.
 * It is null whenever the launcher may proceed.
 *
 * Returns { spawn, reason, claimantSid, ageMs, message }.
 */
export function takeoverDecision({
  claim = null,
  now,
  maxAgeMs = CLAIM_MAX_AGE_MS,
  probePid = null,
  tolerance = PID_START_TOLERANCE_MS,
} = {}) {
  const assessment = claim ? assessClaim({ claim, now, maxAgeMs, probePid, tolerance }) : null
  const { acquire, reason, claimantSid } = reservationDecision({ assessment })
  const ageMs = Number.isFinite(assessment?.ageMs) ? assessment.ageMs : null
  if (acquire) return { spawn: true, reason, claimantSid, ageMs, message: null }

  const minutes = (ms) => (Number.isFinite(ms) ? `${Math.max(0, Math.round(ms / 60000))} min` : null)
  const claimedAgo = minutes(ageMs)
  const windowMin = minutes(maxAgeMs) ?? `${PICKUP_WINDOW_TICKS} ticks`
  const releasedAgo = minutes(
    Number.isFinite(assessment?.releasedAt) && Number.isFinite(now) ? now - assessment.releasedAt : NaN,
  )
  const message =
    reason === 'reserved-released'
      ? `skip: the batch was already RELEASED to session ${claimantSid}` +
        `${releasedAgo === null ? '' : ` ${releasedAgo} ago`} and that window is ALIVE — the free lock is held ` +
        `for its PICK-UP (window: ${windowMin} = ${PICKUP_WINDOW_TICKS} launcher ticks). ` +
        'Taking it here would be the 30.07.2026 handover the user lost.'
      : `skip: session ${claimantSid} has CLAIMED the batch` +
        `${claimedAgo === null ? '' : ` ${claimedAgo} ago`} (${reason}) — the user is working in that window`
  return { spawn: false, reason, claimantSid, ageMs, message }
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
 *  in a row on 30.07.2026 while every line about it looked ordinary — and it says
 *  whether the freed lock is still RESERVED for that window (point 461), because
 *  "spent" alone read as "up for grabs" and the batch was taken back. */
export function describeClaim(assessment) {
  if (!assessment || !assessment.claimantSid) return 'no claim'
  const mins = Number.isFinite(assessment.ageMs) ? Math.round(assessment.ageMs / 60000) : null
  const age = mins === null ? '' : ` (claimed ${mins} min ago)`
  const released =
    assessment.reserve === true
      ? ', ALREADY released for it — the hand-over happened, so this record can never be honoured again, but the ' +
        'free lock stays RESERVED for that window while it lives and until the take-up window runs out'
      : typeof assessment.releasedAt === 'number'
        ? ', ALREADY released for it — the hand-over happened, this record is spent'
        : ''
  return `session ${assessment.claimantSid}${age} — ${assessment.reason}${released}`
}
