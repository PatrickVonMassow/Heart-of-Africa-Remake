// Probe the machine, then let machine-load-core.mjs judge it (point 296).
//
// Everything impure lives here: two `os.cpus()` samples a moment apart, the OS
// process table, and the repo path a leftover is matched against. The verdict,
// the stray classification and the proceed/flag/defer decision are pure and
// pinned in scripts/verify/machine-load.test.mjs.
//
// Standalone — ask BEFORE you spend a browser run (CLAUDE.md §7.2, "ask the
// guards before the action"):
//
//   node scripts/verify/machine-load.mjs            # report; exit 0 quiet, 2 not quiet
//   node scripts/verify/machine-load.mjs --json     # the same as machine-readable JSON
//   node scripts/verify/machine-load.mjs --suites enrichments,polish
//
// FAIL-OPEN: every step is guarded. A probe that cannot read the machine returns
// `ok: false`, which classifies as UNKNOWN — reported, never mistaken for quiet,
// and never a reason to stop a run.
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../is-main.mjs'
import {
  LEVEL, classifyLoad, cpuBusyFraction, decideRun, formatLoadReport, onLoadMode, parsePsOutput,
  parseWindowsProcessJson, strayProcesses,
} from './machine-load-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

/** How long the CPU delta is sampled. Long enough to see a build, short enough
 *  that nobody is tempted to switch the check off. */
const SAMPLE_MS = Number(process.env.VERIFY_LOAD_SAMPLE_MS) || 600
/** The process table is a means, not the goal: a slow WMI call must never hold
 *  a regression, so it is killed and the probe carries on without strays. */
const PS_TIMEOUT_MS = 15000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The MAIN worktree's root, lowercased with forward slashes — the marker that
 * decides `fromThisRepo`. Derived from the git COMMON dir so a leftover started
 * in the main tree is still recognised as ours while this code runs from a
 * worktree under it (and vice versa).
 */
export function repoMarker(cwd = REPO) {
  let root = cwd
  try {
    const res = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd, encoding: 'utf8', timeout: 5000,
    })
    const common = (res.stdout ?? '').trim()
    if (res.status === 0 && common) root = common.replace(/[\\/]\.git\/?$/, '')
  } catch {
    /* no git, no better marker — the checkout path below still works */
  }
  return root.replace(/\\/g, '/').toLowerCase()
}

/** The OS process table as `{ pid, ppid, name, cmd }` rows; [] when unreadable. */
export function listProcesses() {
  try {
    if (process.platform === 'win32') {
      const res = spawnSync(
        'powershell',
        [
          '-NoProfile', '-NonInteractive', '-Command',
          'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8', timeout: PS_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      )
      return parseWindowsProcessJson(res.stdout ?? '')
    }
    const res = spawnSync('ps', ['-axo', 'pid=,ppid=,comm=,args='], {
      encoding: 'utf8', timeout: PS_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024,
    })
    return parsePsOutput(res.stdout ?? '')
  } catch {
    return []
  }
}

/**
 * One reading of the machine: the CPU busy fraction over `sampleMs`, the POSIX
 * run queue per core (0 on Windows, where the core ignores it) and the strays.
 * `ok` is false only when NOTHING could be read — a missing process table alone
 * still leaves a usable CPU verdict, and is reported as `processTable: false`.
 */
export async function probeMachine({ sampleMs = SAMPLE_MS, pid = process.pid } = {}) {
  try {
    // The process table FIRST and outside the CPU window: the WMI/ps call costs
    // a core for about a second, and sampling across it would charge the probe's
    // own cost to the machine it is judging.
    const processes = listProcesses()
    const before = os.cpus()
    await sleep(Math.max(0, sampleMs))
    const after = os.cpus()
    const cpu = cpuBusyFraction(before, after)
    const load = os.loadavg?.()?.[0] ?? 0
    const cores = os.cpus()?.length || 1
    const strays = processes.length ? strayProcesses({ processes, pid, repoMarker: repoMarker() }) : []
    return {
      ok: cpu !== null || processes.length > 0,
      cpuBusyFraction: cpu,
      loadAvgPerCore: load > 0 ? load / cores : null,
      cpuCount: cores,
      processTable: processes.length > 0,
      strays,
    }
  } catch {
    return { ok: false, cpuBusyFraction: null, loadAvgPerCore: null, cpuCount: null, processTable: false, strays: [] }
  }
}

/**
 * Probe + classify in one call, fail-open. Returns the classification with the
 * raw probe attached; a thrown probe yields UNKNOWN rather than an exception —
 * a run must never die because the load check did.
 */
export async function readMachine(options = {}) {
  try {
    const probe = await probeMachine(options)
    return { ...classifyLoad(probe), probe }
  } catch {
    return { ...classifyLoad({ ok: false }), probe: null }
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const suitesArg = (argv.find((a) => a.startsWith('--suites=')) ?? '').split('=')[1]
  const suites = suitesArg ? suitesArg.split(',').map((s) => s.trim()).filter(Boolean) : ['enrichments', 'polish', 'settings']
  const load = await readMachine()
  const decision = decideRun({ suites, level: load.level, mode: onLoadMode({ flags: argv, env: process.env.VERIFY_ON_LOAD }) })
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ level: load.level, reasons: load.reasons, strays: load.strays, decision }, null, 2))
  } else {
    for (const line of formatLoadReport({ load, decision })) console.log(line)
  }
  // 0 = quiet (or unreadable — fail-open), 2 = measurably not quiet, so a caller
  // can chain `node scripts/verify/machine-load.mjs && npm test -- enrichments`.
  process.exit(load.level === LEVEL.quiet || load.level === LEVEL.unknown ? 0 : 2)
}
