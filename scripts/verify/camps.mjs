// Headless verification for CLAUDE.md §7.1.27 (camps/item caches, design.md
// §6/§17): free camps (pitch, store/take, looting, map X) and the safe
// village caches of the Honored Friend, destroyed by a robbery.
// Dev server only (dev hooks).
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
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
await page.waitForFunction(() => window.__game && window.__balance && window.__ui, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false // deterministic
})

const state = () => page.evaluate(() => window.__game.getState())
const uiState = () => page.evaluate(() => window.__ui.getState())
const journalKeys = () =>
  page.evaluate(() => window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))

const camps = await page.evaluate(() => window.__balance.camps)
check('camps balance block present', camps && camps.lootChancePerDay > 0 && camps.campRadiusDeg > 0, JSON.stringify(camps))

// --- Pitch a free camp and store the canoe (design.md §6 use case) ---------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.debugAddEquipment('canoe')
  g.debugAddGift('gold')
  g.debugAddTreasure('silver')
  g.takeInHand('canoe')
  g.pitchOrOpenCamp()
})
let s = await state()
let ui = await uiState()
check(
  'pitching creates a camp and opens its dialog',
  s.freeCamps.length === 1 && ui.dialog?.kind === 'camp' && ui.dialog.scope === 'free',
  `camps: ${s.freeCamps.length}`,
)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.campStore('equipment', 'canoe')
  g.campStore('gift', 'gold')
  g.campStore('treasure', 'silver')
})
s = await state()
check(
  'storing moves items into the cache',
  (s.equipment.canoe ?? 0) === 0 && s.gifts.gold === 0 && s.treasures.silver === 0
    && s.freeCamps[0].items.equipment.canoe === 1 && s.freeCamps[0].items.gifts.gold === 1
    && s.freeCamps[0].items.treasures.silver === 1,
  '',
)
check('storing the held canoe puts the hand away', s.handItem === null, '')

// Take back with a full pack: refused; with space: works.
await page.evaluate(() => {
  const g = window.__game.getState()
  const used =
    Object.values(g.equipment).reduce((a, b) => a + (b ?? 0), 0) +
    Object.values(g.gifts).reduce((a, b) => a + b, 0) +
    Object.values(g.treasures).reduce((a, b) => a + b, 0)
  window.__balance.inventoryCapacity = used
  g.campTake('equipment', 'canoe')
})
s = await state()
check('taking back respects the capacity', (s.equipment.canoe ?? 0) === 0 && !!s.toast, `"${s.toast}"`)
await page.evaluate(() => {
  window.__balance.inventoryCapacity = 40
  window.__game.getState().campTake('equipment', 'canoe')
})
s = await state()
check('with space the item returns to the pack', (s.equipment.canoe ?? 0) === 1 && !s.freeCamps[0].items.equipment.canoe, '')

// Reopening: C near the camp opens the same camp instead of pitching a new one.
await page.evaluate(() => {
  const g = window.__game.getState()
  window.__ui.getState().setDialog(null)
  g.pitchOrOpenCamp()
})
s = await state()
ui = await uiState()
check('a nearby camp is reopened, not duplicated', s.freeCamps.length === 1 && ui.dialog?.kind === 'camp', '')
await page.evaluate(() => window.__ui.getState().setDialog(null))

// --- Looting: a stocked camp is raided while travelling --------------------------
await page.evaluate(() => {
  window.__balance.camps.lootChancePerDay = 10000 // force the roll
  for (let i = 0; i < 6; i++) window.__game.getState().moveTravel(0, -1, 0.05)
})
s = await state()
let keys = await journalKeys()
check(
  'a stocked camp is looted and the loss discovered on return',
  s.freeCamps.length === 0 && keys.includes('journal.campLooted'),
  `camps left: ${s.freeCamps.length}`,
)
check('the looted goods are gone', s.gifts.gold === 0 && s.treasures.silver === 0, '')
await page.evaluate(() => (window.__balance.camps.lootChancePerDay = 0.03))

// --- The map marks camps with an X ------------------------------------------------
await page.evaluate(() => window.__game.getState().pitchOrOpenCamp())
await page.evaluate(() => window.__ui.getState().setDialog(null))
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(600)
const mapVisible = await page.evaluate(() => document.querySelector('.map-overlay canvas') !== null)
s = await state()
check('a pitched camp appears while the map view is open', mapVisible && s.freeCamps.length === 1, '')
await page.evaluate(() => window.__ui.getState().toggleMap())

// --- Village cache: Honored Friend privilege --------------------------------------
await page.evaluate(() => window.__game.getState().enterPlace('nubian-village'))
// Read the toast in the same tick — the HUD clears toasts after a delay.
const refused = await page.evaluate(() => {
  window.__game.getState().openVillageCamp()
  return { toast: window.__game.getState().toast, dialog: window.__ui.getState().dialog }
})
check('without the friend standing the village cache is refused', refused.dialog === null && !!refused.toast, `"${refused.toast}"`)
await page.evaluate(() => {
  window.__game.setState({ honoredFriend: { north: true } })
  window.__game.getState().openVillageCamp()
})
ui = await uiState()
check('the Honored Friend may use the village cache', ui.dialog?.kind === 'camp' && ui.dialog.scope === 'village', '')
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddGift('emerald')
  g.campStore('gift', 'emerald')
})
s = await state()
check('items rest safely in the village cache', s.villageCamps['nubian-village']?.gifts.emerald === 1, '')
// Persistence across leaving and re-entering.
await page.evaluate(() => {
  const g = window.__game.getState()
  window.__ui.getState().setDialog(null)
  g.leavePlace()
})
await page.evaluate(() => {
  const g = window.__game.getState()
  g.enterPlace('nubian-village')
  g.openVillageCamp()
  g.campTake('gift', 'emerald')
})
s = await state()
check('the cache persists and returns its items', s.gifts.emerald >= 1, `emeralds ${s.gifts.emerald}`)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.campStore('gift', 'emerald')
  window.__ui.getState().setDialog(null)
})

// --- A robbery destroys the region's village caches ---------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddEquipment('rifle')
  g.robVillage()
})
await page.waitForTimeout(200)
s = await state()
check(
  'the robbery irretrievably destroys the village caches of the region',
  s.villageCamps['nubian-village'] === undefined && s.regionRobbed.north === true,
  '',
)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
