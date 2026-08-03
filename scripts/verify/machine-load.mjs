// Probe the machine, then let machine-load-core.mjs judge it (point 296/386).
//
// Everything impure lives here: two `os.cpus()` samples a moment apart, the OS
// process table, the per-adapter GPU engine counters, and the repo path a
// leftover is matched against. The verdict, the stray classification and the
// proceed/flag/defer decision are pure and pinned in
// scripts/verify/machine-load.test.mjs.
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
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../is-main.mjs'
import {
  LEVEL, classifyLoad, cpuBusyFraction, decideRun, forcedLevel, formatLoadReport, gpuEngineUtilisation,
  onLoadMode, parseGpuCounterJson, parsePercentUtilisation, parsePsOutput, parseWindowsProcessJson,
  strayProcesses,
} from './machine-load-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

/** How long the CPU delta is sampled. Long enough to see a build, short enough
 *  that nobody is tempted to switch the check off. */
const SAMPLE_MS = Number(process.env.VERIFY_LOAD_SAMPLE_MS) || 600
/** The process table is a means, not the goal: a slow WMI call must never hold
 *  a regression, so it is killed and the probe carries on without strays. */
const PS_TIMEOUT_MS = 15000
/** The GPU counter read costs ~1.5 s here; anything beyond this is a hung
 *  performance-counter service, which is a "not measured", not a reason to wait. */
const GPU_TIMEOUT_MS = 10000

/**
 * Read the per-adapter GPU engine utilisation — the counters the task manager's
 * GPU graph is drawn from, available on Windows without a new dependency.
 *
 * Zero rows are dropped on the PowerShell side (the table is ~250 instances, of
 * which a handful are non-zero) but their COUNT is carried across, so an adapter
 * genuinely idle stays distinguishable from a machine with no such counter.
 *
 * A localized Windows names its counters in the UI language. Perflib keeps the
 * English list under `009` and the localized one under `CurrentLanguage`, both as
 * (id, name) pairs, so the English name is tried first and resolved through the
 * ID when it misses. The join is on the ID rather than on the array position:
 * identical ordering is usual but nothing guarantees it, and a positional join
 * that slipped would build a plausible WRONG path instead of failing.
 */
const GPU_COUNTER_PS = `
$ErrorActionPreference = 'Stop'
try {
  try { $s = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples }
  catch {
    $base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Perflib'
    $en = (Get-ItemProperty "$base\\009").Counter
    $loc = (Get-ItemProperty "$base\\CurrentLanguage").Counter
    $localizedById = @{}
    for ($i = 0; $i -lt $loc.Length - 1; $i += 2) { $localizedById[$loc[$i]] = $loc[$i + 1] }
    $map = @{}
    for ($i = 0; $i -lt $en.Length - 1; $i += 2) { if (-not $map.ContainsKey($en[$i + 1])) { $map[$en[$i + 1]] = $localizedById[$en[$i]] } }
    $path = '\\{0}(*)\\{1}' -f $map['GPU Engine'], $map['Utilization Percentage']
    $s = (Get-Counter $path -ErrorAction Stop).CounterSamples
  }
  @{
    count = @($s).Count
    samples = @($s | Where-Object { $_.CookedValue -gt 0 } | ForEach-Object { @{ i = $_.InstanceName; v = [double]$_.CookedValue } })
  } | ConvertTo-Json -Compress -Depth 4
} catch {
  @{ error = "$($_.Exception.Message)" } | ConvertTo-Json -Compress
}
`

/** Where a Linux driver publishes its own busy percentage. amdgpu's shape, copied
 *  by several others; absent on the drivers that publish nothing. */
const DRM_BUSY_GLOB = '/sys/class/drm'

/**
 * LINUX: the busiest device, read without a new dependency (point 474). Two
 * sources in order of directness — the driver's own sysfs counter first, then
 * `nvidia-smi` where it is installed. Neither present is an honest `unreadable`,
 * never a comforting zero: the load gate must say it is blind rather than certify
 * a machine it did not measure.
 */
function readLinuxGpuUtilisation() {
  const readings = []
  try {
    for (const card of readdirSync(DRM_BUSY_GLOB)) {
      try {
        readings.push(readFileSync(join(DRM_BUSY_GLOB, card, 'device', 'gpu_busy_percent'), 'utf8'))
      } catch {
        /* this card publishes no busy counter — the next one may */
      }
    }
  } catch {
    /* no /sys/class/drm at all (a container without one) */
  }
  const fromSysfs = parsePercentUtilisation(readings)
  if (fromSysfs !== null) return { fraction: fromSysfs, unreadable: null }
  try {
    const res = spawnSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], {
      encoding: 'utf8', timeout: GPU_TIMEOUT_MS, maxBuffer: 1024 * 1024,
    })
    if (res.status === 0) {
      const fromSmi = parsePercentUtilisation([res.stdout ?? ''])
      if (fromSmi !== null) return { fraction: fromSmi, unreadable: null }
    }
  } catch {
    /* nvidia-smi absent or unusable — reported as unreadable below */
  }
  return {
    fraction: null,
    unreadable: 'no GPU busy counter on this host (no sysfs gpu_busy_percent, no nvidia-smi)',
  }
}

/**
 * `{ fraction, unreadable }` — the busiest engine as a fraction in [0,1], or a
 * one-line reason why the device could not be read. Never throws.
 */
export function readGpuUtilisation() {
  if (process.platform !== 'win32') {
    try {
      return readLinuxGpuUtilisation()
    } catch {
      return { fraction: null, unreadable: 'the GPU counter read failed' }
    }
  }
  try {
    const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', GPU_COUNTER_PS], {
      encoding: 'utf8', timeout: GPU_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    })
    const parsed = parseGpuCounterJson(res.stdout ?? '')
    if (parsed.error) return { fraction: null, unreadable: parsed.error }
    const fraction = gpuEngineUtilisation(parsed)
    return fraction === null
      ? { fraction: null, unreadable: 'the GPU engine counter reported no adapter' }
      : { fraction, unreadable: null }
  } catch {
    return { fraction: null, unreadable: 'the GPU counter read failed' }
  }
}

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
      windowsHide: true,
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
      windowsHide: true,
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
    // The process table and the GPU counters FIRST, outside the CPU window: both
    // calls cost a core for about a second, and sampling across them would charge
    // the probe's own cost to the machine it is judging.
    const processes = listProcesses()
    const gpu = readGpuUtilisation()
    const before = os.cpus()
    await sleep(Math.max(0, sampleMs))
    const after = os.cpus()
    const cpu = cpuBusyFraction(before, after)
    const load = os.loadavg?.()?.[0] ?? 0
    const cores = os.cpus()?.length || 1
    const strays = processes.length ? strayProcesses({ processes, pid, repoMarker: repoMarker() }) : []
    return {
      ok: cpu !== null || processes.length > 0 || gpu.fraction !== null,
      cpuBusyFraction: cpu,
      gpuBusyFraction: gpu.fraction,
      gpuUnreadable: gpu.unreadable,
      loadAvgPerCore: load > 0 ? load / cores : null,
      cpuCount: cores,
      processTable: processes.length > 0,
      strays,
    }
  } catch {
    return {
      ok: false, cpuBusyFraction: null, gpuBusyFraction: null, gpuUnreadable: null,
      loadAvgPerCore: null, cpuCount: null, processTable: false, strays: [],
    }
  }
}

/**
 * Probe + classify in one call, fail-open. Returns the classification with the
 * raw probe attached; a thrown probe yields UNKNOWN rather than an exception —
 * a run must never die because the load check did.
 */
export async function readMachine(options = {}) {
  try {
    const forced = forcedLevel(process.env.VERIFY_LOAD_FORCE)
    if (forced) {
      return {
        level: forced,
        reasons: [`VERIFY_LOAD_FORCE=${forced} — the machine was NOT measured; this is the wiring self-test`],
        strays: [],
        probe: null,
      }
    }
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
    console.log(JSON.stringify({
      level: load.level,
      reasons: load.reasons,
      cpuBusyFraction: load.cpuBusyFraction ?? null,
      gpuBusyFraction: load.gpuBusyFraction ?? null,
      strays: load.strays,
      decision,
    }, null, 2))
  } else {
    for (const line of formatLoadReport({ load, decision })) console.log(line)
  }
  // 0 = quiet (or unreadable — fail-open), 2 = measurably not quiet, so a caller
  // can chain `node scripts/verify/machine-load.mjs && npm test -- enrichments`.
  process.exit(load.level === LEVEL.quiet || load.level === LEVEL.unknown ? 0 : 2)
}
