// THE BOOT PATH ON THE WINDOWS HOST, and the mutual watch between the two
// scheduled tasks that carry it (point 447, user 30.07.2026).
//
// WHY THIS EXISTS. The measured state of `HoA-Batch-Autostart` on the Windows
// host was ONE time trigger every 15 minutes with `StartWhenAvailable`, principal
// `Interactive` — so it runs only while the user is logged on, and only within a
// quarter of an hour of becoming able to. `AutoAdminLogon` is set there, so a
// reboot logs itself back in, but that path is UNPROVEN: the machine had been up
// since 24.07.2026 and an update restart can still stop at the lock screen. The
// batch would then stand still for the length of an absence with nothing saying
// so. Two gaps follow: the resume is slow (up to 15 min after a logon), and the
// one task that resurrects everything is itself a single point of failure —
// disabled, deleted or silently failing, nothing notices.
//
// The answer is a SECOND scheduled task that watches the first, and a first that
// watches the second, so neither is alone; plus an at-logon trigger, so the
// resume is instant. Registering and modifying scheduled tasks needs admin
// rights, which no agent here has — the arming is therefore ONE idempotent
// script the user runs once from an elevated shell
// (`scripts/windows/setup-boot-path.ps1`), and this module holds everything
// about it that must be provable WITHOUT that machine: the names, the cadence,
// the probe command, how a task report is read, and what a peer's state means.
//
// PURE. Every decision here is a function of its arguments — no file, no
// process, no clock of its own. The IO half lives in
// `scripts/windows-task-watch.mjs`, which is what both tasks actually run.

/** The primary launcher task. Restated rather than imported: this module must
 *  stay importable on a host that has no launcher module loaded, and the name is
 *  pinned against `LAUNCHER_TASK_NAME` by the test beside it, so the two can
 *  never drift apart unnoticed. */
export const PRIMARY_TASK_NAME = 'HoA-Batch-Autostart'

/** The watchdog task: at-startup trigger, repeating, runs whether or not a user
 *  is logged on. Its only job is that the primary keeps existing and running. */
export const WATCHDOG_TASK_NAME = 'HoA-Batch-Watchdog'

/** The repeat cadence both tasks use, in minutes — the primary's measured one. */
export const TASK_INTERVAL_MINUTES = 15

/** The watchdog's start delay after boot. It OFFSETS the two cadences so they
 *  never tick together: a watchdog that checked the primary in the same second
 *  the primary starts would read a task that has not yet recorded its run. */
export const WATCHDOG_OFFSET_MINUTES = 7

/** How long a peer may stay silent before its watcher starts it. Three intervals:
 *  one missed tick is normal on a busy machine (`StartWhenAvailable` defers), two
 *  is the margin, three is a task that is no longer running. */
export const PEER_MAX_SILENCE_MS = 3 * TASK_INTERVAL_MINUTES * 60 * 1000

/** Where the setup script exports each task's XML definition, so a watcher can
 *  RE-REGISTER a deleted peer instead of only reporting it gone. Git-ignored:
 *  the definition belongs to that one machine, not to the repository. */
export const TASK_DEFINITION_DIR = 'local/windows-tasks'

/** The one script that arms all of this, run once by the user, elevated. */
export const SETUP_SCRIPT_PATH = 'scripts/windows/setup-boot-path.ps1'

/** The script both tasks run to check the other. */
export const WATCH_SCRIPT_PATH = 'scripts/windows-task-watch.mjs'

/** Exit codes Task Scheduler reports for a task that is FINE: succeeded, ready,
 *  currently running, and never yet run. Anything else is a real last result. */
export const OK_TASK_RESULTS = new Set([0, 0x41300, 0x41301, 0x41303])

/** The role names the watch CLI accepts, mapped to the task each one names. */
export const TASK_NAMES = { primary: PRIMARY_TASK_NAME, watchdog: WATCHDOG_TASK_NAME }

/** The task a role name means. Unknown roles answer null — the CLI turns that
 *  into usage text rather than probing a task nobody named. */
export function taskNameFor(role) {
  return Object.hasOwn(TASK_NAMES, String(role ?? '')) ? TASK_NAMES[String(role)] : null
}

/** Where this task's exported definition lives, relative to the repository root. */
export function definitionPathFor(taskName) {
  return `${TASK_DEFINITION_DIR}/${taskName}.xml`
}

/**
 * The PowerShell one-liner that reports a task as JSON. PURE, so the test can
 * pin the command text without a Windows machine — the same shape
 * `probeLauncherState` is pinned in.
 *
 * `-ErrorAction Stop` on the lookup plus the catch make a MISSING task report
 * `{"exists":false}` rather than a non-zero exit, so the watcher can tell "no
 * such task" (re-register it) from "PowerShell failed" (judge nothing).
 */
export function taskProbeCommand(taskName) {
  // Written without an `if` expression inside the hashtable: that shape is
  // Windows-PowerShell-5.1-hostile, and 5.1 is what a bare `powershell` is.
  return [
    'try {',
    `$t = Get-ScheduledTask -TaskName '${taskName}' -ErrorAction Stop;`,
    `$i = Get-ScheduledTaskInfo -TaskName '${taskName}' -ErrorAction SilentlyContinue;`,
    '$lr = $null; $rc = $null;',
    'if ($i) { $rc = [int]$i.LastTaskResult; if ($i.LastRunTime) { $lr = $i.LastRunTime.ToUniversalTime().ToString(\'o\') } };',
    '[ordered]@{',
    'exists = $true;',
    `name = '${taskName}';`,
    'state = [string]$t.State;',
    'triggers = @(@($t.Triggers) | ForEach-Object { [string]$_.CimClass.CimClassName });',
    'actions = @(@($t.Actions) | ForEach-Object { ([string]$_.Execute + \' \' + [string]$_.Arguments).Trim() });',
    'lastRunTime = $lr;',
    'lastTaskResult = $rc;',
    '} | ConvertTo-Json -Compress -Depth 4',
    '} catch {',
    `@{ exists = $false; name = '${taskName}' } | ConvertTo-Json -Compress`,
    '}',
  ].join(' ')
}

/** Windows PowerShell 5.1 unwraps a one-element array on its way through
 *  `ConvertTo-Json`, so a task with exactly one trigger reports a bare string.
 *  Everything that reads a list reads it through here. */
function asArray(value) {
  if (Array.isArray(value)) return value
  return value === null || value === undefined ? [] : [value]
}

/** The trigger kinds a CIM class name means, in the shape a report states them. */
const TRIGGER_KINDS = [
  [/logon/i, 'logon'],
  [/boot/i, 'boot'],
  [/time/i, 'time'],
  [/daily/i, 'daily'],
  [/idle/i, 'idle'],
  [/registration/i, 'registration'],
  [/event/i, 'event'],
]

/** 'MSFT_TaskLogonTrigger' → 'logon'. An unrecognised class keeps its own name,
 *  so a report never silently loses a trigger the readiness check should show. */
export function triggerKind(cimClassName) {
  const raw = String(cimClassName ?? '').trim()
  if (!raw) return 'unknown'
  for (const [re, kind] of TRIGGER_KINDS) if (re.test(raw)) return kind
  return raw
}

/** Task Scheduler's numeric State enum, for a probe that emitted numbers. */
const STATE_BY_NUMBER = { 0: 'unknown', 1: 'disabled', 2: 'queued', 3: 'ready', 4: 'running' }

/** The state word a report states: lower-cased, numbers resolved, else 'unknown'. */
export function normalizeState(state) {
  if (state === null || state === undefined || state === '') return 'unknown'
  const raw = String(state).trim()
  if (/^\d+$/.test(raw)) return STATE_BY_NUMBER[raw] ?? 'unknown'
  const word = raw.toLowerCase()
  return ['disabled', 'queued', 'ready', 'running', 'unknown'].includes(word) ? word : 'unknown'
}

/**
 * A probe's stdout → the normalized report every consumer reads. PURE.
 *
 * Accepts the JSON text, an already-parsed object, or junk. Junk answers
 * `{ readable: false }` — deliberately NOT `exists: false`, because "PowerShell
 * printed something I cannot read" must never be mistaken for "the task is
 * gone" and re-register a task that is fine.
 */
export function parseTaskReport(raw, { taskName = null } = {}) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw.trim())
    } catch {
      return { readable: false, exists: false, name: taskName, state: 'unknown', triggers: [], actions: [], lastRunAt: null, lastResult: null }
    }
  }
  if (!data || typeof data !== 'object') {
    return { readable: false, exists: false, name: taskName, state: 'unknown', triggers: [], actions: [], lastRunAt: null, lastResult: null }
  }
  const exists = data.exists !== false
  const lastRunRaw = data.lastRunTime ?? data.LastRunTime ?? null
  const lastRunAt = lastRunRaw ? Date.parse(lastRunRaw) : null
  const lastResultRaw = data.lastTaskResult ?? data.LastTaskResult ?? null
  return {
    readable: true,
    exists,
    name: data.name ?? taskName ?? null,
    state: exists ? normalizeState(data.state) : 'absent',
    triggers: asArray(data.triggers).map(triggerKind),
    actions: asArray(data.actions).map((a) => String(a)),
    lastRunAt: Number.isFinite(lastRunAt) ? lastRunAt : null,
    lastResult: Number.isFinite(Number(lastResultRaw)) && lastResultRaw !== null ? Number(lastResultRaw) : null,
  }
}

/**
 * WHAT A PEER'S REPORT MEANS, and what its watcher should do about it. PURE.
 *
 * Returns { status, action, reason }, where `action` is one of
 * 'none' | 'register' | 'enable' | 'start'.
 *
 * The order is the order of severity, and each rung is deliberately the SMALLEST
 * repair that fixes it: a missing task is re-registered from its exported XML, a
 * disabled one is enabled, a silent one is started. A task that RAN but reported
 * a non-zero result is NOT restarted — the scheduling works, the payload failed,
 * and restarting a failing payload every quarter of an hour would turn one broken
 * run into a loop. It is reported, which is what the readiness check reads.
 */
export function peerVerdict({ report, now = Date.now(), maxSilenceMs = PEER_MAX_SILENCE_MS } = {}) {
  const r = report ?? {}
  if (r.readable === false) {
    return { status: 'unreadable', action: 'none', reason: 'the task probe returned nothing readable — judging nothing' }
  }
  if (!r.exists) {
    return { status: 'missing', action: 'register', reason: 'the task does not exist' }
  }
  if (r.state === 'disabled') {
    return { status: 'disabled', action: 'enable', reason: 'the task is disabled' }
  }
  if (r.state === 'running') {
    return { status: 'ok', action: 'none', reason: 'the task is running right now' }
  }
  if (r.lastRunAt === null) {
    return { status: 'never-ran', action: 'start', reason: 'the task has no recorded run' }
  }
  const silence = now - r.lastRunAt
  if (silence > maxSilenceMs) {
    return {
      status: 'stale',
      action: 'start',
      reason: `the task last ran ${Math.round(silence / 60000)} min ago (limit ${Math.round(maxSilenceMs / 60000)} min)`,
    }
  }
  if (r.lastResult !== null && !OK_TASK_RESULTS.has(r.lastResult)) {
    return {
      status: 'failing',
      action: 'none',
      reason: `the task ran ${Math.round(silence / 60000)} min ago but reported result 0x${(r.lastResult >>> 0).toString(16)}`,
    }
  }
  return { status: 'ok', action: 'none', reason: `the task ran ${Math.round(silence / 60000)} min ago` }
}

/**
 * The PowerShell command a verdict's action needs. PURE, and the ONLY place the
 * repair commands are written — the watcher runs exactly what this returns and
 * the documentation quotes it, so a remedy can never drift from what runs.
 *
 * `register` reads the definition the setup script exported. Without that file
 * there is nothing to re-register from, which the caller must handle: the
 * command is still returned so the message can name the missing path.
 */
export function remedyCommand(verdict, { taskName, definitionPath = null } = {}) {
  const name = String(taskName ?? '')
  const path = definitionPath ?? definitionPathFor(name)
  switch (verdict?.action) {
    case 'register':
      return `Register-ScheduledTask -TaskName '${name}' -Xml (Get-Content -Raw '${path}') -Force`
    case 'enable':
      return `Enable-ScheduledTask -TaskName '${name}'`
    case 'start':
      return `Start-ScheduledTask -TaskName '${name}'`
    default:
      return null
  }
}

/** One line per run, for the log and for a human reading `--json` output. */
export function formatVerdict({ taskName, verdict, applied = null } = {}) {
  const head = `${taskName}: ${verdict?.status ?? 'unknown'} — ${verdict?.reason ?? ''}`.trim()
  if (!applied) return head
  return `${head} → ${applied.ok ? 'repaired' : 'REPAIR FAILED'} (${applied.action}${applied.error ? `: ${applied.error}` : ''})`
}

/**
 * The watch CLI's arguments. PURE.
 *
 * `--check <role>` names the PEER to check, not the caller: the watchdog task
 * runs `--check primary`, the primary task runs `--check watchdog`. Repairs are
 * ON by default (that is the whole job) and `--dry-run` withholds them, so a
 * human can ask what would happen without changing the machine.
 */
export function parseWatchArgs(argv = []) {
  const out = { role: null, apply: true, json: false, help: false, error: null }
  const args = argv.slice()
  while (args.length) {
    const a = String(args.shift())
    if (a === '--check' || a === '--peer') {
      const role = String(args.shift() ?? '')
      if (!taskNameFor(role)) {
        out.error = `unknown role '${role}' — expected one of ${Object.keys(TASK_NAMES).join(', ')}`
        return out
      }
      out.role = role
    } else if (a === '--dry-run') {
      out.apply = false
    } else if (a === '--json') {
      out.json = true
    } else if (a === '--help' || a === '-h') {
      out.help = true
    } else {
      out.error = `unknown argument '${a}'`
      return out
    }
  }
  if (!out.help && !out.role) out.error = 'no role given — use --check primary|watchdog'
  return out
}
