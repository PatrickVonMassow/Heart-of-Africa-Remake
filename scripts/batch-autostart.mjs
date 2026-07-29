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
import { spawn, execSync, execFileSync } from 'node:child_process'
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
  silenceStage,
  wedgeAction,
  isOwnSpawn,
  PENDING_STALE_MS,
  WEDGE_NOTIFY_MS,
  WORK_STALL_MS,
} from './batch-singleton.mjs'
import { readClaim, maxAgeMs as claimMaxAgeMs } from './batch-claim.mjs'
import { assessClaim } from './batch-claim-core.mjs'
import { readDeclaration, refTipAt, worktreeActiveAt, mtimeOf } from './batch-in-flight.mjs'
import { assessOwnerWork, describeInFlight, LAUNCHER_WORK_MAX_AGE_MS } from './batch-in-flight-core.mjs'
import {
  RESUME_PROMPT,
  buildSpawnArgs,
  buildSpawnOptions,
  chatPromptSuffix,
  claudeExeBase,
  findClaudeExe,
  nextChatHandedAt,
  standingAlertDue,
  pendingSinceHandover,
  recordSpawn,
  reapableSpawns,
  pruneSpawns,
} from './batch-autostart-core.mjs'
import { WATCHER_PID_FILE, watcherSupervision } from './chat-watcher-core.mjs'
import { SECRET_FAULT } from './chat-secret.mjs'
import { openPointStatus } from './tasks-source.mjs'
import { BOARD_PAGE_URL } from './board-currency-core.mjs'

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
// Synchronous, because this launcher is a straight-line script: a reaped process
// takes a moment to disappear, and a takeover may only proceed once it HAS.
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* ignore */ } }
const waitForExit = (pid, budgetMs) => {
  const until = Date.now() + budgetMs
  while (Date.now() < until) {
    if (!pidAlive(pid)) return true
    sleepSync(200)
  }
  return !pidAlive(pid)
}
// Open points, or -1 for the FORMAT ALARM (checkboxes but no parseable point).
// The rule itself lives in scripts/tasks-source.mjs, because the message watcher
// asks the same question — a second copy of it would drift silently, and both
// callers only ever see its verdict. The read stays here: a missing TASKS.md must
// still throw, so the tick bails on it rather than reading it as "nothing to do".
const openPointCount = () => {
  const archive = join(REPO, 'docs', 'tasks-archive.md')
  const { open, alarm } = openPointStatus({
    tasksText: readFileSync(join(REPO, 'TASKS.md'), 'utf8'),
    archiveText: existsSync(archive) ? readFileSync(archive, 'utf8') : '',
  })
  return alarm ? -1 : open
}

const state = readJson(C('autostart-state.json')) ?? { failCount: 0, lastHead: '', lastSpawnAt: 0, lastPid: 0, lastTickAt: 0, spawns: [] }
state.spawns = Array.isArray(state.spawns) ? state.spawns : []
const lock = readOwnerLock()
const probe = lock && lock.pid ? probePid(lock.pid) : null
/** Every exit persists the state, so a sweep that ran is never forgotten. */
const bail = (code = 0) => { writeJsonAtomic(C('autostart-state.json'), state); process.exit(code) }

// --- LEAKED SPAWNS: reap what the removed runtime ceiling used to reap --------
// `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` means a `claude -p` waits forever for
// a background task — including one that never exits, which a left-running dev
// server routinely is. The 600-second ceiling used to end exactly those, and
// `state.lastPid` alone cannot track them because a handover overwrites it. A
// leaked session holds ports, and that breaks the next session's verify suites.
// Narrow by construction (see reapableSpawns): our own spawn by pid AND start
// time, past its boot window, not the lock owner, and superseded.
//
// IT RUNS BEFORE EVERY "DO NOT SPAWN" GUARD (second four-eyes review 28.07.2026,
// finding C). It used to sit below them, and the guard it sat below most often is
// `open === 0`: the FINAL session of a completed batch is precisely the one whose
// dev server outlives it, and from the next tick onward the launcher exited at
// "batch complete" before ever looking at the ledger. The same held for a paused
// batch, an unreadable work order and an honoured user claim. A reason not to
// SPAWN is not a reason to leave a leaked process holding ports; the sweep needs
// only the state, the lock and a pid probe, all cheap.
{
  const leaked = reapableSpawns({ spawns: state.spawns, now, lock, probePid, isOwnSpawn })
  for (const s of leaked) {
    try { process.kill(s.pid) } catch { /* gone */ }
    log(`REAPED leaked spawn pid ${s.pid} (spawned ${Math.round(s.ageMs / 60000)} min ago, not the batch owner)`)
  }
  if (leaked.length > 0) {
    await notify(
      'Leaked worker reaped',
      `The launcher reaped ${leaked.length} of its own earlier headless spawn(s) (pid ${leaked.map((s) => s.pid).join(', ')}) ` +
        'that were still running without owning the batch — a background task the session was waiting on never exited.',
      'low',
    )
  }
  state.spawns = pruneSpawns({ spawns: state.spawns, probePid })
}

// --- THE CHAT INBOX: the user's way back ---------------------------------------
// The board is READ from a phone; this is the tick that reads the reply channel.
// It polls the inbox topic, drops everything unsigned/mis-signed/stale/seen and
// spools what survives; the pending ones are handed to the session spawned
// below. That bounds delivery at one launcher tick without a new process.
//
// IT RUNS BEFORE EVERY GUARD, THE PAUSE INCLUDED. ntfy keeps a message for
// twelve hours, so whether the batch is paused, complete or wedged may not
// decide whether the user's words survive at all — spooling is cheap and the
// spool is read whenever work resumes.
//
// AS ITS OWN PROCESS, like the board watchdog and for the same measured reason:
// a `process.exit()` after any fetch tears undici's socket down mid-close and
// ABORTS this process (exit 127). Bounded, windowsHide (point 401 — no console
// window may steal the user's focus), and wrapped fail-open: a chat poll may
// never be a reason the resurrection does not happen.
let pendingChat = []
/** Set by the tick below: the secret file exists and cannot be read, so nothing
 *  in this channel can work until a human fixes it (see the watcher block). */
let chatSecretBroken = false
try {
  const out = execFileSync(process.execPath, [R('chat-inbox.mjs')], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 45000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const r = JSON.parse(out.trim().split('\n').filter(Boolean).pop())
  // A secret file that EXISTS and cannot be read takes the whole channel down
  // silently — every message the user sends is dropped before it is parsed, and
  // the channel itself can no longer say so. It is therefore the one chat fault
  // that leaves the log and reaches the user out of band. But it is a STANDING
  // condition, not an event: it is true at every tick until the file is fixed,
  // so the PUSH is throttled (`standingAlertDue`) while the log line below still
  // goes out every tick. The stamp is cleared as soon as the fault is gone, so a
  // recurrence after a repair is reported at once.
  chatSecretBroken = r.fault === SECRET_FAULT
  if (!chatSecretBroken) state.chatSecretAlertAt = 0
  else if (standingAlertDue({ lastAt: state.chatSecretAlertAt, now })) {
    state.chatSecretAlertAt = now
    await notify('Chat secret unreadable', `The board chat is DOWN: ${r.reason}. Messages from the phone are dropped until it is fixed.`, 'default')
  }
  if (r.ok === false) log(`chat inbox: ${r.reason}`)
  else if (r.configured === false) { /* channel not paired on this machine — silent */ }
  else if (r.accepted > 0 || (r.dropped ?? []).length > 0) {
    // The drop-notice counts are only worth a word when they DISAGREE: planned
    // but not sent means the transport refused the notice, and the user is then
    // still looking at a message that never landed with nothing to say so.
    const notices = r.noticesPlanned > 0 && r.notices !== r.noticesPlanned
      ? `, DROP NOTICE NOT SENT: ${r.noticesPlanned - r.notices} of ${r.noticesPlanned}`
      : ''
    log(`chat inbox: ${r.accepted} new, ${r.pending} pending${r.dropped?.length ? ` (dropped: ${r.dropped.join(', ')})` : ''}${notices}`)
  }
  pendingChat = Array.isArray(r.messages) ? r.messages : []
} catch (e) {
  log(`chat inbox skipped (${(e && e.message) || e})`)
}

// --- THE MESSAGE WATCHER: this tick is its supervisor (point 407) --------------
// Stage 3 of the chat channel is a long-lived process subscribed to the inbox
// topic, so a message arriving into an IDLE machine wakes a light responder
// within seconds instead of at the next tick of this launcher.
//
// IT GETS NO SCHEDULED TASK OF ITS OWN. `HoA-Batch-Autostart` already runs every
// few minutes, at boot included, and is the one thing here that runs when
// nothing else does — so start-at-boot, restart-after-crash and stop-on-pause
// are three readings of the SAME line rather than three mechanisms. The decision
// is pure (`watcherSupervision`); liveness is by pid AND start time, so a
// recycled pid is never mistaken for the watcher and never killed as one.
//
// IT RUNS BEFORE THE PAUSE GUARD because the pause is half its job: the guard
// below exits the tick, and the watcher would then keep answering messages on a
// batch the user has stopped.
try {
  const rec = readJson(C(WATCHER_PID_FILE))
  const sup = watcherSupervision({ paused: existsSync(C('batch-paused')), record: rec, probe: probePid })
  // A WATCHER CANNOT RUN WITHOUT A READABLE SECRET, and one started anyway exits
  // before it writes its pidfile — so the supervision would read "not running"
  // and start another doomed process at every tick, for ever, with nothing
  // reaching a human. The fault is already reported above; here it simply means
  // do not start. A watcher that is ALREADY alive is left alone: it read the
  // secret at ITS start and its subscription is unaffected by the file breaking.
  if (sup.action === 'start' && chatSecretBroken) {
    log('chat watcher: not started (the chat secret is unreadable)')
  } else if (sup.action === 'stop') {
    try { process.kill(sup.pid) } catch { /* already gone */ }
    log(`chat watcher: stopped pid ${sup.pid} (${sup.reason})`)
  } else if (sup.action === 'start') {
    const out = openSync(C('chat-watcher.log'), 'a')
    const child = spawn(process.execPath, [R('chat-watcher.mjs')], {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', out, out],
      // point 401 — a console window popping up while the user works elsewhere
      // steals their focus, and this process starts unattended by definition.
      windowsHide: true,
    })
    child.unref()
    log(`chat watcher: started pid ${child.pid} (${sup.reason})`)
  }
} catch (e) {
  log(`chat watcher supervision skipped (${(e && e.message) || e})`)
}

// --- Guards: never resurrect when it would be wrong ---------------------------
if (existsSync(C('batch-paused'))) { log('skip: batch is user-paused'); bail() }

// --- BOARD WATCHDOG (point 400, delta E) --------------------------------------
// The BACKSTOP, not the mechanism. Delta D lets every session publish and delta B
// makes it publish before it works, but both live inside a session — and the
// failure this point was written for is precisely a session that has stopped
// running hooks while the user, away from the desk, reads a board that stands
// still. This tick is the only layer that still speaks then.
//
// It reads the LIVE PAGE, not a state file: the whole design turns on the check
// asking the URL rather than a record of an attempt. `liveBoardVerdict` tolerates
// the CDN floor (a page that differs while the publish is still settling is not
// an alarm) and refuses to call an unreadable page current. `watchdogDecision`
// keys each alert so one standing fault is reported once rather than every
// quarter of an hour.
//
// It runs BEFORE every "do not spawn" reason below (except the user's pause):
// "no successor is needed" is not "the board is fine", and a batch that is
// complete or wedged is exactly when a stale board goes unnoticed longest.
//
// IT RUNS AS ITS OWN PROCESS (scripts/board-watchdog.mjs), and that is not
// tidiness. On this platform a `process.exit()` after any `fetch` tears undici's
// socket down mid-close and ABORTS the process — measured: exit 127 with
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. This launcher exits
// that way at fifteen points, so it must not hold a fetch at all. The child is
// also containment nothing else matches: it cannot take the resurrection with it.
// Bounded by a timeout and wrapped fail-open on top, because the launcher's job
// is bringing the batch back and a board check may never be a reason it does not.
try {
  const out = execFileSync(process.execPath, [R('board-watchdog.mjs'), '--last-key', state.boardWatchKey ?? ''], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const r = JSON.parse(out.trim().split('\n').filter(Boolean).pop())
  if (r.verdict !== 'current') log(`board: ${r.verdict}${r.reason ? ` — ${r.reason}` : ''} (${BOARD_PAGE_URL})`)
  if (r.notified) {
    log(`BOARD ALERT: ${r.message}`)
    state.boardWatchKey = r.key
  } else if (r.key === null) {
    // NOTHING to report — not merely "already reported". A recovered board
    // forgets the key so the NEXT fault is announced again instead of being
    // swallowed as a repeat of the one that is over; a fault still standing
    // keeps its key and stays quiet.
    state.boardWatchKey = null
  }
} catch (e) {
  log(`board watchdog skipped (${(e && e.message) || e})`)
}

let open
try { open = openPointCount() } catch { log('skip: cannot read TASKS.md'); bail() }
if (open === -1) { log('ALERT: TASKS.md format unrecognized — not spawning'); await notify('TASKS.md format', 'The batch parser found checkboxes but no points — halting resurrection to be safe.', 'high'); bail() }
if (open === 0) { log('skip: batch complete (0 open points)'); bail() }

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
    bail()
  }
}

const curHead = head()

// --- Owner liveness (the hard-singleton assessment) ---------------------------
// PROGRESS, NOT AGE (point 402): the owner's declared work is an INPUT to the
// verdict. A session waiting on a delegated agent starves its heartbeat for as
// long as the agent takes, and the launcher used to have nothing but the clock to
// judge that with. Same probes and the same pure functions the Stop guard uses —
// nothing about liveness is re-invented here. (`lock` and `probe` were read
// further up — the leak sweep needs them before any guard may exit.)
const declaration = lock ? readDeclaration() : null
// The WINDOW is the launcher's own (`LAUNCHER_WORK_MAX_AGE_MS`), never the Stop
// guard's 45 minutes: asking with the guard's window made `work-stalled`
// arithmetically UNREACHABLE, because a declaration had to be older than the
// 90-minute stall bound and younger than 45 minutes at the same moment. The
// question here is "is this the owner's LAST WORD", not "may a turn end ride on
// it", and `lastWord` already excludes every session that worked after declaring.
const work = assessOwnerWork({
  declaration,
  lock,
  now,
  maxAgeMs: LAUNCHER_WORK_MAX_AGE_MS,
  probePid,
  refTipAt,
  worktreeActiveAt,
  mtimeOf,
})
const assessment = assessOwner(lock, { now, bootTime: bootTimeMs(), probe, work })

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
// "OUR OWN" is judged by pid AND start time (`isOwnSpawn`), never by the pid
// alone: `state.lastPid` persists indefinitely and Windows recycles pids, so a
// days-old spawn's number inherited by an interactive window would otherwise be
// killed here (four-eyes review 28.07.2026, finding 1.3).
if (
  state.lastPid &&
  isOwnSpawn({ pid: state.lastPid, probe: probePid(state.lastPid), lastSpawnPid: state.lastPid, lastSpawnAt: state.lastSpawnAt }) &&
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
// A session whose declared work is visibly ADVANCING is not silent in the sense
// this alarm was written for (point 402): it is waiting on an agent that is still
// committing, and reporting that as a stall would train the user to ignore the
// channel. The stall verdict below is what covers the case where it stops moving.
// PAST THE HOURS-LONG THRESHOLD IT IS REPORTED ANYWAY (four-eyes review, finding
// 1.2): a declaration is evidence, not a permanent exemption from being looked
// at, and an eternally-fresh piece of evidence must never be able to buy silence
// from BOTH the wedge verdict and this notification at once. Notify only — this
// path has never killed anything and still does not.
if (assessment.alive) {
  const ageMs = now - lock.claimedAt
  const thresholdMin = Number(process.env.HOA_WEDGE_NOTIFY_MIN)
  const notifyMs = Number.isFinite(thresholdMin) && thresholdMin > 0 ? thresholdMin * 60000 : WEDGE_NOTIFY_MS
  const stage = silenceStage({ ageMs, advancing: work.advancing, notifyMs })
  const ownerKey = wedgeOwnerKey(lock, stage ?? '')
  const w = wedgeNotifyDecision({ alive: true, stage, ownerKey, lastNotifiedKey: state.wedgeNotifiedKey })
  if (w.notify) {
    const mins = Math.round(ageMs / 60000)
    log(
      `SILENT owner: ${lock.sessionId} (pid ${lock.pid ?? 'unknown'}) has not moved in ${mins} min — notifying (${stage}` +
        `${work.advancing ? '; declared work still advancing' : ''})`,
    )
    await notify(
      stage === 'wedged' ? 'Batch session WEDGED' : 'Batch session SILENT',
      `The owning session (pid ${lock.pid ?? 'unknown'}) has made no tool call in ${mins} minutes but its process ` +
        'is alive, so the launcher may neither take over nor kill it. Either it is inside a very long run, or it ' +
        'stopped while holding the batch lock — the batch is making no progress until someone looks.' +
        // Past the hours-long threshold the report goes out even with live
        // evidence (finding 1.2), so it must SAY what that evidence is — an
        // eternally-fresh declaration looks identical to a working one from here.
        (work.advancing ? ` It still declares advancing work (${work.summary}) — check that this is real.` : ''),
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
  const why = assessment.reason === 'work-advancing' ? `; work advancing — ${work.summary}` : ''
  log(`skip: owner alive (${assessment.reason}; heartbeat ${Math.round((now - lock.claimedAt) / 60000)} min old, pid ${lock.pid ?? 'unknown'}${why})`)
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}
let takeoverAfterKill = false
if (verdict === 'skip-wedged') {
  // `probe` is the lock owner's own { exists, startedAt } — the identity half of
  // "is this really the process we spawned" (four-eyes finding 1.3).
  const act = wedgeAction({ assessment, lock, lastSpawnPid: state.lastPid, lastSpawnAt: state.lastSpawnAt, probe })
  if (act.stalled) {
    // NOT a clock reading (point 402 (d)): the owner has made no tool call for
    // two launcher ticks AND every piece of work it declared has stopped moving.
    const what = declaration ? describeInFlight(work, declaration) : 'nothing declared'
    log(`STALLED owner: pid ${lock.pid} alive, heartbeat ${Math.round((now - lock.claimedAt) / 60000)} min old, work frozen — ${what}`)
    await notify(
      'Batch work STALLED',
      `The owning session (pid ${lock.pid ?? 'unknown'}) has made no tool call for ${Math.round(WORK_STALL_MS / 60000)}+ minutes ` +
        `and the work it declared has stopped advancing: ${what}. ` +
        (act.own ? 'It was spawned by the launcher, so it is being reaped and taken over.' : 'It is not the launcher\'s own spawn, so nothing is being killed — please look.'),
      'urgent',
    )
  } else {
    log(`WEDGED owner: pid ${lock.pid} alive but heartbeat ${Math.round((now - lock.claimedAt) / 60000)} min old`)
  }
  // The consequence of point 388 (c) is the NOTIFICATION above, and it never
  // kills: at 90 minutes a silent owner may well be inside a long verification.
  // The reaping valve fires only on the launcher's OWN headless spawn and never
  // on an interactive window — an unattended `claude -p` that hangs has nobody to
  // read the notification, while a user's window has.
  if (act.kill) {
    try { process.kill(lock.pid) } catch { /* gone */ }
    // Taking the lock beside a process that is still running IS the e9407cae
    // incident, so the takeover waits for a CONFIRMED exit and otherwise leaves
    // the job to the next tick.
    takeoverAfterKill = act.takeover && waitForExit(lock.pid, 3000)
    log(
      takeoverAfterKill
        ? `killed stalled own spawn pid ${lock.pid} — taking over in this tick`
        : `killed ${act.stalled ? 'stalled' : 'wedged'} own spawn pid ${lock.pid} — next tick may take over`,
    )
  }
  if (!takeoverAfterKill) {
    writeJsonAtomic(C('autostart-state.json'), state)
    process.exit(0)
  }
}
if (takeoverAfterKill) {
  log(`owner reaped for a frozen wait (${assessment.reason}) — taking over`)
} else if (lock) {
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
// The lookup itself lives in batch-autostart-core.mjs, because the message
// watcher spawns the same executable and a second copy of this path would drift.
const exe = findClaudeExe({ base: claudeExeBase(), readdir: readdirSync, exists: existsSync, join })
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

// Author the run: verify-able spawn (log to file, record pid+head), atomic markers.
writeJsonAtomic(C('autostart-last.json'), { at: now, head: curHead })
log(`RESUMING: launching ${exe} -p (batch has ${open} open point(s), failCount=${state.failCount})`)
let child
try {
  const out = openSync(join(REPO, '.claude', 'autostart-run.log'), 'a')
  // Everything about the launch — argv, the model chain, the environment — is
  // built purely in scripts/batch-autostart-core.mjs, because THIS file cannot be
  // imported by a test without spawning a session. The environment is the part
  // that matters most: it carries CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0, without
  // which the runtime terminates the session ten minutes into every delegated
  // build (point 402).
  // Only what arrived SINCE the last spawn. The stamp is NOT advanced here: it
  // moves below, after a spawn that actually happened and read at that moment —
  // `now` is the top of the tick, from before the chat poll even ran.
  //
  // DELIVERY HERE IS AT-LEAST-ONCE, DELIBERATELY. These messages ride into the
  // prompt WITHOUT being claimed off the spool, so the session this launcher
  // spawns will read the same words a second time when its per-tool-call hook
  // claims them at its first tool call. Claiming them here instead would make
  // delivery at-most-once: a spawn that dies before its first tool call — or one
  // whose prompt never reaches a model — would take the user's message with it.
  // Seeing an instruction twice costs a few tokens; losing it costs the user
  // their message, so the duplicate is the side to err on.
  const fresh = pendingSinceHandover(pendingChat, state.chatHandedAt)
  const suffix = chatPromptSuffix(fresh)
  if (suffix) log(`carrying ${fresh.length} chat message(s) into the spawn prompt`)
  child = spawn(exe, buildSpawnArgs({ prompt: RESUME_PROMPT + suffix }), buildSpawnOptions({ cwd: REPO, stdio: ['ignore', out, out] }))
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
writeJsonAtomic(C('autostart-state.json'), {
  ...state,
  lastHead: curHead,
  lastSpawnAt: now,
  lastPid: child.pid,
  // The ledger, so a handover overwriting lastPid can no longer lose track of a
  // process that is still running (four-eyes finding 1.4).
  spawns: recordSpawn(state.spawns, { pid: child.pid, at: now }),
  // ONLY NOW, and with a fresh clock. A spawn that threw exits above without
  // ever reaching this line, so its messages stay pending; and `now` is the top
  // of the tick, from BEFORE the chat poll, so using it here would re-deliver
  // everything that arrived during this very tick (four-eyes review, 29.07.2026).
  chatHandedAt: nextChatHandedAt({ spawned: true, previous: state.chatHandedAt, now: Date.now() }),
})
log(`launched pid ${child.pid} under pending-spawn lock ${launcherSid}`)
await notify('Resurrected', `No live session — launched a headless worker to continue the batch (${open} open, failCount ${state.failCount}). Progress on GitHub.`, 'low')
process.exit(0)
