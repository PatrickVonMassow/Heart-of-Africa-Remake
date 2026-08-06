// UserPromptSubmit hook (user mandate 16.07.2026, after repeated dashboard
// staleness): inject the standing dashboard obligation into the context on
// EVERY user prompt, so no turn can end with a stale board. Stdout becomes
// context for the assistant.
//
// Since 22.07.2026 (the now-card still said point 200 while the work had
// pivoted to point 210 after a user question) this hook also ARMS the pivot
// check: it writes .claude/focus-check-pending.json, and the dashboard Stop
// guard BLOCKS the turn from ending until the assistant explicitly confirms or
// re-declares its focus (scripts/focus.mjs) — enforcement, not a reminder.
import fs from 'node:fs'
import { PENDING_PATH, STATE_PATH, boardFilePath, readJson, writeJsonAtomic, mergeState } from './dashboard-state.mjs'
import { heldByOtherLiveOwner, withdrawHandover } from './batch-singleton.mjs'
// The injected board obligation, in a pure module so its size is measurable and
// its content testable (point 436).
import { promptInjectionText } from './dashboard-reminder-core.mjs'

// Hard singleton (24.07.2026): a session that does not own the live batch lock
// has NO dashboard/focus duty — arming the pivot check or issuing the board
// obligations would conscript it into batch work. Since point 440 it is told
// that and nothing else; the chat-timestamp rule reaches every session through
// the user-scope hook and timestamp-guard, not through this one.
let standDown = false
let sid = ''
try {
  sid = JSON.parse(fs.readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin */
}
try {
  standDown = heldByOtherLiveOwner(sid)
} catch {
  standDown = false
}
// A user prompt is the earliest possible proof that a session which took a point
// boundary is alive and about to work again — earlier than any tool call, and it
// arrives even for a turn that never calls one (point 388, four-eyes finding 4).
// Withdrawing the handover here keeps the launcher from spawning a successor
// beside it. Owner-guarded, so it is a no-op once the successor holds the lock.
try {
  withdrawHandover(sid, { trigger: "the user's own prompt (UserPromptSubmit)" })
} catch {
  /* best effort */
}

// Arm the pivot check for THIS session (fail-soft: the reminder text below is
// still the payload if any of this goes wrong).
try {
  if (!standDown) {
    writeJsonAtomic(PENDING_PATH, { sessionId: sid, at: Date.now() })
    // Stamp the turn boundary the BOARD-FIRST PreToolUse gate measures against
    // (board-first-core.mjs): a focus stamp older than this means the board does
    // not yet describe the work about to start. No stamp at all leaves the gate
    // inactive, so this hook is what arms it.
    mergeState({ turnStartedAt: Date.now() })
  }
  // The SAME boundary, but keyed per session and stamped in EVERY state —
  // stand-down included. `turnStartedAt` above is shared by all sessions and
  // written only by the owner, which is correct for the board-first gate (it
  // judges the owner alone) and wrong for any check that must bind a session
  // standing down: that session would measure its turn against a stranger's
  // clock. Its own key cannot be read by mistake, and board-first keeps
  // reading the field it always read.
  mergeState({ turnStartedAtBySession: { ...((readJson(STATE_PATH) ?? {}).turnStartedAtBySession ?? {}), [sid]: Date.now() } })
} catch {
  // best effort
}

// The chat-timestamp rule is NOT stated here (point 440). It used to be stated
// twice — a tagged obligation line and a shouting banner, 497 of
// this hook's 1771 characters — while `timestamp-guard` already BLOCKS the turn
// end on a reply that lacks the stamp and hands the exact line to paste, and the
// user-scope hook scripts/hooks/berlin-timestamp.cjs delivers the current time
// on the same prompt. Worse, both blocks formatted the stamp in the SHORT German
// form ("06.08.26, 21:00"), which is exactly what the guard's TIMESTAMP_RE
// rejects. See PROMPT_ENFORCED_CLAIMS.

if (standDown) {
  console.log(
    '[batch-singleton] Eine ANDERE Session hält den Batch-Lock (lebendig geprüft). STAND DOWN: ' +
      'Diese Session ist NICHT der Batch-Worker — keine Batch-Arbeit, kein Merge nach main, ' +
      'kein TASKS.md-/Dashboard-Edit. Beantworte die Nutzer-Nachricht normal.',
  )
} else {
// The age of the CANONICAL board file (point 435). It used to stat the
// scratchpad copy of the retired mirror, which most sessions never write — so
// the note was silent where it mattered and measured the wrong file where it
// was not.
let mtimeNote = ''
try {
  const board = boardFilePath()
  if (fs.existsSync(board)) {
    const age = Math.round((Date.now() - fs.statSync(board).mtimeMs) / 60000)
    mtimeNote = ` Letzte Dashboard-Dateiänderung vor ~${age} min.`
  }
} catch {
  // best effort — the reminder itself is the payload
}
// The armed focus reconcile is no longer ANNOUNCED here (point 440): the marker
// written above is what binds, and dashboard-guard-core case (7) refuses the turn
// end while it stands — naming `focus.mjs confirm`, `focus.mjs set`, the now-card
// update, the republish and `--synced` in its own block text, which is read
// exactly when it is needed instead of on every prompt.
process.stdout.write(promptInjectionText(mtimeNote))
}
