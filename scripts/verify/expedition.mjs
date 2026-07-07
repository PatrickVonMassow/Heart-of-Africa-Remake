// Headless verification for CLAUDE.md §7.1.24 (deadline & successor,
// design.md §5/§18): staged warnings fire exactly once, the deadline ends
// the expedition (no successor), and after a death a successor resumes at
// the last checkpoint with the day penalty and a journal entry.
// Dev server only (dev hooks).
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
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false // deterministic
})

const journalKeys = () =>
  page.evaluate(() => window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))
const walk = (n) =>
  page.evaluate((steps) => {
    // Walk south (up the Nile): heading north from Cairo runs out of land
    // at the Mediterranean before the long test walks finish.
    for (let i = 0; i < steps; i++) window.__game.getState().moveTravel(0, 1, 0.05)
  }, n)

const dl = await page.evaluate(() => window.__balance.deadline)
check('deadline configured (~5 years, staged warnings)', dl.days > 1000 && dl.warning1 < dl.warning2 && dl.warning2 < 1, `${dl.days} days`)

// --- First warning fires exactly once -----------------------------------------
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
await page.evaluate((d) => window.__game.getState().debugSet({ day: d, foodDays: 60 }), dl.days * dl.warning1 - 0.5)
await walk(20)
let keys = await journalKeys()
check('first warning after 60 % of the time', keys.filter((k) => k === 'journal.deadline1').length === 1, '')
await walk(20)
keys = await journalKeys()
check('first warning fires only once', keys.filter((k) => k === 'journal.deadline1').length === 1, '')

// --- Second warning -------------------------------------------------------------
await page.evaluate((d) => window.__game.getState().debugSet({ day: d, foodDays: 60 }), dl.days * dl.warning2 - 0.5)
await walk(20)
keys = await journalKeys()
check('final warning after 85 % of the time', keys.filter((k) => k === 'journal.deadline2').length === 1, '')

// --- Expiry: defeat without a successor ------------------------------------------
await page.evaluate((d) => window.__game.getState().debugSet({ day: d, foodDays: 60 }), dl.days - 0.2)
await walk(10)
const expired = await page.evaluate(() => ({
  defeat: window.__game.getState().defeat,
  open: window.__game.getState().journalOpen,
}))
check('deadline expiry loses the expedition', expired.defeat === 'deadline' && expired.open === false, '')
await page.waitForTimeout(400)
const overlay = await page.evaluate(() => ({
  text: document.querySelector('.overlay.defeat')?.textContent ?? '',
  successor: [...document.querySelectorAll('.overlay.defeat button')].some((b) =>
    b.textContent?.includes('successor'),
  ),
}))
check('expiry overlay: expedition recalled, no successor', overlay.text.includes('recalled') && !overlay.successor, '')
await page.screenshot({ path: `${OUT}79-deadline-expired.png` })
console.log('shot 79-deadline-expired.png')

// --- Death → successor resumes from the checkpoint with the day penalty ---------
await page.evaluate(() => window.__game.getState().newGame())
await page.waitForTimeout(1800)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false
})
// Checkpoint in Cairo at a known day.
await page.evaluate(() => window.__game.getState().debugSet({ day: 100 }))
await page.evaluate(() => window.__game.getState().enterPlace('cairo'))
await page.waitForTimeout(1500)
const checkpointDay = await page.evaluate(() => window.__game.getState().day)
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1000)
await page.evaluate(() => {
  window.__game.getState().debugSet({ health: 2 })
  window.__game.getState().debugSetAffliction('wounds', 2)
})
await walk(40)
const died = await page.evaluate(() => window.__game.getState().defeat)
check('the predecessor dies in the field', died === 'death', '')
const took = await page.evaluate(() => window.__game.getState().successorTakeOver())
await page.waitForTimeout(600)
const successor = await page.evaluate(() => ({
  defeat: window.__game.getState().defeat,
  day: window.__game.getState().day,
  keys: window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)),
}))
check('successor resumes the expedition', took === true && successor.defeat === null, '')
check(
  'the takeover costs the configured days',
  Math.abs(successor.day - (checkpointDay + dl.successorDayPenalty)) < 0.01,
  `day ${successor.day.toFixed(1)} (checkpoint ${checkpointDay.toFixed(1)} + ${dl.successorDayPenalty})`,
)
check('the successor writes a takeover entry', successor.keys.includes('journal.successor'), '')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
