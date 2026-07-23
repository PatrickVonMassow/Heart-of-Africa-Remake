// Headless verification for the in-game render benchmark (design.md §21.1,
// F8; CLAUDE.md §7.1 pt. 20): the browser-only half. The sweep plan, the
// fixed-timestep clock, the statistics and the report shaping are pure-tested
// in src/systems/benchmark.test.ts; the F8 binding and the localized overlay
// in src/ui/BenchmarkOverlay.test.tsx. What needs a real browser is the RUN:
// F8 in the `?bench=short` mode must drive the live scene through every config
// of the route, publish one report row per config × phase (with the GPU series
// measured on WebGPU and honestly flagged unavailable on the WebGL 2 lane), put
// the progress modal up while it runs — and afterwards leave the game as it was,
// Math.random included (the run installs a seeded PRNG over it, and a leaked
// one would silently derandomise every later session).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// `?bench=short` shrinks the sample so the run fits a regression suite; the
// full sweep is the same code path with the shipped frame counts.
await page.goto(new URL('?bench=short', BASE).href)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__ui && window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
await page.waitForTimeout(3000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__game.getState().leavePlace()
})
await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })

// Deliberately NON-default settings, so "restored afterwards" means restored to
// what the player had — not merely reset to the defaults the benchmark uses.
const BEFORE = await page.evaluate(() => {
  const ui = window.__ui.getState()
  ui.setSsaoEnabled(false)
  ui.setWheelZoomEnabled(true)
  ui.setTravelZoom(1.5)
  ui.setJournalDnd(false)
  window.__balance.travelSpeed = 7.25
  window.__origRandom = Math.random
  const s = window.__ui.getState()
  const g = window.__game.getState()
  return {
    ssaoEnabled: s.ssaoEnabled,
    traaEnabled: s.traaEnabled,
    shadowsEnabled: s.shadowsEnabled,
    shadowMapHalf: s.shadowMapHalf,
    travelZoom: s.travelZoom,
    journalDnd: s.journalDnd,
    travelSpeed: window.__balance.travelSpeed,
    randomEvents: window.__balance.randomEventsEnabled,
    deadline: window.__balance.deadline.enabled,
    seed: g.seed,
    day: g.day,
  }
})

// --- F8 starts the run, the modal comes up -----------------------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' })))
await page.waitForFunction(() => window.__ui.getState().benchProgress !== null, null, { timeout: 60000 })
const modalUp = await page.locator('.bench-progress').count()
check('the progress modal is up while the benchmark runs', modalUp === 1, `${modalUp} modal(s)`)
const progressNames = await page.evaluate(() => {
  const p = window.__ui.getState().benchProgress
  return { phase: p.phase, total: p.framesTotal }
})
check(
  'the progress names the route phase and the fixed total frame count',
  typeof progressNames.phase === 'string' && progressNames.total > 0,
  JSON.stringify(progressNames),
)

// --- the sweep finishes with one row per config × phase ----------------------
await page.waitForFunction(() => window.__ui.getState().benchReport !== null, null, { timeout: 300000 })
const result = await page.evaluate(() => {
  const file = window.__ui.getState().benchReport
  return { filename: file.filename, aborted: file.aborted, report: JSON.parse(file.json) }
})
const report = result.report
const configs = [...new Set(report.rows.map((r) => r.config))]
const phases = [...new Set(report.rows.map((r) => r.phase))]
check('the run completed without an abort', result.aborted === false)
check(
  'one report row per config and phase',
  report.rows.length === configs.length * phases.length && configs.length >= 10 && phases.length === 3,
  `${report.rows.length} rows, ${configs.length} configs, ${phases.length} phases`,
)
check(
  'every row carries frame-time statistics, draw calls and triangles',
  report.rows.every((r) => r.frame.n > 0 && r.frame.median >= 0 && r.cpu.n > 0 && r.drawCalls > 0 && r.triangles > 0),
  JSON.stringify(report.rows[0]?.frame ?? null),
)
check(
  'every row carries a scene-graph triangle breakdown',
  report.rows.every((r) => Object.keys(r.sceneTriangles).length > 0),
)
// GPU time is the series that answers the geometry question under vsync — it
// must be MEASURED where the backend can (WebGPU + timestamp-query) and
// FLAGGED, never fabricated, where it cannot (the WebGL 2 lane).
const gpuRows = report.rows.filter((r) => r.gpu !== null)
if (report.env.backend === 'webgl2') {
  check(
    'WebGL 2: GPU timing is flagged unavailable with a reason, and no row fakes one',
    report.gpuTiming.available === false && report.gpuTiming.reason.length > 0 && gpuRows.length === 0,
    `${report.gpuTiming.reason} / ${gpuRows.length} rows with gpu`,
  )
} else {
  check(
    'WebGPU: real GPU timestamps were measured for every row',
    report.gpuTiming.available === true && gpuRows.length === report.rows.length && gpuRows.every((r) => r.gpu.n > 0 && r.gpu.median > 0),
    `${gpuRows.length}/${report.rows.length} rows, reason "${report.gpuTiming.reason}"`,
  )
}
// The levers must BITE, judged by the real signal (the rendered geometry), not
// by the config object agreeing with itself: a mis-named override key once left
// point 209's refinement fully on while the report claimed it off.
const desertRow = (config) => report.rows.find((r) => r.config === config && r.phase === 'desert-standing')
const baseDesert = desertRow('baseline')
const heaviest = Object.entries(baseDesert?.sceneTriangles ?? {}).sort((a, b) => b[1].tris - a[1].tris)[0]
const terrainTris = (row) => row?.sceneTriangles?.[heaviest?.[0]]?.tris ?? 0
for (const config of ['terrain-refine-off', 'terrain-cap-84']) {
  const cut = terrainTris(baseDesert) - terrainTris(desertRow(config))
  check(
    `the ${config} lever really cuts the terrain geometry`,
    cut > 0,
    `${terrainTris(baseDesert)} -> ${terrainTris(desertRow(config))} (${heaviest?.[0]})`,
  )
}

check(
  'the report names the series to read, consistent with the GPU availability',
  ['gpu', 'cpu', 'wall'].includes(report.headline) && (report.headline === 'gpu') === report.gpuTiming.available,
  `headline ${report.headline}, gpu ${report.gpuTiming.available}`,
)
check(
  'the digest states the headline series before the table',
  report.summary.some((l) => l.startsWith('HEADLINE:')),
)
check(
  'the result panel names the trustworthy series to the player',
  (await page.locator('.bench-headline').count()) === 1,
)
check(
  'the report names the environment (backend, viewport, build)',
  ['webgpu', 'webgl2'].includes(report.env.backend) &&
    report.env.viewport.width === 1440 &&
    typeof report.env.userAgent === 'string' &&
    typeof report.env.commit === 'string',
  `${report.env.backend} ${report.env.adapter}`,
)
check(
  'the file is named with the date and the backend',
  /^hoa-bench-\d{4}-\d{2}-\d{2}-(webgpu|webgl2)\.json$/.test(result.filename),
  result.filename,
)
check('the report leads with a human-readable digest', Array.isArray(report.summary) && report.summary.length > 3)
check(
  'the run was deterministic by construction (fixed seed, date, timestep)',
  report.seed > 0 && report.day === 181 && Math.abs(report.dt - 1 / 60) < 1e-9,
  `seed ${report.seed}, day ${report.day}, dt ${report.dt}`,
)

await page.screenshot({ path: OUT + '136-benchmark-report.png' })

// --- everything restored -----------------------------------------------------
const after = await page.evaluate(() => {
  const s = window.__ui.getState()
  const g = window.__game.getState()
  return {
    ssaoEnabled: s.ssaoEnabled,
    traaEnabled: s.traaEnabled,
    shadowsEnabled: s.shadowsEnabled,
    shadowMapHalf: s.shadowMapHalf,
    travelZoom: s.travelZoom,
    journalDnd: s.journalDnd,
    travelSpeed: window.__balance.travelSpeed,
    randomEvents: window.__balance.randomEventsEnabled,
    deadline: window.__balance.deadline.enabled,
    seed: g.seed,
    day: g.day,
    randomRestored: Math.random === window.__origRandom,
    progressCleared: s.benchProgress === null,
  }
})
// The in-game day is a float the drift can nudge by a hair after the restore,
// so numbers compare with a tolerance; everything else is exact.
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-3 : a === b)
for (const key of Object.keys(BEFORE)) {
  check(`restored: ${key}`, same(after[key], BEFORE[key]), `${BEFORE[key]} -> ${after[key]}`)
}
check('Math.random is the original function again', after.randomRestored === true)
check('the progress state is cleared once the report is up', after.progressCleared === true)

// --- Esc closes the report ---------------------------------------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })))
await page.waitForTimeout(300)
check('Esc closes the result panel', (await page.locator('.bench-report').count()) === 0)

// The digest itself, so a suite run leaves the actual numbers behind (run-all
// captures this; only a direct run prints it).
console.log(report.summary.join('\n'))

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
