// Headless verification for CLAUDE.md §7.1.19 (journal voice markup and
// read-aloud): the browser-only remainder. The static tag scan of de.ts/en.ts
// moved to src/i18n/i18n.test.ts, the parser strip/segment asserts to
// src/journal/voiceMarkup.test.ts, and the "no visible markers / prose intact /
// speak-button de vs en" render asserts to src/ui/JournalPanel.test.tsx. What
// stays here needs a real browser: movement continues while the journal is open
// (scene), the in-browser Kokoro read-aloud reaching the speaking state, the
// cold-load liveness gate (the WASM fallback keeps the main thread free while
// the engine loads — measured and ATTRIBUTED per liveness.mjs, point 304), the
// screenshots (64-66) and the console-error gate.
// This run forces the WASM path via `window.__ttsForceWasm` — headless has no
// WebGPU adapter, and WASM is what stays live (on Chromium hardware the engine
// runs the faster WebGPU path, whose cold load the game pre-warms; point 117).
// Dev server only (dev hooks).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { installTtsCache, markTtsCacheComplete } from './ttsCache.mjs'
import { attributeBlocks, maxGap } from './liveness.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
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
// hook is read on the main thread in speech.ts (point 117). `__ttsDeferWarmup`
// holds the automatic pre-warm back so the cold load happens INSIDE the probe
// window below rather than minutes earlier (point 304), and the liveness
// instrument wraps requestAnimationFrame before any page script runs so every
// frame callback's span is known — see liveness.mjs for why that matters.
await page.addInitScript(() => {
  window.__ttsForceWasm = true
  window.__ttsDeferWarmup = true
  const nativeRaf = window.requestAnimationFrame.bind(window)
  const S = { frames: [], ticks: [], raf: [], recording: false, timer: 0 }
  window.requestAnimationFrame = function (cb) {
    return nativeRaf(function (t) {
      const start = performance.now()
      try {
        return cb(t)
      } finally {
        if (S.recording) {
          S.frames.push({ start, end: performance.now() })
          if (S.raf[S.raf.length - 1] !== t) S.raf.push(t)
        }
      }
    })
  }
  window.__liveness = S
})

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page) // point 204: this suite is WebGL2-only — prove the lane really is WebGL 2
await page.waitForTimeout(4000)

// --- Movement continues while the journal is open (design.md §16) -----------
// The game starts in Cairo with the departure entry and the journal open; the
// character must still walk (the open/narrating journal no longer freezes it).
{
  const jOpen = await page.evaluate(() => window.__game.getState().journalOpen)
  const before = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  // Hold W and poll until the character has actually walked (point 200), rather
  // than a fixed press/wait loop; the assert below still judges the moved
  // distance if it never gets there.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
  await page
    .waitForFunction((b) => Math.hypot(window.__placePlayer.x - b.x, window.__placePlayer.z - b.z) > 0.5, before, { timeout: 5000 })
    .catch(() => {})
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
// The browser profile is fresh and the pre-warm is deferred, so this first
// narration is the COLD engine load, start to finish, inside the probe window.
//
// LIVENESS GATE (point 117, rebuilt by point 304). On this forced-WASM path the
// model load must not cost the game its main thread — WASM never touches the GPU
// process. The gate therefore runs a 50 ms TICK TRAIN and charges only the
// stalls that the page's own animation-frame callbacks do NOT account for; see
// liveness.mjs. The metric it replaces was the raw rAF gap, which read ~15 000 ms
// on a quiet machine and blamed the TTS load for it — while the same 15 000 ms
// reproduced with the TTS worker stubbed out entirely: it is the startup frame
// awaiting the scene's shader-program links, a long FRAME with a perfectly free
// main thread (tick gap 63 ms). Both numbers are reported below; only the
// attributed block is binding.
await page.evaluate(() => {
  const S = window.__liveness
  S.frames.length = 0
  S.ticks.length = 0
  S.raf.length = 0
  S.recording = true
  S.timer = setInterval(() => S.ticks.push(performance.now()), 50)
})
const probeStart = Date.now()
// No trusted gesture has happened yet; a neutral key press is the first one.
// It must be a key the game does NOT bind: this used to be F8, which since the
// in-game render benchmark shipped (point 277) starts that benchmark — it swept
// ten graphics configs, recompiled the post pipeline over and over and blocked
// the main thread for ~15 s at a time, right inside the measurement it was
// meant to leave alone. Insert is bound by neither the game nor the browser.
await page.keyboard.press('Insert')
// Self-test knob (point 304): VOICE_STALL_SELFTEST=<ms> injects a synchronous
// main-thread busy loop into the cold-load window, which must turn the gate
// below RED. That is how the gate is proven to still bite.
const selfTestMs = Number(process.env.VOICE_STALL_SELFTEST ?? 0)
if (selfTestMs > 0) {
  await page.evaluate((ms) => {
    setTimeout(() => {
      const end = performance.now() + ms
      while (performance.now() < end) {
        /* block the main thread on purpose */
      }
    }, 2000)
  }, selfTestMs)
}
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
// Let it reach the speaking state — the cold engine load runs in between, so
// the probe window closes on a load that provably happened inside it.
await page
  .waitForFunction(() => document.querySelector('.journal .speak')?.textContent === '■', null, { timeout: 300000 })
  .catch(() => {})
const probe = await page.evaluate(() => {
  const S = window.__liveness
  S.recording = false
  clearInterval(S.timer)
  return { frames: S.frames, ticks: S.ticks, raf: S.raf }
})
const probeEnd = Date.now()
const blocks = attributeBlocks(probe.ticks, probe.frames)
const rafGapMs = Math.round(maxGap(probe.raf))
// The measurement must be TRUSTWORTHY before it may accuse anything: enough
// samples on both trains, and the model load must genuinely have happened
// inside the window (with the pre-warm deferred, the cache serves the model
// only once the narration asks for it). A window that missed the cold load
// proves nothing, and saying so beats a green tick.
const modelServed = ttsStats.served.filter((s) => /model_quantized\.onnx$/.test(s.url) && s.at >= probeStart && s.at <= probeEnd)
check(
  'the cold-load liveness probe is trustworthy (spans the model load, both sample trains alive)',
  probe.raf.length > 30 && probe.ticks.length > 20 && modelServed.length > 0,
  `${probe.raf.length} frames, ${probe.ticks.length} ticks over ${probeEnd - probeStart} ms, model load in window: ${modelServed.length > 0}`,
)
// Generous bound: the defect this guards is a multi-second freeze; ordinary
// scheduling noise on the tick train is tens of milliseconds.
check(
  'the WASM fallback keeps the main thread free through the cold TTS load (point 117)',
  blocks.blockMs < 1500,
  `attributed block ${Math.round(blocks.blockMs)} ms (raw tick gap ${Math.round(blocks.tickGapMs)} ms)`,
)
// Reported, NOT gated: the renderer's own synchronous frame cost and the
// picture-level frame gap. Both belong to the scene's startup shader-program
// compile, reproduce with the TTS worker stubbed out and are not this suite's
// subject (point 304) — but a silent number is how the last misattribution
// survived, so they are printed on every run.
console.log(
  `INFO  not gated, reported: max frame-covered stall ${Math.round(blocks.frameBlockMs)} ms, max rAF gap ${rafGapMs} ms` +
    ' — seconds here mean the scene awaited its shader-program set, which reproduces with the TTS worker stubbed out (point 304)',
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
  check('TTS assets served offline from the local cache', ttsStats.hits > 0 && ttsStats.misses === 0, JSON.stringify({ ...ttsStats, served: ttsStats.served.length }))
} else {
  check('TTS assets recorded into the local cache', ttsStats.hits + ttsStats.misses > 0, JSON.stringify({ ...ttsStats, served: ttsStats.served.length }))
  if (failures === 0 && errors.length === 0) markTtsCacheComplete()
}
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
