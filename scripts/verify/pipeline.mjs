// Headless verification for CLAUDE.md §7.1.32 (render pipeline upgrades,
// design.md §2): TRAA, screen-space reflections and true water refraction
// are active in the post pipeline and the application runs without console
// errors in both perspectives; screenshots document coast and settlement.
// Dev server only.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
})

const backend = await page.evaluate(() => (window.__ui.getState().webglFallback ? 'WebGL 2' : 'WebGPU'))
console.log(`render backend: ${backend}`)

// --- Pipeline stages active ---------------------------------------------------------
const fx = await page.evaluate(() => window.__postFx ?? null)
// TRAA and SSR are gated to the WebGPU backend (CLAUDE.md §7.1 pt. 32);
// the WebGL 2 fallback keeps MSAA — the flags must match the backend.
const onWebGpu = backend === 'WebGPU'
check(
  'post pipeline matches the backend (GTAO/bloom always; TRAA+SSR on WebGPU, MSAA on WebGL 2)',
  !!fx && fx.gtao === true && fx.bloom === true && fx.traa === onWebGpu && fx.ssr === onWebGpu && fx.msaa === !onWebGpu,
  JSON.stringify(fx),
)

// --- First-person view stays clean under the new pipeline ----------------------------
await page.waitForTimeout(1500)
check('first-person view renders without console errors', errors.length === 0, `${errors.length}`)
await page.screenshot({ path: `${OUT}84-pipeline-place.png` })
console.log('shot 84-pipeline-place.png')

// --- Bird's-eye coast: water with refraction and the SSR mask ------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.debugJumpTo(31.15, 30.2) // Nile delta coast: shallow sea + shoreline
})
await page.waitForTimeout(5000)
const water = await page.evaluate(() => window.__waterFx ?? null)
check(
  'ocean water uses true refraction and the SSR metalness mask',
  !!water && water.refraction === true && water.ssrMask > 0.05,
  JSON.stringify(water),
)
await page.screenshot({ path: `${OUT}85-pipeline-coast.png` })
console.log('shot 85-pipeline-coast.png')
check("bird's-eye coast renders without console errors", errors.length === 0, `${errors.length}`)

// A little travel across the shallows keeps the pipeline exercised.
await page.evaluate(() => {
  for (let i = 0; i < 10; i++) window.__game.getState().moveTravel(0, -1, 0.05)
})
await page.waitForTimeout(1500)
check('travelling on water stays error-free', errors.length === 0, `${errors.length}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
