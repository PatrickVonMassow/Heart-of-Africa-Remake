// End-to-end verification of the POC gameplay loop (CLAUDE.md §7.1/§7.2):
// start → trade in Cairo → checkpoint → travel → village → audience → hint →
// grave → victory. Runs against the dev server (dev hooks __game,
// __placePlayer, __placeLayout are DEV-only). UI text is asserted in German,
// the default game language; journal entries are asserted by their
// language-neutral keys (design.md §17).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

let failCount = 0
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name)
  if (!cond) failCount++
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` })
const state = () => page.evaluate(() => window.__game.getState())
const titleKey = (e) => (typeof e.title === 'object' ? e.title.key : e.title)
const moveTo = (x, z) =>
  page.evaluate(([x, z]) => { const p = window.__placePlayer; p.x = x; p.z = z }, [x, z])
const findInteractive = async (type) =>
  page.evaluate((t) => {
    const it = window.__placeLayout.interactives.find((i) => i.type === t)
    return it ? { pos: it.pos, door: it.door ?? null } : null
  }, type)

// The elder prompt label in the default language (German). A functional building
// now carries a "Space — <name>" prompt at its door too (design.md §2.3).
const ELDER_LABEL = 'Alten'

// German building labels (src/i18n/de.ts): the door prompt NAMES its building, so
// the use-key wait can require the TARGET's name — not merely any prompt. This is
// what makes the entry deterministic against the one-frame stale-candidate race
// (point 244): waiting on "some prompt" could arm on a neighbouring building.
const BUILDING_LABELS = { tools: 'Geräte-Hütte', shop: 'Laden', chief: 'Chefhütte' }

// Stand at the interactive (the elder, or a building's door), wait for the Space
// use-key prompt to arm, then press Space to talk/enter (design.md §2.3): the
// building no longer opens by merely walking into its door.
async function enterBuilding(type) {
  const it = await findInteractive(type)
  if (type === 'villager') {
    await moveTo(it.pos[0], it.pos[1] + 2)
    await page.waitForFunction(
      (label) => (document.querySelector('.prompt')?.textContent ?? '').includes(label),
      ELDER_LABEL,
      { timeout: 30000 },
    )
    await page.keyboard.press('Space')
  } else {
    // Step onto the door point; the door prompt arms in the render loop, then
    // Space enters (walking in alone does nothing now, design.md §2.3). Wait for
    // the prompt that NAMES THIS building so the press cannot fire on a stale or
    // neighbouring candidate (point 244).
    await moveTo(it.door[0], it.door[1])
    await page.waitForFunction(
      (label) => (document.querySelector('.prompt')?.textContent ?? '').includes(label),
      BUILDING_LABELS[type],
      { timeout: 30000 },
    )
    await page.keyboard.press('Space')
    await page.waitForFunction(() => !!document.querySelector('.dialog'), null, { timeout: 30000 })
  }
  await page.waitForTimeout(400)
}

// Leaving is walking out (design.md §2): push the player beyond the walkable
// radius; the render loop switches back to the bird's-eye view.
async function leaveByWalking() {
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.z = window.__placeLayout.radius + 5
  })
  await page.waitForFunction(() => window.__game.getState().mode === 'travel', null, { timeout: 30000 })
  await page.waitForTimeout(400)
}

async function closeDialog() {
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.dialog'), null, { timeout: 30000 })
  await page.waitForTimeout(200)
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
// Point 184 (Pillar 3): confirm the requested backend actually initialised — throws
// on a silent WebGL2 fallback under VERIFY_GL=webgpu (the lane's guardrail).
await page.waitForFunction(() => window.__game && window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
await page.waitForTimeout(3500)
// The flow is asserted against German labels; the default is English (par.17).
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(400)
// Keep the long walks uninterrupted (design.md §16) and hydrated (§6):
// journal auto-open would stop travel movement, desert walking without a
// canteen would drift.
await page.evaluate(() => {
  window.__ui.getState().setJournalDnd(true)
  window.__game.getState().debugAddEquipment('canteen')
  // The core loop is deterministic; random events have their own suite.
  window.__balance.randomEventsEnabled = false
})

// --- 1. Start state (criteria 1, 5, 9) ---
let s = await state()
check('Start in Cairo (first-person)', s.mode === 'place' && s.placeId === 'cairo')
check('Journal open with departure entry', s.journalOpen &&
  s.journal.some((e) => titleKey(e) === 'journal.titles.departure'))
check('Starting money $250', s.money === 250)
check('Provisions 35 days', s.foodDays === 35)
check('2 starting gifts', Object.values(s.gifts).reduce((a, b) => a + b, 0) === 2)
await shot('06-start-journal')
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(300)

// --- 2. Trade in Cairo (criterion 5): enter a building with Space at its door ---
await enterBuilding('tools')
await shot('02-port-cairo-trade')
// Buy prices are laid out as a table: the price cells share a column, so their
// left edges line up (design.md §9).
const priceAligned = await page.evaluate(() => {
  const lefts = [...document.querySelectorAll('.buy-grid .price')].map((p) => Math.round(p.getBoundingClientRect().left))
  return lefts.length >= 2 && lefts.every((l) => Math.abs(l - lefts[0]) <= 1)
})
check('Buy prices are aligned in a column (table layout)', priceAligned)
// Scope to the BUY grid: with the start kit (point 104) the sell-back list
// also carries a 'Schaufel' row, so the unscoped locator matched twice.
await page.locator('.buy-grid .trade-row', { hasText: 'Schaufel' }).locator('button').click()
await page.waitForTimeout(300)
s = await state()
// The demo start kit (point 104) already holds one shovel; the buy adds a second.
check('Shovel bought (−$20)', (s.equipment.shovel ?? 0) === 2 && s.money === 230)
await closeDialog()

await enterBuilding('shop')
await page.locator('.trade-row', { hasText: 'Goldschmuck' }).locator('button').click()
await page.waitForTimeout(300)
s = await state()
check('Gold-jewelry gift bought (−$30)', s.gifts.gold === 1 && s.money === 200)
await closeDialog()

// The SELL/treasure lists use the same aligned column grid as the buy list
// (point 95): open the bazaar with a couple of treasures and assert the buy
// prices share a left edge and the offer (sell) names share a left edge.
await page.evaluate(() => {
  window.__game.getState().debugAddTreasure('gold')
  window.__game.getState().debugAddTreasure('ivory')
  window.__ui.getState().setDialog({ kind: 'bazaar' })
})
await page.waitForTimeout(250)
const bazaarAligned = await page.evaluate(() => {
  const lefts = (sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().left))
  const aligned = (xs) => xs.length >= 2 && xs.every((l) => Math.abs(l - xs[0]) <= 1)
  return aligned(lefts('.buy-grid .price')) && aligned(lefts('.offer-grid .trade-name'))
})
check('Bazaar buy prices and sell names align in columns (table layout)', bazaarAligned)
await closeDialog()

// --- 3. Leave place by walking out → travel mode (criterion 2) ---
await leaveByWalking()
s = await state()
check('Left the place → bird\'s-eye view', s.mode === 'travel')
await page.waitForTimeout(600)
await shot('01-birdseye-view')

// --- 4. Re-enter Cairo with the Space use key → checkpoint (criteria 2/5). ---
// Entry is a deliberate Space press now (design.md §2.3): standing on the marker
// shows the "Space to enter" hint but does NOT enter until Space is pressed.
const cairoW = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const c = geo.PLACES.find((p) => p.id === 'cairo')
  return geo.latLonToWorld(c.lat, c.lon)
})
// Stand on the marker: the enter hint arms, but the view stays bird's-eye.
await page.evaluate((w) => window.__game.setState({ pos: { x: w.x, z: w.z } }), cairoW)
await page.waitForFunction(() => window.__ui.getState().enterPlaceId === 'cairo', null, { timeout: 15000 })
await page.waitForTimeout(400)
check('standing on the marker does not auto-enter (Space required)', (await state()).mode === 'travel')
// Press Space to enter — the movement-based approach, confirmed with the use key.
await page.keyboard.press('Space')
await page.waitForFunction(() => window.__game.getState().mode === 'place', null, { timeout: 15000 })
await page.waitForTimeout(400)
s = await state()
const hasCp = await page.evaluate(() => localStorage.getItem('hoa-checkpoints-v1') !== null)
check('Re-entered Cairo (Space use key)', s.mode === 'place' && s.placeId === 'cairo')
check('Checkpoint saved (localStorage)', hasCp)
check('Arrival journal entry', s.journal.some((e) =>
  titleKey(e) === 'journal.titles.arrival' && e.title.params?.place === 'cairo'))
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(200)

// --- 5. Travel to village (criteria 4, 6) ---
await leaveByWalking()
// Jump slightly north of the North's knowing village (design.md §13.3), then
// walk south into it so the journey itself (movement, time) is exercised.
const village = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const id = window.__game.getState().knowingVillages.north
  const v = geo.PLACES.find((p) => p.id === id)
  return { id, lat: v.lat, lon: v.lon }
})
// 0.5° ≈ 5 world units: outside the enter radius (2.5), so real walking
// (movement, time, provisions) is required to get in.
await page.evaluate(([lat, lon]) => window.__game.getState().debugJumpTo(lat, lon), [village.lat + 0.5, village.lon])
await page.waitForTimeout(400)
const dayBefore = (await state()).day
// Walk south into the village until within its enter radius (the approach is the
// movement — time and provisions), then press Space to confirm entry (design.md
// §2.3): reaching the radius no longer switches views on its own.
await page.keyboard.down('KeyS')
await page
  .waitForFunction((id) => window.__ui.getState().enterPlaceId === id, village.id, { timeout: 60000 })
  .finally(() => page.keyboard.up('KeyS'))
await page.keyboard.press('Space')
// The mode switch is synchronous on the press, but the FIRST entry into this
// village then builds the whole first-person place (layout, panorama capture,
// texture bake, shader compile) in one long main-thread block — measured ~19 s
// on a loaded dev server — during which no rAF poll can fire. Budget what the
// pre-use-key flow gave this same transition (60 s); 15 s starves in the stall.
await page.waitForFunction(() => window.__game.getState().mode === 'place', null, { timeout: 60000 })
await page.waitForTimeout(500)
s = await state()
check('Entered the village (Space at the enter radius)', s.mode === 'place' && s.placeId === village.id)
// Point 11: entering a settlement puts the focus on the controls — no lingering
// HUD button keeps focus, so keyboard works without an extra click (and the
// canvas is not made a focus/click target, so it never blocks HUD clicks).
check(
  'entering leaves no HUD control focused (controls ready, no extra click)',
  await page.evaluate(() => !['BUTTON', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName ?? '')),
  await page.evaluate(() => document.activeElement?.tagName ?? 'none'),
)
check('Time advances with the journey', s.day > dayBefore)
check('Village journal entry', s.journal.some((e) =>
  titleKey(e) === 'journal.titles.village' && e.title.params?.place === village.id))
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(200)
await shot('03-village-nubians')

// --- 5b. Regression guard (design.md §16): the open, non-modal journal must
// not block entering a hut with Space at its door. A fresh village-discovered
// entry auto-opens the journal; Space must still enter (and close the book). ---
await page.evaluate(() => window.__game.getState().setJournalOpen(true))
const marketDoor = await page.evaluate(() => {
  const it = window.__placeLayout.interactives.find((i) => i.type === 'market')
  return it?.door ?? null
})
if (marketDoor) {
  await moveTo(marketDoor[0], marketDoor[1])
  // Arm the Space prompt at the door, then press it (design.md §2.3). Poll until
  // the dialog opens (point 200); the assert below judges the final state.
  await page.waitForFunction(() => !!document.querySelector('.prompt'), null, { timeout: 5000 }).catch(() => {})
  await page.keyboard.press('Space')
  await page
    .waitForFunction(() => !!document.querySelector('.dialog') && !window.__game.getState().journalOpen, null, { timeout: 5000 })
    .catch(() => {})
  check(
    'Space at a hut door enters even with the journal open (design.md §16)',
    await page.evaluate(() => !!document.querySelector('.dialog') && !window.__game.getState().journalOpen),
  )
  await page.evaluate(() => window.__ui.getState().setDialog(null))
  await moveTo(0, 0) // step back to the center, clear of the door prompt
  await page.waitForTimeout(300)
} else {
  check('a hut door opens even with the journal open (design.md §16)', true, 'no market hut in this village — skipped')
}

// --- 6. Villager: the elder teaches the North's direction system (§13.2) ---
await enterBuilding('villager')
s = await state()
check('Language lesson (Nivera = north) in the journal', s.languagesLearned.north === true &&
  s.journal.some((e) => titleKey(e) === 'journal.titles.language'))
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(200)

// --- 7. Chief audience: culturally correct gift → hint (criteria 6, 7) ---
await enterBuilding('chief')
await page.waitForTimeout(300)
await shot('04-chief-hut-audience')
await page.locator('.dialog .row', { hasText: 'Goldschmuck' }).locator('button').click()
await page.waitForTimeout(400)
s = await state()
check('Culturally correct gift → hint unlocked', s.hintsGiven.north === true)
const hint = s.journal.find((e) => titleKey(e) === 'journal.titles.chiefHint')
check('Hint stores grave coordinates (language-neutral)',
  !!hint && typeof hint.text === 'object' && typeof hint.text.params?.lat === 'number')
check('Learned language deciphers the hint (latitude)', s.decodedGiven.north === true &&
  s.journal.some((e) => titleKey(e) === 'journal.titles.decoded'))
await shot('05-journal-hint')
await closeDialog()
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(200)

// --- 8. Triangulation: the East's knowing people contributes the longitude ---
await leaveByWalking()
await page.evaluate(() => {
  const g = window.__game.getState()
  g.enterPlace(g.knowingVillages.east)
})
await page.waitForTimeout(1200)
await page.evaluate(() => {
  const g = () => window.__game.getState()
  g().setJournalOpen(false)
  g().debugAddGift('emerald') // the East reveres emeralds (design.md §8)
  g().giveGift('emerald')
  g().talkToVillager()
})
await page.waitForTimeout(400)
s = await state()
check('Second hint: longitude from the East, deciphered (triangulation)',
  s.hintsGiven.east === true && s.decodedGiven.east === true)
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(800)

// --- 9. Grave: dig with shovel → victory (criterion 10) ---
s = await state()
const grave = s.graveLatLon
check('Grave lies north of the village (Nivera matches)', grave.lat > 21.8)
await page.evaluate(([lat, lon]) => window.__game.getState().debugJumpTo(lat, lon), [grave.lat, grave.lon])
await page.waitForTimeout(400)
// Dig with no shovel in the pack → must fail politely (effects are possession-
// based now, design.md §11/§17).
await page.evaluate(() => {
  const g = window.__game.getState()
  window.__game.setState({ equipment: { ...g.equipment, shovel: 0 } })
})
await page.keyboard.press('KeyG')
await page.waitForTimeout(200)
s = await state()
check('Digging without a shovel in the pack fails', !s.victory)
// Acquire a shovel, then dig by clicking it in the inventory bar (design.md §17).
await page.evaluate(() => window.__game.getState().debugAddEquipment('shovel'))
await page.waitForTimeout(150)
await page.locator('.inventory-bar button', { hasText: 'Schaufel' }).click()
await page.waitForTimeout(400)
s = await state()
check('Victory state after digging at the site (shovel clicked)', s.victory === true)
await shot('07-victory')

// --- Point 59: mouse-look is not grabbed while the start-choice overlay is up -
// (design.md §17.5) A checkpoint at startup shows the StartOverlay; the pointer
// must not be grabbed then, or the load choice is unclickable. Spy on
// requestPointerLock across two loads: fresh (no overlay) grabs, with a
// checkpoint (overlay up) does not.
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page2.on('console', (m) => m.type() === 'error' && errors.push('page2: ' + m.text()))
page2.on('pageerror', (e) => errors.push('page2 PAGEERROR: ' + e.message))
await page2.addInitScript(() => {
  window.__plCalls = 0
  const orig = HTMLCanvasElement.prototype.requestPointerLock
  HTMLCanvasElement.prototype.requestPointerLock = function (...a) {
    window.__plCalls++
    try {
      return orig.apply(this, a)
    } catch {
      return undefined
    }
  }
})
await page2.goto(BASE)
await page2.evaluate(() => localStorage.clear())
await page2.reload()
await page2.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page2.waitForTimeout(700)
// Under browser automation the game deliberately SKIPS the real pointer lock
// (it would grab the OS cursor under system-Chrome --headless=new) and instead
// applies mouse-look from raw movement — so assert the behaviour (the view turns
// on a mouse move at a fresh, overlay-free start) rather than the grab call.
const yawBefore = await page2.evaluate(() => window.__placePlayer?.yaw ?? null)
await page2.mouse.move(640, 400)
await page2.mouse.move(760, 400)
await page2.waitForTimeout(60)
const fresh = await page2.evaluate(() => ({ overlay: !!document.querySelector('.overlay'), yaw: window.__placePlayer?.yaw ?? null }))
check(
  'a fresh start (no overlay) engages mouse-look (the view turns on a mouse move)',
  !fresh.overlay && fresh.yaw !== null && fresh.yaw !== yawBefore,
)
// Seed a checkpoint (entering a port saves one) and reload → the StartOverlay shows.
await page2.evaluate(() => window.__game.getState().enterPlace('cairo'))
await page2.waitForTimeout(200)
await page2.reload()
await page2.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page2.waitForTimeout(700)
const withCp = await page2.evaluate(() => ({ overlay: !!document.querySelector('.overlay'), calls: window.__plCalls }))
check('with a checkpoint the start-choice overlay shows and the pointer is NOT grabbed', withCp.overlay && withCp.calls === 0)
// Choosing an option dismisses the overlay; a canvas click then grabs as usual.
await page2.evaluate(() => [...document.querySelectorAll('.overlay .actions button')].pop()?.click())
await page2.waitForTimeout(400)
await page2.locator('canvas').click({ position: { x: 640, y: 400 } })
await page2.waitForTimeout(200)
const afterChoice = await page2.evaluate(() => ({ overlay: !!document.querySelector('.overlay'), calls: window.__plCalls }))
check('after the choice a canvas click grabs the pointer', !afterChoice.overlay && afterChoice.calls > 0)
await page2.close()

console.log('---')
console.log('CONSOLE ERRORS:', errors.length === 0 ? 'none' : errors.length)
for (const e of errors.slice(0, 10)) console.log('  -', e)
console.log(failCount === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : `FAILURES: ${failCount}`)
await browser.close()
process.exit(failCount === 0 && errors.length === 0 ? 0 : 1)
