// Stop hook (user mandate 21.07.2026, hardened 22.07.2026): GUARANTEE the batch
// dashboard stays current — reminders alone repeatedly failed, so this BLOCKS a
// turn from ending while the dashboard is out of sync with the real batch state.
// The decision logic lives in dashboard-guard-core.mjs (pure, Vitest-covered);
// this wrapper only gathers the inputs and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session.
//
// Enforced invariants (see the core for the full comments):
//   (1) registered   (2) fresh vs HEAD          (3) no ticked point in the queue
//   (4) every open point visible                (5) focus declared (focus.mjs)
//   (6) now-card title point == declared focus  (7) reconcile after a user prompt
//   (8) re-affirm after ~30 min of work         (9) repo file == published content
//
// The companion flow after every dashboard edit:
//   node scripts/dashboard-publish.mjs          # sync repo copy → scratchpad copy
//   <publish the scratchpad file via the Artifact tool (same artifact url)>
//   node scripts/dashboard-guard.mjs --synced <dashboard.html path>
// --synced records the reviewed HEAD and, when the now-card matches the declared
// focus, also counts as the focus confirmation (clears a pending pivot check).
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  REPO_ROOT,
  STATE_PATH,
  FOCUS_PATH,
  PENDING_PATH,
  ACTIVITY_PATH,
  readJson,
  writeJsonAtomic,
  mergeState,
  removeFile,
  sha256File,
} from './dashboard-state.mjs'
import { parseTasks, parseNowCardPoint, evaluate } from './dashboard-guard-core.mjs'
import { specSnapshots } from './dashboard-integrity-guard-core.mjs'

const TASKS = resolve(REPO_ROOT, 'TASKS.md')
const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

function head() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// --synced <path>: record that the dashboard at <path> was reviewed at this HEAD.
if (process.argv[2] === '--synced') {
  const p = process.argv[3]
  if (!p || !existsSync(p)) {
    console.error(`dashboard-guard --synced: file not found: ${p}`)
    process.exit(1)
  }
  mergeState({ dashboardPath: p, head: head(), syncedAt: Date.now() })
  console.log(`dashboard registered at HEAD ${head().slice(0, 7)}: ${p}`)

  // Record the card/spec drift baselines for the integrity guard (check C):
  // per queue card, a hash of the card text and of its TASKS spec block. A
  // later spec change with an unchanged card then flags at turn end until the
  // next reviewed --synced refreshes these snapshots.
  try {
    const snaps = specSnapshots(readFileSync(TASKS, 'utf8'), readFileSync(p, 'utf8'))
    mergeState({ integritySnapshots: snaps })
    console.log(`integrity snapshots recorded for ${Object.keys(snaps).length} queue card(s)`)
  } catch (e) {
    console.log(`note: integrity snapshots skipped (${e && e.message})`)
  }

  // The re-sync IS the forced review of all four sections — when the reviewed
  // now-card matches the declared focus it doubles as the focus confirmation.
  try {
    const focus = readJson(FOCUS_PATH)
    const nowPoint = parseNowCardPoint(readFileSync(p, 'utf8'))
    if (focus && (focus.point == null || focus.point === nowPoint)) {
      writeJsonAtomic(FOCUS_PATH, { ...focus, confirmedAt: Date.now() })
      removeFile(PENDING_PATH)
      console.log(`focus confirmed by the review (point ${focus.point ?? '-'}: ${focus.note ?? ''})`)
    } else if (focus) {
      console.log(
        `WARNING: now-card point ${nowPoint ?? '<none>'} != declared focus ${focus.point} — ` +
          'fix the stale side (card edit + republish, or node scripts/focus.mjs set).',
      )
    } else {
      console.log('note: no focus declared yet — run node scripts/focus.mjs set <N> "<what>"')
    }
  } catch (e) {
    console.log(`note: focus cross-check skipped (${e && e.message})`)
  }
  process.exit(0)
}

// Stop-hook mode.
try {
  let sessionId = ''
  try {
    sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
  } catch {
    // no/non-JSON stdin (manual run) — invariant 7 then binds regardless of session
  }

  const marker = readJson(STATE_PATH)
  const dashboardFile = marker && marker.dashboardPath ? resolve(REPO_ROOT, marker.dashboardPath) : null
  const markerFileExists = !!(dashboardFile && existsSync(dashboardFile))
  const html = markerFileExists ? readFileSync(dashboardFile, 'utf8') : null

  // Only THIS session's tool activity drives the focus-freshness invariant —
  // a parallel chat window's calls must not nag the batch session (and vice versa).
  const activity = readJson(ACTIVITY_PATH)
  const lastToolAt =
    activity && (!activity.sessionId || !sessionId || activity.sessionId === sessionId)
      ? Number(activity.lastToolAt ?? 0)
      : 0

  const result = evaluate({
    paused: existsSync(PAUSE),
    ...parseTasks(readFileSync(TASKS, 'utf8')),
    marker,
    markerFileExists,
    head: head(),
    html,
    repoHash: markerFileExists ? sha256File(dashboardFile) : null,
    focus: readJson(FOCUS_PATH),
    pending: readJson(PENDING_PATH),
    sessionId,
    lastToolAt,
    now: Date.now(),
    // Calibratable without a code change: minutes in dashboard-state.json.
    freshMs: marker && marker.focusFreshMinutes ? Number(marker.focusFreshMinutes) * 60000 : undefined,
  })
  if (result.decision === 'block') process.stdout.write(JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error(`dashboard-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
