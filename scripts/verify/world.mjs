// Verification for the world model (CLAUDE.md §7.1.3): browser-only remainder.
// The data-sanity asserts (counts, terrain sampling, coast/river distances)
// moved to the fast Vitest suite (src/world/world.test.ts); what stays here
// needs a real browser: console-error-free rendering and screenshots of the
// bird's-eye view at characteristic locations. Dev server only.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// --- Screenshots of the travel view at characteristic locations ------------
const jump = async (lat, lon, ms = 2500) => {
  await page.evaluate(([la, lo]) => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    g.debugJumpTo(la, lo)
  }, [lat, lon])
  await page.waitForTimeout(ms)
}

// Leave the starting place into travel mode first.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.setJournalOpen(false)
  if (g.mode === 'place') g.leavePlace()
})
await page.waitForTimeout(2000)

const shots = [
  [30.0, 31.3, '10-worldmodel-nile-delta-cairo'],
  [15.6, 32.6, '11-worldmodel-khartoum-confluence'],
  [-0.8, 33.0, '12-worldmodel-lake-victoria'],
  [-3.05, 37.3, '13-worldmodel-kilimanjaro'],
  [-5.9, 12.8, '14-worldmodel-congo-mouth-boma'],
  [-17.9, 25.9, '15-worldmodel-victoria-falls'],
  [-33.9, 18.6, '16-worldmodel-cape-town'],
  [13.2, 14.2, '17-worldmodel-lake-chad'],
]
for (const [lat, lon, name] of shots) {
  await jump(lat, lon)
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log('shot', name)
}

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
