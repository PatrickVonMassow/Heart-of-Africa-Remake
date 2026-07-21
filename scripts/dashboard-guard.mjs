// Stop hook (user mandate 21.07.2026): GUARANTEE the batch dashboard stays
// current. Reminders alone failed — a queue update was missed while the now-card
// was changed — so this BLOCKS a turn from ending while the dashboard is out of
// sync with the real batch state. Two enforced invariants:
//
//   (1) FRESHNESS — after every commit (HEAD moves) the dashboard must be
//       re-synced. `--synced` records the HEAD it was reviewed against; a later
//       HEAD means work happened without a dashboard review, so the stop is
//       blocked. The re-sync IS the forced review of all four sections.
//   (2) NO STALE QUEUE ITEM — a TASKS point ticked done ([x]) must not still sit
//       in the dashboard Warteschlange (the exact 182-left-in-queue slip).
//
// Silent (allows the stop) when the batch is paused or complete, and fail-OPEN
// on any internal error so a guard bug never traps the session.
//
// Register the live dashboard after publishing it:
//   node scripts/dashboard-guard.mjs --synced <dashboard.html path>
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const MARKER = R('../.claude/dashboard-state.json')
const TASKS = R('../TASKS.md')
const PAUSE = R('../.claude/batch-paused')

function head() {
  try {
    return execSync('git rev-parse HEAD', { cwd: R('..'), encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function tasks() {
  const lines = readFileSync(TASKS, 'utf8').split('\n')
  const open = []
  const done = []
  for (const l of lines) {
    let m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.push(Number(m[1]))
    m = l.match(/^- \[x\] (\d+)\./)
    if (m) done.push(Number(m[1]))
  }
  return { open, done }
}

const allow = () => process.exit(0)
const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

// --synced <path>: record that the dashboard at <path> was reviewed at this HEAD.
if (process.argv[2] === '--synced') {
  const p = process.argv[3]
  if (!p || !existsSync(p)) {
    console.error(`dashboard-guard --synced: file not found: ${p}`)
    process.exit(1)
  }
  writeFileSync(MARKER, JSON.stringify({ dashboardPath: p, head: head(), syncedAt: Date.now() }, null, 2))
  console.log(`dashboard registered at HEAD ${head().slice(0, 7)}: ${p}`)
  process.exit(0)
}

// Stop-hook mode.
try {
  if (existsSync(PAUSE)) allow() // user-paused: no batch work in flight
  const { open, done } = tasks()
  if (open.length === 0) allow() // batch complete

  let marker = null
  try {
    marker = JSON.parse(readFileSync(MARKER, 'utf8'))
  } catch {
    marker = null
  }
  if (!marker || !marker.dashboardPath || !existsSync(marker.dashboardPath)) {
    block(
      'BATCH DASHBOARD NOT REGISTERED. Bring all four dashboard sections in line with ' +
        'the real state, republish it, then run: node scripts/dashboard-guard.mjs --synced ' +
        `<dashboard.html path>. Open points: ${open.join(', ')}.`,
    )
  }

  // (1) Freshness: a moved HEAD means work happened since the last review.
  const cur = head()
  if (cur && marker.head && cur !== marker.head) {
    block(
      `BATCH DASHBOARD OUT OF DATE: HEAD moved to ${cur.slice(0, 7)} since the dashboard was ` +
        `last reviewed (${String(marker.head).slice(0, 7)}). Review ALL FOUR sections against the ` +
        'current state (now-card, queue order, Erledigt), republish, then run: ' +
        'node scripts/dashboard-guard.mjs --synced ' + marker.dashboardPath + '.',
    )
  }

  // (2) No ticked point still in the Warteschlange.
  const html = readFileSync(marker.dashboardPath, 'utf8')
  const qStart = html.indexOf('Warteschlange')
  const qEnd = html.indexOf('<h2>', qStart + 1)
  const queueHtml = qStart >= 0 ? html.slice(qStart, qEnd < 0 ? undefined : qEnd) : ''
  const queued = new Set()
  for (const m of queueHtml.matchAll(/class="num">\s*(\d+)/g)) queued.add(Number(m[1]))
  const stale = done.filter((n) => queued.has(n))
  if (stale.length) {
    block(
      `BATCH DASHBOARD STALE: point(s) ${stale.join(', ')} are ticked done in TASKS.md but still ` +
        'listed in the dashboard Warteschlange. Move them to Erledigt, republish, then re-run --synced.',
    )
  }

  allow()
} catch (e) {
  console.error(`dashboard-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
