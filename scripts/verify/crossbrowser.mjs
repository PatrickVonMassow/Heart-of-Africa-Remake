// Cross-browser & mobile functional smoke (user request 21.07.2026). The
// regression runs on Chromium desktop; this adds a SHORT check on the OTHER
// engines and on mobile/tablet, so a Gecko/WebKit-only or touch-only break is
// caught WITHOUT re-running the whole suite per engine (that would multiply the
// runtime by the engine count). Its DEPTH scales with the regression tier:
//
//   minimal  (SMALL gate): desktop boots, renderer initialises, no console errors.
//   standard (LARGE gate): + the actual backend, a sized canvas, a bird's-eye move,
//                          AND a mobile/tablet pass (touch layer arms on first touch).
//   thorough (maximale QS): + core flows (enter a settlement, open the map & journal).
//
// Desktop: Firefox (Gecko) + WebKit (Safari's engine). Mobile: WebKit ~ iOS Safari
// and Chromium ~ Android Chrome (Firefox has no Playwright touch/mobile emulation).
// It exercises the WebGL2 fallback (these engines' headless WebGPU is unreliable) —
// Firefox ships WebGPU (FF 141+), so the backend is reported. Graceful: an engine
// that is not installed (`npx playwright install firefox webkit`) is SKIPPED, so a
// runner without them never breaks the gate.
//
// Run standalone (or via run-all, which sets BASE_URL + CROSSBROWSER_DEPTH):
//   BASE_URL=http://localhost:5173/ CROSSBROWSER_DEPTH=standard node scripts/verify/crossbrowser.mjs
import { chromium, firefox, webkit } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const DEPTH = ['minimal', 'standard', 'thorough'].includes(process.env.CROSSBROWSER_DEPTH ?? '')
  ? process.env.CROSSBROWSER_DEPTH
  : 'standard'
const RANK = { minimal: 0, standard: 1, thorough: 2 }
const at = (level) => RANK[DEPTH] >= RANK[level]

let failures = 0
let checksRun = 0
const check = (label, name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label.padEnd(15)} ${name}${detail ? ' — ' + detail : ''}`)
  checksRun++
  if (!cond) failures++
}
async function launchOrSkip(label, engine) {
  try {
    return await engine.launch()
  } catch (e) {
    const msg = String(e.message)
    if (/Executable doesn't exist|not found|install/i.test(msg)) {
      console.log(`SKIP  ${label.padEnd(15)} not installed — run: npx playwright install ${label.split('-')[0]}`)
      return null
    }
    check(label, 'engine launches', false, msg.slice(0, 120))
    return null
  }
}
const boot = async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  return page
    .waitForFunction(() => !!(window.__game && window.__ui), null, { timeout: 45000 })
    .then(() => true)
    .catch(() => false)
}

console.log(`# cross-browser & mobile smoke (depth: ${DEPTH}) on ${BASE}`)

// --- DESKTOP: Firefox + WebKit ------------------------------------------------
for (const [label, engine] of [['firefox', firefox], ['webkit', webkit]]) {
  const browser = await launchOrSkip(label, engine)
  if (!browser) continue
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    const booted = await boot(page)
    check(label, 'the app boots (game/ui stores ready)', booted)
    if (!booted) {
      await browser.close()
      continue
    }
    const rendered = await page.waitForFunction(() => !!window.__renderer, null, { timeout: 45000 }).then(() => true).catch(() => false)
    const backend = rendered ? await page.evaluate(() => (window.__ui?.getState?.().webglFallback ? 'WebGL2 (fallback)' : 'WebGPU')) : 'none'
    check(label, `the renderer initialises [backend: ${backend}]`, rendered)

    if (at('standard')) {
      const canvas = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        if (!c) return null
        const r = c.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      })
      check(label, 'a sized WebGL canvas is on screen', !!canvas && canvas.w > 100 && canvas.h > 100, JSON.stringify(canvas))
      const moved = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const p0 = { ...window.__game.getState().pos }
        for (let i = 0; i < 10; i++) {
          window.__game.getState().moveTravel(1, 0, 0.05)
          await sleep(16)
        }
        const p1 = window.__game.getState().pos
        return Math.hypot(p1.x - p0.x, p1.z - p0.z)
      })
      check(label, "a bird's-eye move advances the position", moved > 0.01, `moved ${moved.toFixed(2)}`)
    }
    if (at('thorough')) {
      const flows = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const out = {}
        window.__game.getState().enterPlace('cairo')
        await sleep(1200)
        out.inPlace = window.__game.getState().mode === 'place'
        window.__ui.getState().toggleMap()
        await sleep(300)
        out.mapOpen = !!document.querySelector('.map-overlay')
        window.__ui.getState().toggleMap()
        window.__game.getState().setJournalOpen(true)
        await sleep(300)
        out.journalOpen = !!document.querySelector('.journal')
        window.__game.getState().setJournalOpen(false)
        return out
      })
      check(label, 'entering a settlement switches to the first-person scene', flows.inPlace === true, JSON.stringify(flows))
      check(label, 'the map overlay opens', flows.mapOpen === true, JSON.stringify(flows))
      check(label, 'the journal opens', flows.journalOpen === true, JSON.stringify(flows))
    }
    check(label, 'no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    check(label, 'smoke completes without a thrown error', false, String(e.message).slice(0, 160))
  } finally {
    await browser.close()
  }
}

// --- MOBILE / TABLET: WebKit ~ iOS Safari, Chromium ~ Android Chrome ----------
// (standard+ only; Firefox has no Playwright touch/mobile emulation.) The core
// check: the game boots on a touch/mobile viewport and the touch layer (point 84)
// ARMS on the first real touch — a virtual stick + look surface appear.
if (at('standard')) {
  for (const [label, engine, viewport] of [
    ['webkit-mobile', webkit, { width: 390, height: 844 }], // iPhone-class
    ['chromium-mobile', chromium, { width: 412, height: 915 }], // Pixel-class
  ]) {
    const browser = await launchOrSkip(label, engine)
    if (!browser) continue
    const errors = []
    let context
    try {
      context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
      const page = await context.newPage()
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))
      const booted = await boot(page)
      check(label, 'the app boots on a mobile viewport', booted)
      if (!booted) {
        await browser.close()
        continue
      }
      const rendered = await page.waitForFunction(() => !!window.__renderer, null, { timeout: 45000 }).then(() => true).catch(() => false)
      check(label, 'the renderer initialises on mobile', rendered)
      // Before any touch, the layer is absent (armed only on a real touch, point 84).
      const before = await page.evaluate(() => !!document.querySelector('.touch-controls'))
      // A real touch tap arms the touch layer.
      await page.touchscreen.tap(viewport.width / 2, Math.round(viewport.height * 0.55))
      await page.waitForTimeout(400)
      const armed = await page.evaluate(() => ({
        controls: !!document.querySelector('.touch-controls'),
        stick: !!document.querySelector('.touch-stick'),
        look: !!document.querySelector('.touch-look'),
      }))
      check(label, 'the touch layer arms on the first touch (stick + look)', before === false && armed.controls && armed.stick && armed.look, JSON.stringify({ before, ...armed }))
      if (at('thorough')) {
        // The mobile quality preset applies with the touch layer (point 84).
        const preset = await page.evaluate(() => {
          const u = window.__ui.getState()
          return { traaOff: u.traaEnabled === false, ssaoOff: u.ssaoEnabled === false, halfShadows: u.shadowMapHalf === true }
        })
        check(label, 'the mobile quality preset applied (TRAA/SSAO off, half shadows)', preset.traaOff && preset.ssaoOff && preset.halfShadows, JSON.stringify(preset))
      }
      check(label, 'no console errors on mobile', errors.length === 0, errors.slice(0, 3).join(' | '))
    } catch (e) {
      check(label, 'mobile smoke completes without a thrown error', false, String(e.message).slice(0, 160))
    } finally {
      await browser.close()
    }
  }
}

if (checksRun === 0) {
  console.log('\nSKIPPED — no other-engine browsers installed (npx playwright install firefox webkit)')
  process.exit(0) // not a failure: the gate stays green on a runner without them
}
console.log(failures > 0 ? `\n${failures} CROSS-BROWSER/MOBILE CHECK(S) FAILED` : `\nALL GREEN — cross-browser & mobile smoke (depth: ${DEPTH})`)
process.exit(failures > 0 ? 1 : 0)
