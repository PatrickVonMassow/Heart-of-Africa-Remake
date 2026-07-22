// OS-scheduler launcher (user mandate 22.07.2026) — resurrects a DEAD batch when
// nothing else can, and (Fable-5 audit, finding D) VERIFIES its own work and
// RAISES A SIGNAL when the batch is sick, not just dead. A Windows Scheduled Task
// runs this every ~15 min. It:
//   - never disturbs a live session, a paused batch, or a finished one;
//   - detects a reboot deterministically (lock predates boot) AND a wake-from-
//     sleep (long gap between ticks) so it neither strands nor double-spawns;
//   - verifies the PREVIOUS spawn actually took over (lock claimed / a new commit);
//     kills a zombie `-p` that hung; counts consecutive failures;
//   - after N failures with NO git progress it PAUSES itself and fires an
//     out-of-band ntfy notification (works with no claude.ai / no Claude at all);
//   - writes every marker atomically (temp + rename).
// Disable: schtasks /delete /tn HoA-Batch-Autostart /f
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, openSync } from 'node:fs'
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import os from 'node:os'
import { notify } from './notify.mjs'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO = R('..')
const C = (n) => join(REPO, '.claude', n)
const LOG = C('autostart.log')
const now = Date.now()

const log = (m) => {
  try { writeFileSync(LOG, `[${new Date(now).toISOString()}] ${m}\n`, { flag: 'a' }) } catch { /* ignore */ }
  console.log(m)
}
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const writeJsonAtomic = (p, obj) => {
  try { const t = `${p}.tmp`; writeFileSync(t, JSON.stringify(obj, null, 2)); renameSync(t, p) } catch { /* ignore */ }
}
const head = () => { try { return execSync('git rev-parse HEAD', { cwd: REPO, encoding: 'utf8' }).trim() } catch { return '' } }
const pidAlive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e && e.code === 'EPERM' } }
const openPointCount = () => {
  let n = 0
  let sawCheckbox = false
  for (const l of readFileSync(join(REPO, 'TASKS.md'), 'utf8').split('\n')) {
    if (/^- \[/.test(l)) sawCheckbox = true
    const m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) n++
  }
  // Format sanity (audit #12): checkboxes exist but none parse → treat as unknown,
  // NOT as "complete" (never silently stop with work left on a reformat).
  if (n === 0 && sawCheckbox && !/- \[x\] \d+\./.test(readFileSync(join(REPO, 'TASKS.md'), 'utf8'))) return -1
  return n
}

// --- Guards: never resurrect when it would be wrong ---------------------------
if (existsSync(C('batch-paused'))) { log('skip: batch is user-paused'); process.exit(0) }
let open
try { open = openPointCount() } catch { log('skip: cannot read TASKS.md'); process.exit(0) }
if (open === -1) { log('ALERT: TASKS.md format unrecognized — not spawning'); await notify('TASKS.md format', 'The batch parser found checkboxes but no points — halting resurrection to be safe.', 'high'); process.exit(0) }
if (open === 0) { log('skip: batch complete (0 open points)'); process.exit(0) }

const state = readJson(C('autostart-state.json')) ?? { failCount: 0, lastHead: '', lastSpawnAt: 0, lastPid: 0, lastTickAt: 0 }
const lock = readJson(C('batch-lock.json'))
const curHead = head()

// --- Verify the previous spawn (audit D/#7/#8/#17) ----------------------------
if (state.lastSpawnAt > 0) {
  const progressed = (curHead && state.lastHead && curHead !== state.lastHead) ||
    (lock && typeof lock.claimedAt === 'number' && lock.claimedAt > state.lastSpawnAt)
  if (progressed) {
    if (state.failCount > 0) log(`previous spawn made progress — clearing failCount (${state.failCount})`)
    state.failCount = 0
  } else {
    if (state.lastPid && pidAlive(state.lastPid) && lock && now - lock.claimedAt > 12 * 60 * 1000) {
      // Zombie: spawned claude still running but not heart-beating the lock.
      try { process.kill(state.lastPid) } catch { /* gone */ }
      log(`killed zombie spawn pid ${state.lastPid} (alive but lock stale)`)
    }
    if (!state.lastPid || !pidAlive(state.lastPid)) {
      state.failCount = (state.failCount || 0) + 1
      log(`previous spawn did NOT take over (no new commit, lock not claimed, pid gone) — failCount=${state.failCount}`)
    }
  }
}

// --- Runaway / stuck watchdog (audit D/#8/#14): pause + signal -----------------
if (state.failCount >= 3) {
  log(`RUNAWAY: ${state.failCount} spawns with no git progress — pausing the batch and notifying`)
  try { writeFileSync(C('batch-paused'), `autostart watchdog: ${state.failCount} resurrections made no progress (auth expired? model flag? failing point? push failing?) — investigate, then delete this file.\n`) } catch { /* ignore */ }
  await notify('Batch STALLED', `${state.failCount} headless resurrections made no progress since ${state.lastHead.slice(0, 7)}. Auto-paused. Check auth / git push / the current point.`, 'urgent')
  writeJsonAtomic(C('autostart-state.json'), { ...state, lastTickAt: now })
  process.exit(0)
}

// --- Liveness: don't disturb a live session -----------------------------------
const bootTime = now - Math.round(os.uptime() * 1000)
const lockPredatesBoot = lock && typeof lock.claimedAt === 'number' && lock.claimedAt < bootTime
// Wake-from-sleep grace (audit #6): a long gap between ticks (task interval is 15
// min) means the machine slept; give the surviving session one tick to refresh
// its lock before we conclude it is dead.
const wokeFromSleep = state.lastTickAt > 0 && now - state.lastTickAt > 25 * 60 * 1000
state.lastTickAt = now
if (lock && !lockPredatesBoot && typeof lock.claimedAt === 'number' && now - lock.claimedAt < 12 * 60 * 1000) {
  log(`skip: a session is alive (lock ${Math.round((now - lock.claimedAt) / 60000)} min old)`)
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}
if (wokeFromSleep && lock && !lockPredatesBoot) {
  log('skip: likely woke from sleep — one grace tick before deciding the session is dead')
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}
if (lockPredatesBoot) log('lock predates this boot — previous session is dead, resurrecting')
// Debounce (atomic): a spawn less than 10 min ago is still coming up.
const lastSpawn = readJson(C('autostart-last.json'))
if (lastSpawn && typeof lastSpawn.at === 'number' && now - lastSpawn.at < 10 * 60 * 1000) {
  log(`skip: a spawn ${Math.round((now - lastSpawn.at) / 60000)} min ago is still claiming the lock`)
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}

// --- Find the newest bundled claude.exe ---------------------------------------
function findClaude() {
  const base = join(process.env.LOCALAPPDATA ?? '', 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude-code')
  try {
    const v = readdirSync(base).filter((d) => existsSync(join(base, d, 'claude.exe')))
    v.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    return v.length ? join(base, v[0], 'claude.exe') : null
  } catch { return null }
}
const exe = findClaude()
if (!exe) { log('FAIL: no bundled claude.exe found'); await notify('claude.exe missing', 'The autostart launcher could not find the bundled claude.exe — resurrection is down.', 'urgent'); process.exit(1) }

// Self-heal trust so a headless -p honours the allow-list (idempotent).
try {
  const cfgPath = join(os.homedir(), '.claude.json')
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  cfg.projects ??= {}
  let changed = false
  for (const k of ['C:/Users/Patri/Documents/Developing/hoa', 'c:/Users/Patri/Documents/Developing/hoa']) {
    cfg.projects[k] ??= {}
    if (cfg.projects[k].hasTrustDialogAccepted !== true) { cfg.projects[k].hasTrustDialogAccepted = true; changed = true }
  }
  if (changed) { const t = `${cfgPath}.tmp`; writeFileSync(t, JSON.stringify(cfg, null, 2)); renameSync(t, cfgPath); log('ensured repo trust in ~/.claude.json') }
} catch (e) { log(`warn: could not ensure trust (${e && e.message})`) }

const prompt =
  'Autonome Batch-Wiederaufnahme (vom OS-Scheduler gestartet, weil keine Claude-Session aktiv war). ' +
  'Setze den "Heart of Africa"-Batch fort. Lies ZUERST die Handoff-Memory resume-184-qa-framework. ' +
  'Pruefe als erstes den ausgecheckten Git-Branch und ob ein Merge halb fertig ist. Arbeite die offenen ' +
  'TASKS-Punkte in Reihenfolge ab — Feature-Branch-Workflow (CLAUDE.md §6): jeder Punkt auf seinem ' +
  'EIGENEN feat/<punkt>-<slug>-Branch von main, atomare Commits, den BRANCH nach jedem Commit pushen, ' +
  'Merge nach main NUR wenn der Punkt fertig und verifiziert ist (Tests gruen; Render-/GUI-Aenderungen ' +
  'auf BEIDEN Backends am Bild geprueft); TASKS.md nur auf main abhaken (beim Merge); ' +
  'Querschnitts-Aenderungen (Guards, Docs, Dashboard, Prozessdateien) direkt auf main. Dashboard-Guard + ' +
  'prep-guard gruen halten, Vorarbeit waehrend jeder Validierung. Halte NICHT still an. Wenn ein git push ' +
  'scheitert, schreibe .claude/push-failed und benachrichtige via scripts/notify.mjs. Wenn alles erledigt ist: Closing fahren.'

// Author the run: verify-able spawn (log to file, record pid+head), atomic markers.
writeJsonAtomic(C('autostart-last.json'), { at: now, head: curHead })
writeJsonAtomic(C('autostart-authorized.json'), { at: now })
log(`RESUMING: launching ${exe} -p (batch has ${open} open point(s), failCount=${state.failCount})`)
let child
try {
  const out = openSync(join(REPO, '.claude', 'autostart-run.log'), 'a')
  child = spawn(exe, ['-p', prompt, '--model', 'claude-opus-4-8[1m]'], {
    cwd: REPO, detached: true, stdio: ['ignore', out, out], windowsHide: true,
  })
  child.unref()
} catch (e) {
  log(`FAIL: could not spawn claude (${e && e.message})`)
  await notify('Spawn failed', `Could not launch claude.exe: ${e && e.message}`, 'urgent')
  process.exit(1)
}
writeJsonAtomic(C('autostart-last.json'), { at: now, head: curHead, pid: child.pid })
writeJsonAtomic(C('autostart-state.json'), { ...state, lastHead: curHead, lastSpawnAt: now, lastPid: child.pid })
log(`launched pid ${child.pid}`)
await notify('Resurrected', `No live session — launched a headless worker to continue the batch (${open} open, failCount ${state.failCount}). Progress on GitHub.`, 'low')
process.exit(0)
