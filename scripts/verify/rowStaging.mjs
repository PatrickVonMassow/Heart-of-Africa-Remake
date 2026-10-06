// When the villager-dress suite stands a row again (polish-villagers.mjs,
// `stageClear`). The staging search probes 16 bearings at three distances for
// a clear view of every figure; a passer-by (a task walker, a playing child)
// standing a metre from the camera crosses nearly every sight line, so no
// bearing is clear until it moves on. Such a staging is waited out and stood
// again, like a row a walker hides after it is drawn — within a bound, so a
// village whose view never clears ends in the strict check, not a hang.

/** Attempts at most, frames waited before a re-stage, and a wall-clock cap. */
export const ROW_STAGING = { attempts: 8, waitFrames: 90, maxMs: 90_000 }

/**
 * Why the row must be stood again, or null when it stands: 'hidden' — a
 * passer-by stands between the camera and the drawn row; 'blocked' — no
 * bearing gave every probe a clear line; null as well once the attempts or
 * the time are spent.
 */
export function restageReason(at, hidden, attempt, elapsedMs, bound = ROW_STAGING) {
  if (attempt + 1 >= bound.attempts || elapsedMs >= bound.maxMs) return null
  if (hidden) return 'hidden'
  if (!at || at.score !== at.of) return 'blocked'
  return null
}
