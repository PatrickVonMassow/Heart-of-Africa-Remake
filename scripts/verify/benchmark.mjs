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
import { frameShutter } from './frameSubject.mjs'
import { fileURLToPath } from 'node:url'
import { timingVerdict, isWallCap, laneFpsProbe, laneHeader, unmeasuredLine } from './load-proof-core.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
// A dpr > 1 viewport (the user's notebook runs at 1.25), so a capped preset
// row measurably differs from a native one (point 1541).
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
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
// The lane's delivered rate (point 642): the route below is a fixed frame count
// inside a wall budget, so it declares the rate it needs.
const laneFps = await page.evaluate(laneFpsProbe, 2000).catch(() => null)
console.log(laneHeader(laneFps))
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
// A TIMING check (point 642): a fixed frame count must fit the 300 s budget, so
// the route needs its total over 80 % of the budget. The route always runs and
// is judged after it: completing is PASS on any lane; missing the budget on a
// lane below that rate is UNMEASURED and the run ends without the report checks;
// missing it on a lane that meets the rate is red.
const ROUTE_BUDGET_MS = 300000
const routeNeedFps = Math.max(1, Math.ceil(progressNames.total / ((ROUTE_BUDGET_MS / 1000) * 0.8)))
// Measured before the route, in the steady state: a boot-time reading can
// include a multi-second build hitch (collision read 0.2 fps on a hardware lane).
// A failed probe leaves the rate unmeasured (null), never the boot reading.
const routeFps = await page.evaluate(laneFpsProbe, 2000).catch(() => null)
const routeStarted = Date.now()
// Every wait of the route shares its one deadline, so a slow lane still ends
// in the UNMEASURED verdict below instead of a throw.
const routeLeft = () => Math.max(1, routeStarted + ROUTE_BUDGET_MS - Date.now())
const wallCapToNull = (err) => {
  if (!isWallCap(err)) throw err
  return null
}
// The climate-haze-off lever, live (point 1542): its desert phase must draw no
// haze, and the next config ('all-off', haze on) must draw it again. The
// desert is the only route phase with haze, so both samples are taken there.
// One poll reads config, phase and haze together, so a sample never comes from
// a later phase; `want` waits within the phase, `{ missed }` once it has ended.
const hazeIn = (config, wantShown) =>
  page
    .waitForFunction(
      ({ c, want }) => {
        const s = window.__ui.getState()
        const p = s.benchProgress
        if (p && p.config === c && p.phase === 'desert-standing') {
          window.__hazePhaseSeen = c
          const shown = window.__climate.hazeShown()
          return want === null || shown === want ? { enabled: window.__climate.hazeEnabled(), shown } : null
        }
        return window.__hazePhaseSeen === c || s.benchReport !== null ? { missed: true } : null
      },
      { c: config, want: wantShown },
      { timeout: routeLeft(), polling: 50 },
    )
    .then((h) => h.jsonValue(), wallCapToNull)
// Each sample is judged as soon as it returns, so a later timeout cannot
// suppress an observed failure.
const hazeOff = await hazeIn('climate-haze-off', null)
if (hazeOff) {
  check('climate-haze-off hides the ground haze in its desert phase', hazeOff.enabled === false && hazeOff.shown === false, JSON.stringify(hazeOff))
}
const hazeBack = hazeOff ? await hazeIn('all-off', true) : null
if (hazeBack) {
  check('the next config draws the ground haze again in its desert phase', hazeBack.shown === true, JSON.stringify(hazeBack))
}
const routeDone =
  hazeBack !== null &&
  (await page
    .waitForFunction(() => window.__ui.getState().benchReport !== null, null, { timeout: routeLeft() })
    .then(() => true, (err) => wallCapToNull(err) ?? false))
const routeName = 'the fixed-frame benchmark route completes and reports'
const routeLane = timingVerdict({ ok: routeDone, needFps: routeNeedFps, measuredFps: routeFps })
if (routeLane.verdict === 'unmeasured') console.log(unmeasuredLine(routeName, routeLane.reason))
else check(routeName, routeDone, `${Date.now() - routeStarted} ms of a ${ROUTE_BUDGET_MS} ms budget`)
if (!routeDone) {
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  if (routeLane.verdict === 'unmeasured') console.log('unmeasured checks: 1 (they did not run; not both-backend coverage)')
  process.exit(failures === 0 ? 0 : 1)
}
const result = await page.evaluate(() => {
  const file = window.__ui.getState().benchReport
  return { filename: file.filename, aborted: file.aborted, report: JSON.parse(file.json) }
})
const report = result.report
// The EXPECTED sweep comes from the shipped plan, never from the rows it judges:
// a config missing from both the rows and the digest must still fail.
const sweep = await page.evaluate(async () => {
  const m = await import('/src/systems/benchmark.ts')
  return {
    configs: [...m.BENCH_CONFIGS.map((c) => c.name), ...m.BENCH_PRESET_LEVELS.map((l) => m.PRESET_CONFIG_NAMES[l])],
    phases: m.BENCH_PHASES.map((p) => p.name),
  }
})
const configs = sweep.configs
const phases = sweep.phases
check('the run completed without an abort', result.aborted === false)
check(
  'one report row per config and phase',
  report.rows.length === configs.length * phases.length && configs.length >= 10 && phases.length === 4,
  `${report.rows.length} rows, ${configs.length} configs, ${phases.length} phases`,
)
// Point 1561: the settlement phase stands INSIDE the port city for every
// config, the presets included — judged by the state the row recorded at the
// end of its sample, not by the phase name.
const settlementRows = report.rows.filter((r) => r.phase === 'settlement-standing')
check(
  'every config, the low preset included, has a settlement row measured inside Cairo',
  settlementRows.length === configs.length && configs.includes('low-preset') &&
    settlementRows.every((r) => r.place === 'cairo') &&
    report.rows.filter((r) => r.phase !== 'settlement-standing').every((r) => r.place === null),
  `${settlementRows.length}/${configs.length} rows, places ${JSON.stringify([...new Set(report.rows.map((r) => r.place))])}`,
)
// Exactly ONE row and ONE digest line per (config, phase): a remount race or a
// doubled phase would add a row the count check above could balance away.
const pairKeys = report.rows.map((r) => `${r.config}|${r.phase}`)
const digestKeys = report.summary
  .map((l) => l.match(/^(\S+)\s+(savanna-standing|desert-standing|savanna-driving|settlement-standing)\s/))
  .filter(Boolean)
  .map((m) => `${m[1]}|${m[2]}`)
const pairsOnce = (keys) => configs.every((c) => phases.every((ph) => keys.filter((k) => k === `${c}|${ph}`).length === 1))
check(
  'one row and one digest line per (config, phase), the settlement included',
  new Set(pairKeys).size === pairKeys.length && pairsOnce(pairKeys) && pairsOnce(digestKeys) && digestKeys.length === pairKeys.length,
  `${pairKeys.length} rows, ${new Set(pairKeys).size} distinct, ${digestKeys.length} digest lines`,
)
// The silent later entry: no journal entry, no money, and the readiness wait
// reached a standing scene for every settlement row (no cap hit).
check(
  'every settlement entry added no journal entry and paid nothing',
  settlementRows.every((r) => r.entryCost?.journal === 0 && r.entryCost?.money === 0),
  JSON.stringify([...new Set(settlementRows.map((r) => JSON.stringify(r.entryCost ?? null)))]),
)
check(
  'every settlement row was sampled after its scene stood (no readiness timeout)',
  settlementRows.every((r) => r.readyTimeout === false),
  `${settlementRows.filter((r) => r.readyTimeout !== false).length} row(s) flagged`,
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
// Point 1549: the per-pass GPU split follows the same honesty rule — present
// per row where the pool resolved passes, otherwise flagged with a reason.
const passRows = report.rows.filter((r) => r.gpuPasses != null)
if (report.gpuTiming.available === true) {
  // Real whole-frame timestamps exist, so the split MUST exist too — an
  // "unavailable" here is a broken capture, not an honest flag.
  check(
    'WebGPU: the per-pass breakdown is measured wherever GPU timestamps are',
    report.gpuPassTiming?.available === true && passRows.length === gpuRows.length,
    `${passRows.length}/${gpuRows.length} rows, reason "${report.gpuPassTiming?.reason}"`,
  )
  // Totals and passes cover the SAME frames (a stale resolve records neither).
  check(
    'WebGPU: every breakdown covers exactly the frames of its GPU series',
    passRows.every((r) => r.gpu !== null && r.gpuPasses.frames === r.gpu.n && r.gpuPasses.passes.length > 0),
    passRows.filter((r) => r.gpu === null || r.gpuPasses.frames !== r.gpu.n).slice(0, 3).map((r) => `${r.config}/${r.phase} ${r.gpuPasses.frames} vs ${r.gpu?.n}`).join(' | '),
  )
  // Matching counts alone pass a capture whose frames resolved a total but no
  // pass; every measured frame must carry its passes, and the scene pass must
  // run in every one of them.
  const sceneFrames = (r) => r.gpuPasses.passes.find((p) => p.pass === 'output')?.frames ?? 0
  const holes = passRows.filter((r) => r.gpuPasses.emptyFrames !== 0 || sceneFrames(r) !== r.gpuPasses.frames)
  check(
    'WebGPU: every measured frame resolved its passes, the scene pass included',
    holes.length === 0,
    holes.slice(0, 3).map((r) => `${r.config}/${r.phase} empty ${r.gpuPasses.emptyFrames}, output ${sceneFrames(r)}/${r.gpuPasses.frames}`).join(' | '),
  )
  // Every pass is named after its target, never the generic call fallback.
  const generic = passRows.flatMap((r) => r.gpuPasses.passes.filter((p) => /^pass \d+$/.test(p.pass)).map((p) => `${r.config}/${r.phase} ${p.pass}`))
  check('WebGPU: every pass carries its render-target label', generic.length === 0, generic.slice(0, 3).join(' | '))
  // The real order: with sun shadows on, a shadow map is submitted before the
  // scene pass that samples it (the call index once reversed this).
  const baseRows = passRows.filter((r) => r.config === 'baseline')
  const shadowFirst = (r) => {
    const shadow = r.gpuPasses.passes.find((p) => p.pass.startsWith('ShadowMap'))
    const scene = r.gpuPasses.passes.find((p) => p.pass === 'output')
    return !!shadow && !!scene && shadow.order < scene.order
  }
  check(
    'WebGPU: the baseline rows submit a shadow map before the scene pass',
    baseRows.length === phases.length && baseRows.every(shadowFirst),
    baseRows.map((r) => `${r.phase}: ${r.gpuPasses.passes.map((p) => p.pass).join(' > ')}`).join(' | '),
  )
} else {
  check(
    'the per-pass GPU breakdown is flagged unavailable with a reason, and no row fakes one',
    report.gpuPassTiming?.available === false && report.gpuPassTiming.reason.length > 0 && passRows.length === 0 &&
      report.summary.some((l) => l.startsWith('GPU PASS BREAKDOWN: unavailable')),
    `${report.gpuPassTiming?.reason} / ${passRows.length} rows with passes`,
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
// The config after a settlement phase (point 1561): terrain-refine-off follows
// dpr-1's Cairo row, and TravelScene's remount rewrites the refine setting —
// its FIRST phase, savanna-standing, must already show the cut.
const savannaRow = (config) => report.rows.find((r) => r.config === config && r.phase === 'savanna-standing')
// Both rows must carry the terrain group: a missing or renamed group reads 0
// and would pass as a cut.
const hasTerrain = (row) => typeof row?.sceneTriangles?.[heaviest?.[0]]?.tris === 'number'
check(
  'terrain-refine-off also cuts the savanna terrain right after the settlement',
  hasTerrain(savannaRow('baseline')) && hasTerrain(savannaRow('terrain-refine-off')) &&
    terrainTris(savannaRow('baseline')) - terrainTris(savannaRow('terrain-refine-off')) > 0,
  `${terrainTris(savannaRow('baseline'))} -> ${terrainTris(savannaRow('terrain-refine-off'))} (${heaviest?.[0]})`,
)

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
// --- point 1524: every graphics level measured, each row naming its pixel ratio
for (const name of ['high-preset', 'medium-preset']) {
  const n = report.rows.filter((r) => r.config === name).length
  check(`the sweep includes the ${name} pass (one row per phase)`, n === phases.length, `${n} ${name} rows`)
}
// Point 1541: low caps at 0.8, medium at one pixel per CSS pixel, high keeps the native 1.25.
const presetRatios = (name) => JSON.stringify([...new Set(report.rows.filter((r) => r.config === name).map((r) => r.pixelRatio))])
check(
  'the low/medium/high preset rows render at pixel ratio 0.80 / 1.00 / the native 1.25',
  presetRatios('low-preset') === '[0.8]' && presetRatios('medium-preset') === '[1]' && presetRatios('high-preset') === '[1.25]',
  `low ${presetRatios('low-preset')}, medium ${presetRatios('medium-preset')}, high ${presetRatios('high-preset')}`,
)
check(
  'every row records the pixel ratio it was measured at',
  report.rows.every((r) => typeof r.pixelRatio === 'number' && r.pixelRatio > 0),
  JSON.stringify([...new Set(report.rows.map((r) => r.pixelRatio))]),
)
// --- point 293: the LOW-preset per-system cost ranking -----------------------
const low = report.lowProfile
const lowRows = report.rows.filter((r) => r.config === 'low-preset')
check(
  'the sweep includes the low-preset profiling pass (one row per phase)',
  lowRows.length === phases.length,
  `${lowRows.length} low-preset rows`,
)
check(
  'the report carries a low-preset cost profile with a ranked phase for every low row',
  !!low && Array.isArray(low.phases) && low.phases.length === lowRows.length && typeof low.headlinePhase === 'string',
  low ? `${low.phases.length} phases, headline ${low.headlinePhase}` : 'no lowProfile',
)
check(
  'every low-profile phase ranks its systems most-expensive-first with valid shares',
  !!low &&
    low.phases.every((p) => {
      const r = p.ranking
      const sortedDesc = r.every((e, i) => i === 0 || r[i - 1].tris >= e.tris)
      const shares = r.reduce((s, e) => s + e.pct, 0)
      return r.length > 0 && sortedDesc && Math.abs(shares - 1) < 1e-6
    }),
  low ? JSON.stringify(low.phases.map((p) => p.ranking.slice(0, 3).map((e) => `${e.system} ${Math.round(e.pct * 100)}%`))) : 'no lowProfile',
)
check(
  'the low profile names the dominant remaining systems for the digest',
  !!low && Array.isArray(low.dominant) && low.dominant.length > 0 && low.dominant.every((e) => typeof e.system === 'string' && e.pct >= 0),
  low ? low.dominant.map((e) => `${e.system} ${Math.round(e.pct * 100)}%`).join(', ') : 'no lowProfile',
)
check(
  'the digest states the low-preset dominance line',
  report.summary.some((l) => l.includes('dominated by')),
)
// The GPU series on the low rows follows the same honesty rule as the sweep:
// measured on WebGPU, flagged (null) with a reason on the WebGL 2 lane.
if (report.env.backend === 'webgl2') {
  check(
    'WebGL 2: the low-preset rows flag GPU time unavailable, none fabricated',
    lowRows.every((r) => r.gpu === null) && low?.phases.every((p) => p.gpu === null),
    `${lowRows.filter((r) => r.gpu !== null).length} low rows with gpu`,
  )
} else {
  check(
    'WebGPU: real GPU timestamps were measured for the low-preset rows too',
    lowRows.every((r) => r.gpu !== null && r.gpu.median > 0) && !!low && low.phases.every((p) => p.gpu !== null),
    `${lowRows.filter((r) => r.gpu !== null).length}/${lowRows.length} low rows with gpu`,
  )
}
check(
  'the result panel surfaces the low-level cost ranking to the player',
  (await page.locator('.bench-low-dominant').count()) === 1,
)

check('the report leads with a human-readable digest', Array.isArray(report.summary) && report.summary.length > 3)
check(
  'the run was deterministic by construction (fixed seed, date, timestep)',
  report.seed > 0 && report.day === 181 && Math.abs(report.dt - 1 / 60) < 1e-9,
  `seed ${report.seed}, day ${report.day}, dt ${report.dt}`,
)

// Point 375: the frame is named after the report panel, so the panel must be
// the thing on screen when it is written.
await frameShutter(page, OUT)('136-benchmark-report', { element: '.bench-report', label: 'the benchmark result panel' })

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

// An Esc abort DURING the haze-off pass still restores the lever (point 1542):
// the cleanup runs in the run's finally block, not after the last config.
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' })))
await page.waitForFunction(
  () => window.__ui.getState().benchProgress?.config === 'climate-haze-off',
  null,
  { timeout: ROUTE_BUDGET_MS, polling: 50 },
)
// Config, lever and Esc in one browser call, so the abort lands inside the
// haze-off pass; the report must then say it was aborted, not completed.
const abortedAt = await page.evaluate(() => {
  const at = { config: window.__ui.getState().benchProgress?.config, enabled: window.__climate.hazeEnabled() }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  return at
})
await page.waitForFunction(() => window.__ui.getState().benchReport !== null, null, { timeout: 60000 })
const abortedAfter = await page.evaluate(() => ({
  aborted: window.__ui.getState().benchReport.aborted,
  enabled: window.__climate.hazeEnabled(),
}))
check(
  'an abort during climate-haze-off re-enables the ground haze',
  abortedAt.config === 'climate-haze-off' && abortedAt.enabled === false && abortedAfter.aborted === true && abortedAfter.enabled === true,
  `during ${JSON.stringify(abortedAt)}, after ${JSON.stringify(abortedAfter)}`,
)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })))

// The digest itself, so a suite run leaves the actual numbers behind (run-all
// captures it in the run log; a direct run shows it on the console).
console.log(report.summary.join('\n'))

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
