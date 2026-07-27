// Is the machine QUIET enough for a timing verdict? — as pure functions (point 296).
//
// The other half of the triage. Point 294 reads a red AFTER the fact
// (baseline-classify-core.mjs: the same check twice is a candidate real failure,
// disjoint checks are the LOAD SIGNATURE). This module acts BEFORE the run, on
// the two things that made 27.07.2026 expensive:
//
//   1. A CONCURRENT LOAD makes a timing verdict worthless. `enrichments` was run
//      while a full unit run and two agents shared the machine: it reported two
//      failures, the retry reported a DIFFERENT one, and the harness concluded
//      "a real failure, not a flake". Every named check was unrelated to the
//      change under test, and the same suite was green on a quiet machine in
//      exactly those checks. Three invalid runs, one wrong conclusion.
//   2. THIS PROJECT'S OWN TOOLING LEAVES LEFTOVERS. A unit run on the same
//      machine produced four "Test timed out in 5000ms" failures in tests that
//      pass in 582 ms alone — the cause was a dev server from an earlier verify
//      run that nobody had shut down. Nothing in the harness looked for it.
//
// So: probe before the run, and either DEFER it or FLAG its result "under load —
// not authoritative" instead of emitting an ambiguous red. The vocabulary is
// point 294's on purpose ("load signature", "judge a red only on a QUIET
// machine") — the two halves describe the same phenomenon from opposite ends.
//
// Everything here is data-in / verdict-out so the Vitest layer can pin it
// (scripts/verify/machine-load.test.mjs). All process work — sampling the CPU,
// listing processes — lives in the wrapper scripts/verify/machine-load.mjs.
//
// FAIL-OPEN throughout: a probe that cannot answer must never stop a run. An
// unknown machine proceeds, loudly labelled unknown; it never blocks and never
// claims quiet.

/** The three levels a machine can be in, plus the honest fourth. */
export const LEVEL = { quiet: 'quiet', busy: 'busy', loaded: 'loaded', unknown: 'unknown' }

/**
 * The suites whose verdict is a TIMING verdict — the ones a busy machine can
 * turn red on its own. `settings`, `enrichments` and `polish` are the three the
 * point names (in-scene walk measures and audio fades; the RAF wildlife staging
 * that carries the rotating family flakes; the staged polish checks). The other
 * three are here because their PASS CONDITION is a measured wall clock, which
 * load moves directly rather than incidentally: `startup` gates
 * `balance.startup.pictureFreezeBudgetMs`, `voice` gates the TTS cold-load
 * liveness stall, and `benchmark` reports frame timings as its result.
 */
export const TIMING_SENSITIVE_SUITES = ['settings', 'enrichments', 'polish', 'startup', 'voice', 'benchmark']

/** Is this suite one whose red is a timing verdict? */
export const isTimingSensitive = (suite) => TIMING_SENSITIVE_SUITES.includes(String(suite))

/**
 * Thresholds, as fractions of total CPU capacity. They are deliberately coarse:
 * the question is "is anything else working on this machine", not a benchmark.
 * ELEVATED is roughly "one core of an eight-core box is saturated by someone
 * else"; HEAVY is "the machine has no headroom left", which is where a suite
 * that polls for a staged frame starts missing its window.
 */
export const ELEVATED_CPU = 0.35
export const HEAVY_CPU = 0.7
/** Same question via the POSIX run queue (Windows reports 0 and is skipped). */
export const ELEVATED_LOADAVG = 0.7
export const HEAVY_LOADAVG = 1.0

/** What to do when the machine is not quiet. Default `flag` never blocks. */
export const ON_LOAD = { flag: 'flag', defer: 'defer', off: 'off' }

/** Read the mode from a CLI flag (`--on-load=defer`) or VERIFY_ON_LOAD; junk reads as the default. */
export function onLoadMode({ flags = [], env = '' } = {}) {
  const fromFlag = (flags.find((f) => String(f).startsWith('--on-load=')) ?? '').split('=')[1]
  const raw = String(fromFlag || env || '').trim().toLowerCase()
  return Object.hasOwn(ON_LOAD, raw) ? ON_LOAD[raw] : ON_LOAD.flag
}

// ---------------------------------------------------------------------------
// Process listing → strays
// ---------------------------------------------------------------------------

/**
 * The kinds of leftover/competitor this recognises. The first four are THIS
 * project's own tooling still holding CPU after (or during) another run — the
 * class that cost the four unit timeouts; `foreign-load` is anything else heavy
 * enough to matter but not ours to shut down.
 */
export const STRAY_KIND = {
  verifyRun: 'verify-run',
  unitRun: 'unit-run',
  build: 'build',
  devServer: 'dev-server',
  browser: 'automation-browser',
}

const KIND_LABEL = {
  [STRAY_KIND.verifyRun]: 'another verify/browser suite run',
  [STRAY_KIND.unitRun]: 'a vitest run',
  [STRAY_KIND.build]: 'a build/type-check/lint',
  [STRAY_KIND.devServer]: 'a vite dev/preview server',
  [STRAY_KIND.browser]: 'an automation browser (headless/Playwright)',
}

/** A stray kind's human label, for the report. */
export const strayLabel = (kind) => KIND_LABEL[kind] ?? String(kind)

/**
 * What ONE process is, or null for "not interesting". Order matters: `vitest`
 * contains `vite`, and `vite build` is a build rather than a server, so the
 * narrow patterns are tested first.
 *
 * A person's ordinary browser is deliberately NOT a stray — it is neither ours
 * to kill nor usually the cause. Only an AUTOMATION browser (headless, remote
 * debugging, a Playwright profile) counts, because that one is a leftover of a
 * verify run that died without cleaning up.
 */
export function classifyProcess(proc) {
  const cmd = `${proc?.name ?? ''} ${proc?.cmd ?? ''}`.toLowerCase().replace(/\\/g, '/')
  if (!cmd.trim()) return null
  if (/scripts\/verify\/[a-z-]+\.mjs|playwright[^ ]*\/cli|run-all\.mjs/.test(cmd)) return STRAY_KIND.verifyRun
  if (/\bvitest\b/.test(cmd)) return STRAY_KIND.unitRun
  if (/\bvite\b[^\n]*\bbuild\b|\btsc\b|\boxlint\b|\btsgo\b/.test(cmd)) return STRAY_KIND.build
  if (/\bvite\b|\bnpm run dev\b|\bnpm run preview\b/.test(cmd)) return STRAY_KIND.devServer
  if (/(chrome|chromium|msedge|firefox|webkit)/.test(cmd) && /--headless|--remote-debugging|--enable-automation|playwright|ms-playwright/.test(cmd)) {
    return STRAY_KIND.browser
  }
  return null
}

/**
 * Our OWN process tree: this pid, everything it spawned, and its ancestor chain
 * (the npm wrapper, the shell, the session that started it). Excluded from the
 * stray list — a run must not report itself as the load.
 *
 * SIBLINGS ARE NOT EXCLUDED, and that is the point: a second agent started by
 * the same session is a child of an ANCESTOR, not of us, and it is exactly the
 * load the probe exists to see.
 */
export function ownTree({ processes = [], pid }) {
  const byPid = new Map(processes.map((p) => [Number(p.pid), p]))
  // Descendants FIRST, seeded with self alone. Seeding with the ancestors too
  // would sweep in every sibling subtree — the second agent under the same
  // session would vanish from the stray list, which is the one process we most
  // need to see.
  const own = new Set([Number(pid)])
  for (let pass = 0; pass < processes.length + 1; pass++) {
    let grew = false
    for (const p of processes) {
      if (own.has(Number(p.pid))) continue
      if (own.has(Number(p.ppid))) {
        own.add(Number(p.pid))
        grew = true
      }
    }
    if (!grew) break
  }
  // Ancestors: the npm wrapper, the shell, the session that started us. Walk up,
  // guarding against a cycle in an odd table.
  let cur = byPid.get(Number(pid))
  const seen = new Set([Number(pid)])
  while (cur && cur.ppid !== undefined && !seen.has(Number(cur.ppid))) {
    seen.add(Number(cur.ppid))
    own.add(Number(cur.ppid))
    cur = byPid.get(Number(cur.ppid))
  }
  return own
}

/**
 * The interesting processes that are NOT ours, newest classification first.
 * `repoMarker` (a lowercased path fragment) decides `fromThisRepo`: a leftover
 * of THIS checkout is one we may shut down, a stranger's build is only load.
 */
export function strayProcesses({ processes = [], pid, repoMarker = '' } = {}) {
  const own = ownTree({ processes, pid })
  const marker = String(repoMarker).toLowerCase().replace(/\\/g, '/')
  const out = []
  for (const p of processes) {
    if (own.has(Number(p.pid))) continue
    const kind = classifyProcess(p)
    if (!kind) continue
    const cmd = String(p.cmd ?? '').toLowerCase().replace(/\\/g, '/')
    out.push({
      pid: Number(p.pid),
      kind,
      name: String(p.name ?? ''),
      cmd: String(p.cmd ?? '').slice(0, 200),
      fromThisRepo: marker.length > 0 && cmd.includes(marker),
    })
  }
  return out
}

/**
 * `Get-CimInstance Win32_Process | … | ConvertTo-Json` → the shared row shape.
 * PowerShell emits a BARE OBJECT when exactly one row matches, so the single-row
 * case is normalised rather than dropped. Junk in returns [] — never a throw:
 * this feeds a fail-open probe.
 */
export function parseWindowsProcessJson(text) {
  let data
  try {
    data = JSON.parse(String(text ?? '').trim() || 'null')
  } catch {
    return []
  }
  if (!data) return []
  const rows = Array.isArray(data) ? data : [data]
  return rows
    .map((r) => ({
      pid: Number(r?.ProcessId ?? r?.pid),
      ppid: Number(r?.ParentProcessId ?? r?.ppid ?? 0),
      name: String(r?.Name ?? ''),
      cmd: String(r?.CommandLine ?? ''),
    }))
    .filter((r) => Number.isFinite(r.pid))
}

/** `ps -axo pid=,ppid=,comm=,args=` → the shared row shape. */
export function parsePsOutput(text) {
  const out = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line)
    if (!m) continue
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3], cmd: m[4] })
  }
  return out
}

// ---------------------------------------------------------------------------
// CPU sampling → level
// ---------------------------------------------------------------------------

/**
 * The busy fraction between two `os.cpus()` snapshots, as a number in [0,1].
 * Deltas, never absolutes: the absolute counters carry the whole uptime, in
 * which a fresh spike drowns. Returns null when the two samples cannot be
 * compared (different core counts, no time passed) — null means "no reading",
 * never "quiet".
 */
export function cpuBusyFraction(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return null
  let idle = 0
  let total = 0
  for (let i = 0; i < a.length; i++) {
    const ta = a[i]?.times ?? {}
    const tb = b[i]?.times ?? {}
    for (const key of ['user', 'nice', 'sys', 'idle', 'irq']) {
      const d = Number(tb[key] ?? 0) - Number(ta[key] ?? 0)
      if (!Number.isFinite(d) || d < 0) continue
      total += d
      if (key === 'idle') idle += d
    }
  }
  if (total <= 0) return null
  return Math.min(1, Math.max(0, (total - idle) / total))
}

/**
 * The verdict on the machine. `ok: false` (a probe that threw or timed out)
 * yields `unknown` — reported, never silently treated as quiet.
 *
 * A stray of ours is enough for BUSY on its own even at low CPU, because the
 * leftover dev server that produced the four 5000 ms unit timeouts was idle by
 * every CPU measure: it holds ports, file watchers and a node heap, and the
 * damage it does is not visible as load.
 */
export function classifyLoad({ ok = true, cpuBusyFraction: cpu = null, loadAvgPerCore = null, cpuCount = null, strays = [] } = {}) {
  if (!ok) {
    return {
      level: LEVEL.unknown,
      reasons: ['the load probe could not read the machine — treat the quiet of this run as UNKNOWN, not as proven'],
      strays,
      cpuBusyFraction: null,
    }
  }
  const reasons = []
  let level = LEVEL.quiet
  const raise = (to) => {
    if (to === LEVEL.loaded || (to === LEVEL.busy && level === LEVEL.quiet)) level = to
  }
  const pct = (v) => `${Math.round(v * 100)} %`
  if (typeof cpu === 'number') {
    if (cpu >= HEAVY_CPU) {
      reasons.push(`CPU ${pct(cpu)} busy across ${cpuCount ?? '?'} cores — no headroom left`)
      raise(LEVEL.loaded)
    } else if (cpu >= ELEVATED_CPU) {
      reasons.push(`CPU ${pct(cpu)} busy across ${cpuCount ?? '?'} cores — something else is working`)
      raise(LEVEL.busy)
    }
  } else {
    reasons.push('no CPU reading available')
  }
  if (typeof loadAvgPerCore === 'number' && loadAvgPerCore > 0) {
    if (loadAvgPerCore >= HEAVY_LOADAVG) {
      reasons.push(`run queue ${loadAvgPerCore.toFixed(2)} per core`)
      raise(LEVEL.loaded)
    } else if (loadAvgPerCore >= ELEVATED_LOADAVG) {
      reasons.push(`run queue ${loadAvgPerCore.toFixed(2)} per core`)
      raise(LEVEL.busy)
    }
  }
  for (const kind of new Set(strays.map((s) => s.kind))) {
    const n = strays.filter((s) => s.kind === kind).length
    reasons.push(`${n}× ${strayLabel(kind)} already running`)
    // Another verify run or a competing vitest IS the 27.07. case; a leftover
    // server or browser is a strong warning but not proof the machine is pinned.
    raise(kind === STRAY_KIND.verifyRun || kind === STRAY_KIND.unitRun ? LEVEL.loaded : LEVEL.busy)
  }
  if (level === LEVEL.quiet) reasons.push(`quiet: CPU ${typeof cpu === 'number' ? pct(cpu) : '?'}, no competing run or leftover found`)
  return { level, reasons, strays, cpuBusyFraction: cpu }
}

// ---------------------------------------------------------------------------
// Decision + reports
// ---------------------------------------------------------------------------

/** Exit code of a DEFERRED run: distinct from 1 (a failure), because nothing failed. */
export const DEFERRED_EXIT = 3

/**
 * What this invocation should do. `suites` is the pick that is about to run.
 *
 *   proceed — quiet, or nothing timing-sensitive is in the pick, or the mode is
 *             off/unknown. The load is still REPORTED.
 *   flag    — run, but label the result: a red from these suites is not
 *             evidence (see annotateResult).
 *   defer   — do not run at all (opt-in `--on-load=defer` / VERIFY_ON_LOAD=defer):
 *             an unusable verdict costs more than the run it saves.
 */
export function decideRun({ suites = [], level = LEVEL.unknown, mode = ON_LOAD.flag } = {}) {
  const timing = (suites ?? []).filter(isTimingSensitive)
  const quiet = level === LEVEL.quiet
  if (mode === ON_LOAD.off) return { action: 'proceed', timing, why: 'the quiet-machine check is switched off (--on-load=off)' }
  if (quiet) return { action: 'proceed', timing, why: 'the machine is quiet — a verdict from this run is evidence' }
  if (level === LEVEL.unknown) {
    return { action: 'proceed', timing, why: 'the machine could not be read — proceeding, but nothing here proves the run was quiet' }
  }
  if (timing.length === 0) {
    return {
      action: 'proceed',
      timing,
      why: `the machine is ${level}, but this pick runs no timing-sensitive suite — reported, not acted on`,
    }
  }
  if (mode === ON_LOAD.defer) {
    return {
      action: 'defer',
      timing,
      exitCode: DEFERRED_EXIT,
      why: `the machine is ${level} and this pick runs ${timing.join(', ')} — DEFERRED before spending the run`,
    }
  }
  return {
    action: 'flag',
    timing,
    why: `the machine is ${level} and this pick runs ${timing.join(', ')} — the run proceeds, its timing verdicts do NOT count as evidence`,
  }
}

/** The pre-run report: what the probe saw, and what follows from it. */
export function formatLoadReport({ load, decision, mode = ON_LOAD.flag }) {
  const head = {
    [LEVEL.quiet]: 'QUIET MACHINE — timing verdicts from this run are evidence',
    [LEVEL.busy]: 'MACHINE NOT QUIET (busy)',
    [LEVEL.loaded]: 'MACHINE UNDER LOAD',
    [LEVEL.unknown]: 'MACHINE STATE UNKNOWN',
  }[load.level]
  const lines = [`# quiet-machine check (point 296): ${head}`]
  for (const r of load.reasons ?? []) lines.push(`      ${r}`)
  for (const s of load.strays ?? []) {
    lines.push(`      leftover pid ${s.pid}: ${strayLabel(s.kind)}${s.fromThisRepo ? ' — FROM THIS CHECKOUT' : ''}  ${s.cmd}`)
  }
  const ours = (load.strays ?? []).filter((s) => s.fromThisRepo)
  if (ours.length) {
    lines.push(
      '      these are leftovers of this project\'s own tooling; a forgotten dev server has already cost a whole unit run',
      `      (4× "Test timed out in 5000ms" on 27.07.2026). Shut them down: ${killAdvice(ours.map((s) => s.pid))}`,
    )
  }
  lines.push(`      → ${decision.why}`)
  if (decision.action === 'flag') {
    lines.push('      to skip a run like this instead of flagging it: --on-load=defer (or VERIFY_ON_LOAD=defer)')
  }
  if (decision.action === 'defer') {
    lines.push('      run it again on a quiet machine, or force it with --on-load=flag / --on-load=off')
  }
  if (mode === ON_LOAD.off) lines.push('      (the check is off — this is a report only)')
  return lines
}

/** The platform-appropriate kill line for a list of leftovers. */
export function killAdvice(pids, platform = process.platform) {
  const list = (pids ?? []).map(Number).filter(Number.isFinite)
  if (list.length === 0) return ''
  return platform === 'win32'
    ? `taskkill /F /T ${list.map((p) => `/PID ${p}`).join(' ')}`
    : `kill ${list.join(' ')}`
}

/**
 * The POST-run label — the half a reader actually acts on.
 *
 * The asymmetry is the whole content: load produces false REDS, not false
 * greens. A green taken under load still counts (the checks passed despite the
 * handicap); a red from a timing-sensitive suite under load is not evidence and
 * must be re-run alone before anyone believes it.
 */
export function annotateResult({ level = LEVEL.unknown, redSuites = [], green = false, strays = [] } = {}) {
  if (level === LEVEL.quiet) return []
  const lines = []
  const state = level === LEVEL.unknown ? 'a machine whose quiet could not be verified' : `a machine that was ${level}`
  if (green) {
    lines.push(
      `# NOTE: this run happened on ${state} — the GREEN still counts.`,
      '#       Load produces false REDS, not false greens: every check passed despite the handicap.',
    )
    return lines
  }
  const timing = redSuites.filter(isTimingSensitive)
  const other = redSuites.filter((s) => !isTimingSensitive(s))
  lines.push(`# UNDER LOAD — NOT AUTHORITATIVE: this red was taken on ${state}.`)
  if (timing.length) {
    lines.push(
      `#       ${timing.join(', ')} ${timing.length === 1 ? 'is a timing verdict' : 'are timing verdicts'} — a busy machine turns them red on its own.`,
      '#       House rule (point 294): judge a red only on a QUIET machine. Re-run these alone before treating this as evidence:',
      `#         npm test -- ${timing.join(' ')}`,
    )
  }
  if (other.length) {
    lines.push(`#       ${other.join(', ')} ${other.length === 1 ? 'is' : 'are'} less timing-sensitive, but corroborate before acting on ${other.length === 1 ? 'it' : 'them'}.`)
  }
  const ours = strays.filter((s) => s.fromThisRepo)
  if (ours.length) lines.push(`#       Shut the leftovers down first: ${killAdvice(ours.map((s) => s.pid))}`)
  return lines
}

/**
 * The same label for a stage that dies BEFORE the browser suites — the vitest
 * layer above all. That is not a hypothetical: the 27.07. leftover dev server
 * produced four "Test timed out in 5000ms" failures in tests that pass in 582 ms
 * alone, and the runner exits fail-fast there without ever reaching
 * annotateResult.
 */
export function annotateStageFailure({ stage = 'unit', level = LEVEL.unknown, strays = [] } = {}) {
  if (level === LEVEL.quiet) return []
  const lines = [
    `# UNDER LOAD — the ${stage} stage failed on ${level === LEVEL.unknown ? 'a machine whose quiet could not be verified' : `a machine that was ${level}`}.`,
    '#       A timeout failure under load is not evidence of a broken test; re-run it on a quiet machine.',
  ]
  const ours = strays.filter((s) => s.fromThisRepo)
  if (ours.length) lines.push(`#       Leftovers seen before the run: ${killAdvice(ours.map((s) => s.pid))}`)
  return lines
}
