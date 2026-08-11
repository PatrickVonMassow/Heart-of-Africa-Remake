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
// shape, what throttling is available on this host, how a run-all log is read,
// and the arithmetic of the skew rate. scripts/throttle-probe.mjs runs the
// section and hands the results here; scripts/throttle-probe-core.test.mjs pins
// every rule.

/** How many times a probe runs the section by default — the point-600 sample. */
export const DEFAULT_RUNS = 8
/** How many CPUs the run is pinned to by default. */
export const DEFAULT_CPUS = 1
/**
 * The default throttle RATE: the suite gets roughly one nth of the pinned core,
 * because `rate - 1` busy processes are pinned beside it.
 *
 * Measured 11.08.2026 on the point-600 defect (the pre-fix `ctrl-actor-labels`
 * check of `polish`, which reads the label state and the DOM in two round trips):
 * the bare pin, rate 1, reproduced it 1 of 8; this default, rate 4, 2 of 8. Both
 * are far short of the 8 of 8 a 20× renderer-side throttle produced, so
 * contention has to be manufactured and a green at a low rate acquits nothing.
 * The default trades reproduction against wall clock; raise `--rate` when a
 * suspected race will not show.
 */
export const DEFAULT_RATE = 4
/** A run that has not finished by then is killed and counted as NO VERDICT.
 *  Generous — a throttled run IS slow — but bounded: eight hung runs must not
 *  cost a working day. */
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

const RUNS_MAX = 50
const RATE_MAX = 64

/** A value as text, or '' — `String(x)` itself throws on an object whose
 *  toString does, and everything here must be total on whatever it is handed. */
function text(value) {
  try {
    return String(value ?? '')
  } catch {
    return ''
  }
}

/**
 * Parse the command line. Total: never throws, and every refusal NAMES what was
 * wrong rather than falling back to a default the caller did not ask for — a
 * probe that silently measured something else would be worse than no probe.
 *
 *   node scripts/throttle-probe.mjs <suite> --section=<name> [--runs 8]
 *                                  [--rate 4] [--cpus 1] [--backend webgpu|webgl]
 *                                  [--timeout-ms 900000] [--no-throttle]
 */
export function parseProbeArgs(argv) {
  const args = (Array.isArray(argv) ? argv : []).map((a) => text(a))
  const out = {
    suite: null,
    section: null,
    runs: DEFAULT_RUNS,
    cpus: DEFAULT_CPUS,
    rate: DEFAULT_RATE,
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
    else if (flag === '--section') out.section = text(value(attached)).trim() || null
    else if (flag === '--runs') out.runs = number(value(attached), 'runs', { max: RUNS_MAX }) ?? out.runs
    else if (flag === '--cpus') out.cpus = number(value(attached), 'cpus', { max: 1024 }) ?? out.cpus
    else if (flag === '--rate') out.rate = number(value(attached), 'rate', { max: RATE_MAX }) ?? out.rate
    else if (flag === '--timeout-ms') out.timeoutMs = number(value(attached), 'timeout-ms', { min: 1000 }) ?? out.timeoutMs
    else if (flag === '--no-throttle') out.throttle = false
    else if (flag === '--backend') {
      const backend = text(value(attached)).toLowerCase()
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

/** The CPUs this process may actually run on, from `Cpus_allowed_list` in
 *  /proc/self/status ("0-3,8,10-11"). `[]` when it cannot be read — an unknown
 *  mask must never be guessed at, because guessing produces a `taskset` call
 *  that fails while the report claims a throttle. Total. */
export function parseCpusAllowedList(status) {
  const line = /^Cpus_allowed_list:\s*(.+)$/m.exec(text(status))
  if (!line) return []
  const out = []
  for (const part of line[1].trim().split(',')) {
    const range = /^(\d+)-(\d+)$/.exec(part.trim())
    const single = /^(\d+)$/.exec(part.trim())
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])]
      if (to - from > 4096) continue
      for (let c = from; c <= to; c++) out.push(c)
    } else if (single) out.push(Number(single[1]))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/**
 * HOW this host can throttle a run, or why it cannot.
 *
 * CPU CONTENTION, not a renderer-side multiplier: the suite spawns the dev
 * server and the browser as children, which inherit the affinity mask, so
 * pinning the probe pins the whole stack. `rate` then decides how hard the
 * squeeze is — `rate - 1` busy processes share the same core, leaving the run
 * roughly one nth of it. That is the contention a loaded machine really
 * produces, which is the claim ("it was load") being tested.
 *
 * `allowedCpus` comes from the process's REAL mask, never from a core count: a
 * container whose cpuset excludes CPU 0 would take `taskset -c 0` and fail, and
 * a probe that reports a throttle it never applied is worse than no probe.
 * `taskset` is util-linux; where it is absent the plan says so.
 *
 * Total: never throws, and never claims a throttle it cannot apply.
 */
export function throttlePlan(input) {
  const {
    platform = 'linux',
    allowedCpus = [],
    cpus = DEFAULT_CPUS,
    rate = DEFAULT_RATE,
    hasTaskset = false,
    throttle = true,
  } = input ?? {}
  const unavailable = (how, why) => ({ available: false, argv: [], cpuList: null, rate: 1, spinners: 0, how, why })
  if (!throttle) return unavailable('NOT throttled (--no-throttle) — the control run', null)
  if (platform !== 'linux' || !hasTaskset) {
    return unavailable(
      'NOT throttled',
      platform === 'linux'
        ? 'taskset is missing (install util-linux) — the runs below carry no throttle, so a green proves nothing about load'
        : `no CPU-affinity throttle on ${platform} — the runs below carry no throttle, so a green proves nothing about load`,
    )
  }
  const allowed = (Array.isArray(allowedCpus) ? allowedCpus : []).filter((c) => Number.isInteger(c) && c >= 0)
  if (allowed.length === 0) {
    return unavailable('NOT throttled', 'the process CPU mask could not be read, so no pin can be trusted to apply')
  }
  const want = Math.max(1, Math.min(Number.isInteger(cpus) && cpus > 0 ? cpus : DEFAULT_CPUS, allowed.length))
  const picked = allowed.slice(0, want)
  const cpuList = picked.join(',')
  const squeeze = Math.max(1, Math.min(Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_RATE, RATE_MAX))
  const spinners = (squeeze - 1) * want
  return {
    available: true,
    argv: ['taskset', '-c', cpuList],
    cpuList,
    rate: squeeze,
    spinners,
    how:
      `${want} of ${allowed.length} permitted core(s) (taskset -c ${cpuList})` +
      (spinners > 0 ? `, shared with ${spinners} busy process(es) — about 1/${squeeze} of a core` : ''),
    why: null,
  }
}

/**
 * How many of these processes are STILL RUNNING — asked of the OPERATING SYSTEM,
 * never of the child objects. The probe blocks Node's event loop inside
 * `spawnSync` for the whole measured run, so a spinner that died during it
 * cannot have had its `exitCode` updated by the time anybody looks: reading the
 * child object would count a dead squeeze as a live one and let the report claim
 * a contention it stopped applying. `alive` reads /proc/<pid>/stat in the
 * wrapper — signal 0 would not do, because an unreaped ZOMBIE answers it while
 * burning nothing. Total: an unreadable pid counts as not running, which
 * understates the squeeze rather than overstating it.
 */
export function countAlive(pids, alive) {
  let n = 0
  for (const pid of Array.isArray(pids) ? pids : []) {
    if (!Number.isInteger(pid) || pid <= 0) continue
    try {
      if (alive(pid) === true) n++
    } catch {
      /* not running */
    }
  }
  return n
}

/** run-all's own per-suite summary line, or null. It is the only place a run's
 *  check COUNTS appear, which is how a run that never reached a check (a crash,
 *  a failed pin, a dead dev server) is told from one that reported reds. */
export function runnerSummary(output) {
  const m = /^(?:PASS|FAIL)\s{2,}(\S+)\s+(\d+) pass, (\d+) fail, (\d+) console-errors \(exit (-?\d+)\)/m.exec(
    text(output),
  )
  if (!m) return null
  return { suite: m[1], pass: Number(m[2]), fail: Number(m[3]), consoleErrors: Number(m[4]), exit: Number(m[5]) }
}

/** The SUITE's own result lines out of a run-all log, which echoes them indented
 *  under its summary. Without this the only `FAIL` at column 0 is run-all's own
 *  summary, and every red would be named "polish 7 pass, 1 fail". Falls back to
 *  the whole output, so a suite run directly still parses. Total. */
export function suiteOutput(output) {
  const whole = text(output)
  const inner = whole
    .split('\n')
    .filter((l) => /^\s+(?:FAIL\s{2,}|ERR:)/.test(l))
    .map((l) => l.trim())
  return inner.length ? inner.join('\n') : whole
}

/**
 * WHAT ONE PROBE RUN WAS. Four outcomes, because three of them are not "the
 * check failed": a killed run and a run whose suite never reported reached no
 * verdict at all, and counting either as a red would let eight broken launches
 * read as "reproduced under throttle".
 */
export function classifyRun(input) {
  const { timedOut = false, exit = null, summary = null, checks = [] } = input ?? {}
  if (timedOut) return 'killed'
  // Exit 0 is only a GREEN when the runner also reported the checks it ran. A
  // launch that produced no summary reached no verdict, whatever it exited with
  // — and an exit-0 harness failure counted as green would quietly dilute the
  // very rate this instrument exists to report.
  if (exit === 0) {
    // Exit 0 while the summary reports failures is the runner CONTRADICTING
    // itself. Neither reading may be preferred — a green would dilute the rate,
    // a red would invent one — so the run measured nothing.
    if (!summary) return 'broken'
    return summary.fail > 0 || summary.consoleErrors > 0 ? 'broken' : 'green'
  }
  if (summary && (summary.fail > 0 || summary.consoleErrors > 0)) return 'red'
  if ((Array.isArray(checks) ? checks : []).length > 0) return 'red'
  return 'broken'
}

/**
 * The skew rate and what reddened. `byCheck` is sorted by how often a check
 * failed (then by name), so the mechanism to hunt stands at the top. The rate is
 * taken over the runs that produced a VERDICT — a killed or broken run measures
 * nothing and must not dilute or inflate it. Total.
 */
export function summarise(results) {
  const list = (Array.isArray(results) ? results : []).filter((r) => r && typeof r === 'object')
  const kind = (r) => (typeof r.kind === 'string' ? r.kind : r.ok === true ? 'green' : 'red')
  const red = list.filter((r) => kind(r) === 'red')
  const green = list.filter((r) => kind(r) === 'green')
  const killed = list.filter((r) => kind(r) === 'killed')
  const broken = list.filter((r) => kind(r) === 'broken')
  const counts = new Map()
  for (const r of red) {
    for (const name of Array.isArray(r.checks) ? r.checks : []) {
      const key = text(name)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const judged = red.length + green.length
  return {
    runs: list.length,
    judged,
    reds: red.length,
    greens: green.length,
    killed: killed.length,
    broken: broken.length,
    rate: judged === 0 ? 0 : red.length / judged,
    byCheck: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}

/**
 * THE VERDICT IN WORDS, and none of them closes a red — that is the whole point
 * of the mechanism this serves: a measurement says WHERE to look, it is not
 * itself a cause. A sample with runs that reached no verdict is called out
 * first: a rate over three of eight runs is not a rate over eight.
 */
export function verdictOf(summary, options) {
  const { throttled = true } = options ?? {}
  const s = summary ?? {}
  const judged = Number.isFinite(s.judged) ? s.judged : Number(s.runs) || 0
  const reds = Number(s.reds) || 0
  const lost = (Number(s.killed) || 0) + (Number(s.broken) || 0)
  const lostNote = lost
    ? ` ${lost} run(s) reached NO verdict (killed, or the suite never reported) — read their logs: a probe cannot measure through a broken harness.`
    : ''
  if (judged === 0) return `NOTHING MEASURED — no run produced a verdict.${lostNote}`
  const of = `${reds}/${judged}`
  if (!throttled) {
    return `UNTHROTTLED CONTROL — ${of} runs red. It is the comparison for a throttled probe; on its own it says nothing about load.${lostNote}`
  }
  if (reds === judged) {
    return `REPRODUCED — ${of} runs red under the throttle. Run the same section with --no-throttle: if it holds green there, the check is load-dependent — then name the MECHANISM (what does it read twice, what does it assume has finished), fix it, and show the reproduction gone.${lostNote}`
  }
  if (reds > 0) {
    return `SKEWED — ${of} runs red under the throttle. Load moves this check, so it is timing-shaped; raise --rate to reproduce it harder, then hunt the mechanism.${lostNote}`
  }
  return `NOT REPRODUCED — ${of} runs red under the throttle. Load at this rate does not explain the red, and these greens do NOT close it: name its cause, charge it to the open point that owns it, or file it as a point of its own (raise --rate before concluding).${lostNote}`
}

/** The whole report, line by line — the wrapper only prints what it is handed. */
export function formatProbeReport(input) {
  const { suite = '?', section = '?', backend = null, plan = null, results = [], summary = null } = input ?? {}
  const s = summary ?? summarise(results)
  const lines = [
    '',
    `===== throttle probe — ${suite} --section=${section}${backend ? ` (${backend})` : ''} =====`,
    `throttle: ${plan?.how ?? 'unknown'}${plan?.why ? ` — ${plan.why}` : ''}`,
  ]
  const label = { green: 'GREEN ', red: 'RED   ', killed: 'KILLED', broken: 'BROKEN' }
  for (const [i, r] of (Array.isArray(results) ? results : []).entries()) {
    const kind = typeof r?.kind === 'string' ? r.kind : r?.ok === true ? 'green' : 'red'
    const named = Array.isArray(r?.checks) && r.checks.length ? r.checks.join('; ') : null
    const detail =
      kind === 'green'
        ? ''
        : kind === 'killed'
          ? ' — no verdict: killed at the probe timeout'
          : kind === 'broken'
            ? ` — no verdict: the suite never reported (exit ${r?.exit ?? '?'})`
            : ` — ${named ?? '(no check named — read the run output)'}`
    lines.push(`run ${String(i + 1).padStart(2)}  ${label[kind] ?? 'RED   '}${detail}`)
  }
  const s_ = s ?? {}
  lines.push(
    `SKEW RATE ${Number(s_.reds) || 0}/${Number(s_.judged) || 0} (${Math.round((Number(s_.rate) || 0) * 100)} %)` +
      (s_.killed ? `, ${s_.killed} killed` : '') +
      (s_.broken ? `, ${s_.broken} without a verdict` : ''),
  )
  for (const c of Array.isArray(s_.byCheck) ? s_.byCheck : []) lines.push(`  ${String(c.count).padStart(2)}×  ${c.name}`)
  lines.push(verdictOf(s_, { throttled: plan?.available === true }))
  return lines
}
