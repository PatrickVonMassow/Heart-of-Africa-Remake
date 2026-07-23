// Bird's-eye framerate benchmark + CONFIG SWEEP (point 276).
//
// Measures per-frame time at three reachable states (dense savanna, empty
// desert, driving) for a series of render CONFIGS, so the GPU cost can be
// attributed to each feature and every optimisation lever validated against a
// fixed baseline.
//
// MUST run SOLO — nothing else on the machine (a parallel task/session skews
// everything; see docs/perf-276-findings.md).
//
// Usage: start a dev server, then:
//   BASE_URL=http://localhost:5173/ VERIFY_GL=webgpu node scripts/perf-bench.mjs
// Env: BENCH_SAMPLE_MS, BENCH_SETTLE_MS, BENCH_CONFIGS (comma list, default all),
//      BENCH_POINTS (comma list of point names), BENCH_LABEL (tag for the output).
import { chromium } from 'playwright'

// VSYNC DISABLED so the measured frame time is the TRUE per-frame cost, not a
// 60 Hz cap that masks it (a capped and an uncapped run are NOT comparable).
const VSYNC_OFF = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-unsafe-webgpu', '--enable-gpu']
function launchBenchBrowser() {
  const backend = (process.env.VERIFY_GL ?? 'webgl').toLowerCase()
  if (backend === 'webgpu') return chromium.launch({ channel: 'chrome', args: ['--headless=new', ...VSYNC_OFF] })
  return chromium.launch({ args: ['--use-angle=d3d11', ...VSYNC_OFF] })
}

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const SAMPLE_MS = Number(process.env.BENCH_SAMPLE_MS ?? 6000)
const SETTLE_MS = Number(process.env.BENCH_SETTLE_MS ?? 4000)
const LABEL = process.env.BENCH_LABEL ?? ''
/** A frame at or above this is a HITCH the player feels (~2 frames at 60 Hz). */
const SPIKE_MS = Number(process.env.BENCH_SPIKE_MS ?? 25)

/** Render configs, applied through the debug store — no code change needed.
 *  `flags` are UI-store setters; omitted keys keep the default. */
const ALL_CONFIGS = [
  { name: 'baseline', flags: {} },
  { name: 'traa-off', flags: { traaEnabled: false } },
  { name: 'ssao-off', flags: { ssaoEnabled: false } },
  { name: 'shadows-off', flags: { shadowsEnabled: false } },
  { name: 'shadow-half', flags: { shadowMapHalf: true } },
  { name: 'post-off', flags: { traaEnabled: false, ssaoEnabled: false } },
  { name: 'all-off', flags: { traaEnabled: false, ssaoEnabled: false, shadowsEnabled: false } },
]

/** The three reachable measurement states (zoom 0.5, the achievable range). */
const ALL_POINTS = [
  {
    name: 'savanna-dense',
    setup: async (page) => {
      await page.evaluate(() => {
        window.__balance.travelSpeed = 5.6
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
        window.__game.getState().debugJumpTo(-2.5, 34.0)
      })
    },
  },
  {
    name: 'desert-empty',
    setup: async (page) => {
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
        window.__game.getState().debugJumpTo(23.0, 15.0)
      })
    },
  },
  {
    name: 'driving-savanna',
    setup: async (page) => {
      await page.evaluate(() => {
        window.__game.getState().debugJumpTo(-2.5, 34.0)
        window.__balance.travelSpeed = 6
      })
      await page.waitForTimeout(1500)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })))
    },
    teardown: async (page) => {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })))
    },
  },
]

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return { n: s.length, median: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] }
}

/** Sample per-frame deltas (ms) via a self-contained rAF loop. Each frame also
 *  records the point-272 burst work that landed IN it (terrain/flora rebuild
 *  ms), so a spike can be ATTRIBUTED instead of guessed at. */
async function sampleFrames(page, ms) {
  await page.evaluate(() => {
    window.__bench = []
    window.__benchGo = true
    const p = window.__perf
    let last = performance.now()
    let lastT = p ? p.terrain.totalMs : 0
    let lastF = p ? p.flora.totalMs : 0
    const tick = (t) => {
      const nt = p ? p.terrain.totalMs : 0
      const nf = p ? p.flora.totalMs : 0
      window.__bench.push({ dt: t - last, ter: nt - lastT, flo: nf - lastF })
      last = t
      lastT = nt
      lastF = nf
      if (window.__benchGo) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.waitForTimeout(ms)
  return page.evaluate(() => {
    window.__benchGo = false
    return window.__bench.slice(3) // drop warm-up frames
  })
}

async function applyConfig(page, flags) {
  await page.evaluate((f) => {
    const ui = window.__ui.getState()
    // Optional-called throughout: an OLDER build (the v0.1 comparison) may not
    // have every debug flag yet — a missing setter must not abort the run.
    // Reset to defaults first so configs never leak into each other.
    ui.setTraaEnabled?.(true)
    ui.setSsaoEnabled?.(true)
    ui.setShadowsEnabled?.(true)
    ui.setShadowMapHalf?.(false)
    if (f.traaEnabled !== undefined) ui.setTraaEnabled?.(f.traaEnabled)
    if (f.ssaoEnabled !== undefined) ui.setSsaoEnabled?.(f.ssaoEnabled)
    if (f.shadowsEnabled !== undefined) ui.setShadowsEnabled?.(f.shadowsEnabled)
    if (f.shadowMapHalf !== undefined) ui.setShadowMapHalf?.(f.shadowMapHalf)
  }, flags)
  // The post pipeline rebuilds on a TRAA/SSAO toggle — give it room.
  await page.waitForTimeout(2500)
}

/** Split the sampled frames into the calm body and the SPIKES, and attribute the
 *  spikes to the streaming bursts that landed in them. `spikeMs` counts a frame
 *  as a hitch; the user feels these, not the median. */
function spikeReport(frames, spikeMs) {
  const spikes = frames.filter((f) => f.dt >= spikeMs)
  const attributed = spikes.filter((f) => f.ter + f.flo > 1)
  const burstMs = spikes.reduce((a, f) => a + f.ter + f.flo, 0)
  const spikeMsTotal = spikes.reduce((a, f) => a + f.dt, 0)
  return {
    spikes: spikes.length,
    attributed: attributed.length,
    // share of the spike time the streaming bursts themselves account for
    burstShare: spikeMsTotal > 0 ? +(burstMs / spikeMsTotal).toFixed(2) : 0,
    worst: spikes.length ? +Math.max(...spikes.map((f) => f.dt)).toFixed(1) : 0,
  }
}

async function measure(page, point) {
  await point.setup(page)
  await page.waitForTimeout(SETTLE_MS)
  // Zero the point-272 burst probe so its counters cover THIS sample only —
  // that is how a frame spike gets attributed to a terrain/flora rebuild.
  await page.evaluate(() => window.__perf?.reset())
  const frames = await sampleFrames(page, SAMPLE_MS)
  const burst = await page.evaluate(() => {
    const p = window.__perf
    if (!p) return null
    const pick = (s) => (s ? { n: s.count, max: +s.maxMs.toFixed(1), total: +s.totalMs.toFixed(1) } : null)
    return { terrain: pick(p.terrain), flora: pick(p.flora) }
  })
  if (point.teardown) await point.teardown(page)
  const st = stats(frames.map((f) => f.dt))
  return { fps: 1000 / st.median, ...st, burst, spike: spikeReport(frames, SPIKE_MS) }
}

async function main() {
  const backend = (process.env.VERIFY_GL ?? 'webgl').toLowerCase()
  const pick = (env, all, key) => {
    const want = (process.env[env] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return want.length ? all.filter((x) => want.includes(x[key])) : all
  }
  const configs = pick('BENCH_CONFIGS', ALL_CONFIGS, 'name')
  const points = pick('BENCH_POINTS', ALL_POINTS, 'name')

  // deviceScaleFactor emulates the display's pixel ratio WITHOUT touching the
  // game: dpr 2 = a HiDPI screen rendering 4x the pixels. That is how the
  // resolution lever is measured before any code exists for it.
  const dpr = Number(process.env.BENCH_DPR ?? 1)
  console.log(`# perf-bench SWEEP${LABEL ? ` [${LABEL}]` : ''} on ${backend}, zoom 0.5, vsync OFF`)
  console.log(`# sample ${SAMPLE_MS}ms, settle ${SETTLE_MS}ms, configs=${configs.length}, points=${points.length}, dpr=${dpr}`)
  const browser = await launchBenchBrowser()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.__game && window.__balance && window.__ui, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.__balance.randomEventsEnabled = false
    window.__game.getState().setJournalOpen(false)
    window.__game.getState().leavePlace()
  })
  await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
  await page.waitForTimeout(1500)

  // WARM-UP: a full discarded pass — the first run on a fresh server has
  // multi-second compile/HMR stalls that would poison the first config.
  console.log('# warm-up pass (discarded)…')
  await measure(page, points[0])

  const rows = []
  for (const cfg of configs) {
    await applyConfig(page, cfg.flags)
    for (const pt of points) {
      const r = await measure(page, pt)
      rows.push({ config: cfg.name, point: pt.name, ...r })
      const b = r.burst
      const bs = b ? `ter=${b.terrain.n}/${b.terrain.max}ms flo=${b.flora.n}/${b.flora.max}ms` : 'no-probe'
      console.log(
        `  ${cfg.name.padEnd(12)} ${pt.name.padEnd(16)} fps=${r.fps.toFixed(1).padStart(6)}  ` +
          `dt=${r.median.toFixed(2)}ms p95=${r.p95.toFixed(2)} p99=${r.p99.toFixed(2)} max=${r.max.toFixed(1)} n=${r.n}\n` +
          `      spikes>=${SPIKE_MS}ms: ${r.spike.spikes} (streaming-attributed ${r.spike.attributed}, ` +
          `burst share ${r.spike.burstShare}, worst ${r.spike.worst}ms)  ${bs}`,
      )
    }
  }
  console.log(`# console errors: ${errors.length}`)
  console.log('# JSON ' + JSON.stringify(rows))
  await browser.close()
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('perf-bench failed:', e)
    process.exit(1)
  },
)
