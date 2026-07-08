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
  noise: window.__balance.ambienceNoiseVolume,
  gust: window.__balance.ambienceGustVolume,
}))
check('default mouse sensitivity halved (0.0011)', bal.mouse === 0.0011, `${bal.mouse}`)
check('default walk speed 10 m/s (user calibration)', bal.walk === 10, `${bal.walk}`)
check('default ambience noise volume 20 % (0.2)', bal.noise === 0.2, `${bal.noise}`)
check('default ambience gust volume 20 % (0.2)', bal.gust === 0.2, `${bal.gust}`)

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
check('forward walking actually moves the character', fwd > 0.5, `${fwd.toFixed(2)} m`)
check('strafing in-scene covers less ground than forward', strafeD < fwd, `strafe ${strafeD.toFixed(2)} < fwd ${fwd.toFixed(2)}`)

// --- Debug menu: new controls, German labels, live effect --------------------
// The default language is English (par.17); check the German labels explicitly.
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(400)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(600)
let txt = await page.evaluate(() => document.body.innerText)
check('debug menu (de): mouse sensitivity field', txt.includes('Maus-Empfindlichkeit (Ego-Sicht)'), '')
check('debug menu (de): ambience volume field', txt.includes('Ambiente-Rauschen (Lautstärke)'), '')

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
check('debug menu: ambience volume editable', await fillField('Ambiente-Rauschen', 0.5), '')
check('debug menu: strafe factor editable', await fillField('Seitwärts/Rückwärts-Faktor', 0.6), '')
await page.waitForTimeout(300)
const adjusted = await page.evaluate(() => ({
  mouse: window.__balance.mouseSensitivity,
  noise: window.__balance.ambienceNoiseVolume,
  strafe: window.__balance.placeStrafeFactor,
}))
check('mouse sensitivity applies at runtime', adjusted.mouse === 0.002, `${adjusted.mouse}`)
check('ambience volume applies at runtime', adjusted.noise === 0.5, `${adjusted.noise}`)
check('strafe factor applies at runtime', adjusted.strafe === 0.6, `${adjusted.strafe}`)
// Restore the default so it does not affect later checks.
await page.evaluate(() => (window.__balance.placeStrafeFactor = 0.8))
await page.screenshot({ path: `${OUT}67-settings-debug-menu.png` })
console.log('shot 67-settings-debug-menu.png')

// --- English labels ----------------------------------------------------------
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(600)
txt = await page.evaluate(() => document.body.innerText)
check('debug menu (en): mouse sensitivity field', txt.includes('Mouse sensitivity (first-person)'), '')
check('debug menu (en): ambience volume field', txt.includes('Ambience noise volume'), '')
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

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
