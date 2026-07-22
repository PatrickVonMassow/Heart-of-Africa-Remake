// Stop hook (user mandate 22.07.2026): the dashboard must be TRUSTABLE, not
// merely present — in one session the now-card named the wrong point for hours,
// a queue card kept describing an outdated spec, and each error was only fixed
// when the USER spotted it. This guard holds the board against the ACTUAL state:
//
//   (A) now-card/declared focus vs the git evidence (working-tree edits mapped
//       to TASKS specs, recent commit subjects) — "card says 215, work is 210"
//   (B) no Warteschlange card for a closed or nonexistent TASKS point
//   (C) a queue card whose TASKS spec changed since the last --synced review
//       while the card text did not (heuristic reminder-to-reconcile; the
//       snapshots are recorded by dashboard-guard --synced)
//
// The decision logic lives in dashboard-integrity-guard-core.mjs (pure,
// Vitest-covered); this wrapper only gathers the inputs and is fail-OPEN: any
// internal error, git timeout or missing file → allow, so a guard bug never
// traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT, STATE_PATH, FOCUS_PATH, readJson } from './dashboard-state.mjs'
import { evaluate, RECENT_COMMIT_COUNT } from './dashboard-integrity-guard-core.mjs'

const TASKS = resolve(REPO_ROOT, 'TASKS.md')
const DASHBOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

/** Short-timeout git call; empty string on any failure (fail-open). */
const GIT_TIMEOUT_MS = 3000
function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

/** Working-tree changed + untracked paths from one `git status --porcelain` call. */
function touchedFiles() {
  const files = []
  for (const line of git('status --porcelain').split('\n')) {
    if (line.length < 4) continue
    // "XY path" / "XY old -> new" — take the current path, unquote if quoted.
    let p = line.slice(3)
    const arrow = p.indexOf(' -> ')
    if (arrow >= 0) p = p.slice(arrow + 4)
    p = p.replace(/^"|"$/g, '')
    if (p) files.push(p)
  }
  return files
}

try {
  try {
    JSON.parse(readFileSync(0, 'utf8')) // hook stdin (session_id) — unused; the rules are global truth
  } catch {
    /* no/non-JSON stdin (manual run) */
  }

  if (existsSync(PAUSE)) process.exit(0) // user-paused: no batch duty in flight
  if (!existsSync(DASHBOARD)) process.exit(0) // no board yet — dashboard-guard owns that case

  const focus = readJson(FOCUS_PATH)
  const state = readJson(STATE_PATH)

  // Commit testimony covers ONLY the stretch since the last attested --synced
  // review (marker.head): older commits were already reviewed into the board,
  // so an early-stretch subject naming a still-open point must not contradict
  // a legitimate later pivot. No reviewed HEAD → no commit evidence (the
  // registration invariant of dashboard-guard covers that case).
  const reviewedHead = state && state.head ? String(state.head) : ''
  const commitSubjects = reviewedHead
    ? git(`log -n ${RECENT_COMMIT_COUNT} --format=%s ${reviewedHead}..HEAD`).split('\n').filter(Boolean)
    : []

  const result = evaluate({
    dashboardHtml: readFileSync(DASHBOARD, 'utf8'),
    tasksMd: readFileSync(TASKS, 'utf8'),
    focusPoint: focus && Number.isInteger(focus.point) ? focus.point : null,
    commitSubjects,
    touchedFiles: touchedFiles(),
    snapshots: state && state.integritySnapshots ? state.integritySnapshots : null,
  })
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
  process.exit(0)
} catch (e) {
  console.error(`dashboard-integrity-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
