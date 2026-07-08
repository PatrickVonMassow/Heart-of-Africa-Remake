// Headless verification for the world/settlement/water enrichments
// (CLAUDE.md §7.1 pts. 3/4/12/15/20/21): region-border name labels,
// swimmable enclosed sea vs. blocked open ocean, river cascades/springs/
// lake surfaces, lion leave phase with consumed carcass, elephant
// trampling, debug dropdowns + renderer row + wheel-zoom gate, settlement
// size tiers, village-life walkers and the landscape backdrop.
// Dev server only (dev hooks).
import { chromium } from 'playwright'
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
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(300)

// === Settlement sizes + village life + backdrop (§7.1.15) ====================
const cairo = await page.evaluate(() => ({
  radius: window.__placeLayout.radius,
  dwellings: window.__placeLayout.dwellings.length,
  backdrop: window.__placeBackdrop ?? 0,
}))
check('Cairo (size 3): walkable radius 36', cairo.radius === 36, `${cairo.radius}`)
check('Cairo: landscape backdrop mesh present', cairo.backdrop > 1000, `${cairo.backdrop} vertices`)

await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
await page.evaluate(() => window.__game.getState().enterPlace('boma'))
await page.waitForTimeout(2200)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
const boma = await page.evaluate(() => ({
  radius: window.__placeLayout.radius,
  dwellings: window.__placeLayout.dwellings.length,
}))
check('Boma (size 1): walkable radius 28', boma.radius === 28, `${boma.radius}`)
check(
  'Major city clearly bigger than small station',
  cairo.dwellings > boma.dwellings * 1.4,
  `Cairo ${cairo.dwellings} vs Boma ${boma.dwellings} dwellings`,
)

await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(800)
await page.evaluate(() => window.__game.getState().enterPlace('masai-village'))
await page.waitForTimeout(2200)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
const village = await page.evaluate(() => ({
  walkers: window.__placeWalkers ? window.__placeWalkers.states.length : 0,
  backdrop: window.__placeBackdrop ?? 0,
}))
check('Village: inhabitants with daily routines present', village.walkers >= 3, `${village.walkers} walkers`)
check('Village: landscape backdrop mesh present', village.backdrop > 1000, `${village.backdrop} vertices`)
await page.screenshot({ path: `${OUT}77-enrich-village-life.png` })
console.log('shot 77-enrich-village-life.png')

// === Travel view =============================================================
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// --- Rivers: cascades, springs, lake surfaces (§7.1.21) ----------------------
const rivers = await page.evaluate(() => window.__rivers)
check('Rivers: 5 waterfall cascades', rivers?.falls === 5, `${rivers?.falls}`)
check('Rivers: at least one spring', (rivers?.springs ?? 0) >= 1, `${rivers?.springs}`)
check('Rivers: 8 lake surfaces', rivers?.lakes === 8, `${rivers?.lakes}`)

// --- Region border labels (§7.1.3) -------------------------------------------
await page.evaluate(() => window.__game.getState().debugJumpTo(17.2, -2))
await page.waitForTimeout(2500)
const labels = await page.evaluate(() => [...document.querySelectorAll('.region-label')].map((e) => e.textContent))
check(
  'Border labels: both regions named on their sides',
  labels.includes('North') && labels.includes('West'),
  JSON.stringify([...new Set(labels)]),
)

// --- Enclosed sea swimmable, open ocean blocked (§7.1.4) ---------------------
// Gulf of Sidra: sea inside the continent outline.
const swim = await page.evaluate(async () => {
  const g = window.__game.getState()
  g.debugJumpTo(31.8, 18.5)
  window.__game.getState().setToast(null)
  const before = { ...window.__game.getState().pos }
  for (let i = 0; i < 20; i++) window.__game.getState().moveTravel(0, -1, 0.05)
  const after = window.__game.getState().pos
  return {
    moved: Math.hypot(after.x - before.x, after.z - before.z),
    toast: window.__game.getState().toast,
  }
})
check('Enclosed sea (Gulf of Sidra) is swimmable', swim.moved > 0.5 && !swim.toast, `moved ${swim.moved.toFixed(2)}`)

// Open Atlantic far west of the Sahara coast: outside the outline.
const blocked = await page.evaluate(async () => {
  const g = window.__game.getState()
  g.debugJumpTo(25.0, -19.5)
  window.__game.getState().setToast(null)
  const before = { ...window.__game.getState().pos }
  for (let i = 0; i < 10; i++) window.__game.getState().moveTravel(-1, 0, 0.05)
  const after = window.__game.getState().pos
  return {
    moved: Math.hypot(after.x - before.x, after.z - before.z),
    toast: window.__game.getState().toast,
  }
})
check(
  'Open ocean blocks with the notice',
  blocked.moved < 0.01 && typeof blocked.toast === 'string' && blocked.toast.length > 0,
  `moved ${blocked.moved.toFixed(3)}, toast: ${blocked.toast ? 'yes' : 'no'}`,
)

// --- Mountains are climbable without a rope, slower and dangerous
//     (§7.1.4, design.md §7/§11) -------------------------------------------------
// March east into the Emi Koussi massif: now passable hands-free (with a
// warning), and faster with the rope in hand. Random hazards are switched off
// so the passability comparison is deterministic. A canteen prevents desert
// dehydration drift.
const climb = await page.evaluate(async () => {
  const g = window.__game.getState()
  window.__balance.randomEventsEnabled = false
  g.debugAddEquipment('canteen')
  g.debugSet({ foodDays: 300 })
  g.takeInHand(null)
  g.debugJumpTo(19.87, 17.4)
  g.setToast(null)
  for (let i = 0; i < 120; i++) window.__game.getState().moveTravel(1, 0, 0.05)
  const noRope = { lon: window.__game.getState().pos.x / 10, toast: window.__game.getState().toast }
  window.__game.getState().debugAddEquipment('rope')
  // Single-step speed on the Emi Koussi summit (guaranteed mountain terrain):
  // the rope lowers the time cost, so one step covers more ground.
  const stepAt = (withRope) => {
    const st = window.__game.getState()
    st.takeInHand(withRope ? 'rope' : null)
    st.debugJumpTo(19.87, 18.55)
    const p0 = { ...window.__game.getState().pos }
    window.__game.getState().moveTravel(1, 0, 0.05)
    const p1 = { ...window.__game.getState().pos }
    return Math.hypot(p1.x - p0.x, p1.z - p0.z)
  }
  const noRopeStep = stepAt(false)
  const ropeStep = stepAt(true)
  return { noRope, noRopeStep, ropeStep }
})
check(
  'Mountain is climbable without a rope (with a warning)',
  climb.noRope.lon > 18.6 && typeof climb.noRope.toast === 'string' && climb.noRope.toast.length > 0,
  `reached lon ${climb.noRope.lon.toFixed(2)}, warned: ${climb.noRope.toast ? 'yes' : 'no'}`,
)
check(
  'With the rope in hand the climb is faster (more ground per step)',
  climb.ropeStep > climb.noRopeStep * 1.3,
  `step without ${climb.noRopeStep.toFixed(3)} vs with rope ${climb.ropeStep.toFixed(3)}`,
)

// A fall wounds the traveller and can cost a carried item (design.md §11).
const fall = await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSetAffliction('wounds', 0)
  g.takeInHand(null)
  for (let i = 0; i < 8; i++) {
    window.__game.getState().debugAddEquipment('machete')
    window.__game.getState().debugAddEquipment('canteen')
  }
  const inv = () => (window.__game.getState().equipment.machete ?? 0) + (window.__game.getState().equipment.canteen ?? 0)
  const before = inv()
  let woundedSeen = false
  for (let i = 0; i < 30; i++) {
    window.__game.getState().debugTriggerMountainFall()
    if (window.__game.getState().afflictions.wounds > 0) woundedSeen = true
  }
  return { woundedSeen, before, after: inv() }
})
check('A fall while climbing wounds the traveller', fall.woundedSeen, '')
check('Repeated falls can cost carried items', fall.after < fall.before, `items ${fall.before} → ${fall.after}`)

// --- Movement-penalty reason is visible (§7.1.4 / design.md §11) --------------
// Pure mapping: each slowing terrain names its relieving item.
const penalties = await page.evaluate(() => {
  const mp = window.__movement.movementPenalty
  return {
    jungleNone: mp('jungle', null),
    jungleMachete: mp('jungle', 'machete'),
    waterNone: mp('water', null),
    waterCanoe: mp('water', 'canoe'),
    mountainNone: mp('mountain', null),
    mountainRope: mp('mountain', 'rope'),
    savanna: mp('savanna', null),
  }
})
check('Movement penalty: jungle needs a machete', penalties.jungleNone === 'jungle' && penalties.jungleMachete === null)
check('Movement penalty: water needs a canoe', penalties.waterNone === 'water' && penalties.waterCanoe === null)
check('Movement penalty: mountain needs a rope', penalties.mountainNone === 'mountain' && penalties.mountainRope === null)
check('Movement penalty: open savanna has none', penalties.savanna === null)

// HUD hint: in jungle without a machete the reason is shown, and it clears once
// the machete is in hand.
const jungleSpot = await page.evaluate(() => {
  const seed = window.__game.getState().seed
  for (let lat = 3; lat >= -6; lat -= 0.5) {
    for (let lon = 14; lon <= 28; lon += 0.5) {
      if (window.__terrainType(lat, lon, seed) === 'jungle') return { lat, lon }
    }
  }
  return null
})
if (jungleSpot) {
  await page.evaluate((s) => {
    const g = window.__game.getState()
    g.takeInHand(null)
    g.debugJumpTo(s.lat, s.lon)
  }, jungleSpot)
  await page.waitForTimeout(250)
  const hintNoMachete = await page.evaluate(() => document.querySelector('.movement-penalty')?.textContent ?? '')
  await page.screenshot({ path: `${OUT}84-movement-penalty.png` })
  console.log('shot 84-movement-penalty.png')
  await page.evaluate(() => window.__game.getState().takeInHand('machete'))
  await page.waitForTimeout(250)
  const hintMachete = await page.evaluate(() => document.querySelector('.movement-penalty')?.textContent ?? '')
  check('Movement penalty hint shows in jungle without a machete', hintNoMachete.toLowerCase().includes('machete'), `"${hintNoMachete}"`)
  check('Movement penalty hint clears with a machete in hand', hintMachete === '', `"${hintMachete}"`)
} else {
  check('Movement penalty hint: a jungle tile was found', false, 'no jungle tile located')
}

// --- Lion: carcass consumed, lion moves on (§7.1.12) -------------------------
await page.evaluate(() => {
  const pos = window.__game.getState().pos
  const s = window.__lionHunt.state
  s.px = pos.x + 5
  s.pz = pos.z - 3
  s.lx = s.px + 0.7
  s.lz = s.pz + 0.25
  s.mode = 'feed'
  s.timer = 0.4
})
await page.waitForTimeout(1200)
const leave = await page.evaluate(() => {
  const h = window.__lionHunt
  return {
    mode: h.state.mode,
    preyVisible: h.prey.current?.visible,
    stainVisible: h.stain.current?.visible,
    lionVisible: h.lion.current?.visible,
  }
})
check(
  'Lion moves on once the carcass is consumed (stain remains)',
  leave.mode === 'leave' && leave.preyVisible === false && leave.stainVisible === true && leave.lionVisible === true,
  `mode ${leave.mode}, prey ${leave.preyVisible}, stain ${leave.stainVisible}`,
)
await page.evaluate(() => {
  window.__lionHunt.state.mode = 'idle'
  window.__lionHunt.state.timer = 60
})

// --- Elephant trampling (§7.1.12) --------------------------------------------
// Jump to open savanna so herds exist, then ring a victim with elephants.
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page.waitForTimeout(2500)
const trample = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w?.herdsRef?.current
  if (!herds) return { ok: false, why: 'no herds built' }
  const victimSpecies = ['zebra', 'antelope', 'giraffe'].find((sp) => herds[sp].length > 0)
  if (!victimSpecies) return { ok: false, why: 'no prey herd nearby' }
  const victim = herds[victimSpecies][0]
  // Ring of elephants around the victim: the wander offsets (±4.5) keep at
  // least one of them within trampling range at any time.
  for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [4.5, 4.5], [-4.5, -4.5]]) {
    herds.elephant.push({ x: victim.x + dx, z: victim.z + dz, y: victim.y, rot: 0, scale: 1, phase: 0 })
  }
  const deadline = Date.now() + 8000
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      if (victim.dead) {
        clearInterval(iv)
        resolve({ ok: true, stains: w.stains.current.length, species: victimSpecies })
      } else if (Date.now() > deadline) {
        clearInterval(iv)
        resolve({ ok: false, why: 'no trample within 8s' })
      }
    }, 150)
  })
})
check(
  'Elephant tramples a smaller animal (dead over a stain)',
  trample.ok === true && trample.stains >= 1,
  trample.ok ? `${trample.species}, ${trample.stains} stain(s)` : trample.why,
)

// --- Debug menu: dropdowns, renderer row, wheel-zoom gate (§7.1.20) ----------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(500)
const menu = await page.evaluate(() => ({
  selects: document.querySelectorAll('.debug-menu select').length,
  text: document.body.innerText,
}))
check('Debug menu: three dropdown selectors', menu.selects >= 3, `${menu.selects}`)
check(
  'Debug menu: renderer row shows the backend',
  menu.text.includes('Renderer') && (menu.text.includes('WebGL 2') || menu.text.includes('WebGPU')),
  '',
)
// Jump-to dropdown really jumps (Timbuktu at lat 16.77, lon -3).
const jumped = await page.evaluate(() => {
  const sel = [...document.querySelectorAll('.debug-menu select')].find((s) =>
    [...s.options].some((o) => o.value === 'timbuktu'),
  )
  if (!sel) return null
  const proto = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  proto.set.call(sel, 'timbuktu')
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  const p = window.__game.getState().pos
  return { x: p.x, z: p.z }
})
check(
  'Jump-to dropdown teleports to the picked place',
  jumped !== null && Math.abs(jumped.x - -30) < 1 && Math.abs(jumped.z - -167.7) < 1,
  jumped ? `pos (${jumped.x.toFixed(1)}, ${jumped.z.toFixed(1)})` : 'select not found',
)

// Wheel zoom (design.md §21): the wheel wiring is proven with one real wheel
// event (zoom-in), while the zoom-out gate is asserted directly on the store.
// A single wheel event is used deliberately: after the first zoom the camera
// moves and the newly revealed terrain chunks briefly Suspend the scene
// subtree, dropping its window wheel listener until React remounts it — so
// chaining several synthetic wheel events in the headless run is unreliable.
await page.evaluate(() => window.__ui.getState().setWheelZoomEnabled(false))
// Retry the wheel at page level: a camera move suspends the scene subtree and
// drops its window wheel listener, so give React time to remount between tries.
let zoomedIn = 1
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => window.__ui.getState().setTravelZoom(1))
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -600 })))
  await page.waitForTimeout(180)
  zoomedIn = await page.evaluate(() => window.__ui.getState().travelZoom)
  if (zoomedIn < 1) break
}
// Gate: zoom-out beyond the default distance is clamped to 1 while locked and
// permitted (up to 4) once unlocked (design.md §21).
const gate = await page.evaluate(() => {
  const ui = window.__ui
  ui.getState().setWheelZoomEnabled(false)
  ui.getState().setTravelZoom(2)
  const gated = ui.getState().travelZoom
  ui.getState().setWheelZoomEnabled(true)
  ui.getState().setTravelZoom(2)
  const wide = ui.getState().travelZoom
  ui.getState().setTravelZoom(10)
  const maxOut = ui.getState().travelZoom
  ui.getState().setTravelZoom(0.01)
  const maxIn = ui.getState().travelZoom
  ui.getState().setTravelZoom(3)
  ui.getState().setWheelZoomEnabled(false)
  const clamped = ui.getState().travelZoom
  return { gated, wide, maxOut, maxIn, clamped }
})
const zoom = { zoomedIn, ...gate }
check('Wheel zoom: zooming in works without the unlock', zoom.zoomedIn < 1, `${zoom.zoomedIn.toFixed(2)}`)
check('Wheel zoom: zoom-out gated at the default level', zoom.gated === 1, `${zoom.gated}`)
check('Wheel zoom: zooms out beyond default once unlocked', zoom.wide > 1, `${zoom.wide.toFixed(2)}`)
check('Wheel zoom: range spans 0.25x-4x', zoom.maxOut === 4 && zoom.maxIn === 0.25, `${zoom.maxIn}-${zoom.maxOut}`)
check('Wheel zoom: disabling the unlock clamps back to default', zoom.clamped === 1, `${zoom.clamped}`)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))

// --- Journal do-not-disturb (§7.1.20 / design.md §16) -------------------------
const dnd = await page.evaluate(() => {
  const ui = window.__ui.getState()
  const g = () => window.__game.getState()
  g().setJournalOpen(false)
  ui.setJournalDnd(true)
  const before = g().journal.length
  g().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
  const silent = !g().journalOpen
  const stored = g().journal.length === before + 1
  window.__ui.getState().setJournalDnd(false)
  g().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
  const opens = g().journalOpen
  g().setJournalOpen(false)
  return { silent, stored, opens }
})
check('DND: new entry stays silent but is stored', dnd.silent && dnd.stored, '')
check('DND off: new entry opens the journal again', dnd.opens, '')
const f2 = await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2' }))
  const on = window.__ui.getState().journalDnd
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2' }))
  const off = window.__ui.getState().journalDnd
  return { on, off }
})
check('F2 toggles do-not-disturb', f2.on === true && f2.off === false, '')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
