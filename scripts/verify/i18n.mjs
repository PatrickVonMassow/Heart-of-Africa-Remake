// Headless verification for CLAUDE.md §7.1.17 (localization): browser-only
// remainder. The rendered-text asserts (Date/Funds/Datum/Geld, journal/trade/
// map/debug labels) moved to the fast Vitest suite (src/ui/StatusBar.test.tsx,
// JournalPanel.test.tsx, Dialogs.test.tsx, DebugMenu.test.tsx and
// src/i18n/i18n.test.ts). What stays here needs a real browser: the runtime
// language switch driven through the live UI and the five localization
// screenshots (54-58) that are the §7.2 acceptance evidence, plus the
// console-error gate. Dev server only (dev hooks).
import { launchVerifyBrowser } from './_browser.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

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
await page.waitForTimeout(5000)

// --- English is the default: capture the status bar + journal ----------------
await page.screenshot({ path: `${OUT}54-i18n-english-default.png` })
console.log('shot 54-i18n-english-default.png')

// --- Switch to German at runtime ---------------------------------------------
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}55-i18n-german-journal.png` })
console.log('shot 55-i18n-german-journal.png')

// --- German trade dialog -------------------------------------------------------
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
await page.screenshot({ path: `${OUT}56-i18n-german-trade.png` })
console.log('shot 56-i18n-german-trade.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// --- German map overlay --------------------------------------------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}57-i18n-german-map.png` })
console.log('shot 57-i18n-german-map.png')
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
await page.waitForTimeout(300)

// --- Debug menu language selector + switch back to English --------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}58-i18n-debug-language.png` })
console.log('shot 58-i18n-debug-language.png')
// Click the "English" button to switch back (drives the live UI control).
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.debug-menu button')].find((b) => b.textContent === 'English')
  btn?.click()
})
await page.waitForTimeout(600)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(errors.length > 0 ? 1 : 0)
