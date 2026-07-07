// Headless verification for CLAUDE.md §7.1.17 (localization): German default,
// runtime switch to English, localized journal/status/trade/map, no console
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

// --- German is the default -------------------------------------------------
let txt = await bodyText()
check('German default: status bar', txt.includes('Datum') && txt.includes('Geld') && txt.includes('Proviant'), '')
check('German default: journal title + entry', txt.includes('Tagebuch') && txt.includes('Aufbruch'), '')
check('German default: coordinates', txt.includes('Grad Nord'), '')
await page.screenshot({ path: `${OUT}54-i18n-german-default.png` })
console.log('shot 54-i18n-german-default.png')

// --- Switch to English at runtime ------------------------------------------
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(800)
txt = await bodyText()
check('English: status bar', txt.includes('Date') && txt.includes('Funds') && txt.includes('Provisions'), '')
check('English: journal re-rendered', txt.includes('Journal') && txt.includes('Departure'), '')
check('English: journal prose', txt.includes('Today my expedition begins'), '')
check('English: coordinates', txt.includes('Latitude') && txt.includes('North'), '')
check('English: no German leftovers on screen', !txt.includes('Geld') && !txt.includes('Tagebuch'), '')
await page.screenshot({ path: `${OUT}55-i18n-english-journal.png` })
console.log('shot 55-i18n-english-journal.png')

// --- English trade dialog ---------------------------------------------------
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
await page.evaluate(() => {
  const layout = window.__placeLayout
  const shop = layout.interactives.find((b) => b.type === 'shop')
  const p = window.__placePlayer
  p.x = shop.pos[0]
  p.z = shop.pos[1] + 3.2
})
await page.waitForTimeout(400)
// Open the trade dialog via the E key.
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })))
await page.waitForTimeout(600)
txt = await bodyText()
check('English trade dialog', txt.includes('General Store') && txt.includes('Buy') && txt.includes('Medicine'), '')
await page.screenshot({ path: `${OUT}56-i18n-english-trade.png` })
console.log('shot 56-i18n-english-trade.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// --- English map overlay ----------------------------------------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
await page.waitForTimeout(800)
txt = await bodyText()
check('English map overlay', txt.includes('Map') && txt.includes('explored'), '')
await page.screenshot({ path: `${OUT}57-i18n-english-map.png` })
console.log('shot 57-i18n-english-map.png')
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
await page.waitForTimeout(300)

// --- Debug menu language selector + switch back to German -------------------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(600)
txt = await bodyText()
check('Debug menu shows language selector', txt.includes('Language') && txt.includes('Deutsch') && txt.includes('English'), '')
await page.screenshot({ path: `${OUT}58-i18n-debug-language.png` })
console.log('shot 58-i18n-debug-language.png')
// Click the "Deutsch" button to switch back (proves the UI control works).
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.debug-menu button')].find((b) => b.textContent === 'Deutsch')
  if (!btn) return false
  btn.click()
  return true
})
check('Deutsch button found and clicked', clicked, '')
await page.waitForTimeout(600)
txt = await bodyText()
check('Back to German via debug menu', txt.includes('Geld') && txt.includes('Sprache'), '')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
