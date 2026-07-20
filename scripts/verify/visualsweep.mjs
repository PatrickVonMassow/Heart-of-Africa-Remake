// Point 203 (C) — the VISUAL SWEEP, the primary bug-finding net. A jump only
// POSITIONS; most bugs appear while MOVING and OVER TIME, so at each spot this
// DRIVES (holds a walk) and captures a FILMSTRIP of frames along the path, and
// lets the emergent scene run — so the frames can be VISUALLY inspected for
// anomalies the way a player finds them, but exhaustively. It also varies the
// CALENDAR for the weather-bearing spots. This script only CAPTURES; the finding
// is the inspection of the images. Not a pass/fail suite.
//
// Env: BASE_URL (dev/preview server), SWEEP_OUT (folder), VERIFY_GL (webgl|webgpu).
import { launchVerifyBrowser } from './_browser.mjs'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = process.env.SWEEP_OUT ?? fileURLToPath(new URL('../../verification/sweep/', import.meta.url))
fs.mkdirSync(OUT, { recursive: true })

// (name, lat, lon, month) — month optional (0-11) to probe a season. A spot with
// wildlife/water/coast to exercise the movement + anchoring + drama classes.
const SPOTS = [
  ['maasai-savanna', -2.5, 36.4],
  ['cairo-coast', 30.05, 31.25],
  ['nile-bank', 25.6, 32.6],
  ['zambezi-bank', -16.5, 26.5],
  ['congo-jungle', 0.4, 22.5],
  ['lake-edward', -0.35, 29.6],
  ['sahel-harmattan', 14.0, 2.0, 0], // January — harmattan pall
  ['sahel-wet', 14.0, 2.0, 7], // August — wet
  ['aswan-flood', 24.1, 32.9, 9], // October — Nile flood crest
  ['okavango-dryflood', -19.3, 22.9, 6], // July — dry-season flood
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
  // Do-not-disturb keeps discovery entries from re-opening the journal over the
  // frames (closing per shot lost the race against mid-drive discoveries).
  window.__ui.getState().setJournalDnd(true)
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false
})
await page.waitForTimeout(2000)

for (const [name, lat, lon, month] of SPOTS) {
  await page.evaluate(
    ([la, lo, mo]) => {
      window.__game.getState().debugJumpTo(la, lo)
      window.__ui.getState().setTravelZoom(0.5)
      // The real month API (the first sweep's setDebugMonth was a silent no-op).
      if (mo != null) window.__game.getState().debugJumpToMonth(mo)
    },
    [lat, lon, month],
  )
  await page.waitForTimeout(2500) // settle the jump lerp + let wildlife stream in
  // Drive a filmstrip: hold forward and grab a frame every ~2 sim-seconds so the
  // movement/streaming/emergent bugs (pop-in, jumping flora, pacing, snagging)
  // show up between frames.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })))
  for (let f = 0; f < 4; f++) {
    await page.waitForTimeout(1800) // wall-clock cadence — a capture, not an assertion
    // Keep the journal from covering the scene — region-discovery entries reopen it.
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    const file = `${OUT}${name}-f${f}.png`
    await page.screenshot({ path: file })
    console.log(`SHOT ${name} f${f}`)
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })))
  if (month != null) await page.evaluate(() => window.__ui.getState().setDebugMonth && window.__ui.getState().setDebugMonth(null))
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 200))
await browser.close()
console.log(`SWEEP DONE — ${SPOTS.length} spots x 4 frames in ${OUT}`)
