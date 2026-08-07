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
import { launchVerifyBrowser, assertBackend, waitForSceneBuilt } from './_browser.mjs'
import { frameShutter, capturePixels } from './frameSubject.mjs'
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
const shot = frameShutter(page, OUT)
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
// Wait for the SCENE to finish building, not for the wall clock (point 499). The
// 4 s that stood here was calibrated on a faster host; here the first-person Cairo
// picture is still BLACK at 6 s and only carries its ground micro-structure from
// ~17 s, so the edge-energy check below measured an empty frame and reported the
// feature as gone. `built:false` is surfaced rather than swallowed — a scene that
// never finishes is its own finding, not a silent zero.
const sceneBuilt = await waitForSceneBuilt(page)
check('the first-person scene finishes building before it is measured', sceneBuilt.built, JSON.stringify(sceneBuilt))
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
  const shot = await capturePixels(page, 'ground micro-relief contrast')
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
    frames.push(await capturePixels(page, 'ground shimmer frame diff'))
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

// --- Vertical first-person look (design.md §17.5, point 392) -----------------
// Driven LIVE through the very handler a player's mouse feeds: real mousemove
// events carrying movementY. Headless deliberately skips the pointer lock
// (navigator.webdriver), and the scene applies raw movement in that case, so
// this exercises the production path, not a test-only hook.
const SENS = await page.evaluate(() => window.__balance.mouseSensitivity)
const PITCH_LIMIT = await page.evaluate(() => (window.__balance.lookPitchLimitDeg * Math.PI) / 180)

/** Wait until the scene's own frame loop has carried the look onto the camera —
 *  the application's clock, never the wall clock. */
const lookSettled = () =>
  page.waitForFunction(
    () =>
      window.__placeCamera &&
      window.__placePlayer &&
      Math.abs(window.__placeCamera.rotation.x - window.__placePlayer.pitch) < 1e-9,
    null,
    { timeout: 15000 },
  )

async function resetLook() {
  await page.evaluate(() => {
    window.__ui.getState().setDialog(null)
    window.__ui.getState().setInvertLook(true)
    const p = window.__placePlayer
    p.x = 0
    p.z = 0
    p.yaw = 0
    p.pitch = 0
  })
  await lookSettled()
}

/** Dispatch `times` mouse moves of (dx, dy) px and read the resulting look. The
 *  handler applies them synchronously, so the state is readable at once. */
async function mouseLook(dx, dy, times = 1) {
  return await page.evaluate(
    ({ dx, dy, times }) => {
      for (let i = 0; i < times; i++) {
        window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }))
      }
      return { yaw: window.__placePlayer.yaw, pitch: window.__placePlayer.pitch }
    },
    { dx, dy, times },
  )
}

await resetLook()
// Inverted by default (user 28.07.2026): mouse FORWARD (movementY < 0) = down.
const down1 = await mouseLook(0, -200)
check(
  'pushing the mouse forward looks DOWN (inverted default, point 392)',
  down1.pitch < 0 && Math.abs(down1.pitch + 200 * SENS) < 1e-6,
  `pitch ${down1.pitch.toFixed(4)} rad`,
)
check('the vertical look leaves the yaw alone', Math.abs(down1.yaw) < 1e-9, `yaw ${down1.yaw}`)

await resetLook()
const up1 = await mouseLook(0, 300)
check(
  'pulling the mouse back looks UP at the same sensitivity as the yaw',
  Math.abs(up1.pitch - 300 * SENS) < 1e-6,
  `pitch ${up1.pitch.toFixed(4)} rad, expected ${(300 * SENS).toFixed(4)}`,
)

// The clamp: no sequence of moves passes it, in either direction.
const clampedUp = await mouseLook(0, 5000, 20)
check(
  'the look clamps short of straight up (point 392)',
  Math.abs(clampedUp.pitch - PITCH_LIMIT) < 1e-9 && PITCH_LIMIT < Math.PI / 2,
  `pitch ${clampedUp.pitch.toFixed(4)} rad, clamp ${PITCH_LIMIT.toFixed(4)}`,
)
const clampedDown = await mouseLook(0, -5000, 20)
check(
  'the look clamps short of straight down (point 392)',
  Math.abs(clampedDown.pitch + PITCH_LIMIT) < 1e-9,
  `pitch ${clampedDown.pitch.toFixed(4)} rad`,
)

// The camera itself carries the pitch (YXZ), and the bob stays a position
// offset: the eye height is unchanged by looking around.
await lookSettled()
const camAtClamp = await page.evaluate(() => ({
  x: window.__placeCamera.rotation.x,
  order: window.__placeCamera.rotation.order,
  y: window.__placeCamera.position.y,
}))
check(
  'the pitch reaches the camera as its X rotation, eye height untouched',
  Math.abs(camAtClamp.x + PITCH_LIMIT) < 1e-6 && camAtClamp.order === 'YXZ' && Math.abs(camAtClamp.y - 1.5) < 0.01,
  JSON.stringify(camAtClamp),
)

// The debug checkbox's store field flips the sense — and only the vertical one.
await resetLook()
await page.evaluate(() => window.__ui.getState().setInvertLook(false))
const plain = await mouseLook(-120, -200)
check(
  'switching the inversion off looks UP on a forward push, yaw unchanged in sense',
  plain.pitch > 0 && Math.abs(plain.pitch - 200 * SENS) < 1e-6 && plain.yaw > 0,
  `pitch ${plain.pitch.toFixed(4)}, yaw ${plain.yaw.toFixed(4)}`,
)
await page.evaluate(() => window.__ui.getState().setInvertLook(true))

// --- The pitched frames a human judges (CLAUDE.md §7.2) ----------------------
// Each declares what it must SHOW: the roof of a building overhead, the ground
// at the traveller's own feet, and the ground beyond the walkable disc edge.
const tallest = await page.evaluate(() => {
  const ds = window.__placeLayout?.dwellings ?? []
  let best = null
  for (const d of ds) {
    const top = d.h * (d.floors || 1)
    if (!best || top > best.top) best = { x: d.x, z: d.z, r: d.r, top }
  }
  return best
})
if (tallest) {
  // Stand just clear of the building, on its INWARD side: the layout is seeded
  // per run, so a tall house near the rim would otherwise put the standpoint
  // outside the walkable radius — which leaves the settlement (design.md §2.3)
  // and photographs the travel scene instead.
  const stand = await page.evaluate(
    ({ b }) => {
      const len = Math.hypot(b.x, b.z) || 1
      const gap = b.r + 4
      const p = window.__placePlayer
      p.x = b.x - (b.x / len) * gap
      p.z = b.z - (b.z / len) * gap
      p.yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z))
      p.pitch = 0
      return { x: p.x, z: p.z, radius: window.__placeLayout.radius }
    },
    { b: tallest },
  )
  // Drive the pitch live rather than assigning it: same path as the player's.
  await mouseLook(0, Math.round(0.75 / SENS))
  await shot('143-look-up-rooftop', {
    local: { x: tallest.x, y: tallest.top, z: tallest.z },
    label: 'the roof line overhead with the view pitched up',
  })
  check(
    'the up-pitched frame stands inside the settlement',
    Math.hypot(stand.x, stand.z) < stand.radius,
    `at ${stand.x.toFixed(1)}/${stand.z.toFixed(1)} of radius ${stand.radius}`,
  )
}

// Looking down at one's own feet: the ground the player stands on.
await resetLook()
await page.evaluate(() => {
  const p = window.__placePlayer
  p.x = 0
  p.z = 6
})
await mouseLook(0, -Math.round(1.1 / SENS))
// The subject is the ground a stride in FRONT of the boots (yaw 0 faces -Z):
// the point directly under the camera sits below even a 63° downward look,
// since the frame's own half-FOV is 25°.
await shot('144-look-down-feet', {
  local: { x: 0, y: 0, z: 4.8 },
  label: 'the ground at the traveller’s feet with the view pitched down',
})

// Looking down over the walkable disc edge: the §2.5 seam from above.
const edge = await page.evaluate(() => {
  const r = window.__placeLayout.radius
  const p = window.__placePlayer
  p.x = 0
  p.z = r - 6
  p.yaw = Math.PI // face +Z, outward over the edge
  p.pitch = 0
  return r
})
// A 20° downward look holds BOTH the disc edge a few metres ahead and the
// ground beyond it inside the frame's 25° half-FOV.
await mouseLook(0, -Math.round(0.35 / SENS))
await shot('145-look-down-disc-edge', {
  local: { x: 0, y: 0, z: edge + 8 },
  label: 'the ground past the walkable disc edge, seen over it',
})

await resetLook()

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
// Point 375: the frames prove the thing they are named after is on screen —
// the open debug menu, the feeding lion, the rendered TRAA frame.
await shot('67-settings-debug-menu', { element: '.debug-menu', label: 'the German debug menu' })

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
const lionAt = await page.evaluate(() => {
  const l = window.__lionHunt?.lion.current
  return l ? { x: l.position.x, z: l.position.z } : null
})
await shot('68-lion-feeding', { world: lionAt ?? { x: 0, z: 0 }, label: 'the feeding lion', settle: false })

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
// --- Village speech really plays (design.md §13.4) ---------------------------
// The plan (pace, pause, attenuation) is pinned in the Vitest layer; the browser
// owes only the fact that a spoken utterance SCHEDULES audio — and that one
// spoken from beyond the hearing radius schedules nothing at all.
const speech = await page.evaluate(() => {
  window.__balance.ambienceVolume = 0.5
  const a = window.__ambience
  a.start()
  const near = { ...a.speechProbe() }
  a.speak('BA-BA-ba-ba-ba', 0) // right beside the speaker
  const spokenNear = { ...a.speechProbe() }
  a.speak('BA-BA-ba-ba-ba', window.__balance.communication.hearingRadius * 3) // out of earshot
  const spokenFar = { ...a.speechProbe() }
  a.speakPhrase(['BA-ba-ba-BA-ba', 'BA-ba-BA-ba-ba'], 0) // dig + here
  const phrase = { ...a.speechProbe() }
  return { near, spokenNear, spokenFar, phrase }
})
check('a nearby utterance schedules its syllables with a positive level (design.md §13.4)',
  speech.spokenNear.spoken === speech.near.spoken + 1 &&
    speech.spokenNear.syllables === speech.near.syllables + 5 &&
    speech.spokenNear.lastPeak > 0,
  JSON.stringify(speech))
check('an utterance from beyond the hearing radius schedules nothing',
  speech.spokenFar.spoken === speech.spokenNear.spoken &&
    speech.spokenFar.syllables === speech.spokenNear.syllables,
  JSON.stringify(speech))
check('a phrase plays every atom (two five-syllable atoms)',
  speech.phrase.syllables === speech.spokenFar.syllables + 10, JSON.stringify(speech))

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
const traaShot = await shot('69-traa-on', {
  general: 'the TRAA pipeline rebuild is judged by the mean luma of this whole frame, which is therefore the subject',
  scene: 'travel',
})
const traaMean = await meanLuma(traaShot)
check('TRAA on: scene renders non-black', traaMean > 8, `mean ${traaMean.toFixed(1)}`)
check('TRAA on: no new console errors', errors.length === errsBeforeTraa,
  errors.slice(errsBeforeTraa).join(' | ').slice(0, 300))
await page.evaluate(() => window.__ui.getState().setTraaEnabled(false))
await page.waitForTimeout(1500)
const msaaMean = await meanLuma(await capturePixels(page, 'MSAA path mean luma'))
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
const forceFrame = () => capturePixels(page, 'forced frame for the texture count', { clip: { x: 0, y: 0, width: 8, height: 8 } })
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
const stressMean = await meanLuma(await capturePixels(page, 'TRAA toggle stress mean luma'))
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
const lowMean = await meanLuma(await capturePixels(page, 'F9 low detail mean luma'))
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

// --- DEV render-resource leak invariant (point 295) --------------------------
// The TRAA block above gates ONE transition kind at ONE moment. The invariant
// (src/render/renderLeak.ts) watches every transition of every session, so what
// is checked here is the invariant itself: that a normal run of scene switches,
// detail-level changes and effect toggles leaves it silent, and that a REAL
// leak — render targets allocated and never disposed — makes it scream.
{
  const errsBeforeLeak = errors.length
  const leakState = () => page.evaluate(() => window.__renderLeak?.state() ?? null)
  check('the render-resource leak watch is armed', (await leakState()) !== null)
  // The watch samples on rendered frames; a headless page renders only when
  // something forces it to, so drive frames until it has judged its reading
  // (see settledReading above for the same reason).
  const settleWatch = async (tries = 60) => {
    for (let i = 0; i < tries; i++) {
      await forceFrame()
      await page.waitForTimeout(50)
      const s = await leakState()
      if (s && !s.watching) return s
    }
    return leakState()
  }
  const transition = async (fn, arg) => {
    await page.evaluate(fn, arg)
    await page.waitForTimeout(250)
    return settleWatch()
  }
  // Every transition kind the point names, walked THREE times: the first two
  // settled readings of a signature form its baseline (a settlement is still
  // building when the first one lands), so only a third pass is JUDGED.
  for (let round = 0; round < 3; round++) {
    await transition(() => window.__game.getState().enterPlace('cairo'))
    await transition(() => window.__game.getState().leavePlace())
    await transition((l) => window.__ui.getState().setDetailLevel(l), 'low')
    await transition((l) => window.__ui.getState().setDetailLevel(l), 'medium')
    await transition((v) => window.__ui.getState().setTraaEnabled(v), false)
    await transition((v) => window.__ui.getState().setTraaEnabled(v), true)
  }
  const walked = await leakState()
  const judged = walked.history.filter((h) => h.outcome === 'ok' || h.outcome === 'leak')
  const kinds = new Set(walked.history.map((h) => h.signature.split('|')[0]))
  check('the leak watch judged repeat visits to travel AND to the settlement',
    judged.length >= 4 && kinds.has('travel') && kinds.has('place:cairo'),
    `${judged.length} judged readings over ${walked.history.length} transitions, states: ${[...kinds].join(', ')}`)
  check('a normal session of switches, detail levels and toggles trips nothing',
    walked.violations.length === 0,
    walked.violations.map((v) => v.detail).join(' | ').slice(0, 300) || 'no violations')

  // The other half: a REAL leak must be caught. forceLeak() allocates render
  // targets and initialises them (which is what three counts) without ever
  // disposing them — exactly the shape of the point-276 pipeline-rebuild leak.
  const rtBefore = await page.evaluate(() => window.__renderer.info.memory.renderTargets)
  const rtAfter = await page.evaluate(() => window.__renderLeak.forceLeak(6))
  check('the forced leak really raises the render-target count', rtAfter >= rtBefore + 6,
    `${rtBefore} -> ${rtAfter}`)
  await transition((v) => window.__ui.getState().setTraaEnabled(v), false)
  const leaked = await transition((v) => window.__ui.getState().setTraaEnabled(v), true)
  const asserted = await page.evaluate(() =>
    (window.__assertLog ?? []).filter((a) => a.code === 'render-resource-leak').length)
  check('a forced render-target leak trips the invariant', leaked.violations.length > 0,
    leaked.violations.map((v) => v.detail).join(' | ').slice(0, 300) || 'NOT DETECTED')
  check('the leak reports through the dev-assert channel (console.error + probe log)',
    asserted > 0 && errors.slice(errsBeforeLeak).some((e) => e.includes('[ASSERT] render-resource-leak')),
    `${asserted} assert-log entries`)

  // Give the renderer back what the probe took, and re-baseline, so nothing
  // downstream measures a deliberately poisoned state.
  const released = await page.evaluate(() => window.__renderLeak.releaseForced())
  const cleaned = await settleWatch()
  check('releasing the forced leak restores a clean watch', released === 6 && cleaned.violations.length === 0,
    `${released} targets freed, ${cleaned.violations.length} violations left`)
  // The deliberate assert above is the PASS condition of this block, so it must
  // not fail the suite's console-error gate. Only the render-leak asserts are
  // dropped — every other console error still counts, here and everywhere else.
  for (let i = errors.length - 1; i >= errsBeforeLeak; i--) {
    if (errors[i].includes('[ASSERT] render-resource-leak')) errors.splice(i, 1)
  }
  check('the leak block produced no OTHER console errors', errors.length === errsBeforeLeak,
    errors.slice(errsBeforeLeak).join(' | ').slice(0, 300))
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
