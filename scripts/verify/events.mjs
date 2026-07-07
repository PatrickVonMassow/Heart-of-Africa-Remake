// Headless verification for CLAUDE.md §7.1.23 (random events, design.md
// §14): protection logic of the hand item (rifle > machete, in hand >
// carried, wet rifle useless without the canoe), event outcomes (wounds,
// theft, afflictions, sandstorm time loss, waterfall sweep with inventory
// loss, fatal attacks), the debug triggers (§21), and that disabling the
// events stops them. Dev server only (dev hooks).
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
await page.waitForFunction(() => window.__game && window.__events, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// === Pure protection logic (design.md §7/§14) =================================
const prot = await page.evaluate(() => {
  const { weaponProtection, eventChance } = window.__events
  const ctx = (over) => ({
    terrain: 'savanna', inWater: false, nearWaterfall: false, wetland: false,
    hand: null, equipment: {}, ...over,
  })
  return {
    none: weaponProtection(ctx({})),
    macheteCarried: weaponProtection(ctx({ equipment: { machete: 1 } })),
    macheteHand: weaponProtection(ctx({ equipment: { machete: 1 }, hand: 'machete' })),
    rifleCarried: weaponProtection(ctx({ equipment: { rifle: 1 } })),
    rifleHand: weaponProtection(ctx({ equipment: { rifle: 1 }, hand: 'rifle' })),
    wetRifle: weaponProtection(ctx({ equipment: { rifle: 1 }, hand: 'rifle', inWater: true })),
    wetRifleWithMachete: weaponProtection(ctx({ equipment: { rifle: 1, machete: 1 }, inWater: true })),
    rifleInCanoe: weaponProtection(ctx({ equipment: { rifle: 1 }, hand: 'canoe', inWater: true })),
    crocNoHelp: eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true })),
    crocMachete: eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true, equipment: { machete: 1 } })),
    crocCanoeRifle: eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true, equipment: { rifle: 1 }, hand: 'canoe' })),
  }
})
check(
  'protection order: none > machete carried > machete in hand',
  prot.none > prot.macheteCarried && prot.macheteCarried > prot.macheteHand,
  `${prot.none}/${prot.macheteCarried}/${prot.macheteHand}`,
)
check(
  'protection order: rifle beats machete, in hand beats carried',
  prot.rifleCarried < prot.macheteCarried && prot.rifleHand < prot.rifleCarried,
  `${prot.rifleCarried}/${prot.rifleHand}`,
)
check('wet rifle is useless without the canoe', prot.wetRifle === 1, `${prot.wetRifle}`)
check('in the water the machete still helps', prot.wetRifleWithMachete < 1, `${prot.wetRifleWithMachete}`)
check('in the canoe the rifle works normally', prot.rifleInCanoe < prot.wetRifleWithMachete, `${prot.rifleInCanoe}`)
check(
  'crocodile risk: bare > machete > rifle-in-canoe',
  prot.crocNoHelp > prot.crocMachete && prot.crocMachete > prot.crocCanoeRifle,
  `${prot.crocNoHelp}/${prot.crocMachete}/${prot.crocCanoeRifle}`,
)

// Deterministic outcome mapping via injected rand.
const outcomes = await page.evaluate(() => {
  const { resolveEvent } = window.__events
  const ctx = { terrain: 'savanna', inWater: false, nearWaterfall: false, wetland: false, hand: 'rifle', equipment: { rifle: 1 } }
  const noWeapon = { ...ctx, hand: null, equipment: {} }
  return {
    deterred: resolveEvent('robberAttack', ctx, () => 0.1).result,
    robbed: resolveEvent('robberAttack', noWeapon, () => 0.6).result,
    defended: resolveEvent('lionAttack', ctx, () => 0.1).result,
    escapedBare: resolveEvent('lionAttack', noWeapon, () => 0.1).result,
  }
})
check('rifle in hand deters robbers', outcomes.deterred === 'deterred', outcomes.deterred)
check('unarmed traveller gets robbed', outcomes.robbed === 'robbed', outcomes.robbed)
check('weapon turns escape into an active defense', outcomes.defended === 'defended' && outcomes.escapedBare === 'escaped', '')

// === Debug triggers apply real consequences (§21) ==============================
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)

const journalKeys = () =>
  page.evaluate(() => window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))

// Fever event afflicts and reports.
await page.evaluate(() => window.__game.getState().debugTriggerEvent('fever'))
check('fever event afflicts', await page.evaluate(() => window.__game.getState().afflictions.fever), '')
check('fever event reports in the journal', (await journalKeys()).includes('journal.feverOn'), '')
await page.evaluate(() => {
  window.__game.getState().debugSetAffliction('fever', false)
  window.__game.getState().setJournalOpen(false)
})

// Sandstorm costs time.
const dayBefore = await page.evaluate(() => window.__game.getState().day)
await page.evaluate(() => window.__game.getState().debugTriggerEvent('sandstorm'))
const dayAfter = await page.evaluate(() => window.__game.getState().day)
check('sandstorm costs time', dayAfter > dayBefore, `+${(dayAfter - dayBefore).toFixed(2)} days`)

// Waterfall sweep halves the gifts and wounds the traveller.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddGift('copper')
  g.debugAddGift('copper')
})
const giftsBefore = await page.evaluate(() => ({ ...window.__game.getState().gifts }))
await page.evaluate(() => window.__game.getState().debugTriggerEvent('waterfallSweep'))
const swept = await page.evaluate(() => ({
  gifts: window.__game.getState().gifts,
  wounds: window.__game.getState().afflictions.wounds,
}))
check(
  'waterfall sweep costs a large part of the inventory',
  swept.gifts.copper === Math.floor(giftsBefore.copper / 2) && swept.wounds >= 1,
  `copper ${giftsBefore.copper} -> ${swept.gifts.copper}, wounds ${swept.wounds}`,
)
check('waterfall sweep reports in the journal', (await journalKeys()).includes('journal.sweptAway'), '')
await page.evaluate(() => {
  window.__game.getState().debugSetAffliction('wounds', 0)
  window.__game.getState().setJournalOpen(false)
})

// Robbery steals money (loop until a robbed outcome, unarmed).
const robbed = await page.evaluate(() => {
  const g = () => window.__game.getState()
  const before = g().money
  for (let i = 0; i < 60; i++) {
    g().debugTriggerEvent('robberAttack')
    if (g().money < before) return { ok: true, before, after: g().money }
  }
  return { ok: false, before, after: g().money }
})
check('robbers steal money', robbed.ok, `$${robbed.before} -> $${robbed.after}`)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// A lion attack can end fatally: the remains report takes over (§15).
const fatal = await page.evaluate(() => {
  const g = () => window.__game.getState()
  for (let i = 0; i < 400 && !g().defeat; i++) g().debugTriggerEvent('lionAttack')
  return { defeat: g().defeat, cause: g().deathCause }
})
check('an attack can end fatally (eaten)', fatal.defeat === 'death' && fatal.cause === 'eaten', `${fatal.cause}`)
await page.evaluate(() => window.__game.getState().newGame())
await page.waitForTimeout(1500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// === Events fire on their own while travelling — and stop when disabled ======
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
const eventKeys = [
  'journal.animalAttack', 'journal.robbery', 'journal.feverOn', 'journal.sunblindOn',
  'journal.sandstorm', 'journal.sweptAway', 'journal.findRemains',
]
const countEvents = async () => {
  const keys = await journalKeys()
  return keys.filter((k) => eventKeys.includes(k)).length
}
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8)) // savanna
await page.waitForTimeout(800)
const before = await countEvents()
await page.evaluate(() => {
  const g = () => window.__game.getState()
  // The rope in hand keeps stray highland hills on the roundtrip passable
  // (design.md §11 mountain rule) so travel days actually accrue.
  g().debugAddEquipment('rope')
  g().takeInHand('rope')
  for (let i = 0; i < 900; i++) {
    g().moveTravel(i % 200 < 100 ? 0 : 0.3, i % 100 < 50 ? -1 : 1, 0.05)
    g().debugSet({ foodDays: 30, health: 100 })
  }
})
const rolled = (await countEvents()) - before
check('events fire on their own while travelling', rolled >= 1, `${rolled} events over ~70 days`)

await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
})
const before2 = await countEvents()
await page.evaluate(() => {
  const g = () => window.__game.getState()
  for (let i = 0; i < 900; i++) {
    g().moveTravel(i % 200 < 100 ? 0 : 0.3, i % 100 < 50 ? -1 : 1, 0.05)
    g().debugSet({ foodDays: 30, health: 100 })
  }
})
const rolledDisabled = (await countEvents()) - before2
check('disabled events stay silent', rolledDisabled === 0, `${rolledDisabled}`)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = true
})

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
