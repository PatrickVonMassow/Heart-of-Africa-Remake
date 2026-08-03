// Pure core of the LAUNCHER, on both hosts (point 474, user 03.08.2026).
//
// WHY THIS EXISTS. The repository moved from a Windows host to a Linux container,
// and the batch machinery did not come along. The blocking finding was not the
// launcher itself but what depends on it: `probeLauncherState` answered 'unknown'
// off win32, `batch-progress-guard` reads 'unknown' as NOT armed, so on Linux no
// point boundary could ever be verified — the one stop the batch is allowed to
// make was refused, and an autonomous run could not hand over at all.
//
// The container has NO OS scheduler (`cron`, `crond`, `systemctl` and `at` are all
// absent, PID 1 is `sh`), so the Windows Scheduled Task has nothing to be
// re-registered as. The Linux launcher is therefore a self-scheduling detached
// node daemon (`scripts/batch-launcher.mjs`) that ticks `batch-autostart.mjs` on
// the same interval the task used. Only the TRIGGER changes; the tick path — and
// with it the hard singleton — is untouched.
//
// This module holds the two decisions that must be provable without a machine:
// which launcher a host has (and how it is armed), and whether a daemon RECORD
// found on disk means the launcher is armed. Everything impure — the pid probe,
// the file, the spawn — lives in `scripts/batch-launcher.mjs`.

/** The Windows launcher: a Scheduled Task, armed and disarmed by the user. */
export const LAUNCHER_TASK_NAME = 'HoA-Batch-Autostart'

/** The Linux launcher: this repository's own detached daemon. */
export const LAUNCHER_DAEMON_NAME = 'hoa-batch-launcher'

/** The daemon record's schema version. A record written by another version is
 *  not interpreted — see `classifyDaemonRecord`, where that reads as 'unknown'
 *  (not armed), which is the safe direction: it costs a restart, never the batch. */
export const LAUNCHER_RECORD_VERSION = 1

/** How many missed ticks make a daemon record STALE. The daemon writes the
 *  record before and after every tick, so one whole silent interval is already
 *  abnormal; two is the margin that keeps a slow tick from disarming a healthy
 *  launcher. */
export const LAUNCHER_STALE_TICKS = 2

/** Start times within this tolerance count as the same process. Same reasoning
 *  as `PID_START_TOLERANCE_MS` in scripts/batch-singleton.mjs — a recycled pid
 *  must never inherit a dead daemon's armed verdict — restated here rather than
 *  imported, because this module stays pure and that one is the IO half. */
export const LAUNCHER_PID_TOLERANCE_MS = 2000

/**
 * WHICH LAUNCHER THIS HOST HAS, and how it is armed. PURE.
 *
 * Both hosts are described because both are real: the project must keep running
 * on the Windows host exactly as it did, and the container is where it runs
 * today. The difference that matters to a message is WHO can arm it — on Windows
 * only the user, from an elevated PowerShell; on Linux the session itself, because
 * the daemon is an ordinary user process.
 *
 * Returns { name, command, byUser, how }, where `how` is the sentence fragment a
 * guard or a CLI drops into its own text, so the two can never drift apart.
 */
export function launcherRemedy(platform = process.platform) {
  if (platform === 'win32') {
    const command = `Enable-ScheduledTask -TaskName '${LAUNCHER_TASK_NAME}'`
    return {
      name: LAUNCHER_TASK_NAME,
      command,
      byUser: true,
      how: `the user must run \`${command}\` in an elevated PowerShell (the assistant cannot)`,
    }
  }
  const command = 'node scripts/batch-launcher.mjs --start'
  return {
    name: LAUNCHER_DAEMON_NAME,
    command,
    byUser: false,
    how:
      `run \`${command}\` — this host has no OS scheduler, so the launcher is a detached node daemon ` +
      'this session may start itself',
  }
}

/**
 * IS THE DAEMON ARMED, judged from its own recorded state? PURE.
 *
 * Answers in the SAME vocabulary the Windows probe reads off `Get-ScheduledTask`
 * — 'ready' / 'running' / 'disabled' / 'unknown' — so both hosts feed one
 * `classifyLauncherState` and `batch-progress-guard` sees one verdict.
 *
 * Inputs are plain data:
 *   record     — the parsed `.claude/batch-launcher.json`, or null
 *   probe      — { exists, startedAt } for `record.pid` (null when there is none)
 *   now        — epoch ms
 *   tickMs     — the interval to judge freshness by, when the record names none
 *   staleTicks — how many silent intervals disarm it
 *
 * AN ARMED VERDICT IS NEVER GRANTED BY THE MERE PRESENCE OF A FILE. A record whose
 * pid is dead, whose pid was recycled, whose last tick is older than the margin, or
 * whose schema this code does not know all read 'unknown' — which the guard treats
 * as not armed. The asymmetry is the boundary's own: erring toward "keep working"
 * costs context, erring toward "stop" can cost the whole batch.
 */
export function classifyDaemonRecord({
  record,
  probe,
  now,
  tickMs,
  staleTicks = LAUNCHER_STALE_TICKS,
} = {}) {
  if (!record || typeof record !== 'object') return 'unknown'
  // A daemon that was STOPPED says so, and says it even after its process is
  // gone. That is a disarmed launcher, not an unreadable one, and the difference
  // is what lets a message name the right fix.
  if (record.stopped === true) return 'disabled'
  if (record.v !== LAUNCHER_RECORD_VERSION) return 'unknown'

  const pid = Number(record.pid)
  if (!Number.isInteger(pid) || pid <= 0) return 'unknown'
  if (!probe || typeof probe !== 'object' || probe.exists !== true) return 'unknown'
  // A probe that could not read a start time answers null, and `Number(null)` is
  // a perfectly finite 0 — so the absence is checked before the arithmetic, or an
  // unreadable start time would read as "started at the epoch" and disarm every
  // healthy daemon.
  const recorded = record.pidStartedAt == null ? NaN : Number(record.pidStartedAt)
  const observed = probe.startedAt == null ? NaN : Number(probe.startedAt)
  if (
    Number.isFinite(recorded) &&
    Number.isFinite(observed) &&
    Math.abs(recorded - observed) > LAUNCHER_PID_TOLERANCE_MS
  ) {
    return 'unknown' // the pid was recycled — this is somebody else's process
  }

  const interval = Number.isFinite(Number(record.tickMs)) && Number(record.tickMs) > 0
    ? Number(record.tickMs)
    : Number(tickMs)
  if (!Number.isFinite(interval) || interval <= 0) return 'unknown'
  const lastSeen = Math.max(Number(record.lastTickAt) || 0, Number(record.startedAt) || 0)
  if (!(lastSeen > 0) || !Number.isFinite(Number(now))) return 'unknown'
  if (Number(now) - lastSeen >= interval * staleTicks) return 'unknown'

  // Mid-tick is a state of its own, and the Windows vocabulary already has the
  // word for it. Both readings are armed.
  return record.tickInFlight === true ? 'running' : 'ready'
}
