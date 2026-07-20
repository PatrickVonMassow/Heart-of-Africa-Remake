// Point 203 (C) — the VISUAL SWEEP, the primary bug-finding net: drive/jump to a
// dense, diverse set of spots at the ACHIEVABLE zoom, let the scene settle, and
// screenshot each so the frames can be VISUALLY inspected for anomalies (buried /
// floating / submerged / overlapping / mis-posed / wrong-looking things) — the way
// a player finds them, but exhaustively. This script only CAPTURES; the inspection
// is done by reading the images. Saves to SWEEP_OUT (default: a sweep/ folder next
// to the run). Not a pass/fail suite — it prints where it wrote each shot.
import { launchVerifyBrowser } from './_browser.mjs'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = process.env.SWEEP_OUT ?? fileURLToPath(new URL('../../verification/sweep/', import.meta.url))
fs.mkdirSync(OUT, { recursive: true })

// (name, lat, lon) — the reported trouble spots + one of each biome + the landmarks
// and water bodies. Grows over time (203 keeps a checklist).
const SPOTS = [
  ['cairo-port-coast', 30.05, 31.25],
  ['red-sea-coast', 27.2, 33.5],
  ['nile-delta', 30.9, 31.1],
  ['nile-corridor', 25.6, 32.6],
  ['sudd-marsh', 8.0, 30.6],
  ['lake-edward', -0.35, 29.6],
  ['lake-victoria', -1.0, 33.0],
  ['maasai-savanna', -2.5, 36.4],
  ['kilimanjaro', -3.07, 37.35],
  ['congo-jungle', 0.4, 22.5],
  ['sahel', 14.0, 2.0],
  ['zambezi', -16.5, 26.5],
  ['victoria-falls', -17.9, 25.85],
  ['okavango', -19.3, 22.9],
  ['west-guinea-coast', 7.5, -6.0],
  ['cape-south-coast', -34.0, 20.0],
]

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await page.evaluate(() => {
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false
})
await page.waitForTimeout(2500)

for (const [name, lat, lon] of SPOTS) {
  await page.evaluate(
    ([la, lo]) => {
      window.__game.getState().debugJumpTo(la, lo)
      window.__ui.getState().setTravelZoom(0.5)
    },
    [lat, lon],
  )
  // Let the jump lerp finish and wildlife/flora stream in.
  await page.waitForTimeout(4500)
  const file = `${OUT}${name}.png`
  await page.screenshot({ path: file })
  console.log(`SHOT ${name} (${lat}, ${lon}) -> ${file}`)
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 200))
await browser.close()
console.log(`SWEEP DONE — ${SPOTS.length} shots in ${OUT}`)
