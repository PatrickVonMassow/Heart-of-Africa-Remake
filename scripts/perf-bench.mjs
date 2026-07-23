// Bird's-eye framerate benchmark (point 276). Measures per-frame time at three
// reachable states on the requested backend (VERIFY_GL=webgpu is the user's), so
// each optimisation lever can be validated as a real win against the same points.
// MUST run SOLO — nothing else on the machine (a parallel task skews the numbers,
// especially the CPU-bound wildlife loop). Reads a self-contained rAF sampler (the
// DEV __perf probe is gone in prod; here we sample directly so dev/prod use one path).
//
// Usage: start a dev server (npm run dev), then:
//   VERIFY_GL=webgpu node scripts/perf-bench.mjs
import { chromium } from 'playwright'

// VSYNC DISABLED so the measured frame time is the TRUE per-frame cost, not a
// 60 Hz cap that masks it. WebGPU = system Chrome (headless=new); WebGL2 = ANGLE.
const VSYNC_OFF = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-unsafe-webgpu', '--enable-gpu']
function launchBenchBrowser() {
  const backend = (process.env.VERIFY_GL ?? 'webgl').toLowerCase()
  if (backend === 'webgpu') return chromium.launch({ channel: 'chrome', args: ['--headless=new', ...VSYNC_OFF] })
  return chromium.launch({ args: ['--use-angle=d3d11', ...VSYNC_OFF] })
}

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const SAMPLE_MS = Number(process.env.BENCH_SAMPLE_MS ?? 9000)
const SETTLE_MS = Number(process.env.BENCH_SETTLE_MS ?? 6000)

/** Median + p95/p99 of an array. */
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  return { n: s.length, median: at(0.5), p95: at(0.95), p99: at(0.99), mean, max: s[s.length - 1] }
}

/** Sample per-frame deltas (ms) for `ms` via a self-contained rAF loop. */
async function sampleFrames(page, ms) {
  await page.evaluate(() => {
    window.__bench = []
    window.__benchGo = true
    let last = performance.now()
    const tick = (t) => {
      window.__bench.push(t - last)
      last = t
      if (window.__benchGo) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.waitForTimeout(ms)
  const dts = await page.evaluate(() => {
    window.__benchGo = false
    return window.__bench.slice(2) // drop the first couple (warm-up)
  })
  return dts
}

async function measurePoint(page, label, setup) {
  await setup()
  await page.waitForTimeout(SETTLE_MS)
  const dts = await sampleFrames(page, SAMPLE_MS)
  const st = stats(dts)
  const fps = 1000 / st.median
  const wildlife = await page.evaluate(() => {
    try {
      const h = window.__wildlife?.herdsRef?.current
      if (!h) return null
      return Object.values(h).reduce((a, arr) => a + arr.length, 0)
    } catch {
      return null
    }
  })
  console.log(
    `  ${label.padEnd(18)} fps(median)=${fps.toFixed(1)}  ` +
      `dt median=${st.median.toFixed(2)}ms p95=${st.p95.toFixed(2)} p99=${st.p99.toFixed(2)} max=${st.max.toFixed(1)}  ` +
      `frames=${st.n}  animals=${wildlife ?? '?'}`,
  )
  return { label, fps, ...st, animals: wildlife }
}

async function main() {
  const backend = (process.env.VERIFY_GL ?? 'webgl').toLowerCase()
  console.log(`# perf-bench on ${backend}, zoom 0.5, sample ${SAMPLE_MS}ms/point, settle ${SETTLE_MS}ms`)
  const browser = await launchBenchBrowser()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.__balance.randomEventsEnabled = false
    window.__game.getState().setJournalOpen(false)
    window.__game.getState().leavePlace()
  })
  await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
  await page.waitForTimeout(1500)

  const results = []
  // (a) dense East savanna — Serengeti herds in frame (the wildlife-heavy case).
  results.push(
    await measurePoint(page, 'savanna-dense', async () => {
      await page.evaluate(() => {
        window.__balance.travelSpeed = 5.6
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
        window.__game.getState().debugJumpTo(-2.5, 34.0)
      })
    }),
  )
  // (b) empty desert — deep Sahara, no herds (the near-baseline GPU/CPU floor).
  results.push(
    await measurePoint(page, 'desert-empty', async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
        window.__game.getState().debugJumpTo(23.0, 15.0)
      })
    }),
  )
  // (c) driving in the dense savanna — holds KeyW at a bounded speed (streaming + wildlife).
  results.push(
    await measurePoint(page, 'driving-savanna', async () => {
      await page.evaluate(() => {
        window.__game.getState().debugJumpTo(-2.5, 34.0)
        window.__balance.travelSpeed = 6
      })
      await page.waitForTimeout(2000)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })))
    }),
  )
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })))

  console.log(`# a-b (savanna minus desert) fps delta = wildlife/season CPU share`)
  console.log(`# console errors: ${errors.length}`)
  await browser.close()
  return results
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('perf-bench failed:', e)
    process.exit(1)
  },
)
