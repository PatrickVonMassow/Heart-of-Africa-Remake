// End-to-end verification of the POC gameplay loop (CLAUDE.md §7.1/§7.2):
// start → trade in Cairo → checkpoint → travel → village → audience → hint →
// grave → victory. Runs against the dev server (dev hooks __game,
// __placePlayer, __placeLayout are DEV-only). UI text is asserted in German,
// the default game language; journal entries are asserted by their
// language-neutral keys (design.md §17).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
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

// The elder prompt label in the default language (German). Buildings no longer
// carry a prompt: they open by walking into their entrance door (design.md §2).
const ELDER_LABEL = 'Alten'

// Walk against a building's entrance door → it opens its dialog, no key press
// (design.md §2 "Switching"). Only the elder still takes the E interaction.
async function enterBuilding(type) {
  const it = await findInteractive(type)
  if (type === 'villager') {
    await moveTo(it.pos[0], it.pos[1] + 2)
    await page.waitForFunction(
      (label) => (document.querySelector('.prompt')?.textContent ?? '').includes(label),
      ELDER_LABEL,
      { timeout: 30000 },
    )
    await page.keyboard.press('KeyE')
  } else {
    // Step onto the door point; the door trigger fires in the render loop.
    await moveTo(it.door[0], it.door[1])
    await page.waitForFunction(() => !!document.querySelector('.dialog'), null, { timeout: 15000 })
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
  await page.waitForFunction(() => window.__game.getState().mode === 'travel', null, { timeout: 15000 })
  await page.waitForTimeout(400)
}

async function closeDialog() {
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.dialog'), null, { timeout: 15000 })
  await page.waitForTimeout(200)
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
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

// --- 2. Trade in Cairo (criterion 5): open a building by walking into its door ---
await enterBuilding('tools')
await shot('02-port-cairo-trade')
await page.locator('.dialog .row', { hasText: 'Schaufel' }).locator('button').click()
await page.waitForTimeout(300)
s = await state()
check('Shovel bought (−$20)', (s.equipment.shovel ?? 0) === 1 && s.money === 230)
await closeDialog()

await enterBuilding('shop')
await page.locator('.dialog .row', { hasText: 'Goldschmuck' }).locator('button').click()
await page.waitForTimeout(300)
s = await state()
check('Gold-jewelry gift bought (−$30)', s.gifts.gold === 1 && s.money === 200)
await closeDialog()

// --- 3. Leave place by walking out → travel mode (criterion 2) ---
await leaveByWalking()
s = await state()
check('Left the place → bird\'s-eye view', s.mode === 'travel')
await page.waitForTimeout(600)
await shot('01-birdseye-view')

// --- 4. Re-enter Cairo by walking into it → checkpoint (criterion 5). No key:
// crossing the enter radius switches to the first-person view (design.md §2). ---
let entered = false
for (let i = 0; i < 25 && !entered; i++) {
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(150)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(120)
  entered = await page.evaluate(() => window.__game.getState().mode === 'place')
}
await page.waitForTimeout(400)
s = await state()
const hasCp = await page.evaluate(() => localStorage.getItem('hoa-checkpoints-v1') !== null)
check('Re-entered Cairo', s.mode === 'place' && s.placeId === 'cairo')
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
// Walk south into the village: crossing the enter radius switches to the
// first-person view on its own (no key press, design.md §2).
await page.keyboard.down('KeyS')
await page
  .waitForFunction(() => window.__game.getState().mode === 'place', null, { timeout: 60000 })
  .finally(() => page.keyboard.up('KeyS'))
await page.waitForTimeout(500)
s = await state()
check('Entered the village (first-person)', s.mode === 'place' && s.placeId === village.id)
check('Time advances with the journey', s.day > dayBefore)
check('Village journal entry', s.journal.some((e) =>
  titleKey(e) === 'journal.titles.village' && e.title.params?.place === village.id))
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(200)
await shot('03-village-nubians')

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
// Dig without the shovel in hand → must fail politely.
await page.keyboard.press('KeyG')
await page.waitForTimeout(200)
s = await state()
check('Digging without the shovel in hand fails', !s.victory)
// Take the shovel in hand via the inventory bar, then dig.
await page.locator('.inventory-bar button', { hasText: 'Schaufel' }).click()
await page.waitForTimeout(200)
await page.keyboard.press('KeyG')
await page.waitForTimeout(400)
s = await state()
check('Victory state after digging at the site', s.victory === true)
await shot('07-victory')

console.log('---')
console.log('CONSOLE ERRORS:', errors.length === 0 ? 'none' : errors.length)
for (const e of errors.slice(0, 10)) console.log('  -', e)
console.log(failCount === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : `FAILURES: ${failCount}`)
await browser.close()
process.exit(failCount === 0 && errors.length === 0 ? 0 : 1)
