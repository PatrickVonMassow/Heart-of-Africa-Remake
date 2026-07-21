// Full regression runner (CLAUDE.md §7.2): starts the dev server, runs every
// headless verify suite against it, then builds and runs the production-preview
// smoke test. Exits non-zero if any suite fails or logs a console error.
//
//   npm test            # the whole (LARGE) regression
//   npm run test:small  # Vitest + the SMALL everyday browser gate (no preview)
//   npm run test:large  # Vitest + every browser suite + preview (== npm test)
//   npm test -- flow    # only the named suite(s), dev server managed for you
// See the SMALL_SUITES note below for the tier split (point 173).
//
// Requires the dev dependencies installed (Playwright + Chromium).
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const isWin = process.platform === 'win32'

/** An OS-assigned free ephemeral port. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

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
const DEV_SUITES = [
  'docs', 'world', 'i18n', 'flow', 'health', 'events', 'collision', 'handwriting',
  'polish', 'gamepad', 'touch', 'voice', 'settings', 'enrichments', 'invariants',
]

// Regression tiers (point 173). The browser suites split into a SMALL everyday
// gate — fast, low-flake, core coverage (doc/i18n consistency, the one E2E core
// loop, health/events/collision, TTS) — and the LARGE set, which is EVERY suite
// (adds the heavier scene/geometry/screenshot suites and the wildlife-staging
// ones that carry the rotating family flakes). Pick per task:
//   npm run test:small   # Vitest + the small browser gate (no prod preview)
//   npm run test:large   # Vitest + every browser suite + preview  (== npm test)
//   npm test             # the full LARGE regression (default)
//   npm test -- flow …   # just the named suite(s); dev server managed, no preflight
// The closing cycle ALWAYS runs LARGE. Keep SMALL a strict subset of DEV_SUITES.
const SMALL_SUITES = ['docs', 'i18n', 'flow', 'health', 'events', 'collision', 'voice']

// Backend dimension (point 184 Pillar 3). VERIFY_GL selects the renderer the suites
// launch (mirrored from _browser.mjs; default webgl, propagated to each suite via the
// inherited env). The LARGE regression covers both backends by invoking twice
// (VERIFY_GL=webgl, then VERIFY_GL=webgpu). Two suites are WebGL2-ONLY (user decision,
// 20.07.2026): headless WebGPU under system Chrome cannot drive touch's CDP touch
// events nor voice's TTS speak-state, and BOTH were verified to render correctly on the
// WebGL2 path — so a webgpu invocation SKIPS them rather than false-failing on a harness
// limitation. Everything else runs on whichever backend VERIFY_GL selects.
const VERIFY_GL = (process.env.VERIFY_GL ?? 'webgl').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'
const WEBGL_ONLY_SUITES = ['touch', 'voice']

const args = process.argv.slice(2)
const tier = args.includes('small') ? 'small' : args.includes('large') ? 'large' : null
// Suite-name filters are the args minus the tier tokens.
const filter = args.filter((a) => a !== 'small' && a !== 'large')
// A "full" run does the preflight (build + lint + unit): the default (no args)
// or an explicit tier. Bare suite-name args skip the preflight (quick single run).
const fullRun = tier !== null || filter.length === 0
const tierSuites = tier === 'small' ? SMALL_SUITES : DEV_SUITES
const pick = (list) => (filter.length ? list.filter((s) => filter.includes(s)) : tierSuites)

function waitForServer(url, timeoutMs) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`server ${url} did not come up`))
        else setTimeout(tick, 400)
      })
    }
    tick()
  })
}

function killTree(child) {
  if (!child || child.killed) return
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else process.kill(-child.pid, 'SIGTERM')
}

/**
 * Start a vite server (`npm run dev` / `npm run preview`) on its OWN
 * OS-assigned free port and return { child, base }. The regression NEVER uses
 * the default :5173/:4173, so a developer can start, use and terminate a
 * manual `npm run dev` at any time without ever colliding with a test run.
 * `--strictPort` makes vite fail loudly rather than drift if the chosen port
 * were somehow taken in the tiny window before it binds; that (astronomically
 * rare) race is closed by one retry on a fresh port.
 */
async function launchServer(npmScript, label, cwd) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const port = await getFreePort()
    const base = `http://localhost:${port}/`
    console.log(`# starting ${label} server (:${port})…`)
    const child = spawn(`${npmScript} -- --port ${port} --strictPort`, { cwd, shell: true, detached: !isWin, stdio: 'ignore' })
    try {
      await waitForServer(base, 60000)
      return { child, base }
    } catch (err) {
      killTree(child)
      if (attempt === 1) {
        console.log(`# ${label} server did not bind :${port} (port race?) — retrying on a fresh port`)
        continue
      }
      throw err
    }
  }
}

function runSuite(name, baseUrl) {
  const res = spawnSync(process.execPath, [join(HERE, `${name}.mjs`)], {
    encoding: 'utf8',
    // The suites read BASE_URL (default :5173/:4173); pass the actual server
    // URL so they hit the regression's own server, not a manual dev server.
    env: baseUrl ? { ...process.env, BASE_URL: baseUrl } : process.env,
  })
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
  return ok
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
const RETRY_ENABLED = process.env.VERIFY_NO_RETRY !== '1'
function runSuiteWithRetry(name, baseUrl) {
  if (!RETRY_ENABLED) return runSuite(name, baseUrl) // strict mode (closing's flake-free gate)
  if (runSuite(name, baseUrl)) return true
  console.log(`↻ retry ${name} once — a first-try failure may be a rotating staging flake (point 200)`)
  if (runSuite(name, baseUrl)) {
    console.log(`⚠ PASSED ON RETRY  ${name} — it flaked once; INVESTIGATE if it recurs (could be a real intermittent)`)
    return true
  }
  console.log(`FAIL (twice)  ${name} — a real failure, not a flake`)
  return false
}

// Cross-browser functional smoke (point 213): a SHORT check on Firefox + WebKit
// whose DEPTH scales with the tier (minimal/standard/thorough) — never the whole
// suite per engine. Graceful: exit 0 if the engines aren't installed. Surfaces the
// per-engine backend (WebGPU vs WebGL2 fallback).
function runCrossBrowser(baseUrl, depth) {
  const res = spawnSync(process.execPath, [join(HERE, 'crossbrowser.mjs')], {
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
if (fullRun || filter.includes('build')) {
  console.log('# type-check + production build…')
  const build = spawnSync('npm run build', { cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
  const buildOk = build.status === 0
  console.log(`${buildOk ? 'PASS' : 'FAIL'}  build        (tsc -b + vite build, exit ${build.status})`)
  if (!buildOk) {
    console.log((build.stdout ?? '') + (build.stderr ?? ''))
    console.log('\n1 SUITE(S) FAILED — build failed, skipping the rest')
    process.exit(1) // fail fast: no point running suites against a broken build
  }
  results.push(buildOk)
}
if (fullRun || filter.includes('lint')) {
  console.log('# lint (oxlint)…')
  const lint = spawnSync('npx oxlint', { cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
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
if (fullRun || filter.includes('unit')) {
  console.log('# unit + component tests (vitest, jsdom)…')
  const root = join(HERE, '..', '..')
  const tc = spawnSync('npx tsc -p tsconfig.vitest.json --noEmit', { cwd: root, shell: true, encoding: 'utf8' })
  if (tc.status !== 0) {
    console.log('FAIL  test-types   (tsc -p tsconfig.vitest.json)')
    console.log((tc.stdout ?? '') + (tc.stderr ?? ''))
    console.log('\n1 SUITE(S) FAILED — test type-check failed, skipping the rest')
    process.exit(1)
  }
  console.log('PASS  test-types   (tsc -p tsconfig.vitest.json)')
  // NO_COLOR keeps the summary free of ANSI escapes so the count parses cleanly.
  const unit = spawnSync('npx vitest run', {
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
    process.exit(1) // fail fast
  }
  results.push(unitOk)
}

let dev
try {
  // On WebGPU, drop the WebGL2-only suites (logged so the skip is explicit, never a
  // silent gap) — the rest run on the selected backend.
  const devPick = pick(DEV_SUITES).filter(
    (s) => !(VERIFY_GL === 'webgpu' && WEBGL_ONLY_SUITES.includes(s)),
  )
  for (const s of pick(DEV_SUITES)) {
    if (VERIFY_GL === 'webgpu' && WEBGL_ONLY_SUITES.includes(s)) {
      console.log(`SKIP  ${s.padEnd(12)} (WebGL2-only — not run on WebGPU, point 184)`)
    }
  }
  // Cross-browser smoke (point 213): on a FULL tier/default run (not a bare
  // single-suite filter) or when asked by name; depth scales with the tier
  // (minimal for SMALL, standard for LARGE/default). Run once, on the WebGL2
  // Chromium lane only — it covers the OTHER engines, so re-running it on the
  // WebGPU lane would be redundant.
  const wantCross = (fullRun || filter.includes('crossbrowser')) && VERIFY_GL !== 'webgpu'
  if (devPick.length > 0 || wantCross) {
    const server = await launchServer('npm run dev', 'dev', join(HERE, '..', '..'))
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
if ((fullRun && tier !== 'small') || filter.includes('preview')) {
  console.log('# building for the production-preview smoke test…')
  const build = spawnSync('npm run build', { cwd: join(HERE, '..', '..'), shell: true, stdio: 'inherit' })
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

const failed = results.filter((r) => !r).length
console.log(`\n${failed === 0 ? 'ALL GREEN' : failed + ' SUITE(S) FAILED'} — ${results.length} suites run`)
process.exit(failed === 0 ? 0 : 1)
