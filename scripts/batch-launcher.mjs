// THE LINUX LAUNCHER (point 474, user 03.08.2026) — a self-scheduling daemon.
//
// On Windows the launcher is the Scheduled Task `HoA-Batch-Autostart`, which runs
// `scripts/batch-autostart.mjs` every 15 minutes and survives crashes and reboots.
// The Linux container the project moved to has NO OS scheduler at all — `cron`,
// `crond`, `systemctl` and `at` are absent and PID 1 is `sh` — so there is nothing
// to register the task as. Without a launcher the batch cannot hand over: the
// point boundary is refused while the launcher is not provably armed, which is
// correct (a stop with nothing to restart the batch ENDS it) and left an
// autonomous run on this host unable to end a session at all.
//
// So the trigger is rebuilt in the only place that is always available here: a
// detached node process that ticks on the same interval. ONLY THE TRIGGER. Each
// tick runs `scripts/batch-autostart.mjs` as a child, exactly as the task did, so
// the hard singleton, the claim reservation and the spawn decision are untouched
// — this file can never spawn a session past them, because it never spawns one.
//
// It refuses to run from a git WORKTREE, for the reason `chat-watcher.mjs` does:
// its record would land in a checkout nothing reads, and its tick would run the
// launcher with a throwaway tree as its working directory. On Windows it refuses
// outright and points at the Scheduled Task — a second launcher beside the task
// would be two triggers for one batch.
//
//   node scripts/batch-launcher.mjs --start    start it, detached
//   node scripts/batch-launcher.mjs --stop     stop it
//   node scripts/batch-launcher.mjs --status   what state it is in
//   node scripts/batch-launcher.mjs --daemon   INTERNAL: the loop itself
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { probePid, LAUNCHER_TICK_MS } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { pauseState } from './batch-lock.mjs'
import { describePause } from './batch-pause-core.mjs'
import {
  LAUNCHER_DAEMON_NAME,
  LAUNCHER_RECORD_VERSION,
  LAUNCHER_TASK_NAME,
  classifyDaemonRecord,
  launcherRemedy,
} from './batch-launcher-core.mjs'

export const LAUNCHER_RECORD_PATH = repoPath('.claude/batch-launcher.json')
export const LAUNCHER_LOG_PATH = repoPath('.claude/batch-launcher.log')
const SELF_PATH = fileURLToPath(import.meta.url)

/** How long a single tick may take before it is killed. One whole interval: the
 *  launcher's own work is seconds, and a tick still running when the next is due
 *  is wedged, not slow. */
export const TICK_TIMEOUT_MS = LAUNCHER_TICK_MS

/** How long `--start` waits for the child to publish its record before reporting
 *  what it sees. Node's own startup, not the tick's. */
const START_SETTLE_MS = 8000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** `.git` is a DIRECTORY in the real checkout and a FILE inside a worktree. */
export function inWorktree(root = REPO_ROOT) {
  try {
    return !statSync(join(root, '.git')).isDirectory()
  } catch {
    return false
  }
}

export function readLauncherRecord(path = LAUNCHER_RECORD_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * The daemon's state, read and judged: { state, record }. `state` is the raw
 * launcher vocabulary ('ready' | 'running' | 'disabled' | 'unknown') that
 * `classifyLauncherState` maps to armed/disabled/unknown — the same one the
 * Windows probe reads off the Scheduled Task.
 */
export function launcherState({
  recordPath = LAUNCHER_RECORD_PATH,
  now = Date.now(),
  tickMs = LAUNCHER_TICK_MS,
} = {}) {
  const record = readLauncherRecord(recordPath)
  const pid = Number(record?.pid)
  const probe = Number.isInteger(pid) && pid > 0 ? probePid(pid) : null
  return { state: classifyDaemonRecord({ record, probe, now, tickMs }), record }
}

function appendLog(logPath, line) {
  try {
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* a log that cannot be written must never take the launcher down */
  }
}

/**
 * ONE TICK: run `scripts/batch-autostart.mjs` exactly as the Scheduled Task did.
 * Its stdout/stderr go to the launcher log; its own decisions it records in
 * `.claude/autostart.log` as before. Resolves with the exit code (null when it
 * had to be killed); never rejects — a failed tick is a logged tick, not the end
 * of the launcher.
 */
export function runBatchTick({ logPath = LAUNCHER_LOG_PATH, timeoutMs = TICK_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let fd = 'ignore'
    try {
      mkdirSync(dirname(logPath), { recursive: true })
      fd = openSync(logPath, 'a')
    } catch {
      /* no log file — the tick still runs */
    }
    // The daemon runs for weeks and ticks ~96 times a day: a descriptor left open
    // per tick is a slow leak that would eventually take the launcher down, which
    // is the one process that must not die.
    const closeLog = () => {
      if (typeof fd !== 'number') return
      try {
        closeSync(fd)
      } catch {
        /* already closed */
      }
      fd = 'ignore'
    }
    let child
    try {
      child = spawn(process.execPath, [repoPath('scripts/batch-autostart.mjs')], {
        cwd: REPO_ROOT,
        stdio: ['ignore', fd, fd],
        windowsHide: true,
      })
    } catch (e) {
      closeLog()
      appendLog(logPath, `tick failed to start: ${(e && e.message) || e}`)
      resolve(null)
      return
    }
    const timer = setTimeout(() => {
      appendLog(logPath, `tick exceeded ${timeoutMs} ms — killed`)
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      closeLog()
      appendLog(logPath, `tick errored: ${(e && e.message) || e}`)
      resolve(null)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      closeLog()
      resolve(code)
    })
  })
}

/**
 * THE DAEMON LOOP. `tick` is injected so the loop can be exercised without
 * touching the batch — the same shape `lastWorkOrderTickSince` uses for `git`.
 *
 * IT RUNS ONCE, AND THE PUBLISH IS WHAT SAYS SO. The record used to be judged only
 * at the top: check, then publish — and two starts milliseconds apart both clear a
 * check nobody has published against yet. Node's own ~50–100 ms boot makes that
 * window trivial to hit, and six simultaneous starts left two to five daemons
 * ticking, every round. So the claim is made by the publish itself: ownership is
 * re-read immediately BEFORE every write, the record is one atomic rename, and
 * whoever wrote last owns it — every other daemon sees a live foreign pid at its
 * next publish and leaves WITHOUT writing. That converges to exactly one survivor,
 * because after the globally last write no other process writes again.
 *
 * The same read honours a STOP: a stop mark laid down after this daemon came up is
 * an order to it too, whichever pid the record names. Otherwise the loser of a race
 * outlives `--stop` and re-arms the record at its next tick, making the one promise
 * `--stop` exists to give — nothing will restart the batch — false.
 */
export async function runDaemon({
  tick = runBatchTick,
  recordPath = LAUNCHER_RECORD_PATH,
  logPath = LAUNCHER_LOG_PATH,
  tickMs = LAUNCHER_TICK_MS,
} = {}) {
  const existing = launcherState({ recordPath, tickMs })
  if ((existing.state === 'ready' || existing.state === 'running') && Number(existing.record?.pid) !== process.pid) {
    throw new Error(
      `a launcher daemon is already running (pid ${existing.record?.pid}, ${existing.state}) — nothing started.`,
    )
  }

  const probe = probePid(process.pid)
  const pidStartedAt =
    probe && typeof probe.startedAt === 'number'
      ? probe.startedAt
      : Date.now() - Math.round(process.uptime() * 1000)
  const startedAt = Date.now()
  const base = { v: LAUNCHER_RECORD_VERSION, name: LAUNCHER_DAEMON_NAME, pid: process.pid, pidStartedAt, startedAt, tickMs }
  let lastTickAt = startedAt
  let leaving = null
  /** Writes the record, unless somebody else's claim or a stop order says not to.
   *  Returns false when this daemon has just lost the singleton and must leave. */
  const publish = (patch = {}) => {
    const seen = launcherState({ recordPath, tickMs })
    if (seen.record?.stopped === true && Number(seen.record.stoppedAt) >= startedAt) {
      leaving = 'a stop was ordered'
      return false
    }
    if ((seen.state === 'ready' || seen.state === 'running') && Number(seen.record?.pid) !== process.pid) {
      leaving = `pid ${seen.record?.pid} holds the record (${seen.state})`
      return false
    }
    try {
      writeJsonAtomic(recordPath, { ...base, lastTickAt, ...patch })
    } catch (e) {
      appendLog(logPath, `record write failed: ${(e && e.message) || e}`)
    }
    return true
  }
  // Leaves the record exactly as it stands: the daemon that owns it is still
  // ticking, and a parting `stopped` mark from a loser would disarm a live
  // launcher — the same lie from the other side.
  const leave = () => {
    appendLog(logPath, `launcher leaving (pid ${process.pid}) — ${leaving}`)
    return 'yielded'
  }

  let stopping = false
  let wake = null
  const stop = (signal) => {
    stopping = true
    appendLog(logPath, `stopping on ${signal}`)
    if (wake) wake()
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))

  if (!publish()) return leave()
  appendLog(logPath, `launcher up (pid ${process.pid}, every ${Math.round(tickMs / 1000)} s)`)

  while (!stopping) {
    // Checked again right here, before the tick rather than after it: a daemon
    // that lost the record must not spend an interval running the batch first.
    if (!publish({ tickInFlight: true, tickStartedAt: Date.now() })) return leave()
    try {
      const code = await tick({ logPath })
      appendLog(logPath, `tick finished (exit ${code === null ? 'killed' : code})`)
    } catch (e) {
      appendLog(logPath, `tick threw: ${(e && e.message) || e}`)
    }
    lastTickAt = Date.now()
    if (!publish({ tickInFlight: false })) return leave()
    if (stopping) break
    // Interruptible: a stop signal must not have to wait out a whole interval.
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, tickMs)
      wake = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    wake = null
  }

  publish({ stopped: true, stoppedAt: Date.now() })
  appendLog(logPath, 'launcher down')
  return 'stopped'
}

/** Start the daemon detached, so it outlives the session that started it. */
export async function startDaemon({ recordPath = LAUNCHER_RECORD_PATH, tickMs = LAUNCHER_TICK_MS } = {}) {
  const before = launcherState({ recordPath, tickMs })
  if (before.state === 'ready' || before.state === 'running') {
    return { started: false, ...before, reason: 'already running' }
  }
  const child = spawn(process.execPath, [SELF_PATH, '--daemon'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  const deadline = Date.now() + START_SETTLE_MS
  for (;;) {
    const now = launcherState({ recordPath, tickMs })
    if (now.state === 'ready' || now.state === 'running') return { started: true, ...now }
    if (Date.now() >= deadline) return { started: false, ...now, reason: 'the daemon published no record' }
    await sleep(200)
  }
}

/**
 * Stop it, and RECORD that it was stopped — a disarmed launcher must be
 * distinguishable from an unreadable one, or the fix cannot be named.
 *
 * IT VERIFIES INSTEAD OF ASSUMING. Killing the recorded pid and then reporting the
 * mark it just wrote cannot tell "stopped" from "stopped one of them": anything
 * still alive republishes and the launcher is armed again, while `--stop` has
 * already promised that nothing will restart the batch. So the record is re-read
 * after the kill, and whatever still reads armed is stopped too — and the verdict
 * returned is the one the record actually gives, never the one that was written.
 */
export async function stopDaemon({
  recordPath = LAUNCHER_RECORD_PATH,
  tickMs = LAUNCHER_TICK_MS,
  rounds = 3,
} = {}) {
  const armed = (s) => s.state === 'ready' || s.state === 'running'
  let killed = false
  let state = launcherState({ recordPath, tickMs })
  for (let round = 0; round < rounds; round++) {
    const pid = Number(state.record?.pid)
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && probePid(pid).exists) {
      try {
        process.kill(pid, 'SIGTERM')
        killed = true
      } catch {
        /* gone between the probe and the signal */
      }
      const deadline = Date.now() + 5000
      while (probePid(pid).exists && Date.now() < deadline) await sleep(200)
      if (probePid(pid).exists) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          /* gone */
        }
        while (probePid(pid).exists && Date.now() < deadline + 2000) await sleep(100)
      }
    }
    // Written whatever happened: the daemon marks its own stop on SIGTERM, but a
    // killed or already-dead one cannot, and the state must still say "disabled"
    // rather than "unknown".
    try {
      writeJsonAtomic(recordPath, { ...(state.record ?? { v: LAUNCHER_RECORD_VERSION }), stopped: true, stoppedAt: Date.now() })
    } catch {
      /* reported through the state below */
    }
    // The moment a survivor would need to publish itself over that mark.
    await sleep(300)
    state = launcherState({ recordPath, tickMs })
    if (!armed(state)) break
  }
  return { killed, stopped: !armed(state), ...state }
}

// --- CLI ----------------------------------------------------------------------

if (isMainModule(import.meta.url)) {
  const arg = process.argv[2] ?? '--status'
  const remedy = launcherRemedy()

  const refuseOnWindows = () => {
    console.error(
      `on Windows the launcher is the Scheduled Task "${LAUNCHER_TASK_NAME}", not this daemon — two triggers for ` +
        `one batch is exactly the double-spawn the singleton exists to prevent. Arm it with \`${remedy.command}\` ` +
        'in an elevated PowerShell; read its state with `node scripts/batch-boundary.mjs --status`.',
    )
    process.exit(1)
  }
  const refuseWorktree = () => {
    console.error(
      'scripts/batch-launcher.mjs must not run from a git WORKTREE: its record would land in a checkout the ' +
        'guards never read, and its tick would run the launcher with a throwaway tree as its working directory. ' +
        'Run it from the main checkout.',
    )
    process.exit(1)
  }

  if (arg === '--status') {
    const s = launcherState()
    // The PARK is half the answer to "will anything happen?" (point 445): an armed
    // launcher whose every tick bails at a pause record is not a running batch, and
    // a clocked park says when it will be one again.
    const park = pauseState()
    console.log(JSON.stringify({ platform: process.platform, launcher: remedy.name, ...s, pause: park }, null, 2))
    if (process.platform === 'win32') {
      console.log(`\nOn Windows the launcher is the Scheduled Task "${LAUNCHER_TASK_NAME}" — this record is not it.`)
    } else if (s.state === 'ready' || s.state === 'running') {
      console.log(`\nThe launcher is ARMED (${s.state}).`)
    } else {
      console.log(`\nThe launcher is NOT armed (${s.state}). Start it: ${remedy.command}`)
    }
    if (park.state !== 'none') console.log(describePause(park))
  } else if (arg === '--start') {
    if (process.platform === 'win32') refuseOnWindows()
    if (inWorktree()) refuseWorktree()
    const r = await startDaemon()
    console.log(JSON.stringify(r, null, 2))
    console.log(
      r.started
        ? `\nLauncher started (pid ${r.record?.pid}). It ticks scripts/batch-autostart.mjs every ` +
            `${Math.round(LAUNCHER_TICK_MS / 60000)} min and survives this session.`
        : `\nNothing started: ${r.reason}.`,
    )
    process.exit(r.started || r.reason === 'already running' ? 0 : 1)
  } else if (arg === '--stop') {
    if (process.platform === 'win32') refuseOnWindows()
    const r = await stopDaemon()
    console.log(JSON.stringify(r, null, 2))
    console.log(
      r.stopped
        ? `\nThe launcher is now ${r.state}. Nothing will restart the batch until it is started again.`
        : `\nThe launcher is STILL ${r.state} (pid ${r.record?.pid}) — it was NOT stopped, and it will go on ` +
            'ticking. Run --stop again, and --status to read what it says.',
    )
    process.exit(r.stopped ? 0 : 1)
  } else if (arg === '--daemon') {
    if (process.platform === 'win32') refuseOnWindows()
    if (inWorktree()) refuseWorktree()
    try {
      await runDaemon()
    } catch (e) {
      console.error((e && e.message) || String(e))
      process.exit(1)
    }
  } else {
    console.error(`unknown argument "${arg}". Usage: --start | --stop | --status`)
    process.exit(1)
  }
}
