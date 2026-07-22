// SessionEnd hook (Fable-5 audit #11): when a session ends (the user closes the
// VS Code window / the -p run finishes), release the batch lock IF this session
// owned it. Otherwise a closed session's lock looks fresh for up to ~12 min (its
// heartbeat stopped) before the launcher resurrects — and a re-opened window
// reads the stale-but-recent lock as "held by another" and refuses to resume,
// stranding the batch. Releasing frees it instantly for the successor. Never errors.
import { readFileSync } from 'node:fs'
import { releaseLock } from './batch-lock.mjs'

let sid = ''
try {
  sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin */
}
try {
  if (sid) releaseLock(sid) // no-op unless this session owns the lock
} catch {
  /* nothing to release */
}
process.exit(0)
