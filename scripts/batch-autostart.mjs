// OS-scheduler launcher (user mandate 22.07.2026): close the one gap the in-app
// guards cannot — a fully DEAD session that nothing restarts. A Windows Scheduled
// Task runs this every ~15 min. It resurrects the batch ONLY when there is no
// live session: it never disturbs a running one, never runs while paused, and
// never runs once the batch is complete. When it does fire, it launches a
// headless `claude -p` in the repo that resumes the batch (the in-session
// batch-progress-guard then keeps that session working).
//
// Disable it any time: schtasks /delete /tn "HoA-Batch-Autostart" /f
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO = R('..')
const LOG = join(REPO, '.claude', 'autostart.log')
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}\n`
  try { writeFileSync(LOG, line, { flag: 'a' }) } catch { /* ignore */ }
  console.log(m)
}

// --- Guards: never resurrect when it would be wrong ---------------------------
if (existsSync(join(REPO, '.claude', 'batch-paused'))) { log('skip: batch is user-paused'); process.exit(0) }

let openCount = 0
try {
  for (const l of readFileSync(join(REPO, 'TASKS.md'), 'utf8').split('\n')) {
    const m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) openCount++
  }
} catch { log('skip: cannot read TASKS.md'); process.exit(0) }
if (openCount === 0) { log('skip: batch complete (0 open points)'); process.exit(0) }

const now = Date.now()
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

// A live session refreshes the lock's claimedAt; within 12 min => alive, leave it.
const lock = readJson(join(REPO, '.claude', 'batch-lock.json'))
if (lock && typeof lock.claimedAt === 'number' && now - lock.claimedAt < 12 * 60 * 1000) {
  log(`skip: a session is alive (lock ${Math.round((now - lock.claimedAt) / 60000)} min old)`)
  process.exit(0)
}
// Debounce: if we already spawned recently, give that session time to claim the lock.
const last = readJson(join(REPO, '.claude', 'autostart-last.json'))
if (last && typeof last.at === 'number' && now - last.at < 10 * 60 * 1000) {
  log(`skip: a spawn happened ${Math.round((now - last.at) / 60000)} min ago (waiting for it to claim the lock)`)
  process.exit(0)
}

// --- Find the newest bundled claude.exe --------------------------------------
function findClaude() {
  const base = join(process.env.LOCALAPPDATA ?? '', 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude-code')
  try {
    const versions = readdirSync(base).filter((d) => existsSync(join(base, d, 'claude.exe')))
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    return versions.length ? join(base, versions[0], 'claude.exe') : null
  } catch { return null }
}
const exe = findClaude()
if (!exe) { log('FAIL: no bundled claude.exe found'); process.exit(1) }

const prompt =
  'Autonome Batch-Wiederaufnahme (vom OS-Scheduler gestartet, weil keine Claude-Session aktiv war). ' +
  'Setze den "Heart of Africa"-Batch fort. Lies ZUERST die Handoff-Memory resume-184-qa-framework. ' +
  'Arbeite die offenen TASKS-Punkte in Reihenfolge ab (Kuesten-Pass 210/211, dann QA-Cluster ' +
  '204/181/203/207/205, 200-Rest, 184, 174), in atomaren Commits, jeden pushen, Dashboard-Guard + ' +
  'prep-guard gruen halten, Vorarbeit waehrend jeder Validierung. Halte NICHT still an. Wenn alles ' +
  'erledigt ist: Closing fahren.'

writeFileSync(join(REPO, '.claude', 'autostart-last.json'), JSON.stringify({ at: now }, null, 2))
log(`RESUMING: launching ${exe} -p (batch has ${openCount} open point(s))`)
const child = spawn(exe, ['-p', prompt, '--model', 'claude-opus-4-8[1m]'], {
  cwd: REPO,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
})
child.unref()
log(`launched pid ${child.pid}`)
process.exit(0)
