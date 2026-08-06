// Baseline classification of a RED verify suite (point 294) — OPT-IN.
//
//   node scripts/verify/baseline-classify.mjs <suite> [options]
//
// Re-runs the failed suite against the PRE-CHANGE baseline (the branch's
// merge-base with main by default) and labels every check that is red now:
// REAL REGRESSION (green on the baseline) vs PRE-EXISTING / STALE ASSUMPTION
// (already red there). That triage used to be a manual baseline diff — it was
// done by hand on 24.07.2026 for the SSAO ground-edge check (stale assumption)
// and the proximity-call fade (pre-existing, point 292).
//
// Options
//   --ref <git-ref>     baseline to compare against (default: merge-base with main)
//   --runs <n>          baseline passes (default 2 — one pass is as flake-prone
//                       as the run being triaged, and BOTH wrong readings hurt)
//   --failed "<check>"  the check(s) red now (repeatable); default: run the
//                       suite in THIS tree first and take its failures
//   --current-out <f>   a file holding the failing run's output, as an
//                       alternative to naming each check with --failed
//   --current-checks <n>  how many checks the CURRENT run reached — the yardstick
//                       for the died-early verdict (point 418). run-all hands it
//                       over; it is measured here when the suite runs here.
//   --keep              keep the baseline worktree even on success (it is reused
//                       anyway; this only skips the retention prune)
//   --strict            exit 1 when a REAL REGRESSION was found (default: 0 —
//                       this is a triage aid, the suite result stays the gate)
//
// Cost discipline (the point's DESIGN care): this is never part of a normal
// run. run-all calls it only for a suite that stayed RED and only with
// --baseline / VERIFY_BASELINE=1, and the baseline checkout is a REUSED git
// worktree under the git-ignored local/verify-baseline/, sharing the repo's
// node_modules through Node's ancestor resolution (no second install).
//
// The classification is EVIDENCE, not a verdict: it runs the CURRENT check
// against the BASELINE app code, so it reports the caveats that can bend that
// reading (a changed suite file, changed dependencies or boot helpers).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { killTree, launchServer } from './_server.mjs'
import { DEV_SUITES, SERVERLESS_SUITES, selectBackend } from './tiers.mjs'
import {
  allChecks,
  baselineRunDeath,
  checkFromName,
  classifyAgainstBaseline,
  failedChecks,
  foldBaselineRuns,
  formatBaselineReport,
} from './baseline-classify-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SUITE_TIMEOUT_MS = Number(process.env.VERIFY_SUITE_TIMEOUT_MS) || 45 * 60 * 1000

/** Files whose drift between the baseline and HEAD can bend the comparison:
 *  the baseline checkout runs against the CURRENT node_modules and the current
 *  shared boot helpers, because it has none of its own. */
const INFRA_PATHS = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'scripts/verify/_boot.mjs',
  'scripts/verify/_browser.mjs',
  'scripts/verify/_server.mjs',
]

/** How many baseline checkouts to keep around (each is a full worktree). */
const KEEP_BASELINES = 2

export function parseWrapperArgs(argv) {
  const out = { suite: null, ref: null, runs: 2, keep: false, strict: false, currentOut: null, currentChecks: 0, failed: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--ref') out.ref = argv[++i] ?? null
    else if (a === '--runs') out.runs = Math.max(1, Number(argv[++i]) || 1)
    else if (a === '--failed') out.failed.push(argv[++i] ?? '')
    else if (a === '--current-out') out.currentOut = argv[++i] ?? null
    else if (a === '--current-checks') out.currentChecks = Math.max(0, Number(argv[++i]) || 0)
    else if (a === '--keep') out.keep = true
    else if (a === '--strict') out.strict = true
    else if (!a.startsWith('-') && out.suite === null) out.suite = a
  }
  out.failed = out.failed.filter(Boolean)
  return out
}

function git(args, cwd = ROOT) {
  const res = spawnSync('git', args, { windowsHide: true, cwd, encoding: 'utf8' })
  if (res.status !== 0) return null
  return (res.stdout ?? '').trim()
}

/** The baseline commit: --ref, else the merge-base with main (origin/main when
 *  the local main is absent). Returns null when nothing resolves. */
function resolveBaseline(explicit) {
  if (explicit) {
    const sha = git(['rev-parse', explicit])
    return sha ? { ref: explicit, sha } : null
  }
  for (const main of ['main', 'origin/main']) {
    const sha = git(['merge-base', 'HEAD', main])
    if (sha) return { ref: `merge-base with ${main}`, sha }
  }
  return null
}

/** A reused, detached worktree of `sha` under the git-ignored local/ dir of the
 *  MAIN checkout (never inside this worktree — worktrees cannot nest). */
function prepareBaselineTree(sha) {
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!commonDir) throw new Error('cannot locate the main repository (git rev-parse --git-common-dir failed)')
  const mainRoot = dirname(commonDir)
  const base = join(mainRoot, 'local', 'verify-baseline')
  mkdirSync(base, { recursive: true })
  const dir = join(base, sha.slice(0, 12))
  if (existsSync(join(dir, 'package.json'))) {
    console.log(`# reusing the baseline checkout ${dir}`)
    return { dir, base, mainRoot }
  }
  git(['worktree', 'prune'], mainRoot)
  if (existsSync(dir)) {
    // Present but not a checkout: either a leftover, or ANOTHER run checking out
    // this very sha right now. Deleting it could pull the rug from under that
    // run, so say what to do rather than destroy somebody else's tree.
    throw new Error(`${dir} exists but is not a checkout — another classification may be preparing it; retry, or remove it by hand`)
  }
  const res = spawnSync('git', ['worktree', 'add', '--detach', dir, sha], { windowsHide: true, cwd: mainRoot, encoding: 'utf8' })
  if (res.status !== 0) throw new Error(`git worktree add failed: ${(res.stderr ?? '').trim()}`)
  console.log(`# baseline checkout ${dir}`)
  return { dir, base, mainRoot }
}

/** A checkout younger than this is left alone even when it is over the
 *  retention count — a parallel classification may be serving from it. */
const PRUNE_MIN_AGE_MS = 2 * 60 * 60 * 1000

/** Keep only the newest KEEP_BASELINES checkouts; a full tree each. */
function pruneOldBaselines({ base, mainRoot, keepDir }) {
  let entries
  try {
    entries = readdirSync(base).map((n) => ({ n, dir: join(base, n), t: statSync(join(base, n)).mtimeMs }))
  } catch {
    return
  }
  entries.sort((a, b) => b.t - a.t)
  for (const e of entries.slice(KEEP_BASELINES)) {
    if (e.dir === keepDir || Date.now() - e.t < PRUNE_MIN_AGE_MS) continue
    spawnSync('git', ['worktree', 'remove', '--force', e.dir], { windowsHide: true, cwd: mainRoot, encoding: 'utf8' })
    if (existsSync(e.dir)) rmSync(e.dir, { recursive: true, force: true })
  }
  spawnSync('git', ['worktree', 'prune'], { windowsHide: true, cwd: mainRoot, encoding: 'utf8' })
}

/** Where the kept run outputs go: a lane that dies takes its reason with it
 *  unless the output survives the child process (point 418). A SIBLING of the
 *  baseline checkouts, never inside them — pruneOldBaselines walks that dir and
 *  would delete the very evidence it was kept for. */
function logDir(mainRoot) {
  const dir = join(mainRoot, 'local', 'verify-baseline-logs')
  mkdirSync(dir, { recursive: true })
  return dir
}

function runSuiteOnce({ suitePath, cwd, baseUrl, label, logPath }) {
  console.log(`# ${label}`)
  const res = spawnSync(process.execPath, [suitePath], {
    windowsHide: true,
    cwd,
    encoding: 'utf8',
    env: baseUrl ? { ...process.env, BASE_URL: baseUrl } : process.env,
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  const stderr = res.stderr ?? ''
  const out = (res.stdout ?? '') + stderr
  const failed = failedChecks(out)
  const checks = allChecks(out)
  console.log(`  → exit ${res.status}, ${checks.length} checks, ${failed.length} failing`)
  if (logPath) {
    // Written UNCONDITIONALLY, before anything is judged: on 29.07.2026 the
    // baseline lane died twice and its stderr — the only evidence of why — was
    // discarded with the child process.
    try {
      writeFileSync(logPath, out)
      console.log(`  → output kept at ${logPath}`)
    } catch (err) {
      console.log(`  → could not keep the output (${err?.message ?? err})`)
    }
  }
  // A run that ends with no FAIL line but a non-zero exit did not fail — it
  // DIED. Its tail is the first evidence, so print it here rather than only
  // naming a log file nobody opens.
  if (res.status !== 0 && failed.length === 0) {
    const tail = (stderr || out).split(/\r?\n/).filter((l) => l.trim()).slice(-12)
    console.log(`  → NO failing check but exit ${res.status} — this run DIED. Last ${tail.length} output line(s):`)
    for (const l of tail) console.log(`     | ${l}`)
  }
  return { out, exitCode: res.status, checks, failed }
}

async function main() {
  const opts = parseWrapperArgs(process.argv.slice(2))
  if (!opts.suite || !DEV_SUITES.includes(opts.suite)) {
    console.log(`usage: node scripts/verify/baseline-classify.mjs <suite> [--ref <git-ref>] [--runs n] [--failed "<check>"] [--current-out <file>] [--strict]`)
    console.log(`known suites: ${DEV_SUITES.join(', ')}`)
    process.exit(2)
  }
  const backend = selectBackend(process.env.VERIFY_GL)
  const baseline = resolveBaseline(opts.ref)
  if (!baseline) {
    console.log('baseline-classify: no baseline commit resolved (no main / origin/main, and no --ref) — nothing classified.')
    process.exit(0)
  }
  const headSha = git(['rev-parse', 'HEAD'])
  if (baseline.sha === headSha) {
    console.log(`baseline-classify: the baseline (${baseline.ref}) IS the current commit — there is nothing to compare.`)
    console.log('  On main, name the pre-change commit explicitly, e.g. --ref HEAD~1 (or --ref <sha> before the change).')
    process.exit(0)
  }
  console.log(`# baseline ${baseline.sha.slice(0, 12)} (${baseline.ref}) — suite ${opts.suite}, backend ${backend}, ${opts.runs} run(s)`)

  // A serverless (pure Node) suite reads its OWN tree, so the baseline runs the
  // BASELINE copy of the script; everything else runs the CURRENT check against
  // a baseline dev server.
  const needsServer = !SERVERLESS_SUITES.includes(opts.suite)
  const tree = prepareBaselineTree(baseline.sha)

  // What is red NOW: handed in by run-all (its captured output or the names), or
  // measured here by running the suite in THIS tree.
  let currentFailed = opts.failed.map(checkFromName)
  // How far the CURRENT run got — the yardstick a died-early baseline is
  // measured against (point 418).
  let currentCheckCount = opts.currentChecks
  if (opts.currentOut && existsSync(opts.currentOut)) {
    const text = readFileSync(opts.currentOut, 'utf8')
    currentFailed = failedChecks(text)
    currentCheckCount = allChecks(text).length
  }
  if (currentFailed.length === 0) {
    let server
    try {
      const url = needsServer ? (server = await launchServer('npm run dev', 'current', ROOT)).base : null
      const run = runSuiteOnce({
        suitePath: join(HERE, `${opts.suite}.mjs`),
        cwd: ROOT,
        baseUrl: url,
        label: `running ${opts.suite} on the CURRENT tree to see what is red`,
        logPath: join(logDir(tree.mainRoot), `${opts.suite}-current.log`),
      })
      currentFailed = run.failed
      currentCheckCount = run.checks.length
    } finally {
      killTree(server?.child)
    }
  }
  if (currentFailed.length === 0) {
    console.log('baseline-classify: nothing is failing in this tree — nothing to classify.')
    process.exit(0)
  }

  const outputs = []
  const logs = []
  let server
  try {
    const url = needsServer ? (server = await launchServer('npm run dev', 'baseline', tree.dir)).base : null
    for (let i = 1; i <= opts.runs; i++) {
      const logPath = join(logDir(tree.mainRoot), `${opts.suite}-baseline-${baseline.sha.slice(0, 12)}-run${i}.log`)
      logs.push(logPath)
      const run = runSuiteOnce({
        // The CURRENT check against the BASELINE app, so only the product
        // differs — except for the pure-Node suites, which read their own
        // tree and must therefore run the baseline's own copy.
        suitePath: needsServer ? join(HERE, `${opts.suite}.mjs`) : join(tree.dir, 'scripts', 'verify', `${opts.suite}.mjs`),
        cwd: needsServer ? ROOT : tree.dir,
        baseUrl: url,
        label: `baseline run ${i}/${opts.runs}`,
        logPath,
      })
      outputs.push({ output: run.out, exitCode: run.exitCode })
      const death = baselineRunDeath({ ...run, currentCheckCount })
      if (death) {
        console.log(
          `  !! baseline run ${i} DIED after ${death.reached}` +
            `${death.expected ? ` of ${death.expected}` : ''} checks — last: "${death.lastCheck}"`,
        )
      }
    }
  } finally {
    killTree(server?.child)
    if (!opts.keep) pruneOldBaselines({ base: tree.base, mainRoot: tree.mainRoot, keepDir: tree.dir })
  }

  const folded = foldBaselineRuns(outputs, { currentCheckCount })
  const classified = folded.ran
    ? classifyAgainstBaseline({
        currentFailed,
        baselineFailed: folded.failed,
        baselineChecks: folded.checks,
        baselineFlaky: folded.flaky,
        baselineDied: folded.died,
      })
    : []
  const suiteFileChanged = Boolean(git(['diff', '--name-only', baseline.sha, '--', `scripts/verify/${opts.suite}.mjs`]))
  const infraChanged = (git(['diff', '--name-only', baseline.sha, '--', ...INFRA_PATHS]) ?? '').split('\n').filter(Boolean)
  for (const line of formatBaselineReport({
    suite: opts.suite,
    ref: `${baseline.sha.slice(0, 12)} (${baseline.ref})`,
    backend,
    classified,
    suiteFileChanged,
    infraChanged,
    baselineRan: folded.ran,
    deaths: folded.deaths,
    shortfalls: folded.shortfalls,
    logs,
    note: folded.ran ? '' : 'a baseline run produced no result at all (crash, timeout, or the server never came up).',
  })) {
    console.log(line)
  }
  const regressions = classified.filter((c) => c.verdict === 'real-regression').length
  // --strict fails on a DIED baseline too: it produced no classification at all,
  // which is a worse outcome than a regression it could have named (point 418).
  process.exit(opts.strict && (regressions > 0 || folded.died || !folded.ran) ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    // Fail SOFT: a triage aid must never turn a readable red into a crashed run.
    console.log(`baseline-classify: could not classify — ${err?.message ?? err}`)
    process.exit(0)
  })
}
