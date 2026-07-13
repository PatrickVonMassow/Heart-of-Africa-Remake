// Headless verification for CLAUDE.md §7.1.31 (settlement orientation after
// a gift and distant panorama wildlife, design.md §17/§2). Dev server only.
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

// --- Panorama wildlife (design.md §2) ---------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('masai-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "masai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
// The panorama animals stream in over the first seconds of the scene.
await page.waitForFunction(() => (window.__placePanoramaWildlife ?? 0) >= 3, null, { timeout: 20000 }).catch(() => {})
const wildlife = await page.evaluate(() => window.__placePanoramaWildlife ?? 0)
check('distant wildlife drifts through the panorama', wildlife >= 3, `${wildlife} animals`)

// --- Orientation after a gift (design.md §17) ---------------------------------------
const before = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('no building markers before the gift', before === 0, `${before}`)
const toast = await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddGift('emerald') // revered in the east
  g.giveGift('emerald')
  return window.__game.getState().toast
})
await page.waitForTimeout(600)
const after = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('the gift unlocks the building markers', after >= 1, `${after} markers`)
check('the orientation announces itself', !!toast && toast.length > 0, `"${toast}"`)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}93-orientation-highlight.png` })
console.log('shot 93-orientation-highlight.png')

// Persistence: leaving and re-entering keeps the orientation.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
})
await page.waitForTimeout(600)
await page.evaluate(() => window.__game.getState().enterPlace('masai-village'))
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "masai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
const again = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('the orientation persists across re-entry', again >= 1, `${again} markers`)

// A settlement without a gift stays unmarked.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('swahili-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "swahili-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
const other = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('other settlements stay unmarked without a gift', other === 0, `${other}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
