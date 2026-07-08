// Headless verification for CLAUDE.md §7.1.26 (standing with the natives,
// design.md §12/§7): rifle blockade, hostility/expulsion, "Honored Friend"
// with protection/aid/supplies, and the permanent robbery consequences.
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
await page.waitForFunction(() => window.__game && window.__balance && window.__events, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false // deterministic
})

const state = () => page.evaluate(() => window.__game.getState())
const journalKeys = () =>
  page.evaluate(() => window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))

const rep = await page.evaluate(() => window.__balance.reputation)
check(
  'reputation balance block present',
  rep && rep.goodwillForFriend > 0 && rep.hostilityDays > 0 && rep.friendProtectRadiusDeg > 0,
  JSON.stringify(rep),
)

// --- Rifle no longer blocks the village (design.md §12) ----------------------
// Item effects are possession-based now (no "drawing"): merely owning a rifle
// does not make the villagers flee — the elder still teaches and the chief
// still holds audience; the rifle instead enables the robbery action.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.debugAddEquipment('rifle')
  g.debugAddGift('gold')
  g.enterPlace('nubian-village')
})
await page.evaluate(() => window.__game.getState().talkToVillager())
let s = await state()
check('a rifle in the pack does not block the elder talk', s.languagesLearned.north === true, `"${s.toast}"`)
await page.evaluate(() => window.__game.getState().giveGift('gold'))
s = await state()
check('a rifle in the pack does not block the audience', (s.goodwill['nubian-village'] ?? 0) > 0, '')
// Stay in the village for the hostility test below.

// --- Hostility and expulsion --------------------------------------------------------
// Silver is rejected in the north: the gift gets the traveler thrown out.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddGift('silver')
  g.giveGift('silver')
})
await page.waitForTimeout(200)
s = await state()
let keys = await journalKeys()
check(
  'a rejected gift means expulsion',
  s.mode === 'travel' && keys.includes('journal.giftRejected'),
  `mode ${s.mode}`,
)
check(
  'the village turns hostile for a period',
  (s.hostileUntil['nubian-village'] ?? 0) > s.day && (s.goodwill['nubian-village'] ?? 0) === 0,
  `until day ${s.hostileUntil['nubian-village']?.toFixed(0)}`,
)
await page.evaluate(() => {
  const g = window.__game.getState()
  window.__game.setState({ gifts: { ...g.gifts, gold: 1 } })
  g.enterPlace('nubian-village')
  window.__game.getState().giveGift('gold')
})
s = await state()
check('the hostile chief refuses gifts', s.gifts.gold === 1 && (s.goodwill['nubian-village'] ?? 0) === 0, `"${s.toast}"`)
await page.evaluate(() => {
  const g = window.__game.getState()
  window.__game.setState({ gifts: { ...g.gifts, gold: 1 } })
  g.debugSet({ day: g.day + window.__balance.reputation.hostilityDays + 1 })
  window.__game.getState().giveGift('gold')
})
s = await state()
check('hostility wears off after the period', s.gifts.gold === 0 && (s.goodwill['nubian-village'] ?? 0) > 0, '')

// --- Honored Friend: pledge fires exactly once ---------------------------------------
await page.evaluate((need) => {
  const g = window.__game.getState()
  for (let i = 0; i < need + 2; i++) {
    g.debugAddGift('gold')
    g.giveGift('gold')
  }
}, rep.goodwillForFriend)
s = await state()
keys = await journalKeys()
check(
  'repeated revered gifts bestow "Honored Friend" once',
  s.honoredFriend.north === true && keys.filter((k) => k === 'journal.friendPledge').length === 1,
  `goodwill ${s.goodwill['nubian-village']}`,
)

// --- Protection near the region's villages -------------------------------------------
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(400)
// Standing right beside the Nubian village: every attack ends harmless.
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => window.__game.getState().debugTriggerEvent('lionAttack'))
}
s = await state()
keys = await journalKeys()
check(
  'friend protection caps attacks at light injuries',
  s.defeat === null && s.afflictions.wounds <= 1,
  `wounds ${s.afflictions.wounds}`,
)
check('rescues are told as journal entries', keys.includes('journal.friendRescue'), '')
await page.evaluate(() => window.__game.getState().debugTriggerEvent('robberAttack'))
keys = await journalKeys()
check('robbers are driven off by the natives', keys.includes('journal.friendRescueRobbers'), '')

// --- Near-death aid --------------------------------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSet({ health: 20, foodDays: 1 })
  g.debugSetAffliction('wounds', 2)
  g.moveTravel(0, -1, 0.05)
})
s = await state()
keys = await journalKeys()
check(
  'villagers hurry over with food and medicine near death',
  keys.includes('journal.friendAid') && s.foodDays >= 7 && s.afflictions.wounds === 0,
  `food ${s.foodDays.toFixed(1)}`,
)

// --- Free supplies in the region's villages ----------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSet({ foodDays: 2 })
  g.enterPlace('tuareg-village') // same region (north), friend status applies
})
s = await state()
keys = await journalKeys()
check(
  'friend villages hand out provisions and medicine',
  s.foodDays >= rep.friendVillageFoodDays && (s.equipment.medicine ?? 0) >= 1 && keys.includes('journal.friendSupplies'),
  `food ${s.foodDays.toFixed(0)}, medicine ${s.equipment.medicine}`,
)

// --- Robbery: permanent regional loss ------------------------------------------------------
const giftsBefore = await page.evaluate(() => {
  const g = window.__game.getState()
  return Object.values(g.gifts).reduce((a, b) => a + b, 0)
})
await page.evaluate(() => window.__game.getState().robVillage())
await page.waitForTimeout(200)
s = await state()
keys = await journalKeys()
const giftsAfter = Object.values(s.gifts).reduce((a, b) => a + b, 0)
check(
  'the robbery loots goods and expels the robber',
  s.mode === 'travel' && giftsAfter > giftsBefore && keys.includes('journal.robberyCommitted'),
  `gifts ${giftsBefore} → ${giftsAfter}`,
)
check(
  'the region is antagonized and the friendship forfeited',
  s.regionRobbed.north === true && s.honoredFriend.north === false && s.friendForfeited.north === true,
  '',
)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.enterPlace('nubian-village')
  g.talkToVillager()
})
s = await state()
check('no hut of the robbed region opens again', s.giftLoreGiven.north === undefined && !!s.toast, `"${s.toast}"`)
// The friendship can never be re-earned (design.md §12: irretrievable).
await page.evaluate((need) => {
  const g = window.__game.getState()
  for (let i = 0; i < need + 2; i++) {
    g.debugAddGift('gold')
    g.giveGift('gold')
  }
}, rep.goodwillForFriend)
s = await state()
check('the forfeited friendship cannot be re-earned', s.honoredFriend.north !== true, '')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
