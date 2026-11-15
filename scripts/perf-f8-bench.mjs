// Run the in-game F8 render benchmark (src/systems/benchmarkRun.ts) headless on
// this host's GPU and save its report file (point 1524). Works against ANY
// served build — dev or production preview, this tree or an older commit's —
// because it only presses F8 and clicks the overlay's download button, the
// path the player uses; no dev hook is needed.
//
// The viewport defaults to the user's reference profile (2752x1152 CSS px at
// dpr 1.25, hoa-bench-2026-11-15-webgpu.json). vsync and the frame-rate limit
// are switched off so the wall clock is not capped at the refresh rate.
//
// Usage: BASE_URL=http://localhost:4173/ VERIFY_GL=webgpu|webgl \
//          node scripts/perf-f8-bench.mjs <out.json> [--short]
// Env: BENCH_W, BENCH_H, BENCH_DPR (viewport), BENCH_TIMEOUT_MS (default 15 min).
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { verifyLaunchOptions } from './verify/launch-args-core.mjs'
import { findSystemChrome, hasHardwareGlChain } from './verify/system-chrome.mjs'

const out = process.argv[2]
if (!out) {
  console.error('usage: node scripts/perf-f8-bench.mjs <out.json> [--short]')
  process.exit(2)
}
const short = process.argv.includes('--short')
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/'
const backend = (process.env.VERIFY_GL ?? 'webgpu').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'
const width = Number(process.env.BENCH_W ?? 2752)
const height = Number(process.env.BENCH_H ?? 1152)
const dpr = Number(process.env.BENCH_DPR ?? 1.25)
const timeout = Number(process.env.BENCH_TIMEOUT_MS ?? 15 * 60 * 1000)

const opts = verifyLaunchOptions(
  backend,
  process.platform,
  process.env.VERIFY_ANGLE,
  backend === 'webgpu' ? findSystemChrome(process.platform) : null,
  process.env,
  process.env.VERIFY_GALLIUM,
  hasHardwareGlChain(process.platform),
)
opts.args = [...opts.args, '--disable-gpu-vsync', '--disable-frame-rate-limit']
const browser = await chromium.launch(opts)
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, acceptDownloads: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const url = new URL(BASE)
if (short) url.searchParams.set('bench', 'short')
await page.goto(url.href, { waitUntil: 'load', timeout: 120000 })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('canvas', { timeout: 120000 })
// Let the start scene stream in before the run; the runner discards a warm-up pass too.
await page.waitForTimeout(15000)
const t0 = Date.now()
await page.keyboard.press('F8')
await page.waitForSelector('.bench-download', { timeout })
const [download] = await Promise.all([page.waitForEvent('download'), page.click('.bench-download')])
await download.saveAs(out)
const report = JSON.parse(readFileSync(out, 'utf8'))
console.log(report.summary.join('\n'))
console.log(`# run ${Math.round((Date.now() - t0) / 1000)} s, page errors: ${errors.length}${errors.length ? ' — ' + errors[0] : ''}`)
await browser.close()
