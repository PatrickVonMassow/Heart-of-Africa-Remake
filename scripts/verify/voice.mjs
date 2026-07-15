// Headless verification for CLAUDE.md §7.1.19 (journal voice markup and
// read-aloud): the browser-only remainder. The static tag scan of de.ts/en.ts
// moved to src/i18n/i18n.test.ts, the parser strip/segment asserts to
// src/journal/voiceMarkup.test.ts, and the "no visible markers / prose intact /
// speak-button de vs en" render asserts to src/ui/JournalPanel.test.tsx. What
// stays here needs a real browser: movement continues while the journal is open
// (scene), the in-browser Kokoro read-aloud reaching the speaking state, the
// cold-load render-liveness gate (the WASM fallback keeps the game rendering
// while the engine loads), the screenshots (64-66) and the console-error gate.
// This run forces the WASM path via `window.__ttsForceWasm` — headless has no
// WebGPU adapter, and WASM is what stays live (on Chromium hardware the engine
// runs the faster WebGPU path, whose cold load the game pre-warms; point 117).
// Dev server only (dev hooks).
import { chromium } from 'playwright'
import { installTtsCache, markTtsCacheComplete } from './ttsCache.mjs'
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
// TTS assets come from the local cache (point 88): first run records, later
// runs replay strictly offline-from-CDN.
const ttsStats = await installTtsCache(page)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// Force the WASM TTS path: headless Chromium has no WebGPU adapter, and WASM
// keeps the game rendering through the cold load (the liveness gate below). The
// hook is read on the main thread in speech.ts (point 117).
await page.addInitScript(() => {
  window.__ttsForceWasm = true
})

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(4000)

// --- Movement continues while the journal is open (design.md §16) -----------
// The game starts in Cairo with the departure entry and the journal open; the
// character must still walk (the open/narrating journal no longer freezes it).
{
  const jOpen = await page.evaluate(() => window.__game.getState().journalOpen)
  const before = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
    await page.waitForTimeout(60)
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
  const after = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  const moved = Math.hypot(after.x - before.x, after.z - before.z)
  check('movement continues while the journal is open', jOpen && moved > 0.5, `journalOpen ${jOpen}, moved ${moved.toFixed(2)} m`)
}

// --- German journal screenshot (clean, no visible markers) -------------------
// The no-marker/prose/speak-button asserts moved to Vitest (JournalPanel.test.tsx);
// the screenshot stays as §7.2 acceptance evidence. Default language is English
// (pt. 17), so switch to German explicitly for the shot.
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}64-voice-german-journal-clean.png` })
console.log('shot 64-voice-german-journal-clean.png')

// --- Back to English for the read-aloud (TTS) checks -------------------------
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(800)

// --- The start entry narrates on the first user gesture (autoplay deferral) --
// The browser profile is fresh, so this first narration is the COLD engine
// load. Liveness gate: sample rAF timestamps across it — on this forced-WASM
// headless path the game must keep RENDERING while the worker loads the model
// (WASM never touches the GPU process). On Chromium hardware the WebGPU path is
// used instead, whose cold-load GPU stall the game pre-warms up front (point 117).
await page.evaluate(() => {
  const raf = []
  window.__rafProbe = { raf, running: true }
  const loop = (t) => {
    raf.push(t)
    if (window.__rafProbe.running) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})
// No trusted gesture has happened yet; a neutral key press is the first one.
await page.keyboard.press('F8')
let bootSpoke = false
try {
  await page.waitForFunction(
    () => {
      const btns = document.querySelectorAll('.journal .speak')
      const t = btns.length > 0 ? btns[btns.length - 1].textContent : ''
      return t === '…' || t === '■'
    },
    null,
    { timeout: 300000 },
  )
  bootSpoke = true
} catch {
  bootSpoke = false
}
check('the start entry narrates on the first user gesture', bootSpoke, '')
// Let it reach the speaking state (the cold engine load runs in between),
// then read the liveness probe: the whole load must have kept rendering.
await page
  .waitForFunction(() => document.querySelector('.journal .speak')?.textContent === '■', null, { timeout: 300000 })
  .catch(() => {})
const rafGap = await page.evaluate(() => {
  const p = window.__rafProbe
  p.running = false
  let max = 0
  for (let i = 1; i < p.raf.length; i++) max = Math.max(max, p.raf[i] - p.raf[i - 1])
  return { max: Math.round(max), frames: p.raf.length }
})
// Generous bound against machine load: the defect was a 15 s stall, normal
// frames run at 16-70 ms even under a loaded suite.
check(
  'the WASM fallback keeps the game rendering through the cold TTS load (point 117)',
  rafGap.frames > 30 && rafGap.max < 1500,
  `max rAF gap ${rafGap.max} ms over ${rafGap.frames} frames`,
)
await page.locator('.journal .speak').last().click()
await page.waitForTimeout(500)

await page.locator('.journal .speak').first().click()
let speaking = false
try {
  await page.waitForFunction(
    () => document.querySelector('.journal .speak')?.textContent === '■',
    null,
    { timeout: 300000 },
  )
  speaking = true
} catch {
  speaking = false
}
check('English read-aloud reaches speaking state (audio playing)', speaking, '')
await page.screenshot({ path: `${OUT}65-voice-english-readaloud.png` })
console.log('shot 65-voice-english-readaloud.png')
// Stop narration via the same control.
await page.locator('.journal .speak').first().click()
await page.waitForTimeout(500)

// --- Auto-narration of a newly appearing entry (no click) --------------------
await page.evaluate(() =>
  window.__game.getState().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' }),
)
let autoSpoke = false
try {
  // The model is already loaded, so only synthesis time remains.
  await page.waitForFunction(
    () => {
      const btns = document.querySelectorAll('.journal .speak')
      return btns.length > 0 && btns[btns.length - 1].textContent === '■'
    },
    null,
    { timeout: 180000 },
  )
  autoSpoke = true
} catch {
  autoSpoke = false
}
check('English: new journal entry auto-narrates without a click', autoSpoke, '')
await page.screenshot({ path: `${OUT}66-voice-auto-narration.png` })
console.log('shot 66-voice-auto-narration.png')
await page.locator('.journal .speak').last().click()
await page.waitForTimeout(400)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
// Cache verdict (point 88): once complete, the whole suite must run without
// a single CDN request for the TTS assets; the first (recording) run instead
// proves it captured them.
if (ttsStats.strict) {
  check('TTS assets served offline from the local cache', ttsStats.hits > 0 && ttsStats.misses === 0, JSON.stringify(ttsStats))
} else {
  check('TTS assets recorded into the local cache', ttsStats.hits + ttsStats.misses > 0, JSON.stringify(ttsStats))
  if (failures === 0 && errors.length === 0) markTtsCacheComplete()
}
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
