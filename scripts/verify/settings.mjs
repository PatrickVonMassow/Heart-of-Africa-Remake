// Headless verification for CLAUDE.md §7.1.20 (comfort and audio settings)
// and the lion-feed depiction of §7.1.12: balance defaults (mouse
// sensitivity halved, walk speed 10 m/s, ambience noise at 20 %), the lowered
// first-person eye height, the debug-menu controls in both languages, and
// the schematic feeding animation of the decorative lion hunt.
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
await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)

// --- Balance defaults --------------------------------------------------------
const bal = await page.evaluate(() => ({
  mouse: window.__balance.mouseSensitivity,
  walk: window.__balance.placeWalkSpeed,
  strafe: window.__balance.placeStrafeFactor,
  ambience: window.__balance.ambienceVolume,
  travel: window.__balance.travelSpeed,
  canoe: window.__balance.canoeSpeedup,
  jungle: window.__balance.junglePenalty,
  mountain: window.__balance.mountainPenalty,
}))
check('default mouse sensitivity halved (0.0011)', bal.mouse === 0.0011, `${bal.mouse}`)
check('default walk speed 10 m/s (user calibration)', bal.walk === 10, `${bal.walk}`)
check('single ambience volume default 0.1', bal.ambience === 0.1, `${bal.ambience}`)
check('overland travel speed reduced 30% (5.6)', bal.travel === 5.6, `${bal.travel}`)
check('canoe/jungle/mountain factors present', bal.canoe === 4 && bal.jungle === 2.3 && bal.mountain === 1.67,
  `canoe ${bal.canoe}, jungle ${bal.jungle}, mountain ${bal.mountain}`)

check('default strafe/backward factor 0.8', bal.strafe === 0.8, `${bal.strafe}`)

// --- First-person eye height -------------------------------------------------
const eyeY = await page.evaluate(() => window.__placeCamera?.position.y)
check('first-person eye height lowered to 1.5', Math.abs(eyeY - 1.5) < 1e-6, `${eyeY}`)

// --- Strafe/backward speed is 80 % of forward (design.md §2) -----------------
// Exact ratio via the pure velocity helper (frame-timing independent), plus a
// loose in-scene smoke check that forward still moves and strafing moves less.
const vel = await page.evaluate(() => {
  const v = window.__movement.placeWalkVelocity
  const mag = ([a, b]) => Math.hypot(a, b)
  return {
    forward: mag(v(1, 0, 10, 0.8)),
    strafe: mag(v(0, 1, 10, 0.8)),
    back: mag(v(-1, 0, 10, 0.8)),
    diag: mag(v(1, 1, 10, 0.8)),
  }
})
check('forward walks at full speed', Math.abs(vel.forward - 10) < 1e-6, `${vel.forward}`)
check('strafing is exactly 80 % of forward', Math.abs(vel.strafe / vel.forward - 0.8) < 1e-6, `${(vel.strafe / vel.forward).toFixed(3)}`)
check('walking backward is exactly 80 % of forward', Math.abs(vel.back / vel.forward - 0.8) < 1e-6, `${(vel.back / vel.forward).toFixed(3)}`)
check('a diagonal is not faster than walking straight forward', vel.diag <= vel.forward + 1e-6, `${vel.diag.toFixed(2)}`)

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
  await page.waitForTimeout(280)
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), code)
  await page.waitForTimeout(40)
  const p1 = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  return Math.hypot(p1.x - p0.x, p1.z - p0.z)
}
const fwd = await measureWalk('KeyW')
const strafeD = await measureWalk('KeyD')
// The exact 80 % ratio is proven above via the pure helper; here just confirm
// both directions actually move in the scene (the wall-clock hold gets a
// frame-count-dependent distance, so the two are not directly comparable).
check('forward walking actually moves the character', fwd > 0.5, `${fwd.toFixed(2)} m`)
check('strafing actually moves the character', strafeD > 0.5, `${strafeD.toFixed(2)} m`)

// --- Debug menu: new controls, German labels, live effect --------------------
// The default language is English (par.17); check the German labels explicitly.
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(400)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(600)
let txt = await page.evaluate(() => document.body.innerText)
check('debug menu (de): mouse sensitivity field', txt.includes('Maus-Empfindlichkeit (Ego-Sicht)'), '')
check('debug menu (de): ambience volume field', txt.includes('Ambiente-Lautstärke'), '')

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

/** Fill the number input that sits next to the given label text. */
async function fillField(label, value) {
  return page.evaluate(
    ([lbl, v]) => {
      const rows = [...document.querySelectorAll('.debug-menu label')]
      const row = rows.find((r) => r.textContent.includes(lbl))
      const input = row?.querySelector('input[type="number"]')
      if (!input) return false
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      proto.set.call(input, String(v))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    [label, value],
  )
}
check('debug menu: mouse sensitivity editable', await fillField('Maus-Empfindlichkeit', 0.002), '')
check('debug menu: ambience volume editable', await fillField('Ambiente-Lautstärke', 0.5), '')
check('debug menu: strafe factor editable', await fillField('Seitwärts/Rückwärts-Faktor', 0.6), '')
check('debug menu: canoe speed factor editable', await fillField('Kanu-Tempofaktor', 5), '')
check('debug menu: jungle penalty factor editable', await fillField('Malusfaktor Dschungel', 2.5), '')
await page.waitForTimeout(300)
const adjusted = await page.evaluate(() => ({
  mouse: window.__balance.mouseSensitivity,
  ambience: window.__balance.ambienceVolume,
  strafe: window.__balance.placeStrafeFactor,
  canoe: window.__balance.canoeSpeedup,
  jungle: window.__balance.junglePenalty,
}))
check('mouse sensitivity applies at runtime', adjusted.mouse === 0.002, `${adjusted.mouse}`)
check('ambience volume applies at runtime', adjusted.ambience === 0.5, `${adjusted.ambience}`)
check('strafe factor applies at runtime', adjusted.strafe === 0.6, `${adjusted.strafe}`)
check('canoe/jungle factors apply at runtime', adjusted.canoe === 5 && adjusted.jungle === 2.5,
  `canoe ${adjusted.canoe}, jungle ${adjusted.jungle}`)
// Restore the changed factors so they do not affect later checks.
await page.evaluate(() => { window.__balance.canoeSpeedup = 4; window.__balance.junglePenalty = 2.3 })
// Restore the default so it does not affect later checks.
await page.evaluate(() => (window.__balance.placeStrafeFactor = 0.8))
await page.screenshot({ path: `${OUT}67-settings-debug-menu.png` })
console.log('shot 67-settings-debug-menu.png')

// --- English labels ----------------------------------------------------------
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(600)
txt = await page.evaluate(() => document.body.innerText)
check('debug menu (en): mouse sensitivity field', txt.includes('Mouse sensitivity (first-person)'), '')
check('debug menu (en): ambience volume field', txt.includes('Ambience volume'), '')
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
await page.waitForTimeout(600)
const feedB = await page.evaluate(() => ({ headPitch: window.__lionHunt.lion.current?.rotation.x }))
check('feeding: lion and carcass visible', feedA.lionVisible === true && feedA.preyVisible === true, '')
check('feeding: lion head lowered', feedA.headPitch > 0.1, `${feedA.headPitch?.toFixed(3)}`)
check('feeding: tearing movement animates', Math.abs(feedB.headPitch - feedA.headPitch) > 0.005,
  `${feedA.headPitch?.toFixed(3)} -> ${feedB.headPitch?.toFixed(3)}`)
check('feeding: prey lies on its side', feedA.preyOnSide > 1.0, `${feedA.preyOnSide?.toFixed(2)}`)
check('feeding: stain beneath the carcass', feedA.stainVisible === true && feedA.stainScale > 0.3,
  `scale ${feedA.stainScale?.toFixed(2)}`)
await page.screenshot({ path: `${OUT}68-lion-feeding.png` })
console.log('shot 68-lion-feeding.png')

// --- F3: full debug loadout (design.md §21) ----------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSet({ money: 5, foodDays: 2, health: 10 })
  g.debugSetAffliction('fever', true)
  g.debugSetAffliction('sunblind', true)
  g.debugSetAffliction('wounds', 2)
})
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F3' })))
await page.waitForTimeout(200)
// Read the live store directly — importing the store module inside the page
// would re-instantiate it and reset window.__game.
const loadout = await page.evaluate(() => {
  const equipIds = ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen', 'map', 'canoe']
  const treasureIds = ['gold', 'silver', 'emerald', 'copper', 'ivory', 'statue']
  const g = window.__game.getState()
  const sum = (o) => Object.values(o).reduce((a, b) => a + (b ?? 0), 0)
  return {
    money: g.money,
    food: g.foodDays,
    health: g.health,
    afflictions: g.afflictions,
    giftsTotal: sum(g.gifts),
    allEquip: equipIds.every((e) => (g.equipment[e] ?? 0) >= 1),
    allTreasure: treasureIds.every((t) => (g.treasures[t] ?? 0) >= 1),
    used: sum(g.equipment) + sum(g.gifts) + sum(g.treasures),
    capacity: window.__balance.inventoryCapacity,
  }
})
check('F3: money set to 100000', loadout.money === 100000, `${loadout.money}`)
check('F3: provisions set to 100000', loadout.food === 100000, `${loadout.food}`)
check('F3: full health', loadout.health === 100, `${loadout.health}`)
check(
  'F3: all afflictions cleared',
  !loadout.afflictions.fever && !loadout.afflictions.dehydration && !loadout.afflictions.sunblind && loadout.afflictions.wounds === 0,
  JSON.stringify(loadout.afflictions),
)
check('F3: 100000 gifts', loadout.giftsTotal === 100000, `${loadout.giftsTotal}`)
check('F3: all equipment and treasures present', loadout.allEquip && loadout.allTreasure, `equip ${loadout.allEquip}, treasure ${loadout.allTreasure}`)
check('F3: inventory capacity raised to fit', loadout.capacity >= loadout.used, `cap ${loadout.capacity} >= used ${loadout.used}`)

// --- F4: toggle the canoe in and out of the pack (design.md §21) -------------
const canoe = await page.evaluate(() => {
  const g = () => window.__game.getState()
  window.__game.setState({ equipment: { ...g().equipment, canoe: 0 } })
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }))
  const on = g().equipment.canoe ?? 0
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }))
  const off = g().equipment.canoe ?? 0
  return { on, off }
})
check('F4 adds the canoe when missing', canoe.on === 1, `${canoe.on}`)
check('F4 removes the canoe when present', canoe.off === 0, `${canoe.off}`)

// --- Tab toggles the journal without focus problems (design.md §17) ----------
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
})
await page.waitForTimeout(100)
await page.keyboard.press('Tab')
const tabOpen = await page.evaluate(() => ({ open: window.__game.getState().journalOpen, active: document.activeElement?.tagName }))
await page.keyboard.press('Tab')
const tabClose = await page.evaluate(() => window.__game.getState().journalOpen)
check('Tab opens the journal', tabOpen.open === true, '')
check('Tab does not shift focus onto a control (no focus problem)', tabOpen.active === 'BODY' || tabOpen.active === 'CANVAS' || tabOpen.active == null, `active ${tabOpen.active}`)
check('Tab toggles the journal closed again', tabClose === false, '')
// Inside a form control (debug menu), Tab must NOT toggle the journal.
const tabInField = await page.evaluate(async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })) // open debug menu
  await new Promise((r) => setTimeout(r, 300))
  const input = document.querySelector('.debug-menu input[type="number"]')
  if (!input) return { ok: false }
  input.focus()
  const before = window.__game.getState().journalOpen
  // A Tab keydown while the field is focused (onTab must bail on INPUT targets).
  input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }))
  const after = window.__game.getState().journalOpen
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })) // close debug menu
  return { ok: true, unchanged: before === after }
})
check('Tab in a debug field does not toggle the journal (focus-safe)', tabInField.ok && tabInField.unchanged, JSON.stringify(tabInField))

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

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
