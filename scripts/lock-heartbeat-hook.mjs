// PostToolUse hook (matcher: every tool). Observe-only duties, each isolated
// and never erroring:
//
// (1) OWNER-ONLY lock heartbeat (hard singleton, 24.07.2026): refresh THIS
//     session's batch lock on every tool call — but ONLY if this session
//     already owns it. It NEVER claims: the old "claim when free/stale" made
//     every tool-using session (a chat window, a stale-lock bystander) grab
//     batch ownership as a side effect — one of the advisory holes behind the
//     e9407cae double-session incident. Acquisition now happens exclusively in
//     the SessionStart hook and the batch-progress-guard, through the atomic
//     acquire in scripts/batch-singleton.mjs.
// (2) Parallel-session presence: stamp this session id's tool activity into
//     .claude/session-activity.json — the active detector's raw signal (a
//     NON-owner top-level session with fresh activity in this repo = a
//     parallel session).
// (3) Stamp .claude/tool-activity.json — the dashboard Stop guard's
//     focus-freshness invariant needs to know that real work happened.
// (4) Detect a dashboard publish: when the Artifact tool is called on the
//     dashboard file, record the published content's sha256 in
//     dashboard-state.json ("published" vs "merely edited", invariant 9).
//     The tool's RESPONSE decides whether it counts — a failed publish records
//     publishFailed and no hash, so the board can never be believed live on the
//     strength of an attempt alone (four-eyes finding 28.07.2026).
// (5) THE BOARD-PUBLISH DUE MARK (point 400, delta A): hash the open-point set
//     after each call and, on a CHANGE, set `publishDue`. It lives HERE rather
//     than in a PostToolUse matcher of its own because .claude/settings.json is
//     a protected path an unattended session cannot edit — and because an
//     `Edit|Write` matcher would miss every TASKS.md change made through Bash
//     (a merge, the archive move). The mark is PERSISTED, so a session that dies
//     between the change and the publish hands it to its successor.
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { heartbeat, noteActivity } from './batch-singleton.mjs'
import { handoverSurvivesCall } from './batch-boundary-core.mjs'
import { classifyPublishResponse, publishStatePatch } from './publish-outcome-core.mjs'
import { openFingerprintOfTasks, publishDuePatch } from './board-currency-core.mjs'
import { repoPath } from './repo-paths.mjs'
import {
  STATE_PATH,
  ACTIVITY_PATH,
  readJson,
  writeJsonAtomic,
  mergeState,
  sha256File,
} from './dashboard-state.mjs'

let data = {}
try {
  data = JSON.parse(readFileSync(0, 'utf8')) || {}
} catch {
  /* no/!JSON stdin */
}
const sid = data.session_id || ''

// (1) owner-only lock heartbeat — never claims for a non-owner.
// A heartbeat normally WITHDRAWS a taken boundary (working is proof the session
// is not finished), but not when the call was part of ENDING the batch — the
// board, the review ledger, the work order's own entry (point 388, live finding
// 2). Same verdict as the PreToolUse gate, from the same pure function, so the
// two can never disagree about one call.
try {
  if (sid) {
    const input = data.tool_input ?? data.toolInput ?? {}
    const keep = handoverSurvivesCall({
      toolName: data.tool_name ?? data.toolName,
      filePath: input.file_path ?? input.notebook_path,
      command: input.command,
    })
    heartbeat(sid, { preserveHandover: keep.survives })
  }
} catch {
  /* no lock dir / unreadable — nothing to do */
}

// (2) per-session presence for the parallel-session detector
try {
  if (sid) noteActivity(sid)
} catch {
  /* best effort */
}

// (3) tool-activity stamp
try {
  writeJsonAtomic(ACTIVITY_PATH, { lastToolAt: Date.now(), sessionId: sid })
} catch {
  /* best effort */
}

// (4) dashboard publish detection
try {
  const name = data.tool_name ?? data.toolName ?? ''
  const input = data.tool_input ?? data.toolInput ?? {}
  const file = typeof input.file_path === 'string' ? input.file_path : ''
  // The mere EXISTENCE of the Artifact tool in this session is a fact the
  // board-first gate needs (delta B): it may only escalate to a hard deny where
  // a publish is actually possible. Recorded on any Artifact call, whatever it
  // targeted — a headless session never records one and is therefore never
  // denied for a transport it does not have.
  if (name === 'Artifact' && sid) mergeState({ artifactToolSeen: { sessionId: sid, at: Date.now() } })
  if (name === 'Artifact' && file && input.action !== 'list') {
    const state = readJson(STATE_PATH) ?? {}
    const dashboardNames = new Set(['hoa-batch-dashboard.html', '.batch-dashboard.html'])
    if (state.dashboardPath) dashboardNames.add(basename(state.dashboardPath))
    if (state.scratchpadPath) dashboardNames.add(basename(state.scratchpadPath))
    if (dashboardNames.has(basename(file))) {
      // The RESPONSE decides, not the call: a refused or conflicted publish used
      // to be recorded as a live board (four-eyes finding 28.07.2026).
      const outcome = classifyPublishResponse(data.tool_response ?? data.toolResponse)
      const patch = publishStatePatch(outcome, {
        hash: sha256File(file),
        path: file,
        at: Date.now(),
      })
      if (patch) mergeState(patch)
    }
  }
} catch {
  /* never fail a tool call over the bookkeeping */
}

// (5) board-publish due mark — the open-point set changed, so the board owes the
// reader an update. Gated on TASKS.md's mtime so the common case (nothing
// changed) costs one stat rather than a parse on every single tool call.
try {
  const tasksPath = repoPath('TASKS.md')
  const mtime = statSync(tasksPath).mtimeMs
  const state = readJson(STATE_PATH) ?? {}
  if (state.tasksSeenMtime !== mtime) {
    const fingerprint = openFingerprintOfTasks(readFileSync(tasksPath, 'utf8'))
    const patch = publishDuePatch({ state, fingerprint, at: Date.now() })
    mergeState({ ...(patch ?? {}), tasksSeenMtime: mtime })
  }
} catch {
  /* no TASKS.md / unwritable state — the watchdog is the backstop */
}
process.exit(0)
