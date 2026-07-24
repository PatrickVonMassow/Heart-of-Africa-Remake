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
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { heartbeat, noteActivity } from './batch-singleton.mjs'
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

// (1) owner-only lock heartbeat — never claims for a non-owner
try {
  if (sid) heartbeat(sid)
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
  if (name === 'Artifact' && file && input.action !== 'list') {
    const state = readJson(STATE_PATH) ?? {}
    const dashboardNames = new Set(['hoa-batch-dashboard.html', '.batch-dashboard.html'])
    if (state.dashboardPath) dashboardNames.add(basename(state.dashboardPath))
    if (state.scratchpadPath) dashboardNames.add(basename(state.scratchpadPath))
    if (dashboardNames.has(basename(file))) {
      const hash = sha256File(file)
      if (hash) {
        mergeState({
          publishedHash: hash,
          publishedAt: Date.now(),
          publishedPath: file,
          publishedBy: 'hook',
          publishDeferred: undefined,
        })
      }
    }
  }
} catch {
  /* never fail a tool call over the bookkeeping */
}
process.exit(0)
