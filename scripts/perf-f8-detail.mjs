// F8 benchmark with the per-system CPU split (docs/perf-1543-driving-hitches.md).
// Serves nothing itself: start a DEV server (`npm run dev`) — the split needs the
// DEV probe (window.__perf / window.__f8detail) — then:
//   BASE_URL=http://localhost:5173/ VERIFY_GL=webgpu node scripts/perf-f8-detail.mjs [--short] [--phase savanna-driving] [--json out.json]
// Prints, per measured pass of the phase (sweep configs and the low/medium/high
// preset passes), the CPU median/p95, the report's own GPU timestamp-query
// median/p95 of that pass and each system's share of the 8 worst
// frames, and inside render-submit the exclusive renderer.render time by kind
// and the blocking WebGPU calls (src/render/renderSplitWatch.ts). Env: BENCH_W, BENCH_H, BENCH_DPR (default 1536x960 @ 1.25),
// BENCH_TIMEOUT_MS (default 30 min).
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { verifyLaunchOptions } from './verify/launch-args-core.mjs'
import { findSystemChrome, hasHardwareGlChain } from './verify/system-chrome.mjs'
import { gpuText, measuredPhases, phaseDetail, reportGpu } from './perf-f8-detail-core.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const short = argv.includes('--short')
const phase = flag('--phase') ?? 'savanna-driving'
const jsonOut = flag('--json')
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const backend = (process.env.VERIFY_GL ?? 'webgpu').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'
const width = Number(process.env.BENCH_W ?? 1536)
const height = Number(process.env.BENCH_H ?? 960)
const dpr = Number(process.env.BENCH_DPR ?? 1.25)
const timeout = Number(process.env.BENCH_TIMEOUT_MS ?? 30 * 60 * 1000)

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
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
const url = new URL(BASE)
if (short) url.searchParams.set('bench', 'short')
await page.goto(url.href, { waitUntil: 'load', timeout: 120000 })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('canvas', { timeout: 120000 })
// Let the start scene stream in before the run; the runner discards a warm-up pass too.
await page.waitForTimeout(15000)
await page.keyboard.press('F8')
await page.waitForFunction(() => window.__ui?.getState().benchReport, null, { timeout, polling: 2000 })
const { detail, env, aborted, rows, gpuTiming } = await page.evaluate(() => {
  const r = window.__ui.getState().benchReport
  let parsed = {}
  try {
    parsed = JSON.parse(r.json)
  } catch {
    // keep {}
  }
  return {
    detail: window.__f8detail ?? null,
    env: parsed.env ?? {},
    aborted: !!r.aborted,
    rows: parsed.rows ?? [],
    gpuTiming: parsed.gpuTiming ?? null,
  }
})
await browser.close()

console.log(`# F8 detail — ${env.backend ?? backend} · ${env.adapter ?? '?'} · ${width}x${height} @dpr ${dpr} · build ${env.build ?? '?'} ${env.commit ?? ''}${short ? ' · short' : ''}${aborted ? ' · ABORTED' : ''}`)
if (detail === null) {
  console.log('# no window.__f8detail: serve a DEV build (npm run dev) so the probe is present')
  process.exit(1)
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ detail, rows, gpuTiming }))
const recs = measuredPhases(detail, phase)
if (recs.length === 0) console.log(`# no measured "${phase}" phase recorded`)
for (const rec of recs) {
  const d = phaseDetail(rec)
  console.log(
    `${rec.config.padEnd(16)} ${phase}  cpu median ${d.median} ms  p95 ${d.p95} (${d.ratio}x)  max ${d.max}  ` +
      `${gpuText(reportGpu(rows, rec.config, rec.phase), gpuTiming)}  ` +
      `worst8 [${d.worstFrames.join(', ')}]  gc-in-worst ${d.gcFrames}${d.probe ? '' : '  (no probe split)'}`,
  )
  for (const e of d.worst) console.log(`    ${e.name.padEnd(20)} ${String(e.ms).padStart(7)} ms  ${e.share}`)
  if (d.nested.length) console.log('    inside render-submit:')
  for (const e of d.nested) console.log(`      ${e.name.padEnd(20)} ${String(e.ms).padStart(7)} ms  ${e.share}`)
  for (const c of d.counters) console.log(`    ${c.name.padEnd(24)} per frame: worst8 ${c.worst}  all ${c.all}`)
  if (d.gpuDone)
    console.log(
      `    gpu latency (submit → onSubmittedWorkDone) per frame: worst8 ${d.gpuDone.worst} ms  all ${d.gpuDone.all} ms`,
    )
}
