// Pure scope shared by Stop guards that impose WORK rather than merely inspect
// the step being closed. This module deliberately has no imports: command-line
// fixtures can carry a decision core without pulling in the boundary's I/O
// dependency graph.

export const BOUNDARY_WITHDRAW_COMMAND = 'node scripts/batch-boundary.mjs --clear'

/**
 * Scope one mandatory duty. `owed` is the guard's ordinary condition; a closed
 * fence changes only WHO owes it, never whether the underlying debt exists.
 */
export function scopeMandatoryDuty({ owed, fence, guardId, sessionId, duty } = {}) {
  if (!owed) return { owed: false, deferred: false, message: '' }
  const who = String(sessionId ?? '').trim() || 'the current batch owner'
  if (!fence?.closed) {
    return {
      owed: true,
      deferred: false,
      message: `${duty} This duty is owed by session ${who}.`,
    }
  }
  return {
    owed: false,
    deferred: true,
    message:
      `${guardId}: the context boundary is COMMITTED, so ${duty} is deferred to ${fence.successor ?? 'the successor session'}'s ` +
      `first turn and does not block this exit. To make this session responsible again, withdraw the boundary with ` +
      `\`${BOUNDARY_WITHDRAW_COMMAND}\`.`,
  }
}
