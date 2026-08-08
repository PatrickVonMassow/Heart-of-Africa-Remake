// Full regression runner (CLAUDE.md §7.2): starts the dev server, runs every
// headless verify suite against it, then builds and runs the production-preview
// smoke test. Exits non-zero if any suite fails or logs a console error.
//
//   npm test            # the whole (LARGE) regression
//   npm run test:small  # Vitest + the SMALL everyday browser gate (no preview)
//   npm run test:large  # Vitest + every browser suite + preview (== npm test)
//   npm test -- flow    # only the named suite(s), dev server managed for you
//   npm test -- enrichments --section=<name>   # ONE declared section (point 566)
// The tier split (point 173) and the backend map (points 184/204) live in
// ./tiers.mjs; see the note below and scripts/verify/README.md.
//
// Requires the dev dependencies installed (Playwright + Chromium).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { killTree, launchServer } from './_server.mjs'
import { allChecks, changeRelatedness, failedChecks, formatRepeatReport, repeatSignature } from './baseline-classify-core.mjs'
import {
  LEVEL, annotateResult, annotateStageFailure, decideRun, formatLoadReport, onLoadMode,
} from './machine-load-core.mjs'
import { readMachine } from './machine-load.mjs'
import { DEV_SUITES, needsDevServer, parseArgs, planBackends, selectBackend, skippedSuites, suitesFor } from './tiers.mjs'
import { SECTION_ENV, listSections, resolveSelection } from './sections.mjs'
import { readFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))

// Hybrid test architecture: the fast, deterministic Vitest layer (jsdom, no
// browser) runs first (`unit` stage below) and covers all pure logic, store
// transitions and HTML-HUD component classes/text. Only the checks that
// genuinely need a real browser remain here as Playwright suites against the
// dev server (on an auto-assigned free port, never the default :5173, so a
// manual `npm run dev` never collides): the R3F/three scene + RAF wildlife, real layout geometry,
// canvas/WebGL init, pointer-lock, TTS audio, the §7.2 acceptance screenshots
// and one end-to-end core flow. `docs` is a pure Node check that runs in the
// same pass for a single report. See scripts/verify/README.md for the full
// old→new mapping table.
//
// Regression tiers (point 173) and the backend dimension (points 184/204) are
// the pure decision layer in ./tiers.mjs (Vitest-pinned in tiers.test.mjs):
// DEV_SUITES (the LARGE set), SMALL_SUITES (the fast everyday gate),
// WEBGL_ONLY_SUITES (touch/voice — the documented headless-WebGPU exception),
// and the arg/backend planning below. Pick per task:
//   npm run test:small   # Vitest + the small browser gate (no prod preview)
//   npm run test:large   # Vitest + every browser suite + preview, BOTH backends
//   npm test             # the full LARGE regression (default) — same
//   npm test -- flow …   # just the named suite(s); dev server managed, no preflight
// The closing cycle ALWAYS runs LARGE.
// VERIFY_GL selects the renderer the suites launch (mirrored from _browser.mjs;
// default webgl, propagated to each suite via the inherited env).
const VERIFY_GL = selectBackend(process.env.VERIFY_GL)

const args = process.argv.slice(2)
const { tier, filter, flags, fullRun, isLargeEquivalent, baseline, section } = parseArgs(args)
const wantBaseline = baseline || process.env.VERIFY_BASELINE === '1'

// Run ONE declared section of ONE suite (point 566) — the repair loop, where a
// check that needed fixing used to cost the whole 17-minute pass. Validated HERE,
// before anything is built or booted, from the suite's own source: an unknown
// name must cost a tenth of a second and name the sections that exist, never a
// browser boot that then asserts nothing and exits 0.
if (section !== null) {
  const die = (msg) => {
    console.log(msg)
    process.exit(1)
  }
  if (section === '') die('--section needs its value ATTACHED: `--section=<name>` (a space would read as a suite filter)')
  if (filter.length !== 1 || !DEV_SUITES.includes(filter[0])) {
    die(`--section=${section} needs exactly ONE suite named beside it, e.g. \`npm test -- enrichments --section=${section}\``)
  }
  const suite = filter[0]
  let source = ''
  try {
    source = readFileSync(join(HERE, `${suite}.mjs`), 'utf8')
  } catch {
    die(`--section: cannot read scripts/verify/${suite}.mjs`)
  }
  const verdict = resolveSelection({ sections: listSections(source), requested: section, suite })
  if (!verdict.ok) die(verdict.message)
  // The suites read it from the env; the run recorder stamps the record PARTIAL
  // from the same variable, which is what stops it counting as backend coverage.
  process.env[SECTION_ENV] = section
  console.log(`# PARTIAL: only section "${section}" of ${suite} — NOT suite coverage (point 566)`)
} else {
  // A leftover from an earlier partial run in this shell would silently narrow a
  // full regression to one section. A run that did not ASK for one runs whole.
  delete process.env[SECTION_ENV]
}

// point 204(b): a bare LARGE run (`npm test` / `npm run test:large`) covers BOTH
// renderer backends in one command — it re-invokes itself once per planned pass.
// An explicit VERIFY_GL (the gate's per-backend clear command), the SMALL tier,
// or a bare single-suite filter stays a single-backend pass, as before.
const backendPlan = planBackends({
  isLargeEquivalent,
  verifyGl: process.env.VERIFY_GL,
  ranBoth: process.env.RVA_RAN_BOTH === '1',
})
if (backendPlan.length > 0) {
  const self = fileURLToPath(import.meta.url)
  const runBackend = (pass) =>
    spawnSync(process.execPath, [self, ...args], {
      windowsHide: true,
      cwd: join(HERE, '..', '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        RVA_RAN_BOTH: '1',
        VERIFY_GL: pass.backend,
        ...(pass.skipPreflight ? { RVA_SKIP_PREFLIGHT: '1' } : {}),
      },
    }).status ?? 1
  for (const [i, pass] of backendPlan.entries()) {
    const label = pass.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'
    const shape = pass.skipPreflight
      ? 'render suites; preflight/preview already proven'
      : 'full, with preflight'
    console.log(`\n===== LARGE regression — backend ${i + 1}/${backendPlan.length}: ${label} (${shape}) =====`)
    const status = runBackend(pass)
    if (status !== 0) {
      console.log(`\nLARGE FAILED on the ${label} backend — not proceeding to the remaining backend(s).`)
      process.exit(status)
    }
  }
  process.exit(0)
}
// On the second (WebGPU) pass of a both-backend LARGE run, the backend-agnostic
// preflight (build/lint/unit) and the prod preview were already proven on the
// first pass — skip them and run only the render browser suites.
const skipPreflight = process.env.RVA_SKIP_PREFLIGHT === '1'

// Is the machine QUIET enough for this run's verdict to be evidence (point 296)?
// The other half of the point-294 triage, and the half today's damage came from:
// `enrichments` was judged "a real failure, not a flake" while a unit run and two
// agents shared the machine (the same suite was green on a quiet one), and a unit
// run produced four "Test timed out in 5000ms" failures because a dev server from
// an earlier verify run had never been shut down. So the machine is read BEFORE
// the run: a leftover is named with the command that ends it, and a timing
// verdict taken under load is labelled rather than reported as a plain red.
// Default `flag` (never blocks); `--on-load=defer` / VERIFY_ON_LOAD=defer skips
// such a run outright, `off` disables the check. Probed once here, before the
// minutes of build/lint the preflight costs.
const loadMode = onLoadMode({ flags, env: process.env.VERIFY_ON_LOAD })
let machine = { level: LEVEL.unknown, strays: [] }
if (loadMode !== 'off') {
  machine = await readMachine()
  const plannedSuites = suitesFor({ tier, filter, backend: VERIFY_GL })
  const decision = decideRun({ suites: plannedSuites, level: machine.level, mode: loadMode })
  for (const line of formatLoadReport({ load: machine, decision, mode: loadMode })) console.log(line)
  if (decision.action === 'defer') {
    console.log(`\nDEFERRED — not run (exit ${decision.exitCode}). Nothing failed; nothing was proven either.`)
    process.exit(decision.exitCode)
  }
}

// Per-suite wall timeout (point 249): a GENEROUS backstop so a genuinely hung
// suite (a frozen renderer, a dead server) is killed and reported rather than
// hanging the whole regression forever — but high enough that a slow-but-green
// run (the staged-drama suites poll until state on a slow WebGPU backend) is
// NEVER killed for merely being slow. Configurable via VERIFY_SUITE_TIMEOUT_MS.
const SUITE_TIMEOUT_MS = Number(process.env.VERIFY_SUITE_TIMEOUT_MS) || 45 * 60 * 1000
function runSuite(name, baseUrl) {
  const res = spawnSync(process.execPath, [join(HERE, `${name}.mjs`)], {
    windowsHide: true,
    encoding: 'utf8',
    // The suites read BASE_URL (default :5173/:4173); pass the actual server
    // URL so they hit the regression's own server, not a manual dev server.
    env: baseUrl ? { ...process.env, BASE_URL: baseUrl } : process.env,
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  if (res.error && res.error.code === 'ETIMEDOUT') {
    console.log(`FAIL  ${name.padEnd(12)} — KILLED after ${Math.round(SUITE_TIMEOUT_MS / 60000)} min wall timeout (hung, not slow — raise VERIFY_SUITE_TIMEOUT_MS if this was a genuine slow-green run)`)
    return { ok: false, out: '' }
  }
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  const pass = (out.match(/^PASS/gm) ?? []).length
  const fail = (out.match(/^FAIL/gm) ?? []).length
  const errMatch = out.match(/console errors: (\d+)/)
  const consoleErrors = errMatch ? Number(errMatch[1]) : 0
  const ok = res.status === 0 && fail === 0 && consoleErrors === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(12)} ${pass} pass, ${fail} fail, ${consoleErrors} console-errors (exit ${res.status})`)
  if (!ok) {
    for (const line of out.split('\n')) if (/^FAIL|ERR:/.test(line)) console.log('      ' + line)
    // A non-zero exit without any FAIL line is a CRASH (uncaught exception,
    // timeout throw): echo the tail so the cause is not swallowed.
    if (res.status !== 0 && fail === 0) {
      for (const line of out.split('\n').filter((l) => l.trim()).slice(-12)) console.log('      | ' + line)
    }
  }
  return { ok, out }
}

// Auto-retry a failed BROWSER suite once (point 200 — general flake resilience).
// The suites drive a real-time RAF simulation whose staging can miss its window
// under full-regression load, and each run tends to surface a DIFFERENT rare
// intermittent — so a single retry almost always clears a rotating flake, while
// a REAL failure fails BOTH runs and is still reported. A retry is made LOUD, not
// silent: a "PASSED ON RETRY" line flags the suite for investigation, so a
// genuine INTERMITTENT bug (one that flaked, like the buried-drinker) is surfaced
// rather than masked. The root-cause fix stays the point-200 sim-clock/condition
// polling; this only stops one transient from failing the whole regression.
//
// A double failure is TRIAGED, not asserted (point 294). "Failed twice" used to
// print "a real failure, not a flake", which is not what two failures prove: on
// 27.07.2026 `enrichments` failed two staging checks, then a completely
// different one on the retry, on a loaded machine — the signature of load, and
// none of the three checks had anything to do with the change. So the verdict is
// read from the failing check NAMES (baseline-classify-core.mjs): the SAME check
// twice is a candidate real failure, disjoint sets are load. Whether the check
// even touches the diff is printed beside it as a weak second signal.
const RETRY_ENABLED = process.env.VERIFY_NO_RETRY !== '1'
/** Suites that stayed red, kept for the opt-in baseline classification below.
 *  `runs` is 1 in strict mode (no retry, so there is no repeat signature). */
const redSuites = []
function runSuiteWithRetry(name, baseUrl) {
  const first = runSuite(name, baseUrl)
  if (first.ok) return true
  if (!RETRY_ENABLED) {
    // Strict mode (the closing's flake-free gate): no retry, so no repeat
    // signature exists — say that rather than imply one.
    redSuites.push({ suite: name, failed: failedChecks(first.out), checks: allChecks(first.out).length, runs: 1 })
    return false
  }
  console.log(`↻ retry ${name} once — a first-try failure may be a rotating staging flake (point 200)`)
  const second = runSuite(name, baseUrl)
  if (second.ok) {
    console.log(`⚠ PASSED ON RETRY  ${name} — it flaked once; INVESTIGATE if it recurs (could be a real intermittent)`)
    return true
  }
  const signature = repeatSignature({ first: first.out, second: second.out })
  const interesting = signature.stable.length ? signature.stable : [...signature.onlyFirst, ...signature.onlySecond]
  const relatedness = changeRelatedness({ checks: interesting, changedFiles: changedFiles() })
  for (const line of formatRepeatReport({ suite: name, signature, relatedness })) console.log(line)
  redSuites.push({ suite: name, failed: interesting, checks: Math.max(allChecks(first.out).length, allChecks(second.out).length), runs: 2, verdict: signature.verdict })
  return false
}

// The files this branch changed against its merge-base — the weak relatedness
// signal's input. Read once, failure-tolerant: no git, no answer, and the report
// then says nothing rather than something wrong.
let changedFilesCache = null
function changedFiles() {
  if (changedFilesCache) return changedFilesCache
  const root = join(HERE, '..', '..')
  let base = spawnSync('git', ['merge-base', 'HEAD', 'main'], { windowsHide: true, cwd: root, encoding: 'utf8' })
  if (base.status !== 0) base = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { windowsHide: true, cwd: root, encoding: 'utf8' })
  if (base.status !== 0) return (changedFilesCache = [])
  const diff = spawnSync('git', ['diff', '--name-only', base.stdout.trim(), '--'], { windowsHide: true, cwd: root, encoding: 'utf8' })
  changedFilesCache = diff.status === 0 ? diff.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : []
  return changedFilesCache
}

/**
 * OPT-IN baseline classification (point 294): for each suite that stayed red,
 * re-run it against the pre-change baseline and label each red REAL REGRESSION
 * vs PRE-EXISTING. Off by default — it is a second (and third) browser run on a
 * second checkout. Enable with `npm test -- --baseline` or VERIFY_BASELINE=1.
 */
function classifyAgainstBaselineRuns() {
  if (redSuites.length === 0) return
  console.log(`\n===== baseline classification (point 294) — ${redSuites.length} red suite(s) =====`)
  for (const { suite, failed, checks } of redSuites) {
    if (!DEV_SUITES.includes(suite)) {
      console.log(`SKIP  ${suite} — no baseline lane for it (it is not one of the dev suites).`)
      continue
    }
    if (failed.length === 0) {
      // A crash or a wall-timeout kill left no check names. Classifying would
      // mean running the suite again from scratch on BOTH sides — expensive and
      // pointless while the crash itself is the finding.
      console.log(`SKIP  ${suite} — it produced no check names (crash or timeout kill); read its output first.`)
      continue
    }
    const args = [join(HERE, 'baseline-classify.mjs'), suite]
    for (const c of failed) args.push('--failed', c.name)
    // How far the CURRENT run got: without it a baseline run that ends early
    // cannot be told from one that simply predates a newer check (point 418).
    if (checks > 0) args.push('--current-checks', String(checks))
    spawnSync(process.execPath, args, { windowsHide: true, cwd: join(HERE, '..', '..'), stdio: 'inherit' })
  }
}

// Cross-browser functional smoke (point 213): a SHORT check on Firefox + WebKit
// whose DEPTH scales with the tier (minimal/standard/thorough) — never the whole
// suite per engine. Graceful: exit 0 if the engines aren't installed. Surfaces the
// per-engine backend (WebGPU vs WebGL2 fallback).
function runCrossBrowser(baseUrl, depth) {
  const res = spawnSync(process.execPath, [join(HERE, 'crossbrowser.mjs')], {
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, BASE_URL: baseUrl, CROSSBROWSER_DEPTH: depth },
  })
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  const pass = (out.match(/^PASS/gm) ?? []).length
  const fail = (out.match(/^FAIL/gm) ?? []).length
  const skip = (out.match(/^SKIP/gm) ?? []).length
  const ok = res.status === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  crossbrowser  ${pass} pass, ${fail} fail, ${skip} skip (${depth}, exit ${res.status})`)
  // Always surface the per-engine backend + any skips; on failure also the FAILs.
  for (const line of out.split('\n')) {
    if (/backend:|^SKIP/.test(line)) console.log('      ' + line.trim())
    else if (!ok && /^FAIL/.test(line)) console.log('      ' + line.trim())
  }
  return ok
}

const results = []

// Preflight: type-check + production build and lint must be clean before the
// suites run (CLAUDE.md §7.2). Folding these into `npm test` means a feature's
// whole verification is one already-allowed command.
if (!skipPreflight && (fullRun || filter.includes('build'))) {
  console.log('# type-check + production build…')
  const build = spawnSync('npm run build', { windowsHide: true, cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
  const buildOk = build.status === 0
  console.log(`${buildOk ? 'PASS' : 'FAIL'}  build        (tsc -b + vite build, exit ${build.status})`)
  if (!buildOk) {
    console.log((build.stdout ?? '') + (build.stderr ?? ''))
    console.log('\n1 SUITE(S) FAILED — build failed, skipping the rest')
    process.exit(1) // fail fast: no point running suites against a broken build
  }
  results.push(buildOk)
}
if (!skipPreflight && (fullRun || filter.includes('lint'))) {
  console.log('# lint (oxlint)…')
  const lint = spawnSync('npx oxlint', { windowsHide: true, cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
  const out = (lint.stdout ?? '') + (lint.stderr ?? '')
  const lintOk = lint.status === 0 && !/warning|error/i.test(out)
  console.log(`${lintOk ? 'PASS' : 'FAIL'}  lint         (oxlint, exit ${lint.status})`)
  if (!lintOk) console.log(out)
  results.push(lintOk)
}

// Vitest layer (jsdom): the fast, deterministic unit + component tests that
// carry the bulk of the coverage. Type-checked first (esbuild strips types at
// runtime, so tsc guards the test files), then run. Fail fast — no point
// driving the slow browser suites if the deterministic layer is red.
if (!skipPreflight && (fullRun || filter.includes('unit'))) {
  console.log('# unit + component tests (vitest, jsdom)…')
  const root = join(HERE, '..', '..')
  const tc = spawnSync('npx tsc -p tsconfig.vitest.json --noEmit', { windowsHide: true, cwd: root, shell: true, encoding: 'utf8' })
  if (tc.status !== 0) {
    console.log('FAIL  test-types   (tsc -p tsconfig.vitest.json)')
    console.log((tc.stdout ?? '') + (tc.stderr ?? ''))
    console.log('\n1 SUITE(S) FAILED — test type-check failed, skipping the rest')
    process.exit(1)
  }
  console.log('PASS  test-types   (tsc -p tsconfig.vitest.json)')
  // NO_COLOR keeps the summary free of ANSI escapes so the count parses cleanly.
  const unit = spawnSync('npx vitest run', {
    windowsHide: true,
    cwd: root, shell: true, encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  const out = (unit.stdout ?? '') + (unit.stderr ?? '')
  const unitOk = unit.status === 0
  const m = out.match(/Tests\s+(\d+) passed/)
  console.log(`${unitOk ? 'PASS' : 'FAIL'}  unit         (vitest jsdom, ${m ? m[1] : '?'} tests, exit ${unit.status})`)
  if (!unitOk) {
    console.log(out)
    console.log('\n1 SUITE(S) FAILED — vitest failed, skipping the browser suites')
    // The fail-fast path never reaches the end-of-run label, and this is exactly
    // where the 27.07. leftover dev server did its damage (four 5000 ms timeouts
    // in tests that pass in 582 ms alone) — so say it here.
    if (loadMode !== 'off') for (const line of annotateStageFailure({ stage: 'unit', ...machine })) console.log(line)
    process.exit(1) // fail fast
  }
  results.push(unitOk)
}

let dev
try {
  // On WebGPU, drop the WebGL2-only suites (logged so the skip is explicit, never a
  // silent gap) — the rest run on the selected backend.
  const devPick = suitesFor({ tier, filter, backend: VERIFY_GL })
  for (const s of skippedSuites({ tier, filter, backend: VERIFY_GL })) {
    console.log(`SKIP  ${s.padEnd(12)} (WebGL2-only — not run on WebGPU, point 184)`)
  }
  // Cross-browser smoke (point 213): on a FULL tier/default run (not a bare
  // single-suite filter) or when asked by name; depth scales with the tier
  // (minimal for SMALL, standard for LARGE/default). Run once, on the WebGL2
  // Chromium lane only — it covers the OTHER engines, so re-running it on the
  // WebGPU lane would be redundant.
  const wantCross = (fullRun || filter.includes('crossbrowser')) && VERIFY_GL !== 'webgpu'
  if (devPick.length > 0 || wantCross) {
    // A pure-Node pick (`npm test -- docs`) starts no vite server at all.
    const server = needsDevServer(devPick) || wantCross
      ? await launchServer('npm run dev', 'dev', join(HERE, '..', '..'))
      : { child: null, base: undefined }
    dev = server.child
    for (const s of devPick) results.push(runSuiteWithRetry(s, server.base))
    if (wantCross) {
      const depth = process.env.CROSSBROWSER_DEPTH ?? (tier === 'small' ? 'minimal' : 'standard')
      results.push(runCrossBrowser(server.base, depth))
    }
  }
} finally {
  killTree(dev)
}

// Production-preview smoke test (unless a filter excludes it).
// The prod-preview smoke test runs in the LARGE/default regression, not the SMALL
// gate (the `build` step already type-checks and builds; SMALL trades the extra
// prod-runtime smoke for speed).
if (!skipPreflight && ((fullRun && tier !== 'small') || filter.includes('preview'))) {
  console.log('# building for the production-preview smoke test…')
  const build = spawnSync('npm run build', { windowsHide: true, cwd: join(HERE, '..', '..'), shell: true, stdio: 'inherit' })
  if (build.status !== 0) {
    console.log('FAIL  build failed — skipping preview')
    results.push(false)
  } else {
    let preview
    try {
      const server = await launchServer('npm run preview', 'preview', join(HERE, '..', '..'))
      preview = server.child
      results.push(runSuiteWithRetry('preview', server.base))
    } finally {
      killTree(preview)
    }
  }
}

if (wantBaseline) classifyAgainstBaselineRuns()
else if (redSuites.length > 0) {
  console.log(`\n# ${redSuites.length} suite(s) stayed red — to label each red REAL REGRESSION vs PRE-EXISTING,`)
  console.log(`# re-run with --baseline (or VERIFY_BASELINE=1), or classify one suite directly:`)
  console.log(`#   node scripts/verify/baseline-classify.mjs ${redSuites[0].suite}`)
}

const failed = results.filter((r) => !r).length
console.log(`\n${failed === 0 ? 'ALL GREEN' : failed + ' SUITE(S) FAILED'} — ${results.length} suites run`)
// Say it again at the END, where the verdict is read (point 566): a green
// headline from a one-section run must never be quoted as the suite's.
if (section) console.log(`PARTIAL — only section "${section}" of ${filter[0]} ran; the suite is NOT covered by this run`)
// What the machine's state means for THIS result (point 296). The asymmetry is
// the content: a green under load still counts — load produces false REDS, not
// false greens — while a red from a timing-sensitive suite under load is not
// evidence and names the command that re-runs it alone.
if (loadMode !== 'off') {
  for (const line of annotateResult({
    level: machine.level,
    strays: machine.strays ?? [],
    redSuites: redSuites.map((r) => r.suite),
    green: failed === 0,
  })) console.log(line)
}
process.exit(failed === 0 ? 0 : 1)
