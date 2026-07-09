// Full regression runner (CLAUDE.md §7.2): starts the dev server, runs every
// headless verify suite against it, then builds and runs the production-preview
// smoke test. Exits non-zero if any suite fails or logs a console error.
//
//   npm test            # the whole regression
//   npm test -- flow    # only the named suite(s), dev server managed for you
//
// Requires the dev dependencies installed (Playwright + Chromium).
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const isWin = process.platform === 'win32'

// Suites that run against the dev server (:5173), in a stable order. `docs` is
// a pure Node check (no browser) but runs in the same pass for a single report.
const DEV_SUITES = [
  'docs', 'world', 'i18n', 'hints', 'flow', 'health', 'events', 'expedition', 'economy',
  'reputation', 'camps', 'saveload', 'checkpoint', 'collision', 'handwriting',
  'polish', 'gamepad', 'voice', 'settings', 'enrichments',
]

const filter = process.argv.slice(2)
const pick = (list) => (filter.length ? list.filter((s) => filter.includes(s)) : list)

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

function runSuite(name) {
  const res = spawnSync(process.execPath, [join(HERE, `${name}.mjs`)], { encoding: 'utf8' })
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  const pass = (out.match(/^PASS/gm) ?? []).length
  const fail = (out.match(/^FAIL/gm) ?? []).length
  const errMatch = out.match(/console errors: (\d+)/)
  const consoleErrors = errMatch ? Number(errMatch[1]) : 0
  const ok = res.status === 0 && fail === 0 && consoleErrors === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(12)} ${pass} pass, ${fail} fail, ${consoleErrors} console-errors (exit ${res.status})`)
  if (!ok) {
    for (const line of out.split('\n')) if (/^FAIL|ERR:/.test(line)) console.log('      ' + line)
  }
  return ok
}

const results = []

// Preflight: type-check + production build and lint must be clean before the
// suites run (CLAUDE.md §7.2). Folding these into `npm test` means a feature's
// whole verification is one already-allowed command.
if (!filter.length || filter.includes('build')) {
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
if (!filter.length || filter.includes('lint')) {
  console.log('# lint (oxlint)…')
  const lint = spawnSync('npx oxlint', { cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
  const out = (lint.stdout ?? '') + (lint.stderr ?? '')
  const lintOk = lint.status === 0 && !/warning|error/i.test(out)
  console.log(`${lintOk ? 'PASS' : 'FAIL'}  lint         (oxlint, exit ${lint.status})`)
  if (!lintOk) console.log(out)
  results.push(lintOk)
}

let dev
try {
  const runDev = pick(DEV_SUITES).length > 0
  if (runDev) {
    console.log('# starting dev server (vite :5173)…')
    dev = spawn('npm run dev', { cwd: join(HERE, '..', '..'), shell: true, detached: !isWin, stdio: 'ignore' })
    await waitForServer('http://localhost:5173/', 60000)
    for (const s of pick(DEV_SUITES)) results.push(runSuite(s))
  }
} finally {
  killTree(dev)
}

// Production-preview smoke test (unless a filter excludes it).
if (!filter.length || filter.includes('preview')) {
  console.log('# building + starting preview server (:4173)…')
  const build = spawnSync('npm run build', { cwd: join(HERE, '..', '..'), shell: true, stdio: 'inherit' })
  if (build.status !== 0) {
    console.log('FAIL  build failed — skipping preview')
    results.push(false)
  } else {
    let preview
    try {
      preview = spawn('npm run preview', { cwd: join(HERE, '..', '..'), shell: true, detached: !isWin, stdio: 'ignore' })
      await waitForServer('http://localhost:4173/', 60000)
      results.push(runSuite('preview'))
    } finally {
      killTree(preview)
    }
  }
}

const failed = results.filter((r) => !r).length
console.log(`\n${failed === 0 ? 'ALL GREEN' : failed + ' SUITE(S) FAILED'} — ${results.length} suites run`)
process.exit(failed === 0 ? 0 : 1)
