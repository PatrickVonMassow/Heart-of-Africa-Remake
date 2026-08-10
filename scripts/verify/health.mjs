// Headless verification for CLAUDE.md §7.1.22 (health & afflictions): the
// browser-only remainder. The store-driven asserts (defaults, canteen/
// dehydration onset & recovery, regeneration, fever drain & medicine cure,
// death/successor flow) moved to src/state/store.health.test.ts, and the
// HTML-overlay asserts (.sunblind-veil, the .overlay.defeat remains text, the
// successor button) to src/ui/Hud.test.tsx. What stays here needs a real
// browser: the RAF-driven vultures that circle at poor condition
// (window.__vultures), the remains-report screenshot (§7.2 evidence) and the
// console-error gate. Dev server only (dev hooks).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { sectionGate } from './sections.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

// SECTIONS (points 566/595). The two things this suite drives — the circling
// vultures and the death that renders the remains report — share nothing but the
// boot, and the death is one-way: once the character has died, the vulture check
// cannot be repeated without a fresh page. `--section=vultures` is therefore the
// repair loop for the RAF-driven half. The names are read out of THIS FILE by
// scripts/verify/sections.mjs, so an unknown one is refused with the list of the
// real ones — and the run is stamped PARTIAL, never suite coverage.
const sections = sectionGate()
const { section } = sections
if (sections.banner()) console.log(sections.banner())

let failures = 0
const check = (name, ok, detail) => {
  // The tag goes AFTER the ' — ' separator: the check's NAME is its identity for
  // the red ledger and the baseline classifier and must not change.
  const tail = [detail, sections.tag().trim()].filter(Boolean).join('  ')
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${tail ? ' — ' + tail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Point 375: the frame must show the remains report it is named after — a run
// where the character survived would otherwise file the travel view as proof.
const shot = frameShutter(page, OUT)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page) // point 204: fail loud if the requested backend silently fell back
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
if (section('vultures')) {
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
}

// --- Death: remains-report screenshot (§7.2 evidence) --------------------------
// Drive the character to death to render the remains overlay for the shot; the
// store/overlay asserts themselves moved to Vitest (store.health.test.ts,
// Hud.test.tsx). Create a checkpoint first (re-enter Cairo), then die afield —
// the block owns that whole staging, so it runs alone as well as in sequence.
if (section('remains-report')) {
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
  await shot('78-health-remains-report', { element: '.overlay.defeat', label: 'the remains report' })
}

// A selected section that never executed is a FAILURE, not a quiet pass: it is
// the one way a --section run could report green having verified nothing.
const unrun = sections.unrun()
if (unrun) check('the selected section actually ran', false, unrun)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
// Said again where the verdict is read: a green one-section run is not a green
// suite, and nothing downstream may quote it as one.
if (sections.banner()) console.log(sections.banner())
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
