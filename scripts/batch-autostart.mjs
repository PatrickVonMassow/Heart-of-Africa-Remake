// OS-scheduler launcher (user mandate 22.07.2026) — resurrects a DEAD batch when
// nothing else can, and VERIFIES its own work / RAISES A SIGNAL when the batch
// is sick, not just dead. A Windows Scheduled Task runs this every few minutes.
//
// HARD SINGLETON (24.07.2026, after the e9407cae incident — this launcher
// double-spawned against a live-but-heartbeat-starved interactive session):
//   - Liveness is judged by scripts/batch-singleton.mjs: heartbeat age AND a
//     REAL OS pid check. A session mid-long-tool-call (stale heartbeat, live
//     claude process) reads ALIVE — the old 12-min claimedAt window read it
//     dead and spawned the second session. A reboot alone is NOT death: only
//     a provably dead owner (dead/reused pid, heartbeat predating the boot,
//     or a legacy lock gone very stale) frees the lock.
//   - Spawning goes through the SAME ATOMIC acquire as every session: the
//     launcher first wins a 'pending-spawn' lock (test-and-set); only then
//     does it spawn, and the spawned session converts that lock to itself
//     (pid-bound). If the acquire loses (a session claimed in the race
//     window), NOTHING is spawned. No path overrides a live lock.
//   - ACTIVE DETECTOR + REMEDIATION: every tick it checks for a second live
//     top-level session. If its OWN previous spawn is live but is not the
//     owner, it KILLS that rogue spawn (it created it, it may reap it), logs
//     it and notifies. A rogue interactive session is never killed — the
//     guards make it stand down — but the user is notified urgently.
// Disable: Disable-ScheduledTask -TaskName HoA-Batch-Autostart
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, openSync } from 'node:fs'
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { notify } from './notify.mjs'
import {
  acquire,
  updateOwnLock,
  release,
  readOwnerLock,
  assessOwner,
  probePid,
  bootTimeMs,
  spawnDecision,
  detectParallel,
  raiseParallelAlert,
  wedgeNotifyDecision,
  wedgeOwnerKey,
  wedgeStage,
  PENDING_STALE_MS,
  WEDGE_NOTIFY_MS,
} from './batch-singleton.mjs'
import { readClaim, maxAgeMs as claimMaxAgeMs } from './batch-claim.mjs'
import { assessClaim } from './batch-claim-core.mjs'

// IMPORT-PROOF (27.07.2026). Everything below runs at MODULE LOAD, so merely
// importing this file — a syntax check, a test, a tooling scan — SPAWNS a
// headless claude session. That happened: `node -e "import('./scripts/batch-
// autostart.mjs')"` launched a session inside a worktree, which then claimed
// that worktree's batch lock. Throwing before the first side effect makes the
// mistake loud and free (the same treatment scripts/retro-refresh.mjs got after
// it rewrote a document as empty from a worktree).
if (!(process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href)) {
  throw new Error(
    'scripts/batch-autostart.mjs is a CLI, not a module — importing it would SPAWN a batch session. ' +
      'Run it as `node scripts/batch-autostart.mjs`; use `node --check` to syntax-check it.',
  )
}

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
  // Format sanity: checkboxes exist but none parse → treat as unknown, NOT as
  // "complete" (never silently stop with work left on a reformat). The escape
  // hatch reads the ARCHIVE (docs/tasks-archive.md), because since the split of
  // 26.07.2026 a ticked point leaves TASKS.md at once: looking for `- [x]` here
  // could never succeed again, so every all-DEFERRED file would raise a false
  // format alarm (four-eyes review).
  const archive = join(REPO, 'docs', 'tasks-archive.md')
  const ticksExist = existsSync(archive) && /- \[x\] \d+\./.test(readFileSync(archive, 'utf8'))
  if (n === 0 && sawCheckbox && !ticksExist) return -1
  return n
}

// --- Guards: never resurrect when it would be wrong ---------------------------
if (existsSync(C('batch-paused'))) { log('skip: batch is user-paused'); process.exit(0) }
let open
try { open = openPointCount() } catch { log('skip: cannot read TASKS.md'); process.exit(0) }
if (open === -1) { log('ALERT: TASKS.md format unrecognized — not spawning'); await notify('TASKS.md format', 'The batch parser found checkboxes but no points — halting resurrection to be safe.', 'high'); process.exit(0) }
if (open === 0) { log('skip: batch complete (0 open points)'); process.exit(0) }

// --- THE USER TOOK THE BATCH BACK (point 395) ---------------------------------
// A live, unexpired claim RESERVES the batch for the window the user is sitting
// at. Spawning a headless successor into that reservation would take it straight
// back off them — the owner releases at its next clean turn end, and this tick
// could easily fall in between. Same bounds as everywhere else: the claim expires
// and a claim from a closed window is ignored, so this can never strand the batch.
{
  const claim = readClaim()
  const reserved = claim ? assessClaim({ claim, now, maxAgeMs: claimMaxAgeMs(), probePid }) : { honour: false }
  if (reserved.honour) {
    log(
      `skip: session ${reserved.claimantSid} has CLAIMED the batch ${Math.round(reserved.ageMs / 60000)} min ago — ` +
        'the user is working in that window',
    )
    process.exit(0)
  }
}

const state = readJson(C('autostart-state.json')) ?? { failCount: 0, lastHead: '', lastSpawnAt: 0, lastPid: 0, lastTickAt: 0 }
const curHead = head()

// --- Owner liveness (the hard-singleton assessment) ---------------------------
const lock = readOwnerLock()
const probe = lock && lock.pid ? probePid(lock.pid) : null
const assessment = assessOwner(lock, { now, bootTime: bootTimeMs(), probe })

// --- Verify the previous spawn ------------------------------------------------
if (state.lastSpawnAt > 0) {
  const progressed = (curHead && state.lastHead && curHead !== state.lastHead) ||
    (lock && typeof lock.claimedAt === 'number' && lock.claimedAt > state.lastSpawnAt)
  if (progressed) {
    if (state.failCount > 0) log(`previous spawn made progress — clearing failCount (${state.failCount})`)
    state.failCount = 0
  } else if (!state.lastPid || !pidAlive(state.lastPid)) {
    state.failCount = (state.failCount || 0) + 1
    log(`previous spawn did NOT take over (no new commit, lock not claimed, pid gone) — failCount=${state.failCount}`)
  }
}
state.lastTickAt = now

// --- ACTIVE DETECTOR: a second live session? ----------------------------------
const ownerSid = lock ? lock.sessionId : ''
const parallel = assessment.alive ? detectParallel(ownerSid) : []
if (parallel.length > 0) {
  raiseParallelAlert({ detectedBy: 'batch-autostart', ownerSid, parallel })
  log(`PARALLEL SESSIONS DETECTED: owner=${ownerSid} plus ${parallel.map((p) => p.sid).join(', ')}`)
  await notify(
    'PARALLEL batch sessions',
    `A second live session is running tools in the repo beside the owner (${parallel.length} extra). ` +
      'The non-owner is being stood down by the guards; the owner was told to verify the repo (batch-doctor).',
    'urgent',
  )
}
// Remediation for a rogue spawn of OUR OWN making: our child is alive but is
// NOT the owner (its lock conversion failed or another session owns) → kill it.
if (
  state.lastPid &&
  pidAlive(state.lastPid) &&
  now - state.lastSpawnAt > PENDING_STALE_MS &&
  assessment.alive &&
  lock &&
  lock.pid !== state.lastPid &&
  !(lock.kind === 'pending-spawn' && lock.spawnedPid === state.lastPid)
) {
  try { process.kill(state.lastPid) } catch { /* gone */ }
  log(`REMEDIATED: killed own rogue spawn pid ${state.lastPid} (alive but not the lock owner)`)
  await notify('Rogue spawn killed', `The launcher killed its own previous spawn (pid ${state.lastPid}) — it was alive but not the batch owner.`, 'high')
}

// --- SILENT OWNER: diagnose AND report (point 388 (c)) ------------------------
// The launcher could already NAME this state — it logged "WEDGED owner: pid alive
// but heartbeat N min old" twenty-one times on the night of 28.07.2026 and told
// nobody. It still may not act on the age: a long verify run legitimately starves
// the heartbeat, so the age alone may neither spawn a successor NOR kill the
// owner. What it can do is SAY so, once per silence.
if (assessment.alive) {
  const ageMs = now - lock.claimedAt
  const thresholdMin = Number(process.env.HOA_WEDGE_NOTIFY_MIN)
  const notifyMs = Number.isFinite(thresholdMin) && thresholdMin > 0 ? thresholdMin * 60000 : WEDGE_NOTIFY_MS
  const stage = wedgeStage(ageMs, { notifyMs })
  const ownerKey = wedgeOwnerKey(lock, stage ?? '')
  const w = wedgeNotifyDecision({ alive: true, stage, ownerKey, lastNotifiedKey: state.wedgeNotifiedKey })
  if (w.notify) {
    const mins = Math.round(ageMs / 60000)
    log(`SILENT owner: ${lock.sessionId} (pid ${lock.pid ?? 'unknown'}) has not moved in ${mins} min — notifying (${stage})`)
    await notify(
      stage === 'wedged' ? 'Batch session WEDGED' : 'Batch session SILENT',
      `The owning session (pid ${lock.pid ?? 'unknown'}) has made no tool call in ${mins} minutes but its process ` +
        'is alive, so the launcher may neither take over nor kill it. Either it is inside a very long run, or it ' +
        'stopped while holding the batch lock — the batch is making no progress until someone looks.',
      stage === 'wedged' ? 'urgent' : 'high',
    )
    state.wedgeNotifiedKey = ownerKey
  }
}

// --- Runaway / stuck watchdog: pause + signal ----------------------------------
if (state.failCount >= 3) {
  log(`RUNAWAY: ${state.failCount} spawns with no git progress — pausing the batch and notifying`)
  try { writeFileSync(C('batch-paused'), `autostart watchdog: ${state.failCount} resurrections made no progress (auth expired? model flag? failing point? push failing?) — investigate, then delete this file.\n`) } catch { /* ignore */ }
  await notify('Batch STALLED', `${state.failCount} headless resurrections made no progress since ${state.lastHead.slice(0, 7)}. Auto-paused. Check auth / git push / the current point.`, 'urgent')
  writeJsonAtomic(C('autostart-state.json'), { ...state })
  process.exit(0)
}

// --- Liveness verdict ----------------------------------------------------------
const verdict = lock ? spawnDecision(assessment) : 'spawn'
if (verdict === 'skip-alive') {
  log(`skip: owner alive (${assessment.reason}; heartbeat ${Math.round((now - lock.claimedAt) / 60000)} min old, pid ${lock.pid ?? 'unknown'})`)
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}
if (verdict === 'skip-wedged') {
  log(`WEDGED owner: pid ${lock.pid} alive but heartbeat ${Math.round((now - lock.claimedAt) / 60000)} min old`)
  // The new consequence of point 388 (c) is the NOTIFICATION above, and it never
  // kills: at 90 minutes a silent owner may well be inside a long verification.
  // This valve is the pre-existing one and is left standing (four-eyes review,
  // finding 5): it fires only on the launcher's OWN headless spawn, only past
  // WEDGED_MS = four hours, and never on an interactive window. No tool call runs
  // four hours, and an unattended `claude -p` that hangs has nobody to read the
  // notification — removing it would trade one silent night for another.
  if (lock.pid && lock.pid === state.lastPid) {
    try { process.kill(lock.pid) } catch { /* gone */ }
    log(`killed wedged own spawn pid ${lock.pid} — next tick may take over`)
  }
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}
if (lock) {
  // "handed-over" is not death: the owner finished a point and passed the batch
  // on (point 388). Logged distinctly so the end-to-end chain can be READ out of
  // this file rather than inferred.
  log(
    assessment.reason === 'handed-over'
      ? `HANDOVER accepted: ${lock.sessionId} handed the batch over${lock.handoverPoint ? ` at point ${lock.handoverPoint}` : ''} — spawning the successor`
      : `owner provably dead (${assessment.reason}) — taking over`,
  )
} else {
  // The headless path leaves no lock at all: a `claude -p` that ends at a
  // boundary exits, and SessionEnd releases the lock before this tick runs. Said
  // distinctly so the handover chain can be read from this file either way.
  log('no owner lock — taking over')
}

// Debounce: a spawn less than 10 min ago is still coming up.
const lastSpawn = readJson(C('autostart-last.json'))
if (lastSpawn && typeof lastSpawn.at === 'number' && now - lastSpawn.at < 10 * 60 * 1000) {
  log(`skip: a spawn ${Math.round((now - lastSpawn.at) / 60000)} min ago is still claiming the lock`)
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}

// --- ATOMIC pending acquire: the launcher must WIN the lock before spawning ----
const launcherSid = `launcher-${randomUUID()}`
const acq = acquire(launcherSid, { kind: 'pending-spawn', pid: process.pid, pidStartedAt: now - Math.round(process.uptime() * 1000) })
if (acq !== 'acquired') {
  log(`skip: atomic acquire returned "${acq}" — a session claimed the lock in the race window; NOT spawning`)
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
if (!exe) {
  release(launcherSid)
  log('FAIL: no bundled claude.exe found')
  await notify('claude.exe missing', 'The autostart launcher could not find the bundled claude.exe — resurrection is down.', 'urgent')
  process.exit(1)
}

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
  'prep-guard gruen halten, Vorarbeit waehrend jeder Validierung. PUNKT-GRENZE (27.07.2026): der Kontext ' +
  'ist der groesste Kostenfaktor des Batches — wenn der gemergte und abgehakte Punkt fertig ist UND kein ' +
  'delegierter Agent mehr laeuft (Pool erst leerlaufen lassen), fuehre `node scripts/batch-boundary.mjs ' +
  '<punkt>` aus und BEENDE die Session, statt den naechsten Punkt in denselben Kontext zu ziehen; der ' +
  'OS-Task startet die naechste Session. Halte sonst NICHT still an. Wenn ein git push ' +
  'scheitert, schreibe .claude/push-failed und benachrichtige via scripts/notify.mjs. WICHTIG: Wenn der ' +
  'SessionStart-Hook meldet, dass eine ANDERE Session den Batch-Lock haelt (STAND DOWN), dann arbeite ' +
  'NICHT am Batch und beende dich sofort. Wenn alles erledigt ist: Closing fahren.'

// Author the run: verify-able spawn (log to file, record pid+head), atomic markers.
writeJsonAtomic(C('autostart-last.json'), { at: now, head: curHead })
log(`RESUMING: launching ${exe} -p (batch has ${open} open point(s), failCount=${state.failCount})`)
let child
try {
  const out = openSync(join(REPO, '.claude', 'autostart-run.log'), 'a')
  // --dangerously-skip-permissions: the resurrected session is HEADLESS (-p) and
  // unattended, so it can neither show a permission prompt nor have one answered.
  // A bare "Bash" allow does NOT blanket-approve novel command shapes in this
  // harness (each new one still prompts — the endlessly-growing Bash(...) list in
  // settings.local.json is the proof), and defaultMode "dontAsk" is the settings
  // ceiling. For an autonomous batch on the user's own single-user machine the
  // launch flag is the only thing that guarantees a prompt never blocks the run.
  // Model per the 25.07.2026 policy: Opus 5 is the worker at any difficulty, and
  // the fallback CHAIN is Opus 5 -> Fable 5 -> Opus 4.8. The CLI takes a single
  // --fallback-model, so Fable is wired as that first fallback; should Fable be
  // unavailable too, the session comes up on the user's configured default and
  // the model-guard Stop hook still enforces the allowlist from inside (Opus 4.8
  // passes it, anything outside the three does not). Fable is otherwise used ONLY
  // for four-eyes review, never because a task looks hard.
  child = spawn(exe, ['-p', prompt, '--model', 'claude-opus-5[1m]', '--fallback-model', 'claude-fable-5', '--dangerously-skip-permissions'], {
    cwd: REPO, detached: true, stdio: ['ignore', out, out], windowsHide: true,
  })
  child.unref()
} catch (e) {
  release(launcherSid)
  log(`FAIL: could not spawn claude (${e && e.message})`)
  await notify('Spawn failed', `Could not launch claude.exe: ${e && e.message}`, 'urgent')
  process.exit(1)
}
// Rebind the pending lock to the child so the singleton's liveness follows the
// spawned process, and the spawned session may convert it to itself (pid-bound).
updateOwnLock(launcherSid, { spawnedPid: child.pid, pid: child.pid, pidStartedAt: null })
// One-shot bind helper for the spawned session's SessionStart hook.
writeJsonAtomic(C('autostart-authorized.json'), { at: now, pid: child.pid })
writeJsonAtomic(C('autostart-last.json'), { at: now, head: curHead, pid: child.pid })
writeJsonAtomic(C('autostart-state.json'), { ...state, lastHead: curHead, lastSpawnAt: now, lastPid: child.pid })
log(`launched pid ${child.pid} under pending-spawn lock ${launcherSid}`)
await notify('Resurrected', `No live session — launched a headless worker to continue the batch (${open} open, failCount ${state.failCount}). Progress on GitHub.`, 'low')
process.exit(0)
