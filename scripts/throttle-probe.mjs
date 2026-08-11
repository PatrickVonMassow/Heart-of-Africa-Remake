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
// check reinstated in a worktree, WebGL 2 lane): the bare pin reproduced it 1 of
// 8, the default squeeze 2 of 8, and the FIXED check 0 of 2 — so the instrument
// does catch the real thing, and the squeeze is not decoration. It is still well
// short of the 8 of 8 a 20x renderer-side throttle produced, so a green at one
// rate is no acquittal: raise `--rate` before concluding anything from it.
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
import { readMachine } from './verify/machine-load.mjs'
import { DEV_SUITES, laneFor, selectBackend } from './verify/tiers.mjs'
import {
  classifyRun,
  countAlive,
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
 *  pollute the measured output. A spinner that did not FORK (no pid) is not
 *  counted: the report must never name a squeeze it did not apply. */
function startSpinners(plan) {
  const spun = []
  for (let i = 0; i < plan.spinners; i++) {
    try {
      const child = spawn(plan.argv[0], [...plan.argv.slice(1), process.execPath, '-e', 'for(;;);'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      if (child?.pid) spun.push(child)
    } catch {
      /* counted below as one spinner short, and reported as such */
    }
  }
  return spun
}

/**
 * Is this process still BURNING CPU? Not "does the pid exist": a spinner that
 * exited while `spawnSync` held the event loop is an unreaped ZOMBIE, which
 * still answers signal 0 and squeezes nothing. Linux says so in
 * /proc/<pid>/stat, whose third field is the state — `Z` for a zombie. Anything
 * unreadable counts as NOT running, which understates the squeeze rather than
 * overstating it, and the comm field is skipped by cutting at the LAST ')' (a
 * process name may contain both parentheses and spaces).
 */
function stillRunning(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const state = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[0]
    return state !== '' && state !== 'Z' && state !== 'X'
  } catch {
    return false
  }
}

/** Kill them, and say how many were STILL RUNNING when the run ended — a spinner
 *  that died early squeezed nothing for the rest of it. Liveness is asked of the
 *  OS (signal 0), because the child objects cannot have learnt of an exit while
 *  spawnSync held the event loop. */
function stopSpinners(spun) {
  const alive = countAlive(spun.map((c) => c.pid), stillRunning)
  for (const child of spun) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
  return alive
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

/**
 * ONE probe run, in its OWN PROCESS GROUP.
 *
 * `spawnSync`'s timeout kills the runner and nothing else, so a killed run left
 * its dev server and its browser behind — burning the very CPU the next run is
 * trying to measure, and holding its port. Detached, the child leads a group,
 * and the timeout kills the GROUP.
 */
function runOnce(plan, opts) {
  const args = [
    ...plan.argv,
    process.execPath,
    join(ROOT, 'scripts', 'verify', 'run-all.mjs'),
    opts.suite,
    `--section=${opts.section}`,
  ]
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      windowsHide: true,
      cwd: ROOT,
      // Its own group, so the whole tree can be killed together.
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        // The probe COUNTS first attempts: a retry would fold two runs into one
        // verdict and halve the sample it is here to measure.
        VERIFY_NO_RETRY: '1',
        // The machine is deliberately not quiet — that is the experiment. The
        // load check would otherwise flag (or, set to defer, skip) every run.
        VERIFY_ON_LOAD: 'off',
        ...(opts.backend ? { VERIFY_GL: opts.backend } : {}),
      },
    })
    let out = ''
    let timedOut = false
    child.stdout?.on('data', (c) => (out += c))
    child.stderr?.on('data', (c) => (out += c))
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, opts.timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ out: `${out}\nthrottle-probe: the run could not be started: ${err?.message ?? err}`, timedOut, exit: null })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      // A killed group leaves nothing behind, but give the descendants a moment
      // to go before the next run starts measuring.
      resolve({ out, timedOut, exit: timedOut ? null : code })
    })
  })
}

/** Kill the run and everything it spawned — a survivor would burn the CPU the
 *  next run measures and hold its port. The group goes first; the DESCENDANTS
 *  that left the group do not die with it (`_server.mjs` starts the dev server
 *  detached, and Playwright's browser likewise), so the leftovers of THIS
 *  checkout are swept afterwards — measured 11.08.2026: a group kill alone left
 *  a vite and a headless chrome running. */
function killTree(child) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
    else child.kill('SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

/** The sweep, but AFTER the orphans have been reparented. Measured 11.08.2026:
 *  a sweep fired the instant the group died found nothing — the dev server was
 *  still a child of the dying runner, so the detector counted it as part of this
 *  process's own tree. A second pass covers a slow reparent. */
async function sweepAfterKill() {
  let killed = 0
  for (const wait of [1500, 2000]) {
    await new Promise((r) => setTimeout(r, wait))
    killed += await sweepStrays()
    if (killed > 0) break
  }
  return killed
}

/** Sweep this checkout's leftover dev servers and browsers, using the house
 *  stray detector — which matches on THIS repo path, so a parallel agent's own
 *  run in another worktree is never touched. Returns how many it killed. */
async function sweepStrays() {
  let killed = 0
  try {
    const { strays } = await readMachine()
    for (const stray of Array.isArray(strays) ? strays : []) {
      if (!stray?.fromThisRepo || !Number.isInteger(stray.pid)) continue
      // The GROUP, then the pid: the detector names the ROOT of the leftover
      // tree, which for the dev server is the `sh -c vite` wrapper — killing
      // that alone orphans the node beneath it, which goes on serving and goes
      // on burning the core the next run is measuring (measured 11.08.2026).
      let done = false
      try {
        process.kill(-stray.pid, 'SIGKILL')
        done = true
      } catch {
        /* not a group leader — the pid itself still stands */
      }
      try {
        process.kill(stray.pid, 'SIGKILL')
        done = true
      } catch {
        /* gone already */
      }
      if (done) killed++
    }
  } catch {
    /* a sweep that cannot read the machine is a weaker guarantee, not a failure */
  }
  return killed
}

async function main(argv = process.argv.slice(2)) {
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
  // WHICH LANE the runner will really pin for this suite — not the flag. A
  // request for WebGPU on `touch`/`voice` is ROUTED to WebGL 2 by the runner, and
  // with no flag at all an inherited VERIFY_GL decides; a report naming the
  // request would name a backend the run never used.
  const lane = laneFor(opts.suite, selectBackend(opts.backend ?? process.env.VERIFY_GL))
  const logDir = logDirFor(opts.suite, opts.section)
  console.log(`# ${opts.runs} run(s) of ${opts.suite} --section=${opts.section} — ${plan.how}${plan.why ? ` (${plan.why})` : ''}`)
  if (logDir) console.log(`# each run's output: ${logDir}`)

  const results = []
  // The WEAKEST squeeze any run really carried. A plan is a request; what the
  // report may claim is what ran.
  let leastSpinners = plan.spinners
  for (let i = 0; i < opts.runs; i++) {
    const spun = startSpinners(plan)
    let res
    try {
      res = await runOnce(plan, opts)
    } finally {
      leastSpinners = Math.min(leastSpinners, stopSpinners(spun))
    }
    const out = res.out
    const timedOut = res.timedOut
    // A killed run's dev server and browser outlive the group kill; sweep them
    // before the next run starts, or the "throttle" of run i+1 is really run i
    // still rendering.
    if (timedOut) {
      const swept = await sweepAfterKill()
      if (swept > 0) console.log(`# swept ${swept} leftover process(es) of the killed run`)
    }
    const summary = runnerSummary(out)
    const checks = (() => {
      try {
        return failedChecks(suiteOutput(out)).map((c) => c.name)
      } catch {
        return []
      }
    })()
    const exit = res.exit
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

  // Report the squeeze that HELD, not the one that was asked for.
  const applied =
    plan.spinners > 0 && leastSpinners < plan.spinners
      ? {
          ...plan,
          how:
            `${plan.how} — but only ${leastSpinners} of ${plan.spinners} busy process(es) ran for a whole run, ` +
            'so the squeeze below is weaker than the rate names',
        }
      : plan
  for (const line of formatProbeReport({
    suite: opts.suite,
    section: opts.section,
    backend: lane,
    plan: applied,
    results,
    summary: summarise(results),
  })) {
    console.log(line)
  }
  return 0
}

if (isMainModule(import.meta.url)) process.exit(await main())

export { main }
