// Headless verification for CLAUDE.md §7.1.30 (gamepad controls and the
// position query, design.md §17). A virtual gamepad is injected by
// overriding navigator.getGamepads. Dev server only.
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// Virtual gamepad: axes/buttons are steered from the test.
await page.addInitScript(() => {
  window.__pad = {
    id: 'virtual', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  }
  Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] })
})

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__balance && window.__pad, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page) // point 204: fail loud if the requested backend silently fell back
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
})

// Hold a stick until the render loop produces the expected result, then centre it —
// the loop reads the axes each frame, and a fixed wait yields too few frames on the
// slower/colder WebGPU headless cadence (point 184). Polling for the check's OWN
// condition is safe: a timeout is a real failure, never a false pass. `cond` runs in
// the page with `base` as its argument.
const holdAxesUntil = async (axes, cond, base, timeout = 15000) => {
  await page.evaluate((a) => (window.__pad.axes = a), axes)
  const ok = await page.waitForFunction(cond, base, { timeout }).then(() => true).catch(() => false)
  await page.evaluate(() => (window.__pad.axes = [0, 0, 0, 0]))
  return ok
}

// Pulse a button (clean press/release edges) until its effect lands — a single 150 ms
// tap can fall between two rAF ticks on the slower WebGPU cadence (point 184). Stops
// on the first pulse that satisfies `cond` (evaluated in the page), so a toggle is
// never over-driven.
const pulseButtonUntil = async (index, cond, timeout = 15000) => {
  const t0 = Date.now()
  let ok = await page.evaluate(cond).catch(() => false)
  while (!ok && Date.now() - t0 < timeout) {
    await page.evaluate((i) => (window.__pad.buttons[i] = { pressed: true, touched: true, value: 1 }), index)
    await page.waitForTimeout(120)
    await page.evaluate((i) => (window.__pad.buttons[i] = { pressed: false, touched: false, value: 0 }), index)
    await page.waitForTimeout(120)
    ok = await page.evaluate(cond).catch(() => false)
  }
  return ok
}

// --- Idle axis drift must not steer (worn pads, wheels, flight sticks) -------------
// Below the engagement threshold nothing may move before a deliberate input.
await page.evaluate(() => (window.__pad.axes = [0.35, 0.35, 0.4, 0]))
await page.waitForTimeout(700)
const driftYaw = await page.evaluate(() => window.__placePlayer?.yaw ?? 0)
check('idle axis drift steers nothing before engagement', Math.abs(driftYaw) < 0.01, `yaw ${driftYaw.toFixed(3)}`)
await page.evaluate(() => (window.__pad.axes = [0, 0, 0, 0]))

// --- Right stick turns the first-person view (in Cairo at start) -------------------
const yaw0 = await page.evaluate(() => window.__placePlayer?.yaw ?? 0)
const turned = await holdAxesUntil([0, 0, 1, 0], (y0) => Math.abs((window.__placePlayer?.yaw ?? 0) - y0) > 0.2, yaw0)
const yaw1 = await page.evaluate(() => window.__placePlayer?.yaw ?? 0)
check('right stick turns the first-person view', turned, `yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`)

// --- Left stick walks in the settlement ----------------------------------------------
const pos0 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
const walkedOk = await holdAxesUntil(
  [0, -1, 0, 0],
  (p0) => Math.hypot(window.__placePlayer.x - p0.x, window.__placePlayer.z - p0.z) > 1,
  pos0,
)
const pos1 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
const walked = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z)
check('left stick walks the character (first-person)', walkedOk, `moved ${walked.toFixed(1)} m`)

// --- Y opens the journal, B closes it ---------------------------------------------------
await pulseButtonUntil(3, () => window.__game.getState().journalOpen === true) // Y → Tab (open)
let journalOpen = await page.evaluate(() => window.__game.getState().journalOpen)
check('Y toggles the journal', journalOpen === true, '')
await pulseButtonUntil(1, () => window.__game.getState().journalOpen === false) // B → Escape (close)
journalOpen = await page.evaluate(() => window.__game.getState().journalOpen)
check('B closes the journal again', journalOpen === false, '')

// --- Left stick travels in the bird's-eye view --------------------------------------------
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
const tpos0 = await page.evaluate(() => ({ ...window.__game.getState().pos }))
const travelledOk = await holdAxesUntil(
  [0, 1, 0, 0], // stick down = south
  (p0) => Math.hypot(window.__game.getState().pos.x - p0.x, window.__game.getState().pos.z - p0.z) > 0.5,
  tpos0,
)
const tpos1 = await page.evaluate(() => ({ ...window.__game.getState().pos }))
const travelled = Math.hypot(tpos1.x - tpos0.x, tpos1.z - tpos0.z)
check("left stick travels in the bird's-eye view", travelledOk, `moved ${travelled.toFixed(2)} units`)

// --- A interacts (E): addresses the elder in a village -----------------------------------------
// Places are entered by walking now (design.md §2), so A no longer "enters":
// it maps to the E interaction, which addresses the village elder. The
// northern Nubian village keeps the following position query in the North.
await page.evaluate(() => window.__game.getState().enterPlace('nubian-village'))
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "nubian-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  const el = window.__placeLayout.interactives.find((i) => i.type === 'villager')
  const p = window.__placePlayer
  p.x = el.pos[0]
  p.z = el.pos[1] + 2
})
await page.waitForTimeout(500)
await pulseButtonUntil(0, () => window.__game.getState().languagesLearned.north === true) // A → KeyE → talk
const talked = await page.evaluate(() => window.__game.getState().languagesLearned.north)
check('A interacts: the elder is addressed (language lesson)', talked === true, '')

// --- Position query (P / Select) in both languages -------------------------------------------
// Hold the button until the toast appears (like a real press): right after
// a place entry the scene build can stall frames longer than a short tap,
// so a fixed 150 ms window may fall between two rAF ticks of the poller.
const queryToast = async () => {
  await page.evaluate(() => window.__game.getState().setToast(null))
  await page.evaluate(() => (window.__pad.buttons[8] = { pressed: true, touched: true, value: 1 }))
  const toast = await page
    .waitForFunction(() => window.__game.getState().toast, null, { timeout: 8000 })
    .then((h) => h.jsonValue())
    .catch(() => null)
  await page.evaluate(() => (window.__pad.buttons[8] = { pressed: false, touched: false, value: 0 }))
  await page.waitForTimeout(150)
  return toast
}
let toast = await queryToast()
check('position query reports coordinates and region (EN)', !!toast && toast.includes('Latitude') && toast.includes('North'), `"${toast}"`)
await page.evaluate(() => window.__setLang('de'))
toast = await queryToast()
check('position query localized (DE)', !!toast && toast.includes('Breite'), `"${toast}"`)
await page.evaluate(() => window.__setLang('en'))

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
