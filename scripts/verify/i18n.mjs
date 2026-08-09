// Headless verification for CLAUDE.md §7.1.17 (localization): browser-only
// remainder. The rendered-text asserts (Date/Funds/Datum/Geld, journal/trade/
// map/debug labels) moved to the fast Vitest suite (src/ui/StatusBar.test.tsx,
// JournalPanel.test.tsx, Dialogs.test.tsx, DebugMenu.test.tsx and
// src/i18n/i18n.test.ts). What stays here needs a real browser: the runtime
// language switch driven through the live UI and the five localization
// screenshots (54-58) that are the §7.2 acceptance evidence, plus the
// console-error gate. Dev server only (dev hooks).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { sectionGate } from './sections.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

// SECTIONS (point 566). Each frame below sits in a named block that owns the
// language and the dialog it documents: `if (section('<slug>')) { … }`. Without
// a request every one runs, in file order, exactly as before; `--section=<slug>`
// (VERIFY_SECTION) runs ONE of them, so re-shooting a single localization frame
// costs one boot instead of the whole pass. The names are read out of THIS FILE
// by scripts/verify/sections.mjs, so an unknown one is refused with the list of
// the real ones — and the run is stamped PARTIAL, never suite coverage.
const sections = sectionGate()
const { section } = sections
if (sections.banner()) console.log(sections.banner())

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Every frame here documents a piece of LOCALIZED UI, so the shutter (point
// 375) proves that piece is actually on screen before the file is written — a
// dialog that never opened would otherwise be filed as evidence that it did.
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
await page.waitForTimeout(5000)

// SHARED STAGING (point 566). Every German frame needs the German UI, which the
// journal section switches to first in a whole run. It is a helper each of them
// owns rather than inherits — a no-op once the language is already German (the
// locale store keeps <html lang> in sync), so a whole run switches exactly once.
// (Not named `use…`: oxlint reads such a name as a React hook.)
const switchToGerman = async () => {
  if (await page.evaluate(() => document.documentElement.lang === 'de')) return
  await page.evaluate(() => window.__setLang('de'))
  await page.waitForTimeout(800)
}

// --- English is the default: capture the status bar + journal ----------------
if (section('english-default')) {
  await shot('54-i18n-english-default', { element: '.status-bar', label: 'the English status bar' })
}

// --- Switch to German at runtime ---------------------------------------------
if (section('german-journal')) {
  await switchToGerman()
  await shot('55-i18n-german-journal', { element: '.journal', label: 'the German journal' })
}

// --- German trade dialog -------------------------------------------------------
if (section('trade-dialog')) {
  await switchToGerman()
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(400)
  // Open the trade dialog by standing at the shop's door and pressing the Space
  // use key (design.md §2.3).
  await page.evaluate(() => {
    const shop = window.__placeLayout.interactives.find((b) => b.type === 'shop')
    const p = window.__placePlayer
    p.x = shop.door[0]
    p.z = shop.door[1]
  })
  await page.waitForFunction(() => !!document.querySelector('.prompt'), null, { timeout: 8000 }).catch(() => {})
  await page.keyboard.press('Space')
  await page.waitForFunction(() => !!document.querySelector('.dialog'), null, { timeout: 8000 })
  await page.waitForTimeout(300)
  await shot('56-i18n-german-trade', { element: '.dialog', label: 'the German trade dialog' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// --- German map overlay --------------------------------------------------------
if (section('map-overlay')) {
  await switchToGerman()
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
  await page.waitForTimeout(800)
  await shot('57-i18n-german-map', { element: '.map-overlay', label: 'the German map overlay' })
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
  await page.waitForTimeout(300)
}

// --- Debug menu language selector + switch back to English --------------------
if (section('debug-language')) {
  await switchToGerman()
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
  await page.waitForTimeout(600)
  // The menu's groups start collapsed (design.md §21.3, point 393), and the
  // language selector sits in "tools" — open that group, else the frame would be
  // filed as evidence of a selector it does not show.
  await page.evaluate(() => window.__ui.getState().toggleDebugGroup('tools'))
  await page.waitForFunction(
    () => !!document.querySelector('.debug-menu .debug-group-body:not([hidden])'),
    null,
    { timeout: 10000 },
  )
  await shot('58-i18n-debug-language', { element: '.debug-menu', label: 'the debug menu language selector' })
  // Click the "English" button to switch back (drives the live UI control).
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.debug-menu button')].find((b) => b.textContent === 'English')
    btn?.click()
  })
  await page.waitForTimeout(600)
}

// A selected section that never executed is a FAILURE, not a quiet pass: it is
// the one way a --section run could report green having shot nothing. This suite
// has no check() of its own, so it is reported in the shape the runner reads.
const unrun = sections.unrun()
if (unrun) console.log(`FAIL  the selected section actually ran — ${unrun}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
// Said again where the verdict is read: a green one-section run is not a green
// suite, and nothing downstream may quote it as one.
if (sections.banner()) console.log(sections.banner())
await browser.close()
process.exit(errors.length > 0 || unrun ? 1 : 0)
