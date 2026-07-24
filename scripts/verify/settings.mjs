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
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
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
// Point 184 (Pillar 3): confirm the renderer initialised on the REQUESTED backend —
// throws on a silent WebGL2 fallback under VERIFY_GL=webgpu (the lane's guardrail).
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
await page.waitForTimeout(4000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)

// --- First-person eye height -------------------------------------------------
const eyeY = await page.evaluate(() => window.__placeCamera?.position.y)
check('first-person eye height lowered to 1.5', Math.abs(eyeY - 1.5) < 1e-6, `${eyeY}`)

// --- First-person surface detail (§7.1 pt. 11/15, design.md §2.6) -------------
// The ground at eye height must carry visible micro-structure (grain, pebble
// relief), not a soft wash: measure the mean edge energy (Laplacian) of a
// ground crop from the start position. The flat pre-detail ground measured
// ~0.5 here; the structured ground clears 1.5 with headroom.
{
  const shot = await page.screenshot()
  const crop = await sharp(shot).extract({ left: 500, top: 700, width: 600, height: 170 }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = crop
  let energy = 0
  let n = 0
  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < info.width - 1; x++) {
      const i = y * info.width + x
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - info.width] - data[i + info.width]
      energy += Math.abs(lap)
      n++
    }
  }
  const mean = energy / n
  check('first-person ground shows micro-detail (edge energy)', mean > 1.5, `laplacian mean ${mean.toFixed(2)}`)
}

// --- Temporal stability of the distant ground (§7.1 pt. 15) -------------------
// With a STATIC camera and TRAA on, the mid-distance ground must not tremble:
// unfaded sub-pixel procedural noise resampled under the TRAA jitter shimmered
// across the WHOLE band below the horizon (mean |frame diff| ~1.9), while the
// distance-faded detail leaves the ground still. Gated on the FRACTION of
// changed pixels, minimum across pairs: legitimate movers (a villager, a
// drifting panorama silhouette) touch only a small local patch even under
// full-regression load, whereas the trembling moved most of the crop.
{
  const frames = []
  for (let i = 0; i < 4; i++) {
    frames.push(await page.screenshot())
    await page.waitForTimeout(250)
  }
  let minFrac = Infinity
  let prev = null
  for (const f of frames) {
    const raw = await sharp(f).extract({ left: 100, top: 470, width: 800, height: 120 }).greyscale().raw().toBuffer()
    if (prev) {
      let changed = 0
      for (let i = 0; i < raw.length; i++) if (Math.abs(raw[i] - prev[i]) > 4) changed++
      minFrac = Math.min(minFrac, changed / raw.length)
    }
    prev = raw
  }
  check(
    'distant ground is temporally stable under TRAA (no trembling)',
    minFrac < 0.08,
    `min changed-pixel fraction ${(minFrac * 100).toFixed(2)} %`,
  )
}

// --- Strafe/backward move in the scene (design.md §2) ------------------------
// The exact 80 % ratio is proven by the pure velocity helper in Vitest
// (src/systems/movement.test.ts); here we only confirm both directions move a
// real character in the live scene (frame-count-dependent distance, so the two
// are not directly comparable).
async function measureWalk(code) {
  await page.evaluate(() => {
    // Defensive: a modal dialog blocks movement, so close any before measuring.
    // (Buildings now open only on a Space press at the door, design.md §2.3, so a
    // stray walk no longer opens one — this stays as belt-and-braces.)
    window.__ui.getState().setDialog(null)
    const p = window.__placePlayer
    p.x = 0
    p.z = 16
    p.yaw = 0
  })
  await page.waitForTimeout(80)
  const p0 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })), code)
  // Hold the key until the character has clearly moved (or 15s): headless RAF
  // can stall to fractions of a frame per second under full-regression load,
  // so the window is generous and the poll runs on an interval — the default
  // raf polling would itself starve with the frame loop.
  await page
    .waitForFunction(
      (start) => Math.hypot(window.__placePlayer.x - start.x, window.__placePlayer.z - start.z) > 0.6,
      p0,
      { timeout: 15000, polling: 100 },
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

// --- Walk feel: head bob oscillates while walking, settles at rest (point 97) --
// Bob/footsteps follow the eased VELOCITY and step phase (held-input driven),
// not the distance travelled, so the position is pinned to the centre each
// sample to keep the traveller from walking out of the settlement.
await page.evaluate(() => {
  window.__ui.getState().setDialog(null)
  const p = window.__placePlayer
  p.x = 0; p.z = 0; p.yaw = 0
  delete window.__walkFeel
})
await page.waitForTimeout(120)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
const bobSamples = []
let footSurface = null
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(100)
  const s = await page.evaluate(() => {
    const p = window.__placePlayer; p.x = 0; p.z = 0 // pin to centre
    return { y: window.__walkFeel?.cameraY ?? null, foot: window.__walkFeel?.lastFootstepSurface ?? null }
  })
  if (s.y !== null) bobSamples.push(s.y)
  if (s.foot) footSurface = s.foot
  if (footSurface && bobSamples.length >= 8) break
}
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
const bobDev = bobSamples.length ? Math.max(...bobSamples.map((y) => Math.abs(y - 1.5))) : 0
check(
  'the head bobs off the eye height while walking (point 97)',
  bobSamples.length >= 5 && bobDev > 0.008,
  `max |y-1.5| ${bobDev.toFixed(3)} over ${bobSamples.length} samples`,
)
check(
  'a footstep fires with a surface class while walking (point 97)',
  footSurface === 'ground' || footSurface === 'stone',
  `surface ${footSurface}`,
)
// After stopping, the camera settles back to the eye height — poll the settle
// condition (point 200) rather than a fixed wall wait; a genuine non-settle
// still reaches the assert below (which then fails with the real rest y).
await page
  .waitForFunction(() => window.__walkFeel && Math.abs(window.__walkFeel.cameraY - 1.5) < 0.006, null, { timeout: 5000 })
  .catch(() => {})
const restY = await page.evaluate(() => window.__walkFeel?.cameraY ?? null)
check(
  'the head bob settles back to eye height at rest (point 97)',
  restY !== null && Math.abs(restY - 1.5) < 0.006,
  `rest y ${restY}`,
)

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
// Wait for the render loop to ACTUALLY apply the forced feed — the meshes turn
// visible and take their pose. A fixed wall wait was too short under the WebGPU
// backend's cold shader compile: the point-184 lane surfaced the feed reading
// all-zero because the loop had not yet drawn a feed frame. Poll for the depiction
// (a real failure to depict exhausts the window), then sample a series — WebGPU
// frames are sparser headless, and the head bobs on a ~2 s sine, so keep the
// most-lowered sample and assert the swing across the series.
await page
  .waitForFunction(
    () => {
      const h = window.__lionHunt
      return h?.lion.current?.visible === true && h?.prey.current?.visible === true
    },
    null,
    { timeout: 20000 },
  )
  .catch(() => {})
const pitches = []
let feedA = null
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => {
    const h = window.__lionHunt
    return {
      lionVisible: h.lion.current?.visible,
      preyVisible: h.prey.current?.visible,
      // The stain soaks the GROUND (point 267): a tint patch, not a mesh.
      stainActive: h.stain.active,
      headPitch: h.lion.current?.rotation.x,
      preyOnSide: h.prey.current?.rotation.z,
      stainRadius: h.stain.r,
    }
  })
  pitches.push(s.headPitch ?? 0)
  // Keep the frame with the head most clearly lowered (the sine peak).
  if (!feedA || (s.headPitch ?? 0) > (feedA.headPitch ?? 0)) feedA = s
  await page.waitForTimeout(300)
}
const pitchSwing = Math.max(...pitches) - Math.min(...pitches)
check('feeding: lion and carcass visible', feedA.lionVisible === true && feedA.preyVisible === true, '')
check('feeding: lion head lowered', feedA.headPitch > 0.1, `${feedA.headPitch?.toFixed(3)}`)
check('feeding: tearing movement animates', pitchSwing > 0.005,
  pitches.map((p) => p?.toFixed(3)).join(' -> '))
check('feeding: prey lies on its side', feedA.preyOnSide > 1.0, `${feedA.preyOnSide?.toFixed(2)}`)
check('feeding: stain beneath the carcass', feedA.stainActive === true && feedA.stainRadius > 0.3,
  `radius ${feedA.stainRadius?.toFixed(2)}`)
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

// --- Point 153: coastal surf fade + per-source birdsong slider ---------------
// Read the layer TARGETS synchronously (no await) so the 700 ms ambience
// controller cannot overwrite the forced coast/scene mid-check. Surf follows
// the coast proximity; birdsong scales with its own volume slider.
const surf153 = await page.evaluate(() => {
  window.__balance.ambienceVolume = 0.5
  const a = window.__ambience
  a.setCoast(1) // at the shore
  const atCoast = a.layerTarget('surf')
  const wobbleCoast = a.surfWobble()
  a.setCoast(0) // far inland (coastSurfGain(15°) === 0)
  const inland = a.layerTarget('surf')
  const wobbleInland = a.surfWobble()
  // Birdsong: force a central-region travel scene so the birds are audible,
  // then scale the per-source volume and re-apply.
  a.setScene({ region: 'central', mode: 'travel', placeKind: null, nearVillage: false })
  const birdsFull = a.layerTarget('birds')
  window.__balance.birdsongVolume = 0.5
  a.refresh()
  const birdsHalf = a.layerTarget('birds')
  window.__balance.birdsongVolume = 0
  a.refresh()
  const birdsOff = a.layerTarget('birds')
  window.__balance.birdsongVolume = 1
  a.refresh()
  return { atCoast, inland, birdsFull, birdsHalf, birdsOff, wobbleCoast, wobbleInland }
})
check('surf plays at the coast and is exactly 0 far inland (point 153)',
  surf153.atCoast > 0 && surf153.inland === 0, JSON.stringify(surf153))
check('the surf gust also fades to silence inland (no leak past the target)',
  surf153.wobbleCoast > 0 && surf153.wobbleInland === 0, JSON.stringify(surf153))
check('the birdsong slider scales that source gain (point 153)',
  surf153.birdsFull > 0 && surf153.birdsHalf > 0 && surf153.birdsHalf < surf153.birdsFull && surf153.birdsOff === 0,
  JSON.stringify(surf153))

// --- TRAA toggle (design.md §2.7; CLAUDE.md §7.1 pt. 32) ----------------------
// TRAA is the default; toggling rebuilds the post pipeline (velocity MRT,
// MSAA off ↔ MSAA on). Headless this exercises the WebGL 2 fallback only —
// the WebGPU path passed its supervised manual check. Assert the scene keeps
// rendering a non-black frame without new console errors on both paths.
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

// Repeated toggling must not leak the pipeline: every rebuild disposes the
// full node chain (scene MRT, GTAO, bloom, TRAA history/RTT). The regression
// was a GPU-memory leak per toggle that blacked out the device after a few
// switches on real hardware. Gate on the renderer's live texture count —
// it must stay flat across cycles, not grow per toggle.
const texCount = () => page.evaluate(() => window.__renderer.info.memory.textures)
const toggleTraa = async (on) => {
  await page.evaluate((v) => window.__ui.getState().setTraaEnabled(v), on)
  await page.waitForTimeout(600)
}
await toggleTraa(true)
await toggleTraa(false)
const texAfterFirstCycle = await texCount()
for (let i = 0; i < 5; i++) {
  await toggleTraa(true)
  await toggleTraa(false)
}
const texAfterStress = await texCount()
check('TRAA toggle stress: no render-target leak across rebuilds',
  texAfterStress <= texAfterFirstCycle + 2, `${texAfterFirstCycle} -> ${texAfterStress}`)
const stressMean = await meanLuma(await page.screenshot())
check('TRAA toggle stress: scene still renders non-black', stressMean > 8, `mean ${stressMean.toFixed(1)}`)
check('TRAA toggle stress: no new console errors', errors.length === errsBeforeTraa,
  errors.slice(errsBeforeTraa).join(' | ').slice(0, 300))

// The TRAA scene pass must be single-sampled: an omitted samples option
// inherits the renderer's MSAA (4, antialias: true), whose multisampled
// depth breaks TRAA's history copy with per-frame WebGPU validation errors
// (invisible on the WebGL 2 fallback, so asserted structurally here).
await page.evaluate(() => window.__ui.getState().setTraaEnabled(true))
await page.waitForTimeout(800)
const traaSamples = await page.evaluate(() => window.__scenePass.renderTarget.samples)
await page.evaluate(() => window.__ui.getState().setTraaEnabled(false))
await page.waitForTimeout(800)
const msaaSamples = await page.evaluate(() => window.__scenePass.renderTarget.samples)
check('TRAA scene pass renders single-sampled (MSAA pass keeps 4)',
  traaSamples === 0 && msaaSamples === 4, `traa ${traaSamples}, msaa ${msaaSamples}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
