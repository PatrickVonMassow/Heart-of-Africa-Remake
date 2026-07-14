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
// No silhouette may stand sunken behind the ground disc's false horizon
// (user-reported black back-slivers): every standing height is clamped to
// the disc plane or follows genuinely rising relief.
await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 10000 }).catch(() => {})
const groundYs = await page.evaluate(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}))
check(
  'no panorama silhouette sinks below the settlement ground plane',
  groundYs.length >= 3 && groundYs.every((y) => y >= 0),
  `groundY [${groundYs.map((y) => y.toFixed(2)).join(', ')}]`,
)

// --- Settlement plan on the map (design.md §6.1, point 79) --------------------
// Inside a place the map opens as a plan of the town: functional buildings
// marked and named, no continental canvas.
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(400)
const plan = await page.evaluate(() => {
  const el = document.querySelector('.map-place-plan')
  const labels = [...document.querySelectorAll('.plan-building-label')].map((n) => n.textContent)
  return { present: !!el, labels, canvas: !!document.querySelector('.map-overlay canvas') }
})
await page.screenshot({ path: `${OUT}98-place-plan.png` })
console.log('shot 98-place-plan.png')
check('inside a settlement the map shows the town plan', plan.present && !plan.canvas, JSON.stringify({ canvas: plan.canvas }))
check('the plan names the functional buildings', plan.labels.length >= 2, `labels [${plan.labels.join(', ')}]`)
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(200)

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

// --- Port skyline landmarks (design.md §4.4 Part C) ---------------------------
// Cape Town: Table Mountain stands as a flat-topped massif behind the town.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('capetown')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'capetown', { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(1200)
const skyline = await page.evaluate(() => window.__placeSkyline)
check('Cape Town mounts the Table Mountain skyline', skyline === 'table-mountain', `${skyline}`)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  const p = window.__placePlayer
  p.x = 0
  p.z = window.__placeLayout.radius - 3
  p.yaw = 0
})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}96-capetown-table-mountain.png` })
console.log('shot 96-capetown-table-mountain.png')

// Timbuktu: the Djinguereber mosque stands inside the town fabric, with a
// collider (an oriented box like every rectangular building).
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('timbuktu')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'timbuktu', { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(1200)
const mosque = await page.evaluate(() => {
  const d = window.__placeLayout.dwellings.find((dd) => dd.kind === 'mosque')
  return d ? { x: d.x, z: d.z, door: d.door } : null
})
check('Timbuktu builds the Djinguereber mosque', !!mosque, JSON.stringify(mosque))
if (mosque) {
  await page.evaluate((m) => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    // Stand back from the door point (guaranteed free ground) facing the mosque.
    const dx = m.x - m.door[0]
    const dz = m.z - m.door[1]
    const dl = Math.hypot(dx, dz) || 1
    // Stand on the door approach (kept free by the layout rules), close
    // enough that no neighbouring house can block the view.
    p.x = m.door[0] - (dx / dl) * 5
    p.z = m.door[1] - (dz / dl) * 5
    p.pitch = 0.3 // tilt up so the minaret is in frame
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(m.x - p.x, m.z - p.z) + Math.PI
  }, mosque)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}97-timbuktu-djinguereber.png` })
  console.log('shot 97-timbuktu-djinguereber.png')
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
