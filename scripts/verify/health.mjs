// Headless verification for CLAUDE.md §7.1.22 (health & afflictions,
// design.md §6/§15): drains and regeneration, automatic dehydration in the
// desert without a canteen, sun-blindness veil and recovery, medicine cure,
// death with remains report and successor, vultures at poor condition, and
// the health query (H). Dev server only (dev hooks).
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
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  // Keep this suite deterministic: random events are covered by events.mjs.
  window.__balance.randomEventsEnabled = false
})

const g = (fn) => page.evaluate(fn)
const journalKeys = () =>
  page.evaluate(() => window.__game.getState().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))
const walk = async (n, dx = 0, dz = -1) => {
  await page.evaluate(
    ([steps, x, z]) => {
      for (let i = 0; i < steps; i++) window.__game.getState().moveTravel(x, z, 0.05)
    },
    [n, dx, dz],
  )
}

// --- Defaults -----------------------------------------------------------------
const init = await g(() => ({ health: window.__game.getState().health, a: window.__game.getState().afflictions }))
check('start: full health, no afflictions', init.health === 100 && !init.a.fever && !init.a.dehydration, `${init.health}`)

// --- Dehydration in the desert without a canteen (auto onset/recovery) --------
await g(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
await g(() => window.__game.getState().debugJumpTo(25.5, 27.0)) // deep Sahara
await page.waitForTimeout(800)
await walk(40)
const dehydrated = await g(() => ({
  a: window.__game.getState().afflictions.dehydration,
  health: window.__game.getState().health,
}))
check('desert without canteen: dehydration sets in', dehydrated.a === true, '')
check('dehydration drains health', dehydrated.health < 100, `${dehydrated.health.toFixed(1)}`)
check('journal reports the thirst', (await journalKeys()).includes('journal.dehydrationOn'), '')

await g(() => window.__game.getState().debugAddEquipment('canteen'))
await walk(10)
const rehydrated = await g(() => window.__game.getState().afflictions.dehydration)
check('canteen ends the dehydration', rehydrated === false, '')
check('journal reports the recovery', (await journalKeys()).includes('journal.dehydrationOver'), '')

// --- Regeneration while fed and affliction-free -------------------------------
await g(() => window.__game.getState().debugSet({ health: 50, foodDays: 30 }))
await walk(20)
const regen = await g(() => window.__game.getState().health)
check('health regenerates while fed and affliction-free', regen > 50, `${regen.toFixed(1)}`)

// --- Fever: heavy drain, cured by medicine ------------------------------------
await g(() => {
  window.__game.getState().debugSet({ health: 80 })
  window.__game.getState().debugSetAffliction('fever', true)
})
await walk(20)
const fevered = await g(() => window.__game.getState().health)
check('fever drains health', fevered < 80, `${fevered.toFixed(1)}`)
await g(() => window.__game.getState().debugAddEquipment('medicine'))
const medBefore = await g(() => window.__game.getState().equipment.medicine)
await g(() => window.__game.getState().useMedicine())
const cured = await g(() => ({
  fever: window.__game.getState().afflictions.fever,
  med: window.__game.getState().equipment.medicine,
}))
check('medicine cures the fever and is consumed', cured.fever === false && cured.med === medBefore - 1, '')
check('journal reports the medicine', (await journalKeys()).includes('journal.medicineUsed'), '')

// --- Sun blindness: veil + recovery outside the desert -------------------------
await g(() => window.__game.getState().debugSetAffliction('sunblind', true))
await page.waitForTimeout(300)
check('sun blindness narrows the view (veil)', (await page.locator('.sunblind-veil').count()) === 1, '')
await g(() => window.__game.getState().debugJumpTo(-1.5, 34.5)) // savanna, outside the desert
await page.waitForTimeout(600)
await walk(60)
const sighted = await g(() => window.__game.getState().afflictions.sunblind)
check('sun blindness heals outside the desert', sighted === false, '')
check('veil is gone after recovery', (await page.locator('.sunblind-veil').count()) === 0, '')

// --- Vultures at poor condition (design.md §19) --------------------------------
await g(() => window.__game.getState().debugSet({ health: 20 }))
await page.waitForTimeout(600)
const vultures = await g(() => window.__vultures?.player.current?.visible)
check('vultures circle at poor condition', vultures === true, '')
await g(() => window.__game.getState().debugSet({ health: 90 }))

// --- Health query (H) -----------------------------------------------------------
await g(() => {
  window.__game.getState().debugSetAffliction('wounds', 1)
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
})
await page.waitForTimeout(300)
const toast = await g(() => window.__game.getState().toast)
check('health query reports state and afflictions', typeof toast === 'string' && toast.includes('I feel'), toast ?? '')
await g(() => window.__game.getState().debugSetAffliction('wounds', 0))

// --- Death: remains report, journal silent, successor --------------------------
// Create a checkpoint first (re-enter Cairo), then die in the field.
await g(() => window.__game.getState().enterPlace('cairo'))
await page.waitForTimeout(1500)
await g(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1000)
const entriesBeforeDeath = await g(() => window.__game.getState().journal.length)
await g(() => {
  window.__game.getState().debugSet({ health: 3 })
  window.__game.getState().debugSetAffliction('wounds', 2)
})
await walk(30)
const dead = await g(() => ({
  defeat: window.__game.getState().defeat,
  cause: window.__game.getState().deathCause,
  open: window.__game.getState().journalOpen,
  entries: window.__game.getState().journal.length,
}))
check('zero health loses the expedition', dead.defeat === 'death', `cause: ${dead.cause}`)
check('the journal falls silent on death', dead.open === false && dead.entries <= entriesBeforeDeath + 1, '')
await page.waitForTimeout(400)
const overlayText = await page.evaluate(() => document.querySelector('.overlay.defeat')?.textContent ?? '')
check('remains report names the cause', overlayText.includes('remains') && overlayText.includes('wounds'), '')
await page.screenshot({ path: `${OUT}78-health-remains-report.png` })
console.log('shot 78-health-remains-report.png')

const successorVisible = await page.evaluate(() =>
  [...document.querySelectorAll('.overlay.defeat button')].some((b) => b.textContent?.includes('successor')),
)
check('successor can take over from the checkpoint', successorVisible, '')
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.overlay.defeat button')].find((b) => b.textContent?.includes('successor'))
  btn?.click()
})
await page.waitForTimeout(800)
const revived = await g(() => ({
  defeat: window.__game.getState().defeat,
  health: window.__game.getState().health,
  place: window.__game.getState().placeId,
}))
check(
  'successor continues in Cairo with the checkpoint health',
  revived.defeat === null && revived.health >= 40 && revived.place === 'cairo',
  `health ${revived.health}`,
)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
