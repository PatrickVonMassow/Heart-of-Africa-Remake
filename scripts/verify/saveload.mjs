// Headless verification for CLAUDE.md §7.1.28 (full saving/loading,
// design.md §18): one snapshot per port visit, the tabular load menu with
// the health column, resuming an older visit, the successor on the latest
// snapshot, and the legacy single-slot migration. Dev server only.
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
  window.__balance.randomEventsEnabled = false
})

const snapCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('hoa-checkpoints-v1') ?? '[]').length)

// --- One snapshot per port visit -------------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('cairo') // visit 1: default money
})
await page.waitForTimeout(300)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSet({ money: 500, health: 30 })
  g.leavePlace()
  g.enterPlace('zanzibar') // visit 2: 500 $, poor health
})
await page.waitForTimeout(300)
check('every port visit stores its own snapshot', (await snapCount()) === 2, `${await snapCount()} snapshots`)

// --- The tabular load menu on reload -----------------------------------------------
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(3500)
// Close the journal: the click below is the first user gesture and would
// otherwise start the deferred initial narration (TTS model download).
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.locator('.overlay button', { hasText: 'Load checkpoint' }).click()
await page.waitForTimeout(400)
const table = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.load-menu tbody tr')]
  const heads = [...document.querySelectorAll('.load-menu thead th')].map((th) => th.textContent)
  return { rows: rows.length, heads, firstRow: rows[0]?.textContent ?? '', lastRow: rows.at(-1)?.textContent ?? '' }
})
check('load menu lists one row per port visit', table.rows === 2, `${table.rows} rows`)
check(
  'table shows port, date, money, food, gifts and health',
  ['Port city', 'Date', 'Funds', 'Provisions', 'Gifts', 'Health'].every((h) => table.heads.includes(h)),
  table.heads.join('|'),
)
check(
  'health state appears as a word (poor condition on the latest visit)',
  table.firstRow.includes('Zanzibar') && table.firstRow.includes('poor'),
  table.firstRow.slice(0, 90),
)
await page.screenshot({ path: `${OUT}80-load-menu.png` })
console.log('shot 80-load-menu.png')

// --- Resuming an older visit restores that state -------------------------------------
await page.locator('.load-menu tbody tr', { hasText: 'Cairo' }).locator('button').click()
await page.waitForTimeout(600)
const restored = await page.evaluate(() => ({
  placeId: window.__game.getState().placeId,
  money: window.__game.getState().money,
}))
check(
  'picking the older visit restores that state',
  restored.placeId === 'cairo' && restored.money !== 500,
  `at ${restored.placeId}, ${restored.money} $`,
)

// --- The successor resumes from the latest snapshot -----------------------------------
const took = await page.evaluate(() => window.__game.getState().successorTakeOver())
await page.waitForTimeout(400)
const successorPlace = await page.evaluate(() => window.__game.getState().placeId)
check('the successor resumes from the latest snapshot', took === true && successorPlace === 'zanzibar', `at ${successorPlace}`)

// --- Legacy single-slot checkpoint migrates as one row ---------------------------------
await page.evaluate(() => {
  const snaps = JSON.parse(localStorage.getItem('hoa-checkpoints-v1'))
  localStorage.removeItem('hoa-checkpoints-v1')
  localStorage.setItem('hoa-checkpoint-v2', JSON.stringify(snaps[0]))
})
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(3500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.locator('.overlay button', { hasText: 'Load checkpoint' }).click()
await page.waitForTimeout(400)
const legacyRows = await page.evaluate(() => document.querySelectorAll('.load-menu tbody tr').length)
check('a legacy checkpoint appears as one table row', legacyRows === 1, `${legacyRows} row`)
await page.locator('.load-menu tbody tr button').click()
await page.waitForTimeout(400)
const legacyLoaded = await page.evaluate(() => window.__game.getState().placeId)
check('the migrated snapshot loads', legacyLoaded === 'cairo', `at ${legacyLoaded}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
