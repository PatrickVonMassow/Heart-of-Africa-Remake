// One-off diagnosis probe for the point-145b broken-wing lure (not part of
// the regression; delete when 145b is closed).
import { chromium } from 'playwright'

const URL = process.env.VERIFY_URL ?? 'http://localhost:5192/'
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await page.goto(URL)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page.waitForFunction(() => !!window.__placeLayout, null, { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(700)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.evaluate(() => { window.__balance.randomEventsEnabled = false })
await page.evaluate(() => window.__game.getState().debugJumpTo(13.5, 5.0))
await page.waitForFunction(() => window.__wildlife && window.__terrainType, null, { timeout: 30000 })

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__game.getState().debugJumpTo(13.5, 5.0)
  await sleep(600)
  const herds = window.__wildlife.herdsRef.current
  const seed = window.__game.getState().seed
  const p0 = window.__game.getState().pos
  const nx = p0.x + 5
  const nz = p0.z
  const U = 10
  const terr = window.__terrainType(-nz / U, nx / U, seed)
  const parent = { x: nx, z: nz, y: 0.2, rot: 0, scale: 1, phase: 0.3, chunk: undefined, nest: { x: nx, z: nz } }
  herds.plover.push(parent)
  const trace = []
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    trace.push({
      t: +((Date.now() - t0) / 1000).toFixed(1),
      x: +(parent.x - nx).toFixed(2),
      z: +(parent.z - nz).toFixed(2),
      lure: parent.lure ? (parent.lure.returning ? 'ret' : 'drag') : (parent.lureCooldown !== undefined ? 'cool' : '-'),
      inList: herds.plover.includes(parent),
      dead: !!parent.dead,
    })
    await sleep(250)
  }
  herds.plover = herds.plover.filter((a) => a !== parent)
  return { terr, ploverCount: herds.plover.length, playerAt: { x: +p0.x.toFixed(1), z: +p0.z.toFixed(1) }, trace }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
