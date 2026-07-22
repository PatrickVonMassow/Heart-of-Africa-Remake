// PostToolUse hook: keep THIS session's batch lock fresh on every tool call, so a
// live working session never ages past the launcher's 12-min window (the
// batch-progress-guard only refreshes at turn-end; a long turn is the norm under
// the anti-idle guard). Ownership-aware (Fable-5 audit #4): it refreshes/claims
// the lock only when it is free, stale, or already THIS session's — it NEVER keeps
// a different, still-live session's lock warm. Never errors.
import { readFileSync } from 'node:fs'
import { lockStatus, claimLock } from './batch-lock.mjs'

let sid = ''
try {
  sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin */
}
try {
  if (sid && lockStatus(sid, Date.now()) !== 'held') claimLock(sid, Date.now())
} catch {
  /* no lock dir / unreadable — nothing to do */
}
process.exit(0)
