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

// === Reduced event rates (design.md §14, user calibration ÷5) ================
const rates = await page.evaluate(() => ({ ...window.__balance.events }))
check(
  'event rates reduced by a factor of 5',
  Math.abs(rates.animalAttack - 0.004) < 1e-9 &&
    Math.abs(rates.robberAttack - 0.002) < 1e-9 &&
    Math.abs(rates.waterfallSweep - 0.024) < 1e-9 &&
    Math.abs(rates.crocodile - 0.012) < 1e-9,
  `animal ${rates.animalAttack}, robber ${rates.robberAttack}, falls ${rates.waterfallSweep}`,
)

// === Pure protection logic (design.md §7/§14) =================================
// Effects are possession-based: a rifle in the pack cuts risk most, a machete
// less; in water the rifle only works from a canoe, else it is wet.
const prot = await page.evaluate(() => {
  const { weaponProtection, eventChance } = window.__events
  const ctx = (over) => ({
    terrain: 'savanna', inWater: false, nearWaterfall: false, wetland: false,
    equipment: {}, ...over,
  })
  return {
    none: weaponProtection(ctx({})),
    machete: weaponProtection(ctx({ equipment: { machete: 1 } })),
    rifle: weaponProtection(ctx({ equipment: { rifle: 1 } })),
    wetRifle: weaponProtection(ctx({ equipment: { rifle: 1 }, inWater: true })),
    wetRifleWithMachete: weaponProtection(ctx({ equipment: { rifle: 1, machete: 1 }, inWater: true })),
    rifleInCanoe: weaponProtection(ctx({ equipment: { rifle: 1, canoe: 1 }, inWater: true })),
    crocNoHelp: eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true })),
    crocMachete: eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true, equipment: { machete: 1 } })),
    crocCanoeRifle: eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true, equipment: { rifle: 1, canoe: 1 } })),
  }
})
check(
  'protection order: none > machete > rifle',
  prot.none > prot.machete && prot.machete > prot.rifle,
  `${prot.none}/${prot.machete}/${prot.rifle}`,
)
check('a rifle in the pack protects best', prot.rifle < prot.machete, `${prot.rifle}`)
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
  const ctx = { terrain: 'savanna', inWater: false, nearWaterfall: false, wetland: false, equipment: { rifle: 1 } }
  const noWeapon = { ...ctx, equipment: {} }
  return {
    deterred: resolveEvent('robberAttack', ctx, () => 0.1).result,
    robbed: resolveEvent('robberAttack', noWeapon, () => 0.6).result,
    defended: resolveEvent('lionAttack', ctx, () => 0.1).result,
    escapedBare: resolveEvent('lionAttack', noWeapon, () => 0.1).result,
  }
})
check('a rifle in the pack deters robbers', outcomes.deterred === 'deterred', outcomes.deterred)
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
  // Prove the autonomous-firing *mechanism* independent of the (now much
  // lower, ÷5) calibrated rate: raise the animal-attack rate high for this leg
  // so an event reliably fires over the travelled days despite the post-event
  // cooldown (the calibrated rate is asserted separately above).
  // Raise the robber rate high: unlike animal attacks (which need savanna/
  // jungle), a robbery can strike on any non-water land, so this is independent
  // of the per-run biome under the new seed and fires reliably.
  window.__balance.events.robberAttack = 0.8
  // Pin to solid inland East-African land (central Tanzania) so the roundtrip
  // stays on passable ground and travel days accrue (an ocean step rolls
  // nothing); the rope keeps any highland hill passable (design.md §11).
  g().debugJumpTo(-6, 35)
  g().debugAddEquipment('rope')
  for (let i = 0; i < 1300; i++) {
    g().moveTravel(i % 200 < 100 ? -0.4 : 0.4, i % 100 < 50 ? -1 : 1, 0.05)
    g().debugSet({ foodDays: 30, health: 100 })
  }
  window.__balance.events.robberAttack = 0.002
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
  g().debugJumpTo(-6, 35) // solid inland land, as above
  for (let i = 0; i < 1300; i++) {
    g().moveTravel(i % 200 < 100 ? -0.4 : 0.4, i % 100 < 50 ? -1 : 1, 0.05)
    g().debugSet({ foodDays: 30, health: 100 })
  }
})
const rolledDisabled = (await countEvents()) - before2
check('disabled events stay silent', rolledDisabled === 0, `${rolledDisabled}`)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = true
})

// --- Touching a lion triggers a lion attack (user request / design.md §14) ---
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8)) // savanna
await page.waitForFunction(() => window.__lionHunt && window.__lionHunt.state, null, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(600)
const lionTouch = await page.evaluate(async () => {
  const store = window.__game
  store.setState({ eventCooldown: 0, defeat: null, victory: false })
  store.getState().debugAddEquipment('rifle') // rifle in pack → rarely fatal
  const key = (e) => (typeof e.title === 'object' ? e.title.key : e.title)
  const attacksBefore = store.getState().journal.filter((e) => key(e) === 'journal.titles.attack').length
  // Drop the active lion right on top of the player so the frame loop detects
  // contact; keep it pinned each tick since it moves while chasing.
  const deadline = Date.now() + 10000
  return await new Promise((res) => {
    const iv = setInterval(() => {
      const g = store.getState()
      const pos = g.pos
      const s = window.__lionHunt?.state
      if (s) {
        s.predator = 'lion' // only the lion attacks on contact (design.md §14)
        s.mode = 'chase'
        s.timer = 5
        s.px = pos.x; s.pz = pos.z
        s.lx = pos.x; s.lz = pos.z
      }
      const attacksNow = g.journal.filter((e) => key(e) === 'journal.titles.attack').length
      const died = g.defeat === 'death'
      if (attacksNow > attacksBefore || died) {
        clearInterval(iv)
        res({ triggered: true, died, cooldown: g.eventCooldown })
      } else if (Date.now() > deadline) {
        clearInterval(iv)
        res({ triggered: false, died, cooldown: g.eventCooldown })
      }
    }, 80)
  })
})
check(
  'touching a lion triggers a lion attack',
  lionTouch.triggered && lionTouch.cooldown > 0,
  JSON.stringify(lionTouch),
)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
