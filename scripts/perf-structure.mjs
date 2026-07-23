// Structural frame-load probe (point 276): what the renderer actually SUBMITS
// per frame at a fixed state — draw calls, triangles, compiled programs, scene
// object count. Unlike a timing sample these are COUNTS, so they carry no
// run-to-run noise: comparing an old build against today's says WHERE the extra
// frame cost comes from (more draws / more geometry / more JS objects).
//
// Usage: BASE_URL=http://localhost:5174/ VERIFY_GL=webgpu node scripts/perf-structure.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const LABEL = process.env.BENCH_LABEL ?? ''

const POINTS = [
  { name: 'savanna-dense', lat: -2.5, lon: 34.0 },
  { name: 'desert-empty', lat: 23.0, lon: 15.0 },
]

async function main() {
  const backend = (process.env.VERIFY_GL ?? 'webgl').toLowerCase()
  const args = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-unsafe-webgpu', '--enable-gpu']
  const browser =
    backend === 'webgpu'
      ? await chromium.launch({ channel: 'chrome', args: ['--headless=new', ...args] })
      : await chromium.launch({ args: ['--use-angle=d3d11', ...args] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.__game && window.__ui && window.__renderer, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.__balance.randomEventsEnabled = false
    window.__game.getState().setJournalOpen(false)
    window.__game.getState().leavePlace()
  })
  await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
  await page.waitForTimeout(2000)

  console.log(`# perf-structure${LABEL ? ` [${LABEL}]` : ''} on ${backend}, zoom 0.5`)
  for (const pt of POINTS) {
    await page.evaluate((p) => window.__game.getState().debugJumpTo(p.lat, p.lon), pt)
    await page.waitForTimeout(6000)
    const info = await page.evaluate(() => {
      const i = window.__renderer.info
      return {
        calls: i.render.calls,
        drawCalls: i.render.drawCalls,
        triangles: i.render.triangles,
        geometries: i.memory.geometries,
        textures: i.memory.textures,
      }
    })
    console.log(`  ${pt.name.padEnd(16)} ` + JSON.stringify(info))
  }
  await browser.close()
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('perf-structure failed:', e)
    process.exit(1)
  },
)
