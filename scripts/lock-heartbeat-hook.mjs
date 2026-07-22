// PostToolUse hook (matcher: every tool). Three observe-only duties, each
// isolated and never erroring:
//
// (1) Keep THIS session's batch lock fresh on every tool call, so a live working
//     session never ages past the launcher's 12-min window (the
//     batch-progress-guard only refreshes at turn-end; a long turn is the norm
//     under the anti-idle guard). Ownership-aware (Fable-5 audit #4): it
//     refreshes/claims the lock only when it is free, stale, or already THIS
//     session's — it NEVER keeps a different, still-live session's lock warm.
// (2) Stamp .claude/tool-activity.json — the dashboard Stop guard's
//     focus-freshness invariant needs to know that real work happened.
// (3) Detect a dashboard publish: when the Artifact tool is called on the
//     dashboard file, record the published content's sha256 in
//     dashboard-state.json. This is what lets the Stop guard tell "published"
//     from "merely edited" (invariant 9) without trusting a self-report.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { lockStatus, claimLock } from './batch-lock.mjs'
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

// (1) lock heartbeat
try {
  if (sid && lockStatus(sid, Date.now()) !== 'held') claimLock(sid, Date.now())
} catch {
  /* no lock dir / unreadable — nothing to do */
}

// (2) tool-activity stamp
try {
  writeJsonAtomic(ACTIVITY_PATH, { lastToolAt: Date.now(), sessionId: sid })
} catch {
  /* best effort */
}

// (3) dashboard publish detection
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
