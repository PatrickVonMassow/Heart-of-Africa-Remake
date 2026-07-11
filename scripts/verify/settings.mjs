// Headless verification for CLAUDE.md §7.1.20 (comfort/audio settings) and the
// lion-feed depiction of §7.1.12: the browser-only remainder. The balance
// defaults (mouse/walk/ambience/travel/canoe/jungle/mountain/canteen/reentry/
// strafe) moved to src/config/balance.test.ts, the pure placeWalkVelocity ratio
// to src/systems/movement.test.ts, the F3/F4/Tab-toggle store asserts to
// src/state/store.debug.test.ts, and the DebugMenu label/field/dropdown/
// renderer render asserts to src/ui/DebugMenu.test.tsx. What stays here needs a
// real browser: the first-person eye height (window.__placeCamera), the
// in-scene walk measurement, the user-select computed style, the RAF-driven
// lion-feed depiction (window.__lionHunt), the ambience engine + proximity
// animal call rise/fade (AudioContext/window.__wildlife), the Tab-no-focus-shift
// behaviour (activeElement/canvas), the TRAA pipeline toggle (real pipeline
// rebuild + frame check), the screenshots and the console-error gate.
// Dev server only (dev hooks).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

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
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)

// --- First-person eye height -------------------------------------------------
const eyeY = await page.evaluate(() => window.__placeCamera?.position.y)
check('first-person eye height lowered to 1.5', Math.abs(eyeY - 1.5) < 1e-6, `${eyeY}`)

// --- Strafe/backward move in the scene (design.md §2) ------------------------
// The exact 80 % ratio is proven by the pure velocity helper in Vitest
// (src/systems/movement.test.ts); here we only confirm both directions move a
// real character in the live scene (frame-count-dependent distance, so the two
// are not directly comparable).
async function measureWalk(code) {
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = 0
    p.z = 16
    p.yaw = 0
  })
  await page.waitForTimeout(80)
  const p0 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })), code)
  // Hold the key until the character has clearly moved (or 4s): headless RAF is
  // throttled, so a fixed short hold can span too few frames under load.
  await page
    .waitForFunction(
      (start) => Math.hypot(window.__placePlayer.x - start.x, window.__placePlayer.z - start.z) > 0.6,
      p0,
      { timeout: 4000 },
    )
    .catch(() => {})
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), code)
  await page.waitForTimeout(40)
  const p1 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  return Math.hypot(p1.x - p0.x, p1.z - p0.z)
}
const fwd = await measureWalk('KeyW')
const strafeD = await measureWalk('KeyD')
check('forward walking actually moves the character', fwd > 0.5, `${fwd.toFixed(2)} m`)
check('strafing actually moves the character', strafeD > 0.5, `${strafeD.toFixed(2)} m`)

// --- Debug menu open: user-select computed style + screenshot ----------------
// The German label/field/dropdown asserts moved to Vitest (DebugMenu.test.tsx);
// the debug menu is opened here for the real-CSS user-select check and the
// acceptance screenshot. Switch to German first (matches the shot's evidence).
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(400)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(600)
// GUI text is not selectable, but form controls keep normal selection.
const select = await page.evaluate(() => {
  const bar = document.querySelector('.status-bar')
  const label = document.querySelector('.debug-menu label span')
  const input = document.querySelector('.debug-menu input')
  const us = (el) => (el ? getComputedStyle(el).userSelect : null)
  return { bar: us(bar), label: us(label), input: us(input) }
})
check('GUI text is not selectable', select.bar === 'none' && select.label === 'none', JSON.stringify(select))
check('form inputs keep normal text selection', select.input === 'text', JSON.stringify(select))
await page.screenshot({ path: `${OUT}67-settings-debug-menu.png` })
console.log('shot 67-settings-debug-menu.png')

// Close the debug menu and restore English before the scene checks.
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(400)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(400)

// --- Lion feeding (travel view) ----------------------------------------------
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(2500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForFunction(() => window.__lionHunt, null, { timeout: 20000 })
await page.evaluate(() => {
  const pos = window.__game.getState().pos
  const s = window.__lionHunt.state
  // Force a generic grazer feed: a naturally started calf hunt (victimHunt)
  // would keep the scripted prey/stain meshes hidden (the herds draw a calf
  // victim instead), so clear it before forcing the feed state.
  s.victim = null
  s.victimHunt = false
  s.px = pos.x + 5
  s.pz = pos.z - 3
  s.lx = s.px + 0.7
  s.lz = s.pz + 0.25
  s.mode = 'feed'
  s.timer = 15
})
await page.waitForTimeout(800)
const feedA = await page.evaluate(() => {
  const h = window.__lionHunt
  return {
    lionVisible: h.lion.current?.visible,
    preyVisible: h.prey.current?.visible,
    stainVisible: h.stain.current?.visible,
    headPitch: h.lion.current?.rotation.x,
    preyOnSide: h.prey.current?.rotation.z,
    stainScale: h.stain.current?.scale.x,
  }
})
// The head bobs on a ~2 s sine, so two samples can land symmetric around a
// peak and tie — sample a short series and assert the swing instead.
const pitches = [feedA.headPitch]
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(300)
  pitches.push(await page.evaluate(() => window.__lionHunt.lion.current?.rotation.x))
}
const pitchSwing = Math.max(...pitches) - Math.min(...pitches)
check('feeding: lion and carcass visible', feedA.lionVisible === true && feedA.preyVisible === true, '')
check('feeding: lion head lowered', feedA.headPitch > 0.1, `${feedA.headPitch?.toFixed(3)}`)
check('feeding: tearing movement animates', pitchSwing > 0.005,
  pitches.map((p) => p?.toFixed(3)).join(' -> '))
check('feeding: prey lies on its side', feedA.preyOnSide > 1.0, `${feedA.preyOnSide?.toFixed(2)}`)
check('feeding: stain beneath the carcass', feedA.stainVisible === true && feedA.stainScale > 0.3,
  `scale ${feedA.stainScale?.toFixed(2)}`)
await page.screenshot({ path: `${OUT}68-lion-feeding.png` })
console.log('shot 68-lion-feeding.png')

// --- Tab toggles the journal without focus problems (design.md §17) ----------
// The journalOpen toggle itself is asserted in Vitest (store.debug.test.ts);
// here we only prove the real-browser focus behaviour: Tab must not park focus
// on a control, so the keyboard keeps steering the character.
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
})
await page.waitForTimeout(100)
await page.keyboard.press('Tab')
const tabActive = await page.evaluate(() => document.activeElement?.tagName)
check(
  'Tab does not shift focus onto a control (no focus problem)',
  tabActive === 'BODY' || tabActive === 'CANVAS' || tabActive == null,
  `active ${tabActive}`,
)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// --- Proximity animal calls under the ambience (design.md §19) ---------------
// A nearby animal raises its own call in the soundscape; the call fades once
// the player leaves. Measured via the ambience layer target (audio itself is
// not asserted headless). The engine is started on demand.
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.ambienceVolume = 0.5 // clear signal for the assertion
  window.__game.getState().debugJumpTo(-2.2, 34.8) // open savanna with herds
  window.__ambience.start()
  window.__lionHunt.state.mode = 'idle'
  window.__lionHunt.state.timer = 90
})
await page.waitForTimeout(1800)
const aniSound = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const started = window.__ambience.started()
  const p = window.__game.getState().pos
  // Quiet baseline: no elephants near.
  herds.elephant = herds.elephant.filter(() => false)
  await sleep(1200)
  const baseline = window.__ambience.layerTarget('aniElephant')
  // Inject one right beside the player and let the proximity report settle.
  herds.elephant.push({ x: p.x + 4, z: p.z + 2, y: 0.2, rot: 0, scale: 1, phase: 0, chunk: 'inject', herd: 999 })
  await sleep(1600)
  const near = window.__ambience.layerTarget('aniElephant')
  const prox = window.__ambience.animalProx().elephant
  // Remove it again; the call fades back toward silence.
  herds.elephant = herds.elephant.filter((a) => a.chunk !== 'inject')
  await sleep(1600)
  const gone = window.__ambience.animalProx().elephant
  return { started, baseline, near, prox, gone }
})
check('ambience engine starts on demand', aniSound.started === true, '')
check('a nearby animal raises its proximity call', aniSound.prox > 0.5 && aniSound.near > aniSound.baseline + 0.02, JSON.stringify(aniSound))
check('the animal call fades once the player moves away', aniSound.gone < 0.1, JSON.stringify(aniSound))

// --- TRAA toggle (design.md §2.7; CLAUDE.md §7.1 pt. 32 check loop) ----------
// Enabling the temporal AA rebuilds the post pipeline (velocity MRT, MSAA off).
// Headless this exercises the WebGL 2 fallback only — the WebGPU path stays a
// supervised manual check. Assert the scene keeps rendering a non-black frame
// without new console errors, and that disabling restores the MSAA path.
const meanLuma = async (png) => {
  const stats = await sharp(png).stats()
  return stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3
}
const errsBeforeTraa = errors.length
await page.evaluate(() => window.__ui.getState().setTraaEnabled(true))
await page.waitForTimeout(2500)
const traaShot = await page.screenshot({ path: `${OUT}69-traa-on.png` })
console.log('shot 69-traa-on.png')
const traaMean = await meanLuma(traaShot)
check('TRAA on: scene renders non-black', traaMean > 8, `mean ${traaMean.toFixed(1)}`)
check('TRAA on: no new console errors', errors.length === errsBeforeTraa,
  errors.slice(errsBeforeTraa).join(' | ').slice(0, 300))
await page.evaluate(() => window.__ui.getState().setTraaEnabled(false))
await page.waitForTimeout(1500)
const msaaMean = await meanLuma(await page.screenshot())
check('TRAA off again: MSAA path renders non-black', msaaMean > 8, `mean ${msaaMean.toFixed(1)}`)
check('TRAA off again: no new console errors', errors.length === errsBeforeTraa,
  errors.slice(errsBeforeTraa).join(' | ').slice(0, 300))

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
