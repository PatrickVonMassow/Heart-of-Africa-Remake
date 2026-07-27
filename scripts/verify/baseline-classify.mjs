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
//   --current-out <f>   a file holding the failing run's output (what run-all
//                       passes, so the suite is not run a third time)
//   --keep              keep the baseline worktree even on success (it is reused
//                       anyway; this only skips the retention prune)
//   --strict            exit 1 when a REAL REGRESSION was found (default: 0 —
//                       this is a triage aid, the suite result stays the gate)
//
// Cost discipline (the point's DESIGN care): this is never part of a normal
// run. run-all calls it only for a suite that failed TWICE and only with
// --baseline / VERIFY_BASELINE=1, and the baseline checkout is a REUSED git
// worktree under the git-ignored local/verify-baseline/, sharing the repo's
// node_modules through Node's ancestor resolution (no second install).
//
// The classification is EVIDENCE, not a verdict: it runs the CURRENT check
// against the BASELINE app code, so it reports the caveats that can bend that
// reading (a changed suite file, changed dependencies or boot helpers).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { killTree, launchServer } from './_server.mjs'
import { DEV_SUITES, selectBackend } from './tiers.mjs'
import {
  allChecks,
  classifyAgainstBaseline,
  failedChecks,
  foldBaselineRuns,
  formatBaselineReport,
} from './baseline-classify-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SUITE_TIMEOUT_MS = Number(process.env.VERIFY_SUITE_TIMEOUT_MS) || 45 * 60 * 1000

/** Suites that need no dev server (pure Node checks) — they read their OWN
 *  tree, so the baseline runs the BASELINE copy of the script. */
const NO_SERVER_SUITES = ['docs']

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
  const out = { suite: null, ref: null, runs: 2, keep: false, strict: false, currentOut: null, failed: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--ref') out.ref = argv[++i] ?? null
    else if (a === '--runs') out.runs = Math.max(1, Number(argv[++i]) || 1)
    else if (a === '--failed') out.failed.push(argv[++i] ?? '')
    else if (a === '--current-out') out.currentOut = argv[++i] ?? null
    else if (a === '--keep') out.keep = true
    else if (a === '--strict') out.strict = true
    else if (!a.startsWith('-') && out.suite === null) out.suite = a
  }
  out.failed = out.failed.filter(Boolean)
  return out
}

function git(args, cwd = ROOT) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' })
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
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  const res = spawnSync('git', ['worktree', 'add', '--detach', dir, sha], { cwd: mainRoot, encoding: 'utf8' })
  if (res.status !== 0) throw new Error(`git worktree add failed: ${(res.stderr ?? '').trim()}`)
  console.log(`# baseline checkout ${dir}`)
  return { dir, base, mainRoot }
}

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
    if (e.dir === keepDir) continue
    spawnSync('git', ['worktree', 'remove', '--force', e.dir], { cwd: mainRoot, encoding: 'utf8' })
    if (existsSync(e.dir)) rmSync(e.dir, { recursive: true, force: true })
  }
  spawnSync('git', ['worktree', 'prune'], { cwd: mainRoot, encoding: 'utf8' })
}

function runSuiteOnce({ suitePath, cwd, baseUrl, label }) {
  console.log(`# ${label}`)
  const res = spawnSync(process.execPath, [suitePath], {
    cwd,
    encoding: 'utf8',
    env: baseUrl ? { ...process.env, BASE_URL: baseUrl } : process.env,
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  const failed = failedChecks(out)
  console.log(`  → exit ${res.status}, ${allChecks(out).length} checks, ${failed.length} failing`)
  return out
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

  const needsServer = !NO_SERVER_SUITES.includes(opts.suite)
  const tree = prepareBaselineTree(baseline.sha)

  // What is red NOW: handed in by run-all (its captured output or the names), or
  // measured here by running the suite in THIS tree.
  let currentFailed = opts.failed.map((name) => ({ name, key: null, kind: 'check' }))
  if (opts.currentOut && existsSync(opts.currentOut)) currentFailed = failedChecks(readFileSync(opts.currentOut, 'utf8'))
  if (currentFailed.length === 0) {
    let server
    try {
      const url = needsServer ? (server = await launchServer('npm run dev', 'current', ROOT)).base : null
      currentFailed = failedChecks(
        runSuiteOnce({
          suitePath: join(HERE, `${opts.suite}.mjs`),
          cwd: ROOT,
          baseUrl: url,
          label: `running ${opts.suite} on the CURRENT tree to see what is red`,
        }),
      )
    } finally {
      killTree(server?.child)
    }
  }
  if (currentFailed.length === 0) {
    console.log('baseline-classify: nothing is failing in this tree — nothing to classify.')
    process.exit(0)
  }
  // Re-key the names handed in as bare strings.
  currentFailed = currentFailed.map((c) => (c.key ? c : failedChecks(`FAIL  ${c.name}`)[0] ?? c))

  const outputs = []
  let server
  try {
    const url = needsServer ? (server = await launchServer('npm run dev', 'baseline', tree.dir)).base : null
    for (let i = 1; i <= opts.runs; i++) {
      outputs.push(
        runSuiteOnce({
          // The CURRENT check against the BASELINE app, so only the product
          // differs — except for the pure-Node suites, which read their own
          // tree and must therefore run the baseline's own copy.
          suitePath: needsServer ? join(HERE, `${opts.suite}.mjs`) : join(tree.dir, 'scripts', 'verify', `${opts.suite}.mjs`),
          cwd: needsServer ? ROOT : tree.dir,
          baseUrl: url,
          label: `baseline run ${i}/${opts.runs}`,
        }),
      )
    }
  } finally {
    killTree(server?.child)
    if (!opts.keep) pruneOldBaselines({ base: tree.base, mainRoot: tree.mainRoot, keepDir: tree.dir })
  }

  const folded = foldBaselineRuns(outputs)
  const classified = folded.ran
    ? classifyAgainstBaseline({
        currentFailed,
        baselineFailed: folded.failed,
        baselineChecks: folded.checks,
        baselineFlaky: folded.flaky,
      })
    : []
  const suiteFileChanged = Boolean(git(['diff', '--name-only', baseline.sha, 'HEAD', '--', `scripts/verify/${opts.suite}.mjs`]))
  const infraChanged = (git(['diff', '--name-only', baseline.sha, 'HEAD', '--', ...INFRA_PATHS]) ?? '').split('\n').filter(Boolean)
  for (const line of formatBaselineReport({
    suite: opts.suite,
    ref: `${baseline.sha.slice(0, 12)} (${baseline.ref})`,
    backend,
    classified,
    suiteFileChanged,
    infraChanged,
    baselineRan: folded.ran,
    note: folded.ran ? '' : 'a baseline run produced no result at all (crash, timeout, or the server never came up).',
  })) {
    console.log(line)
  }
  const regressions = classified.filter((c) => c.verdict === 'real-regression').length
  process.exit(opts.strict && regressions > 0 ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    // Fail SOFT: a triage aid must never turn a readable red into a crashed run.
    console.log(`baseline-classify: could not classify — ${err?.message ?? err}`)
    process.exit(0)
  })
}
