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
import { leakVerdict } from './textureLeak.mjs'
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
// ground crop from the start position. Reference points: the flat pre-detail
// ground measured ~0.5; the normal-map surface relief at the SHIPPED DEFAULT
// (medium, SSAO off per point 276) measures ~1.23 — clearly structured, ~2.5x
// the flat floor. (Screen-space AO, high-only now, adds contact-shadow
// contrast that used to push this above 1.5; the bar tracks the default look,
// not the AO bonus.) The threshold guards "structured vs soft wash" at the
// level the player actually ships with.
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
  check('first-person ground shows micro-detail (edge energy)', mean > 1.1, `laplacian mean ${mean.toFixed(2)}`)
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
  // UNTAGGED (`chunk: undefined`) like every other verification-injected animal:
  // a SYNTHETIC chunk tag does not survive a frame — the streaming re-homes an
  // animal whose tag is not a live chunk into the live chunk under its feet
  // (keepStreamedAnimal, point 282), overwriting the tag. An untagged animal is
  // never re-homed and never chunk-culled, so the harness alone owns its life.
  const injected = { x: p.x + 4, z: p.z + 2, y: 0.2, rot: 0, scale: 1, phase: 0, chunk: undefined, herd: 999 }
  herds.elephant.push(injected)
  await sleep(1600)
  const near = window.__ambience.layerTarget('aniElephant')
  const prox = window.__ambience.animalProx().elephant
  // Remove it again BY IDENTITY; the call fades back toward silence. (A
  // `chunk !== 'inject'` filter matched nothing once the re-home landed, so the
  // elephant stayed beside the player and its call — correctly — stayed up: the
  // false red of point 292, where `gone` read exactly `prox`.)
  herds.elephant = herds.elephant.filter((a) => a !== injected)
  const left = herds.elephant.filter((a) => !a.dead).length // reported, not asserted: a fresh herd may stream in
  await sleep(1600)
  const gone = window.__ambience.animalProx().elephant
  const layerGone = window.__ambience.layerTarget('aniElephant')
  return { started, baseline, near, prox, left, gone, layerGone }
})
check('ambience engine starts on demand', aniSound.started === true, '')
check('a nearby animal raises its proximity call', aniSound.prox > 0.5 && aniSound.near > aniSound.baseline + 0.02, JSON.stringify(aniSound))
// Both halves of the fade: the reported proximity falls AND the audible layer
// target follows it down (the ramp reaches silence, not only the report).
check('the animal call fades once the player moves away',
  aniSound.gone < 0.1 && aniSound.layerGone < 0.02, JSON.stringify(aniSound))

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
// switches on real hardware. Gate on the renderer's live texture count — it
// must RETURN to where it started across cycles, not grow per toggle.
//
// MEASURED AT A STEADY STATE (point 334). A rebuild frees the old post chain at
// commit but the new one allocates its render targets only on the next RENDERED
// frame — and a headless page that nothing forces to paint falls to zero rAF
// ticks for seconds (measured: 36 frames per 600 ms while screenshots flow, 0-2
// once they stop, and the WebGPU lane reaches 0 where the WebGL 2 lane never
// quite does — the whole reason this gate failed on one backend only). Read in
// that window the count sits in a DIP with the entire post chain missing (33
// instead of 47 in the bird's-eye view: 12 render targets, 14 textures). Reading
// the DIP as the baseline and the settled value at the end is exactly the "+14
// leaked" the product was accused of. So force a frame and poll until the
// reading stops moving, and keep a live-texture registry so a real leak can
// NAME its survivors instead of being two bare numbers.
const texCount = () => page.evaluate(() => window.__renderer.info.memory.textures)
// A screenshot is the reliable way to make a throttled headless page render;
// an 8x8 clip keeps it cheap. rAF alone cannot be awaited here — it is the very
// thing that stalls.
const forceFrame = () => page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 8 } })
/** Force frames until the texture count repeats, i.e. the rebuilt pipeline has
 *  finished allocating. Reports whether it actually settled. */
const settledReading = async (tries = 12) => {
  let prev = await texCount()
  for (let i = 0; i < tries; i++) {
    await forceFrame()
    await page.waitForTimeout(120)
    const cur = await texCount()
    if (cur === prev) return { count: cur, settled: true, polls: i + 1 }
    prev = cur
  }
  return { count: prev, settled: false, polls: tries }
}
// three's own bookkeeping (Info.createTexture/destroyTexture) carries the
// texture object, so wrapping it yields a live registry — the only way to say
// WHICH resources survived, since the counter alone cannot.
await page.evaluate(() => {
  const info = window.__renderer.info
  const live = new Map()
  const origCreate = info.createTexture.bind(info)
  const origDestroy = info.destroyTexture.bind(info)
  info.createTexture = function (t) {
    const img = t.image ?? {}
    live.set(t, {
      cls: t.constructor?.name ?? 'Texture',
      w: img.width ?? t.width ?? 0,
      h: img.height ?? t.height ?? 0,
      depth: img.depth ?? 1,
      format: t.format,
      type: t.type,
      isRT: t.isRenderTargetTexture === true,
      isDepth: t.isDepthTexture === true,
      name: t.name || '',
    })
    return origCreate(t)
  }
  info.destroyTexture = function (t) {
    live.delete(t)
    return origDestroy(t)
  }
  window.__texRegistry = () => [...live.values()]
})
const liveTextures = () => page.evaluate(() => window.__texRegistry())
const toggleTraa = async (on) => {
  await page.evaluate((v) => window.__ui.getState().setTraaEnabled(v), on)
  await page.waitForTimeout(600)
  await forceFrame() // let the rebuilt pipeline actually build its targets
}
await toggleTraa(true)
await toggleTraa(false)
const firstCycle = await settledReading()
const liveBefore = await liveTextures()
for (let i = 0; i < 5; i++) {
  await toggleTraa(true)
  await toggleTraa(false)
}
const afterStress = await settledReading()
const liveAfter = await liveTextures()
check('TRAA toggle stress: the texture count settles for measurement',
  firstCycle.settled && afterStress.settled,
  `baseline ${firstCycle.count} (reads ${firstCycle.polls}, tracked ${liveBefore.length}), ` +
  `end ${afterStress.count} (reads ${afterStress.polls}, tracked ${liveAfter.length})`)
const leak = leakVerdict({
  before: firstCycle.count, after: afterStress.count, cycles: 5, tolerance: 2, liveBefore, liveAfter,
})
check('TRAA toggle stress: no render-target leak across rebuilds', leak.ok, leak.detail)
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

// --- Graphics quality levels (design.md §21, F9 / point 276 part B) ------------
// F9 cycles the `detailLevel` (medium → low → high → medium); every render lever
// reads DERIVED from that level's QUALITY_PRESET without clobbering the player's
// debug allow-flags. Assert the F9 cycle order and that the EFFECTIVE reads flip
// with the level, computed the same way the ui.ts selectors do (their maths is
// pure-tested in src/state/ui.test.ts). The FPS win is priced live by the main
// session on both backends.
const errsBeforeLow = errors.length
// Start from a known state: the default level, every allow-flag on.
await page.evaluate(() => {
  const u = window.__ui.getState()
  u.setDetailLevel('medium')
  u.setSsaoEnabled(true)
  u.setTraaEnabled(true)
  u.setShadowsEnabled(true)
  u.setFireShadowsEnabled(true)
  u.setShadowMapHalf(false)
})
// Read the effective levers the SAME way ui.ts derives them (level preset AND
// the allow-flag), so the live check matches the pure-tested selectors.
const PRESETS = {
  low: { dpr: 1, ssao: false, traa: false, bloom: false, shadows: true, shadowRes: 1024, fire: false },
  medium: { dpr: null, ssao: false, traa: true, bloom: true, shadows: true, shadowRes: 2048, fire: true },
  high: { dpr: null, ssao: true, traa: true, bloom: true, shadows: true, shadowRes: 4096, fire: true },
}
const effective = () => page.evaluate(() => {
  const s = window.__ui.getState()
  const P = {
    low: { dpr: 1, ssao: false, traa: false, bloom: false, shadows: true, shadowRes: 1024, fire: false },
    medium: { dpr: null, ssao: false, traa: true, bloom: true, shadows: true, shadowRes: 2048, fire: true },
    high: { dpr: null, ssao: true, traa: true, bloom: true, shadows: true, shadowRes: 4096, fire: true },
  }[s.detailLevel]
  return {
    level: s.detailLevel,
    ssao: P.ssao && s.ssaoEnabled,
    traa: P.traa && s.traaEnabled,
    bloom: P.bloom,
    shadows: P.shadows && s.shadowsEnabled,
    shadowRes: Math.max(256, Math.round(P.shadowRes / (s.shadowMapHalf ? 2 : 1))),
    fireShadows: P.fire && s.fireShadowsEnabled,
    // Allow-flags — must be UNTOUCHED by the level cycle.
    baseSsao: s.ssaoEnabled, baseTraa: s.traaEnabled, baseShadows: s.shadowsEnabled,
    baseFire: s.fireShadowsEnabled, baseHalf: s.shadowMapHalf,
  }
})
const cycleF9 = async () => {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9', bubbles: true })))
  await page.waitForTimeout(900)
  return effective()
}
const atMedium = await effective()
check('graphics level defaults to medium: SSAO off, TRAA+Bloom on, 2048 shadows, campfire on',
  atMedium.level === 'medium' && atMedium.ssao === false && atMedium.traa && atMedium.bloom &&
  atMedium.shadows && atMedium.shadowRes === 2048 && atMedium.fireShadows === true,
  JSON.stringify(atMedium))
// F9 #1: medium → low (every fill-rate lever forced DOWN).
const atLow = await cycleF9()
check('F9 → low: post off, shadows low-res, no campfire shadows',
  atLow.level === 'low' && atLow.ssao === false && atLow.traa === false && atLow.bloom === false &&
  atLow.shadowRes === PRESETS.low.shadowRes && atLow.fireShadows === false, JSON.stringify(atLow))
const lowMean = await meanLuma(await page.screenshot())
check('F9 low: scene still renders non-black', lowMean > 8, `mean ${lowMean.toFixed(1)}`)
// F9 #2: low → high (wraps to the top; SSAO on, sharper shadows).
const atHigh = await cycleF9()
check('F9 → high (wraps from the bottom): SSAO on, 4096 shadows, campfire on',
  atHigh.level === 'high' && atHigh.ssao === true && atHigh.shadowRes === 4096 &&
  atHigh.fireShadows === true, JSON.stringify(atHigh))
// F9 #3: high → medium (back to the default).
const atMediumAgain = await cycleF9()
check('F9 → medium: a full cycle returns to the default in three presses',
  atMediumAgain.level === 'medium' && atMediumAgain.shadowRes === 2048, JSON.stringify(atMediumAgain))
check('graphics levels: the debug allow-flags stay untouched across the cycle (read derived)',
  atHigh.baseSsao && atHigh.baseTraa && atHigh.baseShadows && atHigh.baseFire && atHigh.baseHalf === false,
  JSON.stringify(atHigh))
check('Graphics levels: no new console errors across the F9 cycle', errors.length === errsBeforeLow,
  errors.slice(errsBeforeLow).join(' | ').slice(0, 300))

// --- Point 325: a wheel over the debug panel scrolls it, never the zoom -------
// The bird's-eye zoom listens on `window`, so a wheel over the long debug menu
// used to scroll the panel AND zoom the view underneath it. The counter-check
// matters as much: the same wheel over the canvas must still zoom, so the gate
// costs the scene nothing. Deliberately LAST — the check moves the camera and
// briefly opens the debug menu, and no other assertion may inherit that state.
await page.waitForFunction(() => window.__travelWheelReady === true, null, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(300)
const zoomBefore = await page.evaluate(() => window.__ui.getState().travelZoom)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForFunction(() => !!document.querySelector('.debug-menu'), null, { timeout: 10000 }).catch(() => {})
const wheelOverPanel = await page.evaluate(() => {
  const before = window.__ui.getState().travelZoom
  const panel = document.querySelector('.debug-menu')
  // Dispatch on a NESTED child, the realistic case: the pointer sits over a
  // label or a field deep inside the panel, not on its outer box.
  const inner = panel?.querySelector('label span, span, label') ?? panel
  inner?.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true }))
  return { before, after: window.__ui.getState().travelZoom, found: !!panel }
})
check(
  'wheel over the debug panel leaves the bird\'s-eye zoom untouched',
  wheelOverPanel.found && wheelOverPanel.after === wheelOverPanel.before,
  `${wheelOverPanel.before} → ${wheelOverPanel.after}`,
)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(300)
// The control. Retried like the enrichments zoom check: a freshly revealed
// terrain chunk can briefly Suspend the travel subtree, dropping its window
// wheel listener until React remounts it.
let canvasWheel = { before: 0, after: 0 }
for (let i = 0; i < 10; i++) {
  const ready = await page.evaluate(() => window.__travelWheelReady === true && window.__game.getState().mode === 'travel')
  if (ready) {
    canvasWheel = await page.evaluate(() => {
      const before = window.__ui.getState().travelZoom
      document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true }))
      return { before, after: window.__ui.getState().travelZoom }
    })
    if (canvasWheel.after !== canvasWheel.before) break
  }
  await page.waitForTimeout(250)
}
check(
  'the same wheel over the canvas still zooms (the gate costs the scene nothing)',
  canvasWheel.after !== canvasWheel.before,
  `${canvasWheel.before} → ${canvasWheel.after}`,
)
await page.evaluate((z) => window.__ui.getState().setTravelZoom(z), zoomBefore)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
