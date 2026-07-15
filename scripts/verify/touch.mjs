// Headless verification for CLAUDE.md §7.1.30 (touch / tablet controls,
// design.md §17.5, point 84). A touch-capable context is used and real touch
// events are driven through CDP so pointer capture and multi-touch behave like
// hardware. Dev server only.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
// A phone-shaped, touch-enabled viewport (design.md §17.5): the safe-area/compact
// HUD path and the deliberate-input guard only matter with real touch.
const context = await browser.newContext({ viewport: { width: 430, height: 850 }, hasTouch: true, isMobile: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// --- CDP touch helpers: real touchStart/Move/End -> real pointer events -------
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
  })

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__balance && window.__ui, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
})

// --- Before any touch: no overlay, PC-identical (deliberate-input guard) -------
const before = await page.evaluate(() => ({
  active: window.__ui.getState().touchActive,
  overlay: !!document.querySelector('.touch-controls'),
}))
check('no touch overlay before the first touch (desktop stays identical)', !before.active && !before.overlay, JSON.stringify(before))

// --- First touch arms the layer and applies the mobile quality preset ---------
await touch('touchStart', [{ x: 215, y: 120 }])
await touch('touchEnd', [])
await page.waitForTimeout(400)
const armed = await page.evaluate(() => {
  const u = window.__ui.getState()
  return {
    active: u.touchActive,
    overlay: !!document.querySelector('.touch-controls'),
    stick: !!document.querySelector('.touch-stick'),
    look: !!document.querySelector('.touch-look'),
    traa: u.traaEnabled,
    ssao: u.ssaoEnabled,
    shadowHalf: u.shadowMapHalf,
  }
})
check('first touch mounts the overlay (stick + look surface)', armed.active && armed.overlay && armed.stick && armed.look, JSON.stringify(armed))
check('touch applies the mobile quality preset (TRAA/SSAO off, half shadows)', armed.traa === false && armed.ssao === false && armed.shadowHalf === true, JSON.stringify(armed))

// --- Virtual stick walks the character (first-person, Cairo start) ------------
const stickCX = 24 + 64 // stick centre x (left inset + half of 128)
const stickCY = 850 - (24 + 64) // bottom inset + half height
const pos0 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
await touch('touchStart', [{ x: stickCX, y: stickCY }])
await touch('touchMove', [{ x: stickCX, y: stickCY - 60 }]) // drag up = forward
await page.waitForTimeout(700)
await touch('touchEnd', [])
const pos1 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
const walked = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z)
check('virtual stick walks the character', walked > 1, `moved ${walked.toFixed(1)} m`)
// The stick releases to neutral: the walk-feel inertia (point 97) coasts a
// fraction of a metre, then the position must be fully settled (no drift).
await page.waitForTimeout(500)
const pos2 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
await page.waitForTimeout(300)
const pos3 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
check('lifting the stick stops the walk', Math.hypot(pos3.x - pos2.x, pos3.z - pos2.z) < 0.1, 'settled')

// --- Right-half drag turns the first-person yaw -------------------------------
const yaw0 = await page.evaluate(() => window.__placePlayer.yaw)
await touch('touchStart', [{ x: 320, y: 420 }])
await touch('touchMove', [{ x: 220, y: 420 }]) // drag left
await touch('touchMove', [{ x: 140, y: 420 }])
await page.waitForTimeout(150)
await touch('touchEnd', [])
const yaw1 = await page.evaluate(() => window.__placePlayer.yaw)
check('right-half drag turns the first-person view', Math.abs(yaw1 - yaw0) > 0.1, `yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`)

// --- Tapping the interaction prompt fires the E interaction (talk to elder) ---
await page.evaluate(() => window.__game.getState().enterPlace('nubian-village'))
await page
  .waitForFunction(() => window.__game.getState().placeId === 'nubian-village' && !!window.__placeLayout, null, { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  const el = window.__placeLayout.interactives.find((i) => i.type === 'villager')
  const p = window.__placePlayer
  p.x = el.pos[0]
  p.z = el.pos[1] + 2
})
// Let the prompt appear, then tap it.
await page.waitForSelector('.prompt-tappable', { timeout: 8000 }).catch(() => {})
const promptShown = await page.evaluate(() => !!document.querySelector('.prompt-tappable'))
await page.click('.prompt-tappable').catch(() => {})
await page.waitForTimeout(300)
const talked = await page.evaluate(() => window.__game.getState().languagesLearned.north)
check('tapping the prompt fires the interaction (elder addressed)', promptShown && talked === true, `prompt ${promptShown}, learned ${talked}`)

// --- Two-finger pinch zooms the bird's-eye view -------------------------------
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
const zoom0 = await page.evaluate(() => window.__ui.getState().travelZoom)
// Spread two fingers apart = zoom in (travelZoom decreases; zoom-in is always
// allowed). Both fingers stay inside the right-half look surface (x > 215).
await touch('touchStart', [{ x: 280, y: 400, id: 0 }, { x: 360, y: 400, id: 1 }])
await touch('touchMove', [{ x: 260, y: 400, id: 0 }, { x: 380, y: 400, id: 1 }])
await touch('touchMove', [{ x: 240, y: 400, id: 0 }, { x: 400, y: 400, id: 1 }])
await page.waitForTimeout(150)
await touch('touchEnd', [])
const zoom1 = await page.evaluate(() => window.__ui.getState().travelZoom)
check('two-finger pinch changes the bird\'s-eye zoom', Math.abs(zoom1 - zoom0) > 0.01, `zoom ${zoom0.toFixed(3)} → ${zoom1.toFixed(3)}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
