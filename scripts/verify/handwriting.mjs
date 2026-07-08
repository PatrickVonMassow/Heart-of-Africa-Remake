// Headless verification for CLAUDE.md §7.1.29 (animated handwriting,
// design.md §16): a new entry is written visibly by a hand, the hand shows
// the wound level, wounded entries keep blood traces, a click finishes the
// entry, and do-not-disturb writes silently. Dev server only.
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
  window.__game.getState().setJournalOpen(true)
})
await page.waitForTimeout(400)

const lastEntryText = () => page.evaluate(() => [...document.querySelectorAll('.journal .entry p')].at(-1)?.textContent ?? '')

// --- A new entry is written by the hand, stroke by stroke -----------------------
await page.evaluate(() =>
  window.__game.getState().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' }),
)
await page.waitForTimeout(350)
const early = await page.evaluate(() => ({
  writing: document.querySelectorAll('.journal .entry.writing').length,
  hand: document.querySelectorAll('.writing-hand').length,
  text: document.querySelector('.journal .entry.writing p')?.textContent ?? '',
}))
check('a new entry starts in the writing state with the hand', early.writing === 1 && early.hand === 1, '')
await page.waitForTimeout(900)
const later = await lastEntryText()
check(
  'the text reveals stroke by stroke',
  early.text.length > 0 && later.length > early.text.length,
  `${early.text.length} → ${later.length} chars`,
)
await page.screenshot({ path: `${OUT}81-handwriting.png` })
console.log('shot 81-handwriting.png')
await page.waitForTimeout(3500)
const finished = await page.evaluate(() => ({
  writing: document.querySelectorAll('.journal .entry.writing').length,
  text: [...document.querySelectorAll('.journal .entry p')].at(-1)?.textContent ?? '',
}))
check(
  'the finished entry shows the full clean text',
  finished.writing === 0 && finished.text.length > 80 && !finished.text.includes('['),
  `${finished.text.length} chars`,
)

// --- The wounded hand and its blood traces ---------------------------------------
await page.evaluate(() => {
  window.__game.getState().debugSetAffliction('wounds', 2)
  window.__game.getState().addEntry({ key: 'journal.titles.attack' }, { key: 'journal.healthPoor' })
})
await page.waitForTimeout(350)
const bloody = await page.evaluate(() => ({
  bloodyHand: document.querySelectorAll('.writing-hand.bloody').length,
  marks: [...document.querySelectorAll('.journal .entry')].at(-1)?.querySelectorAll('.blood-marks.severe span').length ?? 0,
}))
check('a severely wounded hand writes bloody', bloody.bloodyHand === 1, '')
check('the entry carries blood traces', bloody.marks >= 3, `${bloody.marks} marks`)
await page.screenshot({ path: `${OUT}82-handwriting-blood.png` })
console.log('shot 82-handwriting-blood.png')

// A click finishes the handwriting immediately. DND is raised around the
// click: it is the page's first user gesture and would otherwise start the
// deferred initial narration (TTS model download).
await page.evaluate(() => window.__ui.getState().setJournalDnd(true))
await page.locator('.journal .entry.writing').click()
await page.waitForTimeout(200)
await page.evaluate(() => window.__ui.getState().setJournalDnd(false))
const clicked = await page.evaluate(() => ({
  writing: document.querySelectorAll('.journal .entry.writing').length,
  marks: [...document.querySelectorAll('.journal .entry')].at(-1)?.querySelectorAll('.blood-marks span').length ?? 0,
}))
check('a click finishes the entry immediately', clicked.writing === 0, '')
check('the blood traces persist after writing', clicked.marks >= 3, `${clicked.marks} marks`)
await page.evaluate(() => window.__game.getState().debugSetAffliction('wounds', 0))

// --- Do not disturb: entries appear silently without the animation -----------------
await page.evaluate(() => {
  window.__ui.getState().setJournalDnd(true)
  window.__game.getState().setJournalOpen(false)
  window.__game.getState().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
})
await page.waitForTimeout(300)
const dnd = await page.evaluate(() => ({
  open: window.__game.getState().journalOpen,
  writing: document.querySelectorAll('.journal .entry.writing').length,
}))
check('do-not-disturb writes silently without the animation', dnd.open === false && dnd.writing === 0, '')
await page.evaluate(() => window.__ui.getState().setJournalDnd(false))

// --- The view follows new content down while it is written (design.md §15/§16) ---
// Fill the journal so it overflows, reopen it, then add an animated entry: the
// scroll container must follow the growing text to the bottom so the newly
// appearing strokes stay visible.
await page.evaluate(() => {
  const g = window.__game.getState()
  window.__ui.getState().setJournalDnd(true) // silent fillers while closed
  for (let i = 0; i < 24; i++) g.addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
  window.__ui.getState().setJournalDnd(false)
  g.setJournalOpen(true)
})
await page.waitForTimeout(400)
await page.evaluate(() =>
  window.__game.getState().addEntry({ key: 'journal.titles.attack' }, { key: 'journal.healthPoor' }),
)
await page.waitForTimeout(500) // mid-animation
const scroll = await page.evaluate(() => {
  const el = document.querySelector('.journal .entries')
  const wp = document.querySelector('.journal .entry.writing p')
  const cRect = el.getBoundingClientRect()
  const pRect = wp ? wp.getBoundingClientRect() : null
  return {
    overflow: el.scrollHeight - el.clientHeight,
    bottomGap: el.scrollHeight - el.clientHeight - el.scrollTop,
    writingVisible: pRect ? pRect.bottom <= cRect.bottom + 6 && pRect.bottom >= cRect.top : false,
  }
})
check('the journal overflows so scrolling is required', scroll.overflow > 40, `overflow ${scroll.overflow.toFixed(0)}px`)
check(
  'the view auto-scrolls down to the still-writing entry',
  scroll.bottomGap < 10 && scroll.writingVisible,
  `bottomGap ${scroll.bottomGap.toFixed(0)}px, writingVisible ${scroll.writingVisible}`,
)
await page.screenshot({ path: `${OUT}83-handwriting-autoscroll.png` })
console.log('shot 83-handwriting-autoscroll.png')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
