// Verifies the checkpoint load flow (CLAUDE.md §7.1.5): seed a distinctive
// state, save a checkpoint, reload the page, load the checkpoint via the
// overlay ("Load checkpoint" — English default language) and confirm the
// state is restored. Dev server only (dev hooks).
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

// Seed a distinctive state and save a checkpoint.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSet({ money: 123 })
  g.saveCheckpoint()
})

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

check('Checkpoint overlay after reload', (await page.getByText('Load checkpoint').count()) > 0)
await page.getByText('Load checkpoint').click()
await page.waitForTimeout(500)
const s = await page.evaluate(() => window.__game.getState())
check('State restored from checkpoint ($123, in Cairo)',
  s.money === 123 && s.mode === 'place' && s.placeId === 'cairo')
check('No page errors', errors.length === 0)
if (errors.length) console.log('ERRORS:', errors.join('; '))
await browser.close()
process.exit(failures === 0 ? 0 : 1)
