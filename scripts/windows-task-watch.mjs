// THE MUTUAL WATCH between the two Windows scheduled tasks (point 447).
//
// Both tasks run THIS script, each naming the OTHER:
//   HoA-Batch-Watchdog   → node scripts/windows-task-watch.mjs --check primary
//   HoA-Batch-Autostart  → node scripts/windows-task-watch.mjs --check watchdog
//
// so neither task is a single point of failure. A peer that is gone is
// re-registered from the XML the setup script exported, a disabled one is
// enabled, a silent one is started; a peer that RAN and failed is reported, not
// restarted (see `peerVerdict` for why). Every run appends one line to
// `local/windows-task-watch.log`.
//
// Off Windows this is a no-op that exits 0: the Linux host has no Task
// Scheduler, its launcher is the daemon (`scripts/batch-launcher.mjs`), and a
// non-zero exit here would only teach a future caller to ignore this script.
//
// The decisions live in `scripts/windows-task-core.mjs` (pure, Vitest-covered);
// what is here is the process, the file and the clock — deliberately thin,
// because it is the half that cannot be tested from the container the project
// builds in.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import {
  SETUP_SCRIPT_PATH,
  TASK_DEFINITION_DIR,
  WATCH_SCRIPT_PATH,
  definitionPathFor,
  formatVerdict,
  parseTaskReport,
  parseWatchArgs,
  peerVerdict,
  remedyCommand,
  taskNameFor,
  taskProbeCommand,
} from './windows-task-core.mjs'

const LOG_PATH = 'local/windows-task-watch.log'

/** One PowerShell round trip. Returns stdout, or throws — the caller decides
 *  what a failure means, because "no answer" and "no task" differ. */
function powershell(command, { exec = execFileSync } = {}) {
  return String(
    exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }) ?? '',
  )
}

/** The peer's normalized report. An unreadable probe answers `readable: false`,
 *  which `peerVerdict` turns into "judge nothing" rather than "re-register". */
export function readTaskReport(taskName, { exec = execFileSync } = {}) {
  try {
    return parseTaskReport(powershell(taskProbeCommand(taskName), { exec }), { taskName })
  } catch {
    return parseTaskReport('', { taskName })
  }
}

/** Carry out a verdict's repair. Returns { action, ok, error, command }. */
export function applyRemedy(verdict, { taskName, exec = execFileSync, definitionExists = existsSync } = {}) {
  const action = verdict?.action ?? 'none'
  if (action === 'none') return null
  const relative = definitionPathFor(taskName)
  const command = remedyCommand(verdict, { taskName, definitionPath: repoPath(relative) })
  if (action === 'register' && !definitionExists(repoPath(relative))) {
    return {
      action,
      ok: false,
      command,
      error: `no exported definition at ${relative} — re-run ${SETUP_SCRIPT_PATH} elevated`,
    }
  }
  try {
    powershell(command, { exec })
    return { action, ok: true, command, error: null }
  } catch (e) {
    return { action, ok: false, command, error: e && e.message ? String(e.message).split('\n')[0] : 'unknown error' }
  }
}

/** Append one line to the watch log. Never throws: a log that cannot be written
 *  must not stop the repair it was going to describe. */
export function logLine(line, { path = repoPath(LOG_PATH), now = () => new Date() } = {}) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${now().toISOString()} ${line}\n`, 'utf8')
  } catch {
    /* the verdict still goes to stdout */
  }
}

/**
 * One watch run. Returns { taskName, report, verdict, applied } — the same shape
 * the readiness check (point 448) reads, which is why it is a return value and
 * not only printed.
 */
export function watchPeer(role, { apply = true, exec = execFileSync, now = Date.now() } = {}) {
  const taskName = taskNameFor(role)
  const report = readTaskReport(taskName, { exec })
  const verdict = peerVerdict({ report, now })
  const applied = apply ? applyRemedy(verdict, { taskName, exec }) : null
  return { taskName, report, verdict, applied }
}

const USAGE = [
  `usage: node ${WATCH_SCRIPT_PATH} --check primary|watchdog [--dry-run] [--json]`,
  '',
  '  --check <role>  the PEER to check (the watchdog checks the primary, and back)',
  '  --dry-run       report the verdict without changing anything',
  '  --json          print the report and verdict as JSON',
  '',
  `Definitions for a re-registration are exported to ${TASK_DEFINITION_DIR}/ by`,
  'scripts/windows/setup-boot-path.ps1, which the user runs once, elevated.',
].join('\n')

if (isMainModule(import.meta.url)) {
  const args = parseWatchArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${USAGE}\n`)
    process.exit(0)
  }
  if (args.error) {
    process.stderr.write(`${args.error}\n\n${USAGE}\n`)
    process.exit(2)
  }
  if (process.platform !== 'win32') {
    // Not an error: this host's launcher is the daemon, not a scheduled task.
    process.stdout.write(`windows-task-watch: no Task Scheduler on ${process.platform} — nothing to watch\n`)
    process.exit(0)
  }
  const result = watchPeer(args.role, { apply: args.apply })
  const line = formatVerdict({ taskName: result.taskName, verdict: result.verdict, applied: result.applied })
  if (args.json) process.stdout.write(`${JSON.stringify(result)}\n`)
  else process.stdout.write(`${line}\n`)
  // Only a repair that was ATTEMPTED and FAILED is an error: everything else —
  // healthy, repaired, or unreadable — leaves the scheduler's last result at 0,
  // so the peer's own check does not read this run as a failure.
  if (result.applied && !result.applied.ok) {
    logLine(line)
    process.exit(1)
  }
  if (result.verdict.status !== 'ok') logLine(line)
  process.exit(0)
}
