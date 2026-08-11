// OS-scheduler launcher (user mandate 22.07.2026) — resurrects a DEAD batch when
// nothing else can, and VERIFIES its own work / RAISES A SIGNAL when the batch
// is sick, not just dead. The launcher's TRIGGER runs this every few minutes: a
// Windows Scheduled Task there, the scripts/batch-launcher.mjs daemon on Linux
// (point 474). This file does not care which — only that it is ticked.
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
// Disable: `node scripts/batch-launcher.mjs --stop` (Linux) /
//          `Disable-ScheduledTask -TaskName HoA-Batch-Autostart` (Windows)
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, openSync, closeSync, readSync, statSync, rmSync } from 'node:fs'
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
  ownerStateKey,
  verdictRepeat,
  isOwnSpawn,
  PENDING_STALE_MS,
} from './batch-singleton.mjs'
import { readClaim, maxAgeMs as claimMaxAgeMs } from './batch-claim.mjs'
import { takeoverDecision } from './batch-claim-core.mjs'
import { readDeclaration, refTipAt, worktreeActiveAt, mtimeOf } from './batch-in-flight.mjs'
import { assessOwnerWork, describeInFlight, LAUNCHER_WORK_MAX_AGE_MS } from './batch-in-flight-core.mjs'
import {
  RESUME_PROMPT,
  buildSpawnArgs,
  buildSpawnOptions,
  chatPromptSuffix,
  resolveClaudeCli,
  cliSearchSummary,
  repoTrustKeys,
  claudeConfigPath,
  nextChatHandedAt,
  standingAlertDue,
  pendingSinceHandover,
  recordSpawn,
  reapableSpawns,
  pruneSpawns,
  judgeSpawnPreflight,
  judgePreviousSpawn,
  spawnProgressed,
  spawnBackoffMs,
  detectQuotaSignature,
  judgeSpawnOutcome,
  announceSpawn,
  RUNAWAY_FAIL_LIMIT,
} from './batch-autostart-core.mjs'
import { repoRepairAllowed, repoRepairDecision } from './batch-doctor-core.mjs'
import { clearMandateMarker, writeMandateMarker } from './batch-doctor-states.mjs'
import { writeTextAtomic } from './atomic-write.mjs'
import { classifyPause, describePause, formatPauseRecord, planPause } from './batch-pause-core.mjs'
import { WATCHER_PID_FILE, watcherSupervision } from './chat-watcher-core.mjs'
import { SECRET_FAULT } from './chat-secret.mjs'
import { chatInboxLogLines } from './chat-core.mjs'
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
const head = () => { try { return execSync('git rev-parse HEAD', { windowsHide: true, cwd: REPO, encoding: 'utf8' }).trim() } catch { return '' } }
const pidAlive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e && e.code === 'EPERM' } }
// (`sleepSync`/`waitForExit` went with the kill-then-take valve, point 434: the
// launcher no longer ends the owner's process, so nothing here waits for an exit.)
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

// --- WHAT THE PREVIOUS SPAWN SAID BEFORE IT DIED (point 444) -------------------
// A `claude -p` refused by the usage limit prints one line and exits, and that
// line is the only evidence of the difference between "the batch is broken" and
// "the budget is spent". The spawned session's stdout and stderr both land in
// .claude/autostart-run.log, so the launcher records the log's SIZE at each spawn
// and reads exactly what has been appended since — no timestamps to parse and no
// chance of reading an older session's words as this one's.
const RUN_LOG = join(REPO, '.claude', 'autostart-run.log')
/** Bound: a refusal is a handful of bytes, a working session's report is not. */
const RUN_LOG_SEGMENT_MAX = 64 * 1024
const runLogSize = () => { try { return statSync(RUN_LOG).size } catch { return 0 } }
/** The tail of the run log written since `from`. Never throws: an unreadable log
 *  means "no signature", and the ordinary failure ladder keeps its verdict. */
function readRunLogSegment(from) {
  try {
    const size = runLogSize()
    const start = Number.isFinite(from) && from >= 0 && from <= size ? from : Math.max(0, size - RUN_LOG_SEGMENT_MAX)
    const len = Math.min(size - start, RUN_LOG_SEGMENT_MAX)
    if (len <= 0) return ''
    const fd = openSync(RUN_LOG, 'r')
    try {
      const buf = Buffer.alloc(len)
      readSync(fd, buf, 0, len, size - len)
      return buf.toString('utf8')
    } finally { closeSync(fd) }
  } catch { return '' }
}

// --- THE DRILL: one real tick over a fake signature, with no side effect -------
// `--quota-report [segmentFile]` runs the REAL classification and the REAL
// decision, in this process, against the REAL state file — reading the spawn
// segment from the file named (default: the live run log) — prints the verdict as
// JSON and exits BEFORE the first side effect of a tick. Nothing is swept, nothing
// is spawned, nothing is written. scripts/quota-drill.mjs is its caller: it hands
// in a segment carrying a limit line and asserts what comes back.
{
  const i = process.argv.indexOf('--quota-report')
  if (i >= 0) {
    const arg = process.argv[i + 1]
    const file = arg && !arg.startsWith('--') ? arg : null
    let segment = ''
    if (file) { try { segment = readFileSync(file, 'utf8') } catch (e) { segment = ''; console.error(`unreadable segment file: ${e && e.message}`) } }
    else segment = readRunLogSegment(state.runLogAt)
    const quotaHit = detectQuotaSignature(segment)
    const outcome = judgeSpawnOutcome({
      verdict: 'failed',
      quotaHit,
      failCount: state.failCount || 0,
      quota: state.quota ?? null,
      now,
    })
    console.log(JSON.stringify({
      segmentBytes: segment.length,
      quotaHit,
      failCountBefore: state.failCount || 0,
      ...outcome,
      announce: announceSpawn({ quota: outcome.quota }),
    }))
    process.exit(0)
  }
}

// --- THE PAUSE DRILL: the real classification, no side effect (point 445) ------
// `--pause-report [recordFile]` reads a pause record — the one named, or the live
// `.claude/batch-paused` — runs the SAME classification the tick below runs, prints
// what the tick would do as JSON and exits BEFORE the first side effect. It clears
// nothing, spawns nothing and writes nothing, so scripts/pause-retry-drill.mjs can
// prove the wiring on a machine whose batch is running.
{
  const i = process.argv.indexOf('--pause-report')
  if (i >= 0) {
    const arg = process.argv[i + 1]
    const file = arg && !arg.startsWith('--') ? arg : C('batch-paused')
    let text = null
    try { text = readFileSync(file, 'utf8') } catch { text = null }
    const verdict = classifyPause({ text, now })
    console.log(JSON.stringify({
      file,
      now,
      ...verdict,
      // What the tick does with it: park (hold/wait) or resume (retry/none).
      parksTheTick: verdict.state === 'hold' || verdict.state === 'wait',
      clearsTheRecord: verdict.state === 'retry',
      note: describePause(verdict),
    }))
    process.exit(0)
  }
}

// --- LEAKED SPAWNS: reap what the removed runtime ceiling used to reap --------
// `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` means a `claude -p` waits forever for
// a background task — including one that never exits, which a left-running dev
// server routinely is. The 600-second ceiling used to end exactly those, and
// `state.lastPid` alone cannot track them because a handover overwrites it. A
// leaked session holds ports, and that breaks the next session's verify suites.
// --- THE FIREWALL TOP-UP: reachability decays while nobody looks ------------
// The container's allowlist is an ipset of ADDRESSES, filled at boot by
// `init-firewall.sh` from a `dig A` of each domain. Cloudflare-fronted hosts
// rotate theirs, so that snapshot goes stale WHILE THE SESSION RUNS — no restart
// needed. Measured 11.08.2026: after a restart at 22:04, chatgpt.com resolved to
// addresses that were not in the set, and every Sol review silently fell back to
// one of our own models, which costs the four-eyes rule the cross-vendor
// decorrelation it exists for. The boot script cannot fix this: it is baked into
// the image and runs once, and the addresses it wrote were already wrong minutes
// later.
//
// So the tick re-applies it. It is additive and cannot seal the container (that
// is the whole point of `firewall-allow.mjs`), and it needs no network of its own
// beyond DNS.
//
// IT IS DETACHED, NOT AWAITED (GPT-5.6 Sol, 11.08.2026). Run synchronously it sat
// in front of every later duty of the tick — the spawn decision, the chat inbox,
// the leaked-worker sweep — and `timeout` on a sync call is no ceiling at all:
// node signals the child and then waits for it to actually exit, so a wedged
// resolver stalls the launcher for as long as it likes. The top-up has no result
// this tick needs, so it is launched and let go: its own log records what it did,
// and the tick proceeds at once. A firewall hiccup must never be able to hold up
// the mechanism that keeps the batch alive.
// AND IT IS SINGLE-FILE (second review, 11.08.2026). A detached child belongs to no
// ledger — the tick's reaper only knows its own Claude workers — so one wedged in DNS
// would survive while every later tick started another, a slow pile-up nobody watches.
// The previous child's pid is therefore written down and probed first: while it still
// runs, this tick starts nothing and says so. A stale record is harmless (an unrelated
// pid at most costs one skipped tick), and the top-up is idempotent anyway.
// A LIVE PID IS NOT PROOF OF OUR CHILD, and a lost record is not proof of none
// (third review, 11.08.2026). `kill(pid, 0)` says only that SOMEBODY owns that
// number: after reuse an unrelated long-lived process would read as "busy" and
// suppress the top-up for as long as IT lives — not for one tick, forever. So the
// recorded pid is confirmed against what that process actually IS. And the record is
// written under the same try as the spawn: if it fails, the child is killed rather
// than left running unrecorded, because an untracked child is the very class this
// bounds.
try {
  const PIDFILE = C('firewall-topup.pid')
  const prev = Number(readFileSync(PIDFILE, 'utf8')) || 0
  let busy = false
  if (prev > 0) {
    try {
      // The identity check, not just liveness. Linux only; elsewhere the read throws
      // and `busy` stays false — starting a redundant top-up is the safe direction,
      // since it is idempotent and short.
      busy = readFileSync(`/proc/${prev}/cmdline`, 'utf8').includes('firewall-allow')
    } catch {
      busy = false
    }
  }
  if (busy) {
    log(`firewall top-up still running (pid ${prev}) — not starting a second`)
  } else {
    const out = openSync(C('firewall-topup.log'), 'a')
    const child = spawn(process.execPath, [R('firewall-allow.mjs')], {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', out, out],
      windowsHide: true,
    })
    child.on('error', (e) => log(`firewall top-up could not start (${(e && e.message) || e})`))
    try {
      if (child.pid) writeFileSync(PIDFILE, String(child.pid))
      child.unref()
    } catch (e) {
      try { if (child.pid) process.kill(child.pid) } catch { /* already gone */ }
      log(`firewall top-up stopped — its pid could not be recorded (${(e && e.message) || e})`)
    }
  }
} catch (e) {
  log(`firewall top-up skipped (${(e && e.message) || e})`)
}

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
  // Every fact in the report gets its own line, decided in the pure core. An
  // `if`/`else if` chain here could only ever tell ONE of them, and the fact it
  // dropped was the loudest: a refused drop notice in the very tick whose spool
  // write failed.
  for (const line of chatInboxLogLines(r)) log(line)
  pendingChat = Array.isArray(r.messages) ? r.messages : []
} catch (e) {
  log(`chat inbox skipped (${(e && e.message) || e})`)
}

// --- THE PAUSE RECORD AND ITS RESTART CLOCK (point 445) ------------------------
// A park used to end the batch until a human deleted `.claude/batch-paused`. Away
// for a fortnight, that turned a cause which clears itself in twenty minutes into
// the rest of the absence. So the record carries a RETRY-AFTER, and this tick is
// what acts on it: the clock runs out, the record goes, the attempt is noted, and
// the tick proceeds to its ordinary spawn decision — through the singleton and the
// claim, exactly as any other tick, so a retry can never double-spawn.
//
// A record WITHOUT a clock still parks for ever (`hold`): every marker an older
// session wrote, every one a human writes by hand, and the short written-down list
// of genuinely unsafe causes (CLOCKLESS_CAUSES) read the same way. A missing clock
// is never read as an expired one — that direction is the safe one.
//
// THE RUNAWAY COUNTER IS CLEARED WITH IT. `failCount` is what paused the batch in
// the first place, and it survives in the state file; left standing, the runaway
// guard below would re-pause this very tick and the clock would have bought
// nothing. A retry means the next spawn gets a fresh ladder — and if it fails
// again, the pause returns one rung higher.
const pause = classifyPause({ text: (() => { try { return readFileSync(C('batch-paused'), 'utf8') } catch { return null } })(), now })
let batchParked = pause.state === 'hold' || pause.state === 'wait'
if (pause.state === 'retry') {
  try { rmSync(C('batch-paused')) } catch { /* already gone — nothing to resume from */ }
  // A record that SURVIVED its removal keeps the batch parked: resuming while the
  // marker every other guard reads still lies there would run the batch against
  // its own stand-down.
  batchParked = existsSync(C('batch-paused'))
  if (batchParked) log(`PAUSE CLOCK EXPIRED but ${C('batch-paused')} could not be removed — staying parked`)
  else {
    state.pauseAttempt = (pause.attempt || 0) + 1
    state.pauseRetryAt = now
    state.failCount = 0
    log(describePause(pause))
    await notify(
      'Batch resumed itself',
      `The pause clock ran out (attempt ${state.pauseAttempt}) and the launcher resumed the batch. It was parked for: ` +
        `${(pause.reason || 'no reason recorded').split('\n')[0]}`,
      'low',
      { key: 'pause-retry' },
    )
  }
}

// --- THE MESSAGE WATCHER: this tick is its supervisor (point 407) --------------
// Stage 3 of the chat channel is a long-lived process subscribed to the inbox
// topic, so a message arriving into an IDLE machine wakes a light responder
// within seconds instead of at the next tick of this launcher.
//
// IT GETS NO TRIGGER OF ITS OWN. The launcher already runs every
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
  const sup = watcherSupervision({ paused: batchParked, record: rec, probe: probePid })
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
// The verdict was taken above (point 445), before the watcher supervision: a park
// with a clock still running waits it out, one without a clock waits for a human.
if (batchParked) {
  log(pause.state === 'retry' ? 'skip: the pause record outlived its own removal' : describePause(pause))
  bail()
}

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
  const out = execFileSync(
    process.execPath,
    [
      R('board-watchdog.mjs'),
      '--last-key',
      state.boardWatchKey ?? '',
      // THE CONSECUTIVE-FAILURE COUNT lives here, between ticks (point 562): the
      // child is a fresh process every quarter of an hour and can hold no memory
      // of its own, and only consecutive failures may escalate — one success
      // anywhere resets it to zero.
      '--streak',
      String(state.boardProbeStreak ?? 0),
    ],
    {
      windowsHide: true,
      cwd: REPO,
      encoding: 'utf8',
      // Two probes of two attempts with a brief pause between them (point 562)
      // fit far inside this; the child bounds every attempt at 15 s itself.
      timeout: 90000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const r = JSON.parse(out.trim().split('\n').filter(Boolean).pop())
  state.boardProbeStreak = Number(r.streak) || 0
  if (r.rescued) log('board: a probe failed and its immediate retry succeeded — a flicker, not a fault')
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

// --- STALE-SITE WATCHDOG (point 528) ------------------------------------------
// The same shape as the board watchdog above, for the other page this project
// publishes: the GAME at the site root. Every alarm this project had fired on a
// RED RUN — and on 06.08.2026 the run history was beside the point, because what
// hurt was that `main` stood at ee125053 while the site served c728c816 for
// hours and the user judged every render change against exactly that. A site can
// also go stale with no red run at all (a push that triggered nothing, a
// deployment that reported success and did not land), so the check asks the SITE,
// not the run list: the build emits its revision at `<site>/build-info.json`
// (scripts/build-info.mjs) and the child compares it with `main`, names both
// revisions, and re-dispatches the deploy once GitHub answers again.
//
// Its own process for the same two reasons: a `fetch` in this file would abort it
// at any of its fifteen exits, and the resurrection must be unreachable from a
// site check. Bounded and fail-open on top — a stale site may never be a reason
// the batch does not come back.
try {
  const out = execFileSync(process.execPath, [R('deploy-staleness.mjs')], {
    windowsHide: true,
    cwd: REPO,
    encoding: 'utf8',
    // 120 s, with headroom over the child's own bounds (20 s fetch + three 15 s
    // HTTP calls): an overrun is fail-open, but it also loses that tick's state
    // write and any alert it had decided, and the sum should not brush the cap.
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const r = JSON.parse(out.trim().split('\n').filter(Boolean).pop())
  if (r.verdict !== 'current') log(`deployed site: ${r.verdict} — ${r.reason ?? ''}`)
  if (r.dispatched) log(`deployed site: re-dispatched the deploy workflow (${r.dispatch})`)
  if (r.notified) log(`SITE ALERT: ${r.message}`)
} catch (e) {
  log(`stale-site watchdog skipped (${(e && e.message) || e})`)
}

let open
try { open = openPointCount() } catch { log('skip: cannot read TASKS.md'); bail() }
if (open === -1) { log('ALERT: TASKS.md format unrecognized — not spawning'); await notify('TASKS.md format', 'The batch parser found checkboxes but no points — halting resurrection to be safe.', 'high'); bail() }
if (open === 0) { log('skip: batch complete (0 open points)'); bail() }

// --- THE USER TOOK THE BATCH BACK (point 395) ---------------------------------
// A live claim RESERVES the batch for the window the user is sitting at.
// Spawning a headless successor into that reservation would take it straight back
// off them — the owner releases at its next clean turn end, and this tick could
// easily fall in between. The reservation OUTLIVES the release (point 461): a
// released record is never honoured again, but the freed lock stays that window's
// while its process lives, and this tick is exactly one of the automated
// acquirers the user's window used to have to race. The whole verdict — including
// the PICK-UP WINDOW after a release (point 446) and the line that says why — is
// `takeoverDecision`, which composes the one reading of a claim
// (`assessClaim` → `reservationDecision`) the resume hook, the boundary and the
// owner's Stop guard share, so the doors cannot drift apart and the launcher's
// own gate is provable in the fast layer. Same bounds as everywhere else: a claim
// from a closed window is ignored and the window caps an untaken one, so this can
// never strand the batch.
{
  const takeover = takeoverDecision({ claim: readClaim(), now, maxAgeMs: claimMaxAgeMs(), probePid })
  if (!takeover.spawn) {
    log(takeover.message)
    bail()
  }
}

const curHead = head()

// --- Owner liveness (the hard-singleton assessment) ---------------------------
// THE LEASE DECIDES (point 434, docs/batch-resilience.md §3 layer 1). The launcher
// no longer judges wedgedness at all: it reads whether the owner's lease has run
// out, which is arithmetic on two numbers, and everything else follows from the
// ordinary "not alive" path this file has always had. The declaration below is
// still read — but only to SAY what the owner was waiting on, never to decide.
// (`lock` and `probe` were read further up — the leak sweep needs them before any
// guard may exit.)
const declaration = lock ? readDeclaration() : null
// Read for the REPORT, not for the verdict: when the batch is taken from an owner
// whose lease ran out, the notification should name what that owner said it was
// doing. `LAUNCHER_WORK_MAX_AGE_MS` is the launcher's own window on a declaration.
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
// …AND FOR THE VERDICT TOO, SINCE POINT 556. An expired lease is necessary but no
// longer sufficient: the tick hands `work` in, and `leaseTakeoverDecision` inside
// `assessOwner` refuses to dispossess an owner whose pid is alive AND whose
// declared work is still moving. On 08.08.2026 this very tick printed both signals
// in the same line it used to take the batch anyway, producing the double session.
// The launcher is the ONLY caller that passes `work` — it is the only one that has
// it — so every other door keeps comparing numbers.
const assessment = assessOwner(lock, { now, bootTime: bootTimeMs(), probe, work })

// --- Verify the previous spawn ------------------------------------------------
// LIVING IS NOT WORKING (point 433, §4 of docs/batch-resilience.md). This used to
// count a failure ONLY when the spawn's pid was gone, so a successor that came up,
// wedged and kept breathing counted as a success forever — and a chain of such
// successors would burn a whole night's tokens while looking busy. The decision is
// pure (`judgePreviousSpawn`); this only gathers the three facts.
if (state.lastSpawnAt > 0) {
  const progressed = spawnProgressed({ curHead, lastHead: state.lastHead, lock, lastSpawnAt: state.lastSpawnAt })
  const proveMin = Number(process.env.HOA_SPAWN_PROVE_MIN)
  const v = judgePreviousSpawn({
    lastSpawnAt: state.lastSpawnAt,
    now,
    progressed,
    pidAlive: !!(state.lastPid && pidAlive(state.lastPid)),
    // The spawn proved the lock is its own the moment it converted the pending
    // lock to itself — then it is judged as the OWNER, by the wedge ladder above.
    lockConverted: !!(lock && lock.kind !== 'pending-spawn' && lock.pid === state.lastPid),
    proveMs: Number.isFinite(proveMin) && proveMin > 0 ? proveMin * 60000 : undefined,
  })
  // A QUOTA BLOCK IS A WAITING STATE (point 444). The verdict above cannot tell
  // a broken environment from a spent budget — both look like "the pid is gone" —
  // so a failed spawn's own output is read for the limit's signature before the
  // ladder is allowed to climb. The classification and the state machine are both
  // pure (`detectQuotaSignature`, `judgeSpawnOutcome`); this only gathers.
  const quotaHit = v.verdict === 'failed' ? detectQuotaSignature(readRunLogSegment(state.runLogAt)) : null
  const outcome = judgeSpawnOutcome({
    verdict: v.verdict,
    quotaHit,
    failCount: state.failCount || 0,
    quota: state.quota ?? null,
    now,
  })
  if (outcome.state === 'progress' && (state.failCount || 0) > 0) log(`previous spawn made progress — clearing failCount (${state.failCount})`)
  if (outcome.state === 'failed') log(`${v.reason} — failCount=${outcome.failCount}`)
  // Every probe and the moment work resumed go into the log, so the real reset
  // rhythm can be measured out of it instead of assumed.
  if (outcome.note) log(outcome.note)
  state.failCount = outcome.failCount
  // THE RETRY RUNG GOES WITH IT (point 445, four-eyes finding 2). `pauseAttempt`
  // counts the resumptions of ONE spell of trouble; a counter that survived a
  // recovery would make every park months later clockless on a ladder spent long
  // ago, silently retiring the restart clock.
  if (outcome.state === 'progress' && (state.pauseAttempt || 0) > 0) {
    log(`previous spawn made progress — clearing the pause retry rung (${state.pauseAttempt})`)
    delete state.pauseAttempt
    delete state.pauseRetryAt
  }
  if (outcome.quota) state.quota = outcome.quota
  else delete state.quota
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

// THE SILENCE REPORT IS GONE (point 434). It existed because the launcher could
// name a wedged owner and not act on it — "it may neither take over nor kill it"
// was its own text — so the best it could do was tell a person, in two stages, and
// hope. The lease removed the reason: an owner that stopped saying it was there
// stops owning the batch, and what used to be a notification is now the takeover
// below, which reports itself. One verdict, one consequence, one line.

// --- Runaway / stuck watchdog: pause + signal ----------------------------------
// It is NEVER reached by a quota block (point 444): a limit refusal counts no
// failure at all, so an unattended fortnight is no longer paused by a budget that
// comes back on the hour.
if (state.failCount >= RUNAWAY_FAIL_LIMIT) {
  // IT PARKS WITH A CLOCK (point 445). The causes this watchdog names — expired
  // auth, a push that fails, a point that keeps dying — include several that come
  // back on their own, and the ladder climbs (20 min, 1 h, 3 h) before the park
  // finally becomes a clockless one for a human. `pauseAttempt` is how many retries
  // this stall has already had.
  const plan = planPause({ cause: 'runaway', attempt: state.pauseAttempt || 0, now })
  const when = plan.clockless ? 'no restart clock — a human is needed' : `retry at ${new Date(plan.retryAfter).toISOString()}`
  log(`RUNAWAY: ${state.failCount} spawns with no git progress — pausing the batch (${when}) and notifying`)
  // ATOMICALLY (four-eyes finding 4): a torn record is the one corruption that
  // could flip this mechanism toward resuming — a half-written stamp read as a
  // past one. tmp + rename makes a half-written file unreachable.
  try {
    writeTextAtomic(C('batch-paused'), formatPauseRecord({
      reason: `autostart watchdog: ${state.failCount} resurrections made no progress (auth expired? model flag? failing point? push failing?) — investigate; the launcher retries when the clock below runs out.`,
      ...plan,
      pausedAt: now,
    }))
  } catch { /* ignore */ }
  await notify('Batch STALLED', `${state.failCount} headless resurrections made no progress since ${state.lastHead.slice(0, 7)}. Auto-paused (${when}). Check auth / git push / the current point.`, 'urgent')
  writeJsonAtomic(C('autostart-state.json'), { ...state })
  process.exit(0)
}

// --- Liveness verdict ----------------------------------------------------------
// TWO OUTCOMES, NOT THREE (point 434). 'skip-wedged' and everything under it —
// the stall verdict, the two-stage silence report, the wedge takeover, the
// kill-then-take valve — are gone. An owner whose lease ran out is not a third
// state to be adjudicated; it is simply not the owner, and the takeover below is
// the one this file has always performed for a dead one.
const verdict = lock ? spawnDecision(assessment) : 'spawn'
if (verdict === 'skip-alive') {
  const why = work.advancing ? `; declared work advancing — ${work.summary}` : ''
  log(`skip: owner alive (${assessment.reason}; heartbeat ${Math.round((now - lock.claimedAt) / 60000)} min old, pid ${lock.pid ?? 'unknown'}${why})`)
  // AND IT SAYS WHAT IT OVERRODE (point 556). A skip that silently swallowed an
  // expired lease would be the same blindness in the other direction: the morning
  // reader must be able to see that the arithmetic said "take it" and what
  // outvoted it, or the next incident is invisible in this log too.
  if (assessment.detail) log(`  ${assessment.detail}`)
  // A SKIP THAT OVERRODE AN EXPIRED LEASE IS NOT A HEALTHY TICK (four-eyes review
  // of point 556, confirmed finding 1). It must keep ESCALATING, or the one state
  // where the launcher deliberately declines to act would also be the one state
  // nobody is ever told about — an owner silent past its lease with something
  // still moving in the background would skip in silence tick after tick. The
  // override is time-capped in the core; this is what makes the run-up audible.
  if (assessment.reason === 'lease-expired-owner-working') {
    const rep = verdictRepeat({
      key: `${assessment.reason}#${ownerStateKey(lock)}`,
      lastKey: state.wedgeVerdictKey,
      repeats: state.wedgeVerdictRepeats,
    })
    state.wedgeVerdictKey = rep.key
    state.wedgeVerdictRepeats = rep.repeats
    if (rep.escalate) {
      log(`ESCALATING: the same owner has outvoted its expired lease for ${rep.repeats} launcher ticks`)
      await notify(
        'Batch owner silent past its lease',
        `${lock.sessionId} (pid ${lock.pid ?? 'unknown'}) has been silent past its lease for ${rep.repeats} ticks ` +
          'running. It is NOT being taken over because its declared work keeps producing output — but if that is a ' +
          'runaway rather than a long verification, only a person can tell. Please look.',
        'high',
      )
    }
    writeJsonAtomic(C('autostart-state.json'), state)
    process.exit(0)
  }
  // A healthy tick ENDS the repetition count (four-eyes nit on point 433 (c)):
  // without this a later, identically-worded episode of the same owner would
  // escalate on its second tick instead of its own count, because the key never
  // stopped matching. The direction is harmless either way, but "escalates after N
  // repeats" should mean N repeats of THIS episode.
  delete state.wedgeVerdictKey
  delete state.wedgeVerdictRepeats
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}
// A LEASE THAT RAN OUT IS REPORTED, ALWAYS (docs/batch-resilience.md §5: no silent
// recovery). The take itself happens through the ordinary atomic acquire further
// down; this says WHO lost the batch, for how long it had been quiet and what it
// had declared, so the morning reader finds the reason rather than a gap.
const dispossessed = !!lock && (assessment.reason === 'lease-expired' || assessment.reason === 'declared-wait-stale')
if (dispossessed) {
  const mins = Math.round((now - lock.claimedAt) / 60000)
  const what = declaration ? describeInFlight(work, declaration) : 'nothing declared'
  // REPETITION IS THE SIGNAL (point 433 (c)): if the same owner still reads
  // lease-expired a tick later, the takeover did NOT resolve the standstill, and
  // that — not the finding itself — is what a person needs to hear.
  const rep = verdictRepeat({
    key: `${assessment.reason}#${ownerStateKey(lock)}`,
    lastKey: state.wedgeVerdictKey,
    repeats: state.wedgeVerdictRepeats,
  })
  state.wedgeVerdictKey = rep.key
  state.wedgeVerdictRepeats = rep.repeats
  log(
    `LEASE EXPIRED: ${lock.sessionId} (pid ${lock.pid ?? 'unknown'}) has not renewed for ${mins} min — taking the ` +
      `batch. It keeps running and merely stops owning the batch; it was waiting on: ${what}`,
  )
  // WHICH CORROBORATING SIGNAL CAME BACK NEGATIVE (point 556). The lease alone no
  // longer takes anything, so the line above is only half the reason; this is the
  // other half, and it is what distinguishes a genuine recovery from the takeover
  // of 08.08.2026 that should never have happened.
  if (assessment.detail) log(`  ${assessment.detail}`)
  if (rep.escalate) {
    log(`ESCALATING: the same expired lease has stood for ${rep.repeats} launcher ticks — the takeover is not resolving it`)
    await notify(
      'Batch takeover NOT resolving',
      `The launcher has taken the batch from ${lock.sessionId} for the ${rep.repeats}. tick running — the lease keeps ` +
        `expiring and the standstill persists (silent ${mins} min, declared: ${what}). Please look.`,
      'urgent',
    )
  } else if (!rep.suppressLog) {
    await notify(
      'Batch lease expired',
      `The owning session (pid ${lock.pid ?? 'unknown'}) made no tool call for ${mins} minutes, so its lease ran out ` +
        `and the launcher is starting a successor. Nothing was killed — the old process keeps running and stands ` +
        `down at its next hook. It had declared: ${what}.`,
      'high',
    )
  }
}
if (dispossessed) {
  // Nothing is killed and nothing waits for an exit: the dispossessed process
  // keeps running and learns at its next hook that it no longer owns the batch,
  // which stands every ownership-gated guard down. The kill-then-take valve that
  // used to sit here needed an identity check it could rarely satisfy, and on the
  // lost night that check is exactly what stopped the rescue.
} else if (lock) {
  // "handed-over" is not death: the owner finished a point and passed the batch
  // on (point 388). Logged distinctly so the end-to-end chain can be READ out of
  // this file rather than inferred.
  // An IDLE release is neither death nor a handover: the owner reserved the batch
  // and never ran a thing (point 612). It is a routine, healthy transition — like
  // a handover — so it is logged distinctly and nobody's phone is buzzed for it.
  log(
    assessment.reason === 'handed-over'
      ? `HANDOVER accepted: ${lock.sessionId} handed the batch over${lock.handoverPoint ? ` at point ${lock.handoverPoint}` : ''} — spawning the successor`
      : assessment.reason === 'idle'
        ? `IDLE owner superseded: ${lock.sessionId} (pid ${lock.pid ?? 'unknown'}) held the batch without working — spawning the successor`
        : `owner provably dead (${assessment.reason}) — taking over`,
  )
  if (assessment.reason === 'idle' && assessment.detail) log(`  ${assessment.detail}`)
} else {
  // The headless path leaves no lock at all: a `claude -p` that ends at a
  // boundary exits, and SessionEnd releases the lock before this tick runs. Said
  // distinctly so the handover chain can be read from this file either way.
  log('no owner lock — taking over')
}

// Debounce, and it ESCALATES (point 433 (iii)): the base ten minutes is what a
// healthy spawn needs to come up, but each recorded failure doubles the wait up to
// the cap, so a refusing environment is no longer hammered at a fixed rate all
// night. `failCount` is cleared the moment a spawn makes progress, so the ladder
// falls back to the floor by itself.
// A standing QUOTA block short-circuits the ladder to its floor (point 444): the
// only way to learn that the budget is back is to try, and a refused start costs
// practically nothing, so the probe rides the ordinary tick.
const backoffMs = spawnBackoffMs({ failCount: state.failCount, quota: !!state.quota })
const lastSpawn = readJson(C('autostart-last.json'))
if (lastSpawn && typeof lastSpawn.at === 'number' && now - lastSpawn.at < backoffMs) {
  log(
    `skip: a spawn ${Math.round((now - lastSpawn.at) / 60000)} min ago is still claiming the lock ` +
      `(backoff ${Math.round(backoffMs / 60000)} min at failCount ${state.failCount || 0}` +
      `${state.quota ? `, quota block standing since ${new Date(state.quota.since).toISOString()}` : ''})`,
  )
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}

// --- ENVIRONMENT PREFLIGHT: a spawn into a broken environment is not a rescue ---
// Point 433 (i). The probes are deliberately CHEAP and local — no model call, no
// network — and they answer the question the design doc asks: can anything at all
// run here? What they cannot see is a permission service that refuses tool calls
// INSIDE a session (the 30.07.2026 outage); `judgePreviousSpawn` above is what
// catches that, one tick later, by refusing to call a breathing successor a success.
const preflight = judgeSpawnPreflight({ probes: environmentProbes() })
if (!preflight.ok) {
  state.failCount = (state.failCount || 0) + 1
  log(`PREFLIGHT REFUSED — not spawning: ${preflight.reason} (failCount=${state.failCount})`)
  await notify(
    'Batch spawn BLOCKED',
    `The launcher would have started a successor but the environment failed its preflight (${preflight.reason}). ` +
      'Spawning into a broken environment is not a rescue, so nothing was started. Please look at the machine.',
    'urgent',
  )
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}

// Point 442. The repo comes BEFORE the successor. A session that died mid-merge
// leaves the tree torn, and until 30.07.2026 the next one was started into it and
// had to notice by itself. The doctor already knew how to find and mend exactly
// this; nobody called it on the way in. It runs without `--gate`, so this stays a
// repo check of a second or two — the three-minute suite is a session's job, not a
// launcher tick's.
//
// It may WRITE only where the previous owner is provably gone. An expired LEASE is
// not that (four-eyes review): such a process is alive and merely silent, it stands
// down at its next hook, and stashing the merge it is resolving would destroy real
// work. There the check is read-only and the successor carries the mandate instead.
//
// And it never stops the spawn. A finding no repair clears is TRUE at every tick
// until somebody acts; refusing here would have stood the batch still for a whole
// unattended fortnight, so the successor starts and is TOLD. The alert is throttled
// as the standing condition it is, and `failCount` stays untouched — a torn tree is
// not a broken environment.
// (g) THE LEASE NO LONGER SHADOWS A PROVABLY DEAD PID (point 443). `assessOwner`
// tests the expired lease BEFORE it probes the pid, so an owner that is BOTH dead
// and lease-expired — the machine slept, the launcher was off for an hour, the
// likely shape of an unattended fortnight — read `lease-expired` and its tree went
// unmended for nothing. `repoRepairAllowed` now consults the probe on that branch.
const repaired = repoRepairAllowed(assessment.reason, { probe, lock })
const repo = runRepoDoctor(repaired)
const repoVerdict = repoRepairDecision({ ...repo, repaired })
log(`repo check before spawn: ${repoVerdict.reason}${repo.ran ? ` (batch-doctor exit ${repo.code}${repaired ? ', --repair' : ', read-only'})` : ''}`)
if (repoVerdict.alert) {
  const due = !repoVerdict.standing || standingAlertDue({ lastAt: state.repoAlertAt ?? null, now })
  if (due) {
    state.repoAlertAt = now
    await notify('Repo not clean before spawn', repoVerdict.alert, 'default')
  }
} else {
  delete state.repoAlertAt
  // And the MARKER goes with the condition (four-eyes re-review, finding 1). A tick
  // whose spawn failed leaves one behind; without this line only its 15-minute
  // expiry keeps the next, CLEAN tick from handing a false "repo not clean" to a
  // healthy successor — and that expiry equals the tick interval, i.e. about a
  // minute of margin. One deletion closes the class instead of leaning on timing.
  clearMandateMarker({ path: C('repo-mandate.json') })
}
if (repoVerdict.mandate) writeMandateMarker({ path: C('repo-mandate.json'), at: now, code: repo.code ?? null, reason: repoVerdict.reason })

/** Run the doctor and report how it went. `write` false keeps it to its read-only
 *  levels. Never throws: an unrunnable doctor is reported as such and decided
 *  fail-open above. */
function runRepoDoctor(write) {
  try {
    execFileSync(process.execPath, [join(REPO, 'scripts', 'batch-doctor.mjs'), ...(write ? ['--repair'] : [])], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 120000,
      windowsHide: true,
    })
    return { ran: true, code: 0 }
  } catch (e) {
    // A non-zero exit lands here too — that is the doctor's verdict, not a failure
    // to run it. Only a missing binary/file or the timeout means it never ran.
    if (e && typeof e.status === 'number') return { ran: true, code: e.status }
    return { ran: false, code: null, detail: (e && e.message) || String(e) }
  }
}

/** The cheap, local checks that must hold before a successor is worth starting. An
 *  UNRUNNABLE probe returns `ok: null` — inconclusive never blocks (the preflight
 *  must not become a new way for the batch to stand still). */
function environmentProbes() {
  const probes = []
  // 1. git answers — the successor's first act is reading the work order out of a
  //    checkout, and a repo that cannot be read cannot be worked in.
  try {
    const h = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8', timeout: 30000, windowsHide: true }).trim()
    probes.push({ name: 'git', ok: /^[0-9a-f]{40}$/.test(h), detail: h ? '' : 'git rev-parse HEAD returned nothing' })
  } catch (e) {
    probes.push({ name: 'git', ok: false, detail: `git rev-parse HEAD failed (${e && e.message})` })
  }
  // 2. the state directory is writable — every lock, marker and log the session
  //    needs lives there, and a read-only or full disk wedges a session silently.
  const canary = C(`preflight-${process.pid}.tmp`)
  try {
    writeFileSync(canary, `${now}\n`)
    rmSync(canary, { force: true })
    probes.push({ name: 'state-writable', ok: true })
  } catch (e) {
    probes.push({ name: 'state-writable', ok: false, detail: `cannot write ${canary} (${e && e.message})` })
  }
  return probes
}

// --- ATOMIC pending acquire: the launcher must WIN the lock before spawning ----
const launcherSid = `launcher-${randomUUID()}`
const acq = acquire(launcherSid, {
  kind: 'pending-spawn',
  pid: process.pid,
  pidStartedAt: now - Math.round(process.uptime() * 1000),
  // No special permission is asked for any more (point 434): an expired lease
  // reads as "not alive" inside acquire's reap mutex, exactly like a dead pid, so
  // an owner that renewed in the race window keeps its lock and this tick logs
  // "held". The take is recorded on the new lock so the morning reader can see
  // whose batch this was.
  extra: dispossessed
    ? { takenFromExpiredLease: { sessionId: lock.sessionId, pid: lock.pid ?? null, silentMs: now - lock.claimedAt } }
    : undefined,
})
if (acq !== 'acquired') {
  log(`skip: atomic acquire returned "${acq}" — a session claimed the lock in the race window; NOT spawning`)
  writeJsonAtomic(C('autostart-state.json'), state)
  process.exit(0)
}

// --- Find the CLI this host can spawn -----------------------------------------
// The lookup itself lives in batch-autostart-core.mjs, because the message
// watcher spawns the same executable and a second copy of this path would drift.
// It is host-neutral since point 490: the Windows-only shape cost three silent
// hours on the Linux host, so a failure here now NAMES what it searched.
const exe = resolveClaudeCli({
  readdir: readdirSync,
  exists: existsSync,
  // `existsSync` says yes to a directory as well, so the file test is injected:
  // a directory named `claude` on PATH must not be handed to `spawn`.
  isFile: (p) => {
    try {
      return statSync(p).isFile()
    } catch {
      return false
    }
  },
  join,
})
if (!exe) {
  release(launcherSid)
  const searched = cliSearchSummary()
  log(`FAIL: no claude CLI found — ${searched}`)
  await notify('claude CLI missing', `The autostart launcher found no claude CLI — resurrection is down. ${searched}`, 'urgent')
  // `bail`, not a bare exit (point 443 (h)). Everything this tick learned would
  // otherwise be thrown away — including `state.repoAlertAt`, which was set MINUTES
  // ago above. Losing it means the repo alert fires again at the very next tick,
  // and it is a STANDING condition: an already-alarming mode would then push a
  // second, unthrottled alarm every quarter of an hour for the whole absence.
  bail(1)
}

// Self-heal trust so a headless -p honours the allow-list (idempotent).
// Both halves of this are host-dependent and both were wrong before point 490:
// the config lives under CLAUDE_CONFIG_DIR where that is set (it is, on the Linux
// host — reading ~/.claude.json there found NOTHING and the heal only warned),
// and the project keys must be this repo's own spellings WITHOUT the trailing
// separator `REPO` carries. Both are decided in the pure core, where they are
// tested; a missing file is healed rather than treated as a failure.
try {
  const cfgPath = claudeConfigPath({ home: os.homedir(), join })
  const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {}
  cfg.projects ??= {}
  let changed = false
  for (const k of repoTrustKeys(REPO)) {
    cfg.projects[k] ??= {}
    if (cfg.projects[k].hasTrustDialogAccepted !== true) { cfg.projects[k].hasTrustDialogAccepted = true; changed = true }
  }
  if (changed) { const t = `${cfgPath}.tmp`; writeFileSync(t, JSON.stringify(cfg, null, 2)); renameSync(t, cfgPath); log('ensured repo trust in ~/.claude.json') }
} catch (e) { log(`warn: could not ensure trust (${e && e.message})`) }

// Author the run: verify-able spawn (log to file, record pid+head), atomic markers.
writeJsonAtomic(C('autostart-last.json'), { at: now, head: curHead })
log(
  `RESUMING: launching ${exe} -p (batch has ${open} open point(s), failCount=${state.failCount}` +
    `${state.quota ? `, QUOTA PROBE ${(state.quota.probes ?? 0) + 1}` : ''})`,
)
// Read BEFORE the spawn: everything appended past this offset is the child's own
// output, which is where the usage limit says so (point 444).
const runLogAt = runLogSize()
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
  // ENOENT, EACCES and EISDIR do NOT throw here — `spawn` reports them
  // ASYNCHRONOUSLY, so without this handler the one failure class the resolver
  // can still produce would take the tick down as an unhandled event instead of
  // through the loud path below (four-eyes review 04.08.2026, finding 4). The
  // bookkeeping past this point has already run by then, so the handler only
  // speaks — the runaway ladder does the rest at the next tick.
  child.on('error', (e) => {
    log(`FAIL: could not spawn claude (${e && e.message}) — exe ${exe}`)
    void notify('Spawn failed', `Could not launch the claude CLI at ${exe}: ${e && e.message}`, 'urgent')
  })
  child.unref()
} catch (e) {
  release(launcherSid)
  log(`FAIL: could not spawn claude (${e && e.message})`)
  await notify('Spawn failed', `Could not launch the claude CLI: ${e && e.message}`, 'urgent')
  bail(1) // same reason as the missing-exe path above (point 443 (h))
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
  // Where this spawn's own words begin in .claude/autostart-run.log (point 444).
  runLogAt,
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
// A PROBE UNDER A STANDING BLOCK IS NOT NEWS (point 444). Probing every quarter of
// an hour through a limit window would otherwise buzz an unattended phone all
// night for a condition that repairs itself; the probes stay in the log, and the
// first spawn after the block clears announces itself normally.
if (announceSpawn({ quota: state.quota })) {
  await notify('Resurrected', `No live session — launched a headless worker to continue the batch (${open} open, failCount ${state.failCount}). Progress on GitHub.`, 'low')
} else {
  log(`quota probe launched — no push (the block has stood ${Math.round((now - state.quota.since) / 60000)} min)`)
}
process.exit(0)
