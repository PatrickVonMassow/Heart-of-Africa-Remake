// THE INDEPENDENT TOTAL-WEDGE DECISION (point 947) — the pure half. It judges
// one hourly timer tick from measured standstill evidence alone: whether the
// batch stands although workable points exist, whether ordinary recovery has
// already been tried against this same standstill, and what the successor
// session must be told. scripts/batch-emergency.mjs does the acting.
export const EMERGENCY_THRESHOLD_MS = 60 * 60 * 1000
export const EMERGENCY_COOLDOWN_MS = 45 * 60 * 1000
export const BATCH_PROGRESS_KINDS = new Set([
  'first-parent-commit',
  'committed-boundary',
  'delegated-branch-moved',
])

export function latestProgressAt(report = {}) {
  const start = Number(report?.window?.start)
  const end = Number(report?.window?.end)
  let latest = Number.isFinite(start) ? start : null
  for (const event of report?.batchProgress ?? []) {
    if (!BATCH_PROGRESS_KINDS.has(event?.kind) || !Number.isFinite(event?.at) || (Number.isFinite(end) && event.at > end)) continue
    latest = latest === null ? event.at : Math.max(latest, event.at)
  }
  return latest
}

export function activeVeto(veto, now = Date.now()) {
  if (!veto || typeof veto !== 'object') return false
  return typeof veto.reason === 'string' && veto.reason.trim().length > 0 &&
    Number.isFinite(veto.until) && veto.until > now
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
  if (Number.isFinite(state?.lastStrikeAt) && now - state.lastStrikeAt < cooldownMs) {
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
    workablePoints: workablePoints.map(Number),
  }
}

export function strikeRecord({ id, decision, at = Date.now(), phase = 'intent', outcomes = [] } = {}) {
  return {
    v: 1,
    id,
    at,
    atIso: new Date(at).toISOString(),
    phase,
    action: decision.action,
    reason: decision.reason,
    progressAt: decision.progressAt,
    stalledMs: decision.stalledMs,
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
