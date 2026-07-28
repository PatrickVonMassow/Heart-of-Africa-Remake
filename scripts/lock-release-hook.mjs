// SessionEnd hook: when a session ends (the user closes the VS Code window /
// the -p run finishes), release the batch lock IF this session owned it — a
// closed owner's lock would otherwise look alive until its pid check fails,
// delaying the successor. Also clears this session's entry from the
// parallel-session activity map so a cleanly ended session can never be
// flagged as a live parallel session. Never errors.
import { readFileSync } from 'node:fs'
import { release, clearActivity, clearOwnBoundary } from './batch-singleton.mjs'

let sid = ''
try {
  sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin */
}
try {
  if (sid) {
    release(sid) // no-op unless this session owns the lock
    clearActivity(sid)
    // The boundary marker now survives the stop it authorised (point 388, live
    // finding 2), so the session's own end is what retires it — a successor must
    // never meet a marker naming a point it did not close.
    clearOwnBoundary(sid)
  }
} catch {
  /* nothing to release */
}
process.exit(0)
