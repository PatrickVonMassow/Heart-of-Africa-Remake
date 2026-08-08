// THE OWNER'S CORROBORATION, GATHERED ONCE FOR EVERY DOOR (four-eyes review of
// point 556, confirmed finding 2).
//
// Point 556 taught the LAUNCHER not to dispossess an owner whose pid is alive and
// whose declared work is still producing. It did not teach anybody else, and that
// asymmetry is its own incident: in exactly the state the launcher protects, an
// inbound chat message (`chat-watcher`), a newly opened window
// (`batch-resume-hook`) or a non-owner's Stop guard (`batch-progress-guard`) still
// read that owner as dead and took the batch off it — two sessions on one
// repository, one layer out from where the fix was applied.
//
// The fix is not a second rule but ONE gatherer every door calls, so the
// corroborated reading is the reading, everywhere. It lives in its own module
// because of the dependency direction: `assessOwnerWork` and the probes sit in
// batch-in-flight{,-core}.mjs, which already import batch-singleton.mjs, so
// batch-singleton cannot import them back. `acquire` therefore takes the verdict
// as DATA (`opts.work`) and this module is what fills it in.
//
// CHEAP BY CONSTRUCTION. The probes run git, and three of the four callers are on
// a hook path — so nothing is gathered unless the lock is actually in a state
// where corroboration could change the answer: an expired lease, or the stretch a
// declared wait bought. In every other case the arithmetic decides alone, exactly
// as before, and this returns null for one file read.
import { readDeclaration, refTipAt, worktreeActiveAt, mtimeOf } from './batch-in-flight.mjs'
import { assessOwnerWork, LAUNCHER_WORK_MAX_AGE_MS } from './batch-in-flight-core.mjs'
import { probePid } from './batch-singleton.mjs'
import { leaseExpired, inDeclaredWaitWindow, LEASE_MS } from './batch-lease-core.mjs'

/**
 * IS THIS LOCK IN A STATE WHERE CORROBORATION MATTERS? PURE.
 *
 * Only two: the lease has run out, or we are inside the stretch a declared wait
 * bought beyond an ordinary window. Anywhere else `assessOwner` never reaches the
 * branch that reads `work`, so gathering would be pure cost.
 */
export function corroborationNeeded(lock, { now = Date.now(), leaseMs = LEASE_MS } = {}) {
  if (!lock || typeof lock !== 'object') return false
  return leaseExpired(lock, { now, leaseMs }) || inDeclaredWaitWindow(lock, { now, leaseMs })
}

/**
 * The owner's declared work as `assessOwner` wants it, or null when nothing needs
 * asking. NEVER THROWS — a corroboration we cannot gather must not break a hook,
 * and null reads exactly as the pre-556 behaviour did.
 */
export function gatherOwnerWork(lock, { now = Date.now(), leaseMs = LEASE_MS, maxAgeMs = LAUNCHER_WORK_MAX_AGE_MS } = {}) {
  try {
    if (!corroborationNeeded(lock, { now, leaseMs })) return null
    return assessOwnerWork({
      declaration: readDeclaration(),
      lock,
      now,
      maxAgeMs,
      probePid,
      refTipAt,
      worktreeActiveAt,
      mtimeOf,
    })
  } catch {
    return null
  }
}
