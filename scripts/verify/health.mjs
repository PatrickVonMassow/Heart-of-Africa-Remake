// Headless verification for CLAUDE.md §7.1.22 (health & afflictions): the
// browser-only remainder. The store-driven asserts (defaults, canteen/
// dehydration onset & recovery, regeneration, fever drain & medicine cure,
// death/successor flow) moved to src/state/store.health.test.ts, and the
// HTML-overlay asserts (.sunblind-veil, the .overlay.defeat remains text, the
// successor button) to src/ui/Hud.test.tsx. What stays here needs a real
// browser: the RAF-driven vultures that circle at poor condition
// (window.__vultures), the remains-report screenshot (§7.2 evidence) and the
// console-error gate. Dev server only (dev hooks).
import { launchVerifyBrowser } from './_browser.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
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

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  // Keep this suite deterministic: random events are covered by events.mjs.
  window.__balance.randomEventsEnabled = false
})

const g = (fn) => page.evaluate(fn)
const walk = async (n, dx = 0, dz = -1) => {
  await page.evaluate(
    ([steps, x, z]) => {
      for (let i = 0; i < steps; i++) window.__game.getState().moveTravel(x, z, 0.05)
    },
    [n, dx, dz],
  )
}

// Leave the starting place into the bird's-eye view (where the vultures mount).
await g(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)

// --- Vultures at poor condition (design.md §19) --------------------------------
await g(() => window.__game.getState().debugSet({ health: 20 }))
// Poll for the RAF-driven vultures to mount and turn visible (up to a generous
// window) rather than a fixed wait — they need more frames on the WebGPU backend's
// slower/colder headless cadence (point 184, the same timing class as the lion feed).
const vultures = await page
  .waitForFunction(() => window.__vultures?.player.current?.visible === true, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false)
check('vultures circle at poor condition', vultures === true, '')
await g(() => window.__game.getState().debugSet({ health: 90 }))

// --- Death: remains-report screenshot (§7.2 evidence) --------------------------
// Drive the character to death to render the remains overlay for the shot; the
// store/overlay asserts themselves moved to Vitest (store.health.test.ts,
// Hud.test.tsx). Create a checkpoint first (re-enter Cairo), then die afield.
await g(() => window.__game.getState().enterPlace('cairo'))
await page.waitForTimeout(1500)
await g(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1000)
await g(() => {
  window.__game.getState().debugSet({ health: 3 })
  window.__game.getState().debugSetAffliction('wounds', 2)
})
await walk(30)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}78-health-remains-report.png` })
console.log('shot 78-health-remains-report.png')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
