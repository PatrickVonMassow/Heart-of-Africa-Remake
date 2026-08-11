// THE THROTTLE PROBE (point 640) — answer "was that red just load?" with a
// measurement instead of an argument.
//
//   node scripts/throttle-probe.mjs polish --section=ctrl-actor-labels --runs 8
//
// It runs ONE declared section of ONE suite N times with the whole stack pinned
// to a single CPU and `rate - 1` busy processes squeezing that same CPU, and
// reports how often it reddens and on which checks. That is the instrument the
// point-600 repair used ad hoc — 8 of 8 red under a CPU throttle, the mechanism
// named, 0 of 8 after the fix — made a house command, because the alternative on
// record is "it passed three times since", which distinguishes a fixed defect
// from a rare one from a race from an idle machine not at all.
//
// MEASURED 11.08.2026 against that very defect (the pre-fix `ctrl-actor-labels`
// check reinstated in a scratch tree): the bare pin reproduced it 1 of 8, so the
// squeeze is not decoration — contention has to be manufactured. Raise `--rate`
// when a suspected race will not show.
//
// WHAT IT IS NOT. It closes no red. A reproduction points at a mechanism, a
// non-reproduction rules out one explanation at that rate; either way the red
// closes only by a named cause, by a charge to the open point that owns it, or
// by becoming a point (CLAUDE.md §7.2).
//
// Every probe run is a `--section` run, so its record is stamped PARTIAL: it can
// neither clear a gate nor block one, however often it reddens.
//
// The decisions (arguments, throttle plan, log reading, skew arithmetic,
// verdict) are pure and pinned in scripts/throttle-probe-core.test.mjs; only the
// running is here.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from './is-main.mjs'
import { failedChecks } from './verify/baseline-classify-core.mjs'
import { listSections, resolveSelection } from './verify/sections.mjs'
import { DEV_SUITES } from './verify/tiers.mjs'
import {
  classifyRun,
  formatProbeReport,
  parseCpusAllowedList,
  parseProbeArgs,
  runnerSummary,
  suiteOutput,
  summarise,
  throttlePlan,
} from './throttle-probe-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const USAGE = [
  'THROTTLE PROBE — is this check load-dependent, or is it a defect? (point 640)',
  '',
  '  node scripts/throttle-probe.mjs <suite> --section=<name> [options]',
  '',
  '  --runs <n>        how many times to run it (default 8, the point-600 sample)',
  '  --rate <n>        how hard to squeeze: the run gets about 1/n of a core (default 4)',
  '  --cpus <n>        how many cores the whole run is pinned to (default 1)',
  '  --backend <b>     webgpu | webgl (default: the house lane)',
  '  --timeout-ms <n>  kill a run that has not finished (default 900000)',
  '  --no-throttle     the unthrottled control run, for comparison',
  '',
  'It reports the SKEW RATE and the checks that reddened. It closes no red:',
  'a red closes by a named cause, by a charge to the open point that owns it,',
  'or by becoming an open point of its own.',
].join('\n')

/** Is `taskset` on this host? Asked once, cheaply, and never assumed. */
function hasTaskset() {
  try {
    return spawnSync('taskset', ['--version'], { windowsHide: true, encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}

/** The CPUs this process may really run on — the mask, not the core count: a
 *  cpuset that excludes CPU 0 would take `taskset -c 0` and fail. */
function allowedCpus() {
  try {
    return parseCpusAllowedList(readFileSync('/proc/self/status', 'utf8'))
  } catch {
    return []
  }
}

/** Does the pin ACTUALLY apply? A plan that cannot be executed must downgrade to
 *  "not throttled" before the runs, never after eight of them reported a rate. */
function pinWorks(plan) {
  if (!plan.available) return true
  try {
    return spawnSync(plan.argv[0], [...plan.argv.slice(1), 'true'], { windowsHide: true, encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}

/** Busy processes pinned to the same core(s) — the squeeze. Plain node loops, so
 *  nothing beyond the repo's own runtime is needed; each is killed with the run
 *  that spawned it, and they are spawned detached from stdio so they cannot
 *  pollute the measured output. */
function startSpinners(plan) {
  const spun = []
  for (let i = 0; i < plan.spinners; i++) {
    try {
      spun.push(
        spawn(plan.argv[0], [...plan.argv.slice(1), process.execPath, '-e', 'for(;;);'], {
          windowsHide: true,
          stdio: 'ignore',
        }),
      )
    } catch {
      /* one spinner short is a weaker throttle, not a failed measurement */
    }
  }
  return spun
}

function stopSpinners(spun) {
  for (const child of spun) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

/** Where a run's whole output is kept, so a KILLED or BROKEN run can be read
 *  afterwards. Under the git-ignored local/, never in the repository proper. */
function logDirFor(suite, section) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(ROOT, 'local', 'throttle-probe', `${suite}-${section}-${stamp}`)
  try {
    mkdirSync(dir, { recursive: true })
    return dir
  } catch {
    return null
  }
}

function main(argv = process.argv.slice(2)) {
  const opts = parseProbeArgs(argv)
  if (opts.help) {
    console.log(USAGE)
    return 0
  }
  if (opts.error) {
    console.log(`throttle-probe: ${opts.error}\n\n${USAGE}`)
    return 1
  }
  // The suite and the section are validated from the suite's own source BEFORE
  // anything is booted — a typo must cost a tenth of a second and name what
  // exists, not eight browser runs that assert nothing (the point-566 rule).
  if (!DEV_SUITES.includes(opts.suite)) {
    console.log(`throttle-probe: unknown suite "${opts.suite}" — the suites are:\n  ${DEV_SUITES.join('\n  ')}`)
    return 1
  }
  let source = ''
  try {
    source = readFileSync(join(ROOT, 'scripts', 'verify', `${opts.suite}.mjs`), 'utf8')
  } catch {
    console.log(`throttle-probe: cannot read scripts/verify/${opts.suite}.mjs`)
    return 1
  }
  const selection = resolveSelection({ sections: listSections(source), requested: opts.section, suite: opts.suite })
  if (!selection.ok) {
    console.log(`throttle-probe: ${selection.message}`)
    return 1
  }

  let plan = throttlePlan({
    platform: process.platform,
    allowedCpus: allowedCpus(),
    cpus: opts.cpus,
    rate: opts.rate,
    hasTaskset: hasTaskset(),
    throttle: opts.throttle,
  })
  if (!pinWorks(plan)) {
    plan = throttlePlan({ platform: process.platform, throttle: false })
    plan.how = 'NOT throttled'
    plan.why = 'the pin was refused by this host, so the runs below carry no throttle and a green proves nothing about load'
  }
  const logDir = logDirFor(opts.suite, opts.section)
  console.log(`# ${opts.runs} run(s) of ${opts.suite} --section=${opts.section} — ${plan.how}${plan.why ? ` (${plan.why})` : ''}`)
  if (logDir) console.log(`# each run's output: ${logDir}`)

  const results = []
  for (let i = 0; i < opts.runs; i++) {
    const spun = startSpinners(plan)
    let res
    try {
      const args = [
        ...plan.argv,
        process.execPath,
        join(ROOT, 'scripts', 'verify', 'run-all.mjs'),
        opts.suite,
        `--section=${opts.section}`,
      ]
      res = spawnSync(args[0], args.slice(1), {
        windowsHide: true,
        cwd: ROOT,
        encoding: 'utf8',
        timeout: opts.timeoutMs,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          // The probe COUNTS first attempts: a retry would fold two runs into
          // one verdict and halve the sample it is here to measure.
          VERIFY_NO_RETRY: '1',
          // The machine is deliberately not quiet — that is the experiment. The
          // load check would otherwise flag (or, set to defer, skip) every run.
          VERIFY_ON_LOAD: 'off',
          ...(opts.backend ? { VERIFY_GL: opts.backend } : {}),
        },
      })
    } finally {
      stopSpinners(spun)
    }
    const out = (res.stdout ?? '') + (res.stderr ?? '')
    const timedOut = res.error?.code === 'ETIMEDOUT'
    const summary = runnerSummary(out)
    const checks = (() => {
      try {
        return failedChecks(suiteOutput(out)).map((c) => c.name)
      } catch {
        return []
      }
    })()
    const exit = res.status ?? null
    const kind = classifyRun({ timedOut, exit, summary, checks })
    results.push({ kind, ok: kind === 'green', checks, exit })
    if (logDir) {
      try {
        writeFileSync(join(logDir, `run-${String(i + 1).padStart(2, '0')}.log`), out)
      } catch {
        /* the measurement matters more than its log */
      }
    }
    console.log(
      `run ${i + 1}/${opts.runs}  ${kind.toUpperCase()}${kind === 'green' ? '' : ` — ${checks[0] ?? `exit ${exit}`}`}`,
    )
  }

  for (const line of formatProbeReport({
    suite: opts.suite,
    section: opts.section,
    backend: opts.backend,
    plan,
    results,
    summary: summarise(results),
  })) {
    console.log(line)
  }
  return 0
}

if (isMainModule(import.meta.url)) process.exit(main())

export { main }
