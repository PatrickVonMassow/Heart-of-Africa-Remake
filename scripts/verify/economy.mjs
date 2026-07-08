// Headless verification for CLAUDE.md §7.1.25 (trade economy, design.md
// §8/§9/§10): inventory capacity, bazaar bid mechanic with regional factors,
// ferry passages (Zanzibar reachable), discovery bounties, elephant-graveyard
// ivory, buried treasure caches and the visible-valuable reactions.
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
await page.waitForFunction(() => window.__game && window.__balance && window.__economy, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false // deterministic
})

const state = () => page.evaluate(() => window.__game.getState())
const journalKeys = () =>
  page.evaluate(() => window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))

// --- Config and procedural placement --------------------------------------------
const eco = await page.evaluate(() => window.__balance.economy)
check('economy balance block present', eco && eco.treasureBase.statue > 0 && eco.reveredFactor > 1, '')
const cap0 = await page.evaluate(() => window.__balance.inventoryCapacity)
check('inventory capacity configured', cap0 > 0, `${cap0}`)

let s = await state()
check(
  'treasure caches: one per region plus a statue site',
  s.treasureSites.length === 6 && s.treasureSites.filter((x) => x.treasure === 'statue').length === 1,
  `${s.treasureSites.length} sites`,
)

// --- Regional factors (pure) ------------------------------------------------------
const factors = await page.evaluate(() => ({
  reveredGoldNorth: window.__economy.regionalFactor('gold', 'north'),
  neutralGoldWest: window.__economy.regionalFactor('gold', 'west'),
  rejectedGoldCentral: window.__economy.regionalFactor('gold', 'central'),
  statueAnywhere: window.__economy.regionalFactor('statue', 'central'),
}))
check(
  'regional value factors: revered > neutral, rejected refused',
  factors.reveredGoldNorth > factors.neutralGoldWest && factors.rejectedGoldCentral === null,
  JSON.stringify(factors),
)
check('the statue is coveted everywhere', factors.statueAnywhere > 1, '')

// --- Bazaar: offer → bid → accept, and the regional rejection ---------------------
// Cairo (north): gold is revered, silver rejected.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddTreasure('gold')
  g.debugAddTreasure('silver')
})
const moneyBefore = (await state()).money
await page.evaluate(() => window.__game.getState().offerTreasure('gold'))
const bid = await page.evaluate(() => window.__ui.getState().bazaarBid)
check('offering a revered treasure yields a bid', bid !== null && bid.amount > 0, `bid ${bid?.amount} $`)
await page.evaluate(() => window.__game.getState().acceptBid())
s = await state()
check(
  'accepting the bid pays out and hands over the treasure',
  s.money === moneyBefore + bid.amount && s.treasures.gold === 0,
  `money ${s.money}`,
)
await page.evaluate(() => window.__game.getState().offerTreasure('silver'))
const rejectedBid = await page.evaluate(() => window.__ui.getState().bazaarBid)
const rejectToast = (await state()).toast
check('a rejected material draws no bid', rejectedBid === null && !!rejectToast, `"${rejectToast}"`)

// Decline path: the bid disappears, nothing is traded.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddTreasure('emerald')
  g.offerTreasure('emerald')
})
const firstEmeraldBid = await page.evaluate(() => window.__ui.getState().bazaarBid?.amount)
await page.evaluate(() => window.__game.getState().declineBid())
s = await state()
check(
  'declining keeps the treasure',
  s.treasures.emerald === 1 && (await page.evaluate(() => window.__ui.getState().bazaarBid)) === null,
  '',
)

// Stable re-offer price (design.md §10): re-offering the same treasure at the
// same port shows the identical quote instead of a freshly rolled one.
const reBids = await page.evaluate(() => {
  const g = window.__game.getState()
  const amounts = []
  for (let i = 0; i < 6; i++) {
    g.offerTreasure('emerald')
    amounts.push(window.__ui.getState().bazaarBid?.amount)
    g.declineBid()
  }
  return amounts
})
check(
  're-offering the same treasure shows the identical price',
  firstEmeraldBid > 0 && reBids.every((a) => a === firstEmeraldBid),
  `first ${firstEmeraldBid}, re-offers ${reBids.join('/')}`,
)
// The quote is cached per port and clears on leaving; re-enter to continue.
const quoteLife = await page.evaluate(() => {
  const g = window.__game.getState()
  const cached = g.bazaarQuotes.emerald
  g.leavePlace()
  const afterLeave = Object.keys(window.__game.getState().bazaarQuotes).length
  window.__game.getState().enterPlace('cairo')
  const afterEnter = Object.keys(window.__game.getState().bazaarQuotes).length
  return { cached, afterLeave, afterEnter }
})
check(
  'the bazaar quote is cached per port and cleared on leaving',
  quoteLife.cached === firstEmeraldBid && quoteLife.afterLeave === 0 && quoteLife.afterEnter === 0,
  JSON.stringify(quoteLife),
)

// Buying at the bazaar (arbitrage leg).
await page.evaluate(() => window.__game.getState().debugSet({ money: 1000 }))
const buyPrice = await page.evaluate(() => window.__economy.treasureBuyPrice('copper', 'north'))
await page.evaluate(() => window.__game.getState().buyTreasure('copper'))
s = await state()
check('buying a treasure at the bazaar', s.treasures.copper === 1 && s.money === 1000 - buyPrice, `${buyPrice} $`)

// --- Inventory capacity ------------------------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  const used =
    Object.values(g.equipment).reduce((a, b) => a + (b ?? 0), 0) +
    Object.values(g.gifts).reduce((a, b) => a + b, 0) +
    Object.values(g.treasures).reduce((a, b) => a + b, 0)
  window.__balance.inventoryCapacity = used // pack is now exactly full
})
const moneyFull = (await state()).money
const capFull = await page.evaluate(() => window.__balance.inventoryCapacity)
await page.evaluate(() => window.__game.getState().buy('rope'))
s = await state()
check('a full pack refuses purchases', (s.equipment.rope ?? 0) === 0 && s.money === moneyFull, `"${s.toast}"`)
await page.evaluate(() => window.__game.getState().debugAddTreasure('gold'))
const capAfter = await page.evaluate(() => window.__balance.inventoryCapacity)
s = await state()
check('debug adds auto-raise the capacity', s.treasures.gold === 1 && capAfter === capFull + 1, `capacity ${capFull} → ${capAfter}`)
await page.evaluate(() => (window.__balance.inventoryCapacity = 60))

// --- Ferry: Cairo → Zanzibar --------------------------------------------------------
const ferryQuote = await page.evaluate(() => {
  const from = { lat: 30.05, lon: 31.45 }
  const to = { lat: -6.16, lon: 39.3 }
  return { cost: window.__economy.ferryCost(from, to), days: window.__economy.ferryDays(from, to) }
})
const before = await state()
await page.evaluate(() => window.__game.getState().bookFerry('zanzibar'))
await page.waitForTimeout(400)
s = await state()
check(
  'ferry passage reaches Zanzibar',
  s.placeId === 'zanzibar' && s.mode === 'place',
  `at ${s.placeId}`,
)
check(
  'the passage costs fare and days',
  Math.abs(s.day - (before.day + ferryQuote.days)) < 0.01 && s.money <= before.money - ferryQuote.cost,
  `${ferryQuote.cost} $, ${ferryQuote.days} days`,
)
let keys = await journalKeys()
check('the passage writes a journal entry', keys.includes('journal.ferry'), '')
check('arrival in the port saves the checkpoint', keys.includes('journal.portArrival') && s.hasCheckpoint === true, '')

// --- Discovery bounties --------------------------------------------------------------
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(600)
// Sight Kilimanjaro (landmark), then first-visit the Masai village. A rope
// in hand keeps the massif climbable (design.md §11).
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddEquipment('rope')
  g.takeInHand('rope')
  g.debugJumpTo(-3.35, 37.35)
})
await page.evaluate(() => {
  for (let i = 0; i < 3; i++) window.__game.getState().moveTravel(0, -1, 0.03)
})
s = await state()
check('sighting a landmark registers it', s.landmarksSeen.includes('kilimanjaro'), s.landmarksSeen.join(','))
await page.evaluate(() => window.__game.getState().enterPlace('masai-village'))
await page.waitForTimeout(300)
s = await state()
const pendingKinds = s.pendingBounties.map((b) => b.kind).sort()
check(
  'village visit and landmark await their bounty',
  pendingKinds.includes('landmark') && pendingKinds.includes('village'),
  JSON.stringify(s.pendingBounties),
)
const expectedBounty = s.pendingBounties.reduce(
  (sum, b) => sum + (b.kind === 'village' ? eco.bountyVillage : eco.bountyLandmark),
  0,
)
const moneyPreBounty = s.money
await page.evaluate(() => window.__game.getState().leavePlace())
await page.evaluate(() => window.__game.getState().enterPlace('zanzibar'))
await page.waitForTimeout(300)
s = await state()
keys = await journalKeys()
check(
  'bounties are credited on the next port visit',
  s.money === moneyPreBounty + expectedBounty && s.pendingBounties.length === 0 && keys.includes('journal.bounty'),
  `+${expectedBounty} $`,
)

// --- Elephant graveyard ivory ---------------------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.debugAddEquipment('shovel')
  g.takeInHand('shovel')
})
await page.evaluate(() => window.__game.getState().debugJumpTo(-4.9, 36.6))
const ivory0 = (await state()).treasures.ivory
const supply = await page.evaluate(() => window.__game.getState().graveyardIvoryLeft)
for (let i = 0; i < supply; i++) await page.evaluate(() => window.__game.getState().dig())
s = await state()
keys = await journalKeys()
check(
  'the graveyard yields its limited ivory',
  s.treasures.ivory === ivory0 + supply && s.graveyardIvoryLeft === 0 && keys.includes('journal.ivoryFound'),
  `${supply} tusks`,
)
await page.evaluate(() => window.__game.getState().dig())
s = await state()
check('an exhausted graveyard yields nothing more', s.treasures.ivory === ivory0 + supply && !!s.toast, `"${s.toast}"`)

// --- Buried treasure caches -------------------------------------------------------------
const statueSite = s.treasureSites.find((x) => x.treasure === 'statue')
await page.evaluate(
  ([lat, lon]) => window.__game.getState().debugJumpTo(lat, lon),
  [statueSite.lat, statueSite.lon],
)
await page.evaluate(() => window.__game.getState().dig())
s = await state()
keys = await journalKeys()
check(
  'digging the statue cache recovers the statue',
  s.treasures.statue === 1 && s.treasureSites.find((x) => x.treasure === 'statue').dug === true
    && keys.includes('journal.treasureFound'),
  `${statueSite.lat}, ${statueSite.lon}`,
)

// --- Visible valuable reactions (design.md §8) --------------------------------------------
// North reveres gold, rejects silver.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddTreasure('gold')
  g.takeInHand('gold')
  g.enterPlace('nubian-village')
})
await page.waitForTimeout(200)
s = await state()
keys = await journalKeys()
check(
  'a revered valuable in hand creates goodwill',
  keys.includes('journal.valuableRevered') && (s.goodwill['nubian-village'] ?? 0) > 0,
  `goodwill ${s.goodwill['nubian-village']}`,
)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.debugAddTreasure('silver')
  g.takeInHand('silver')
  g.enterPlace('tuareg-village')
})
await page.waitForTimeout(200)
keys = await journalKeys()
check('a rejected valuable in hand provokes the negative reaction', keys.includes('journal.valuableRejected'), '')

// --- Village trade in gifts (design.md §9/§10, points 4/5) --------------------
// Every settlement offers the baseline goods; villages pay in gifts, not money.
const villageGoods = await page.evaluate(async () => {
  const store = await import('/src/state/store.ts')
  return store.VILLAGE_TRADE_GOODS
})
check(
  'every settlement sells food, machete, shovel and medicine',
  ['food', 'machete', 'shovel', 'medicine'].every((g) => villageGoods.includes(g)),
  villageGoods.join(','),
)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.takeInHand(null)
  g.leavePlace()
  window.__game.setState({ gifts: { gold: 0, silver: 0, emerald: 0, copper: 6, ivory: 0 }, money: 500 })
  g.enterPlace('nubian-village') // North village → currency is gifts
})
await page.waitForTimeout(200)
// The village trading post opens a trade dialog priced in gifts.
await page.evaluate(() => window.__ui.getState().setDialog({ kind: 'trade', building: 'market' }))
await page.waitForTimeout(200)
const villageDialog = await page.evaluate(() => {
  const txt = document.querySelector('.dialog')?.textContent ?? ''
  return { txt, hasGifts: /Gaben|gifts/i.test(txt), hasDollar: txt.includes('$') }
})
check('the village trade dialog prices goods in gifts, not money', villageDialog.hasGifts && !villageDialog.hasDollar, `"${villageDialog.txt.slice(0, 60)}"`)

const vBuy = await page.evaluate(() => {
  const g = () => window.__game.getState()
  const before = { gifts: g().gifts.copper, food: g().foodDays, money: g().money }
  g().buy('food') // costs 1 gift, +7 food, money unchanged
  const afterFood = { gifts: g().gifts.copper, food: g().foodDays, money: g().money }
  g().buy('machete') // costs gifts, gear +1
  const machete = g().equipment.machete ?? 0
  return { before, afterFood, machete }
})
check(
  'buying food in a village spends gifts and leaves money untouched',
  vBuy.afterFood.gifts === vBuy.before.gifts - 1 && vBuy.afterFood.food === vBuy.before.food + 7 && vBuy.afterFood.money === vBuy.before.money,
  `gifts ${vBuy.before.gifts}→${vBuy.afterFood.gifts}, money ${vBuy.afterFood.money}`,
)
check('buying gear in a village works (machete acquired)', vBuy.machete >= 1, `${vBuy.machete}`)

const vSell = await page.evaluate(() => {
  const g = () => window.__game.getState()
  const giftsBefore = window.__store_totalGifts ? 0 : Object.values(g().gifts).reduce((a, b) => a + b, 0)
  const machBefore = g().equipment.machete ?? 0
  g().sellItem('machete') // village → paid in gifts
  const giftsAfter = Object.values(g().gifts).reduce((a, b) => a + b, 0)
  return { giftsBefore, giftsAfter, machBefore, machAfter: g().equipment.machete ?? 0, money: g().money }
})
check(
  'selling gear in a village pays in gifts (not money)',
  vSell.giftsAfter > vSell.giftsBefore && vSell.machAfter === vSell.machBefore - 1,
  `gifts ${vSell.giftsBefore}→${vSell.giftsAfter}`,
)

// Not enough gifts → refused with the gift-currency notice.
const refusedGifts = await page.evaluate(() => {
  const g = window.__game.getState()
  window.__game.setState({ gifts: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0 } })
  g.setToast(null)
  window.__game.getState().buy('machete')
  return { food: window.__game.getState().equipment.machete, toast: window.__game.getState().toast }
})
check('a village purchase without gifts is refused', !!refusedGifts.toast && /Gaben|gifts/i.test(refusedGifts.toast), `"${refusedGifts.toast}"`)

// In a port, selling gear pays money.
const pSell = await page.evaluate(() => {
  const g = () => window.__game.getState()
  g().leavePlace()
  g().enterPlace('cairo')
  window.__game.setState({ money: 200 })
  g().debugAddEquipment('machete')
  const before = g().money
  g().sellItem('machete')
  return { before, after: g().money }
})
check('selling gear in a port pays money', pSell.after > pSell.before, `money ${pSell.before}→${pSell.after}`)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
