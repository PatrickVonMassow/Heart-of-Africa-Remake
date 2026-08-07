// Pure decision core of the waiting-time prep guard (user mandate 21.07.2026;
// extracted 07.08.2026 for point 437 E).
//
// THE RULE: while a long background validation is in flight, yielding the turn
// to a pure idle wait WITHOUT read-only prep for the next ticket is blocked.
// The reminder alone kept failing, which is the user's own stated reason.
//
// The logic was inline in the wrapper until the preflight had to predict it —
// and a guard whose decision lives in its wrapper cannot be predicted, tested or
// reviewed. It is small, which is exactly why the wrapper kept it; small is not
// a reason for an enforcer's decision to be untestable.
//
// Side-effect free. Pinned by prep-guard-core.test.mjs.

/**
 * Should the turn end be blocked?
 *
 * Inputs (plain data — the wrapper reads the marker file):
 *   marker   the parsed `.claude/wait-prep.json`, or null when none is armed
 *
 * Returns { block, reason }. Total: anything unreadable answers ALLOW — a guard
 * that blocks on its own blindness trains the reader to route around it.
 */
export function evaluatePrep({ marker = null } = {}) {
  if (!marker || typeof marker !== 'object') return { block: false, reason: '' }
  if (marker.prepped) return { block: false, reason: '' } // prep already recorded for this wait
  const task = String(marker.task ?? 'a background validation')
  return {
    block: true,
    reason:
      `WAITING-TIME PREP REQUIRED. A background task ("${task}") is in flight and you are about ` +
      `to yield without having done prep. Standing rule (enforced, not reminded): use the wait to ` +
      `do READ-ONLY prep for the NEXT queue ticket — investigate the relevant code, sharpen the ` +
      `plan/estimate, update the dashboard queue card. Then record it: node scripts/prep-guard.mjs ` +
      `--prepped (or --clear once you have consumed the task result). If there is genuinely nothing ` +
      `to prep, run --prepped to acknowledge.`,
  }
}
