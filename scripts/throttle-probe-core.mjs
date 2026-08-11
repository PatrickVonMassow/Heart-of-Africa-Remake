// IS THIS CHECK LOAD-DEPENDENT? — the pure half of the throttle probe (point 640).
//
// A red used to be argued away: "it passed three times since, so it was load".
// Three greens are consistent with a fixed defect, a rare defect, a timing race
// and a machine that happened to be idle — they distinguish none of them. What
// settled the neighbouring case the same day was a MEASUREMENT: the point-600
// check reproduced 8 of 8 under a CPU throttle, which named the mechanism (state
// and DOM read in two round trips) and, after the fix, 0 of 8.
//
// This module holds everything that decision needs and no I/O: the argument
// shape, what throttling is available on this host, and the arithmetic of the
// skew rate. scripts/throttle-probe.mjs runs the section and hands the results
// here; scripts/throttle-probe-core.test.mjs pins every rule.

/** How many times a probe runs the section by default — the point-600 sample. */
export const DEFAULT_RUNS = 8
/** How many CPUs the run is pinned to by default. One is the strongest throttle
 *  this mechanism has: the suite, the dev server, the browser and its GPU
 *  process then queue on a single core, which is the contention a loaded machine
 *  produces and a check that reads state in two round trips cannot survive. */
export const DEFAULT_CPUS = 1
/** A run that has not finished by then is killed and counted as no verdict.
 *  Generous — a pinned run IS slow — but bounded: eight hung runs must not cost
 *  a working day. */
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

const RUNS_MAX = 50

/**
 * Parse the command line. Total: never throws, and every refusal NAMES what was
 * wrong rather than falling back to a default the caller did not ask for — a
 * probe that silently measured something else would be worse than no probe.
 *
 *   node scripts/throttle-probe.mjs <suite> --section=<name> [--runs 8]
 *                                  [--cpus 1] [--backend webgpu|webgl]
 *                                  [--timeout-ms 900000] [--no-throttle]
 */
export function parseProbeArgs(argv) {
  const args = (Array.isArray(argv) ? argv : []).map((a) => String(a))
  const out = {
    suite: null,
    section: null,
    runs: DEFAULT_RUNS,
    cpus: DEFAULT_CPUS,
    backend: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    throttle: true,
    help: false,
    error: null,
  }
  const number = (raw, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < min || n > max) {
      out.error = `--${label} takes a whole number between ${min} and ${max} (got "${raw}")`
      return null
    }
    return n
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = (attached) => (attached !== undefined ? attached : args[++i])
    const [flag, attached] = arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined]
    if (flag === '--help' || flag === '-h') out.help = true
    else if (flag === '--section') out.section = String(value(attached) ?? '').trim() || null
    else if (flag === '--runs') out.runs = number(value(attached), 'runs', { max: RUNS_MAX }) ?? out.runs
    else if (flag === '--cpus') out.cpus = number(value(attached), 'cpus', { max: 1024 }) ?? out.cpus
    else if (flag === '--timeout-ms') out.timeoutMs = number(value(attached), 'timeout-ms', { min: 1000 }) ?? out.timeoutMs
    else if (flag === '--no-throttle') out.throttle = false
    else if (flag === '--backend') {
      const backend = String(value(attached) ?? '').toLowerCase()
      if (backend !== 'webgpu' && backend !== 'webgl') out.error = `--backend takes webgpu or webgl (got "${backend}")`
      else out.backend = backend
    } else if (flag.startsWith('-')) out.error = `unknown flag "${flag}"`
    else if (out.suite === null) out.suite = arg
    else out.error = `only ONE suite can be probed at a time (got "${out.suite}" and "${arg}")`
    if (out.error) break
  }
  if (!out.error && !out.help) {
    if (!out.suite) out.error = 'name the suite to probe, e.g. `polish --section=goat-stance`'
    else if (!out.section) {
      out.error = `--section=<name> is required: the probe measures ONE named block of ${out.suite}, never the whole suite`
    }
  }
  return out
}

/**
 * HOW this host can throttle a run, or why it cannot.
 *
 * CPU AFFINITY, not a renderer-side multiplier: the suite spawns the dev server
 * and the browser as children, which inherit the mask, so pinning the probe pins
 * the whole stack — the contention a loaded machine really produces, which is
 * the claim ("it was load") being tested. `taskset` is util-linux; where it is
 * absent the probe says so and refuses to pretend, because a run that was NOT
 * throttled would answer a different question with the same output.
 *
 * Total: never throws, and never claims a throttle it cannot apply.
 */
export function throttlePlan({ platform = process.platform, cpuCount = 1, cpus = DEFAULT_CPUS, hasTaskset = false, throttle = true } = {}) {
  const total = Number.isInteger(cpuCount) && cpuCount > 0 ? cpuCount : 1
  if (!throttle) {
    return { available: false, argv: [], how: 'NOT throttled (--no-throttle) — the control run', why: null }
  }
  if (platform !== 'linux' || !hasTaskset) {
    return {
      available: false,
      argv: [],
      how: 'NOT throttled',
      why:
        platform === 'linux'
          ? 'taskset is missing (install util-linux) — the runs below carry no throttle, so a green proves nothing about load'
          : `no CPU-affinity throttle on ${platform} — the runs below carry no throttle, so a green proves nothing about load`,
    }
  }
  const want = Math.max(1, Math.min(Number.isInteger(cpus) && cpus > 0 ? cpus : DEFAULT_CPUS, total))
  const list = want === 1 ? '0' : `0-${want - 1}`
  return {
    available: true,
    argv: ['taskset', '-c', list],
    how: `CPU affinity pinned to ${want} of ${total} core(s) (taskset -c ${list})`,
    why: null,
  }
}

/** One completed probe run, as the wrapper reports it:
 *  `{ ok, checks: string[], timedOut?: boolean, exit?: number }`. */

/**
 * The skew rate and what reddened. `byCheck` is sorted by how often a check
 * failed (then by name), so the mechanism to hunt stands at the top. Total.
 */
export function summarise(results) {
  const list = Array.isArray(results) ? results.filter((r) => r && typeof r === 'object') : []
  const reds = list.filter((r) => r.ok !== true)
  const counts = new Map()
  for (const r of reds) {
    for (const name of Array.isArray(r.checks) ? r.checks : []) {
      const key = String(name)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const byCheck = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return {
    runs: list.length,
    reds: reds.length,
    timeouts: reds.filter((r) => r.timedOut === true).length,
    rate: list.length === 0 ? 0 : reds.length / list.length,
    byCheck,
  }
}

/**
 * THE VERDICT IN WORDS. Three cases, and none of them closes a red on its own —
 * that is the whole point of the mechanism this serves: a measurement tells you
 * WHERE to look for the cause, it is not itself the cause.
 */
export function verdictOf(summary, { throttled = true } = {}) {
  const s = summary ?? { runs: 0, reds: 0 }
  const of = `${s.reds}/${s.runs}`
  if (!throttled) {
    return `UNTHROTTLED CONTROL — ${of} runs red. Compare it against a throttled probe; on its own it measures nothing about load.`
  }
  if (s.runs === 0) return 'NOTHING MEASURED — no run completed.'
  if (s.reds === s.runs) {
    return `REPRODUCED — ${of} runs red under the throttle. The check is load-dependent: name the MECHANISM (what does it read twice, what does it assume finished), fix it, and show the reproduction gone.`
  }
  if (s.reds > 0) {
    return `SKEWED — ${of} runs red under the throttle. Load moves this check, so the red is real and timing-shaped; hunt the mechanism before charging or filing it.`
  }
  return `NOT REPRODUCED — ${of} runs red under the throttle. Load does not explain the red, and these greens do NOT close it: name its cause, charge it to the open point that owns it, or file it as a point of its own.`
}

/** The whole report, line by line — the wrapper only prints what it is handed. */
export function formatProbeReport({ suite = '?', section = '?', backend = null, plan = null, results = [], summary = null } = {}) {
  const s = summary ?? summarise(results)
  const lines = [
    '',
    `===== throttle probe — ${suite} --section=${section}${backend ? ` (${backend})` : ''} =====`,
    `throttle: ${plan?.how ?? 'unknown'}${plan?.why ? ` — ${plan.why}` : ''}`,
  ]
  for (const [i, r] of (Array.isArray(results) ? results : []).entries()) {
    const label = r?.ok === true ? 'GREEN' : r?.timedOut === true ? 'KILLED' : 'RED  '
    const detail = r?.ok === true
      ? ''
      : r?.timedOut === true
        ? ' — no verdict: killed at the probe timeout'
        : ` — ${(Array.isArray(r?.checks) && r.checks.length ? r.checks : ['(no check named — read the run output)']).join('; ')}`
    lines.push(`run ${String(i + 1).padStart(2)}  ${label}${detail}`)
  }
  lines.push(`SKEW RATE ${s.reds}/${s.runs} (${Math.round(s.rate * 100)} %)${s.timeouts ? `, ${s.timeouts} killed` : ''}`)
  for (const c of s.byCheck) lines.push(`  ${String(c.count).padStart(2)}×  ${c.name}`)
  lines.push(verdictOf(s, { throttled: plan?.available === true }))
  return lines
}
