// Headless verification for CLAUDE.md §7.1.17 (localization): English default,
// runtime switch to German, localized journal/status/trade/map, no console
// errors. Dev server only (dev hooks).
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
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(5000)

const bodyText = () => page.evaluate(() => document.body.innerText)

// --- English is the default --------------------------------------------------
let txt = await bodyText()
check('English default: status bar', txt.includes('Date') && txt.includes('Funds') && txt.includes('Provisions'), '')
check('English default: journal title + entry', txt.includes('Journal') && txt.includes('Departure'), '')
check('English default: journal prose', txt.includes('Today my expedition begins'), '')
check('English default: coordinates', txt.includes('Latitude') && txt.includes('North'), '')
await page.screenshot({ path: `${OUT}54-i18n-english-default.png` })
console.log('shot 54-i18n-english-default.png')

// --- Switch to German at runtime ---------------------------------------------
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(800)
txt = await bodyText()
check('German: status bar', txt.includes('Datum') && txt.includes('Geld') && txt.includes('Proviant'), '')
check('German: journal re-rendered', txt.includes('Tagebuch') && txt.includes('Aufbruch'), '')
check('German: journal prose', txt.includes('Heute beginnt meine Expedition'), '')
check('German: coordinates', txt.includes('Grad Nord'), '')
check('German: no English leftovers on screen', !txt.includes('Funds') && !txt.includes('Journal ('), '')
await page.screenshot({ path: `${OUT}55-i18n-german-journal.png` })
console.log('shot 55-i18n-german-journal.png')

// --- German trade dialog -------------------------------------------------------
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
// Open the trade dialog by walking onto the shop's entrance door (design.md §2).
await page.evaluate(() => {
  const shop = window.__placeLayout.interactives.find((b) => b.type === 'shop')
  const p = window.__placePlayer
  p.x = shop.door[0]
  p.z = shop.door[1]
})
await page.waitForFunction(() => !!document.querySelector('.dialog'), null, { timeout: 8000 })
await page.waitForTimeout(300)
txt = await bodyText()
check('German trade dialog', txt.includes('Laden') && txt.includes('Kaufen') && txt.includes('Medizin'), '')
await page.screenshot({ path: `${OUT}56-i18n-german-trade.png` })
console.log('shot 56-i18n-german-trade.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// --- German map overlay --------------------------------------------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
await page.waitForTimeout(800)
txt = await bodyText()
check('German map overlay', txt.includes('Karte') && txt.includes('erkundet'), '')
await page.screenshot({ path: `${OUT}57-i18n-german-map.png` })
console.log('shot 57-i18n-german-map.png')
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
await page.waitForTimeout(300)

// --- Debug menu language selector + switch back to English --------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(600)
txt = await bodyText()
check('Debug menu shows language selector', txt.includes('Sprache') && txt.includes('Deutsch') && txt.includes('English'), '')
await page.screenshot({ path: `${OUT}58-i18n-debug-language.png` })
console.log('shot 58-i18n-debug-language.png')
// Click the "English" button to switch back (proves the UI control works).
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.debug-menu button')].find((b) => b.textContent === 'English')
  if (!btn) return false
  btn.click()
  return true
})
check('English button found and clicked', clicked, '')
await page.waitForTimeout(600)
txt = await bodyText()
check('Back to English via debug menu', txt.includes('Funds') && txt.includes('Language'), '')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
