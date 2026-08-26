import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'

export const EMERGENCY_THRESHOLD_MS = 60 * 60 * 1000
export const EMERGENCY_COOLDOWN_MS = 45 * 60 * 1000

export const ADVANCING_CLASSES = new Set([
  ACTIVITY_CLASSES.FOREGROUND,
  ACTIVITY_CLASSES.DELEGATED,
  ACTIVITY_CLASSES.VERIFICATION,
  ACTIVITY_CLASSES.CI_WAIT,
  ACTIVITY_CLASSES.HANDOVER,
])

export function latestProgressAt(report = {}) {
  const start = Number(report?.window?.start)
  let latest = Number.isFinite(start) ? start : null
  for (const interval of report?.timeline ?? []) {
    if (ADVANCING_CLASSES.has(interval?.className) && Number.isFinite(interval?.end)) {
      latest = latest === null ? interval.end : Math.max(latest, interval.end)
    }
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
