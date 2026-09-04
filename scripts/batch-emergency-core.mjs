// THE INDEPENDENT TOTAL-WEDGE DECISION (point 947) — the pure half. It judges
// one hourly timer tick from measured standstill evidence alone: whether the
// batch stands although workable points exist, whether ordinary recovery has
// already been tried against this same standstill, and what the successor
// session must be told. scripts/batch-emergency.mjs does the acting.
export const EMERGENCY_THRESHOLD_MS = 60 * 60 * 1000
export const EMERGENCY_COOLDOWN_MS = 45 * 60 * 1000
// THE ABSOLUTE DEADLINE (point 1048, union entry U5). The threshold above can be
// pushed out by a live verification lease, and that is correct — a lease is
// evidence of real work. What was missing is a bound that NOTHING derived from
// liveness may extend: two hours after the last observable progress the batch
// recovers, lease or no lease, heartbeat or no heartbeat. Two hours is the
// measured two-backend LARGE run (80m48s) plus ordinary variance, so it cannot
// fire on an honest closing run (point 1002).
//
// THE STATED BOUND, which the drill asserts: a soft recovery becomes due at the
// last observable progress + 60 min and the launcher executes it within one
// 15-minute tick (worst case 75 min); a hard recovery fires unconditionally at
// the last observable progress + 120 min. Only a batch pause or a clocked
// operator veto — deliberate human acts, not liveness signals — stand it down.
export const EMERGENCY_HARD_DEADLINE_MS = 2 * EMERGENCY_THRESHOLD_MS
export const VERIFICATION_LEASE_MS = 15 * 60 * 1000
// The measured two-backend LARGE run is 80m48s. Two hours admits that run and
// ordinary variance while bounding renewals from any one run record.
export const VERIFICATION_SUSPENSION_MAX_MS = 2 * EMERGENCY_THRESHOLD_MS
export const BATCH_PROGRESS_KINDS = new Set([
  'first-parent-commit',
  'committed-boundary',
  'delegated-branch-moved',
])

/**
 * THE ONE PROGRESS CLOCK (point 1048, union entry U1). Every decision in this
 * file that speaks of "no progress" reads this and nothing else.
 *
 * The night of 02./03.09.2026 was lost because tool calls, watcher spawns, log
 * mtimes and heartbeats all LOOK like work. Only the three durable kinds above
 * count, and — the repair — an event only advances the clock when its VALUE
 * differs from the last sample of the same kind. A component that re-reports the
 * same commit sha, the same boundary id or the same branch tip every ten minutes
 * therefore reports nothing, however fresh its timestamp is.
 *
 * An event without a `value` is trusted as distinct, because that is how the
 * report was written before this repair and a missing field must not silently
 * erase real progress.
 */
export function latestProgressAt(report = {}) {
  const start = Number(report?.window?.start)
  const end = Number(report?.window?.end)
  let latest = Number.isFinite(start) ? start : null
  // First occurrence of a (kind, value) pair wins: a repeat of an identical
  // observation is the SAME progress seen again, not new progress.
  const seen = new Map()
  for (const event of report?.batchProgress ?? []) {
    if (!BATCH_PROGRESS_KINDS.has(event?.kind) || !Number.isFinite(event?.at) || (Number.isFinite(end) && event.at > end)) continue
    if (event.value !== undefined && event.value !== null) {
      const key = `${event.kind}\u0000${String(event.value)}`
      const first = seen.get(key)
      if (first !== undefined) {
        if (event.at >= first) continue
        seen.set(key, event.at)
      } else {
        seen.set(key, event.at)
      }
    }
    latest = latest === null ? event.at : Math.max(latest, event.at)
  }
  if (seen.size > 0) {
    // Recompute from the deduplicated first-occurrence times plus every
    // value-less event, so a late repeat cannot outrank its own original.
    let best = Number.isFinite(start) ? start : null
    for (const at of seen.values()) best = best === null ? at : Math.max(best, at)
    for (const event of report?.batchProgress ?? []) {
      if (!BATCH_PROGRESS_KINDS.has(event?.kind) || !Number.isFinite(event?.at)) continue
      if (Number.isFinite(end) && event.at > end) continue
      if (event.value !== undefined && event.value !== null) continue
      best = best === null ? event.at : Math.max(best, event.at)
    }
    return best
  }
  return latest
}

/** The idempotency key of one recovery episode (union entry U9). Points 947,
 *  958 and 1048 all reach the same recovery, so they must reach it under ONE
 *  key or a wedge is killed twice and deferred twice. The episode is the
 *  progress boundary it was raised against plus the owner generation being
 *  recovered from; it survives every retry and ends only when the clock above
 *  advances. */
export function recoveryEpisodeKey({ progressAt, ownerGeneration = null } = {}) {
  if (!Number.isFinite(progressAt)) return null
  return `${progressAt}:${ownerGeneration ?? 'unknown'}`
}

export function activeVeto(veto, now = Date.now()) {
  if (!veto || typeof veto !== 'object') return false
  return typeof veto.reason === 'string' && veto.reason.trim().length > 0 &&
    Number.isFinite(veto.until) && veto.until > now
}

/**
 * A named verification run suspends this tick; it does not become batch
 * progress. The IO half measures the adjacent run record, output-log mtime and
 * process identity, while this pure half makes the evidence self-bounding. In
 * particular, a stale progress sample cannot be rescued by an arbitrary future
 * `leaseUntil` value.
 */
export function activeVerificationLease(
  report = {},
  now = Date.now(),
  leaseMs = VERIFICATION_LEASE_MS,
  suspensionMaxMs = VERIFICATION_SUSPENSION_MAX_MS,
  // THE BOUNDARY THE LEASE MAY NOT OUTLIVE (point 1048, union entry U3). Capping
  // the suspension from the LEASE's own start was escapable: a run that ends and
  // is replaced by a fresh one starts a fresh cap, so a sequence of runs could
  // suspend recovery for ever. Capping it from the last observable PROGRESS
  // instead makes the sequence irrelevant — replacement runs inherit the same
  // deadline, because none of them moved the batch.
  progressBoundaryAt = null,
) {
  let active = null
  const windowEnd = Number(report?.window?.end)
  for (const lease of report?.verificationLeases ?? []) {
    const startedAt = Number(lease?.startedAt)
    const progressAt = Number(lease?.progressAt)
    const leaseUntil = Number(lease?.leaseUntil)
    const named = typeof lease?.record === 'string' && lease.record.trim().length > 0 &&
      typeof lease?.command === 'string' && lease.command.trim().length > 0
    if (!named || lease?.status !== 'running' || lease?.processAlive !== true) continue
    if (![startedAt, progressAt, leaseUntil].every(Number.isFinite)) continue
    if (progressAt < startedAt || progressAt > now || (Number.isFinite(windowEnd) && progressAt > windowEnd)) continue
    if (leaseUntil <= now || leaseUntil <= progressAt || leaseUntil - progressAt > leaseMs) continue
    if (now - progressAt >= leaseMs) continue
    const boundaryCap = Number.isFinite(progressBoundaryAt) ? progressBoundaryAt + EMERGENCY_HARD_DEADLINE_MS : Infinity
    const suspensionUntil = Math.min(startedAt + suspensionMaxMs, boundaryCap)
    if (!Number.isFinite(suspensionUntil) || now >= suspensionUntil) continue
    const effectiveUntil = Math.min(leaseUntil, suspensionUntil)
    if (!active || progressAt > active.progressAt) {
      active = { ...lease, startedAt, progressAt, leaseUntil: effectiveUntil, suspensionUntil }
    }
  }
  return active
}

/**
 * Decide one independent timer tick. A first strike is deliberately soft. A
 * hard strike is licensed only by a recorded earlier strike against the SAME
 * last-progress boundary: that is the proof that ordinary recovery ran and did
 * not restore progress.
 */
export function emergencyDecision({
  now = Date.now(), report = {}, workablePoints = [], paused = false, veto = null,
  state = {}, thresholdMs = EMERGENCY_THRESHOLD_MS, cooldownMs = EMERGENCY_COOLDOWN_MS,
} = {}) {
  if (paused) return { action: 'stand-down', reason: 'batch-paused', strike: false }
  if (activeVeto(veto, now)) {
    return { action: 'stand-down', reason: 'clocked-veto', strike: false, vetoUntil: veto.until }
  }
  if (!Array.isArray(workablePoints) || workablePoints.length === 0) {
    return { action: 'stand-down', reason: 'no-workable-points', strike: false }
  }
  const progressAt = latestProgressAt(report)
  if (!Number.isFinite(progressAt)) {
    return { action: 'observe', reason: 'no-bounded-evidence-window', strike: false }
  }
  const stalledMs = Math.max(0, now - progressAt)
  if (stalledMs < thresholdMs) {
    return { action: 'observe', reason: 'progress-within-threshold', strike: false, progressAt, stalledMs }
  }
  // THE DEADLINE NO EVIDENCE MAY EXTEND (union entry U5) — decided BEFORE the
  // lease and the cooldown, because both are exactly what kept the incident's
  // clock from ever running out. Past it the batch recovers hard, whatever any
  // process, log or heartbeat says. Only `paused` and a clocked operator veto,
  // both decided above, still stand it down: those are human decisions, not
  // liveness signals.
  const hardDeadlineMs = thresholdMs * (EMERGENCY_HARD_DEADLINE_MS / EMERGENCY_THRESHOLD_MS)
  if (stalledMs >= hardDeadlineMs) {
    return {
      action: 'hard-recover',
      reason: 'past-absolute-deadline',
      strike: true,
      progressAt,
      stalledMs,
      hardDeadlineAt: progressAt + hardDeadlineMs,
      workablePoints: workablePoints.map(Number),
    }
  }
  const suspensionMaxMs = thresholdMs * (VERIFICATION_SUSPENSION_MAX_MS / EMERGENCY_THRESHOLD_MS)
  const verificationLease = activeVerificationLease(report, now, VERIFICATION_LEASE_MS, suspensionMaxMs, progressAt)
  if (verificationLease) {
    return {
      action: 'stand-down', reason: 'live-verification-lease', strike: false,
      progressAt, stalledMs, verificationLease,
    }
  }
  // THE COOLDOWN BELONGS TO ITS EPISODE (union entry U6). It exists to stop one
  // standstill being struck twice in quick succession — not to shield the NEXT
  // standstill, which is a different wedge against a different progress
  // boundary. Keyed to the boundary, a batch that advanced and then stalled
  // again is struck on its own merits instead of inheriting the last episode's
  // silence.
  const sameEpisode = state?.lastStrikeProgressAt === progressAt
  if (sameEpisode && Number.isFinite(state?.lastStrikeAt) && now - state.lastStrikeAt < cooldownMs) {
    return { action: 'observe', reason: 'strike-cooldown', strike: false, progressAt, stalledMs }
  }
  const recoveryAlreadyFailed = state?.lastStrikeProgressAt === progressAt &&
    Number.isFinite(state?.lastStrikeAt) && state.lastStrikeAt > progressAt
  return {
    action: recoveryAlreadyFailed ? 'hard-recover' : 'soft-recover',
    reason: recoveryAlreadyFailed ? 'batch-still-stalled-after-recorded-recovery' : 'batch-stalled-past-threshold',
    strike: true,
    progressAt,
    stalledMs,
    hardDeadlineAt: progressAt + hardDeadlineMs,
    workablePoints: workablePoints.map(Number),
  }
}

export function strikeRecord({ id, decision, at = Date.now(), phase = 'intent', outcomes = [], episode = null } = {}) {
  return {
    v: 1,
    id,
    at,
    atIso: new Date(at).toISOString(),
    phase,
    // The one key points 947, 958 and 1048 all reach recovery under (union
    // entry U9), carried on the record so a retry can recognise its own attempt
    // instead of opening a second one.
    episode,
    action: decision.action,
    reason: decision.reason,
    progressAt: decision.progressAt,
    stalledMs: decision.stalledMs,
    // Carried so the record itself says WHEN this episode's recovery stops being
    // negotiable (union entry U5) — the morning reader gets the deadline, not
    // only the elapsed time.
    hardDeadlineAt: decision.hardDeadlineAt ?? null,
    workablePoints: decision.workablePoints,
    outcomes,
    veto: 'node scripts/batch-emergency.mjs --veto "<reason>" --until <ISO>',
  }
}

/** The successor-facing half of deferral. The emergency intent exists before
 * autostart runs, so the fresh session can skip a point that already survived a
 * soft recovery instead of reopening the same queue head forever. */
export function emergencyHandoffPrompt(state = {}) {
  const intent = state?.pending
  if (intent?.phase !== 'intent' || intent?.action !== 'hard-recover') return ''
  const points = (intent.workablePoints ?? []).map(Number).filter((point) => Number.isInteger(point) && point > 0)
  if (!points.length) return ''
  const [stuck, next] = points
  if (!next) {
    return `\n\nEMERGENCY RECOVERY: point ${stuck} made no progress after the recorded soft recovery and no other workable point exists. Diagnose and repair it; do not silently wait.`
  }
  return (
    `\n\nEMERGENCY RECOVERY: point ${stuck} made no progress after the recorded soft recovery. ` +
    `Defer it in favour of workable point ${next}: first record the visible queue exception with ` +
    `\`node scripts/commission-guard.mjs --override ${next} --reason "emergency deferral: point ${stuck} remained stalled after soft recovery"\`, ` +
    `then work point ${next}. Leave point ${stuck} for a later diagnosed retry; do not reopen it in this recovery session.`
  )
}
