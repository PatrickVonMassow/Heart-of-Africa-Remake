// Headless verification for CLAUDE.md §7.1.23 (random events): the browser-only
// remainder. The pure protection/rate/outcome logic (window.__events +
// window.__balance) moved to src/systems/events.test.ts, and the store-driven
// asserts (debugTriggerEvent consequences, autonomous firing while travelling,
// silence when disabled) to src/state/store.events.test.ts. What stays here
// needs a real browser: pinning a wandering bird's-eye predator on the player
// via the RAF-driven window.__lionHunt scene and confirming that touching a
// lion — and a hyena — triggers that predator's attack, plus the console-error
// gate. Dev server only (dev hooks).
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
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// Leave into the bird's-eye view where the wandering predators mount.
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)

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

// Point 9: every wandering predator attacks on contact, not only the lion.
// Pin a hyena on the player and confirm the attack fires (its journal entry).
const hyenaTouch = await page.evaluate(async () => {
  const store = window.__game
  store.setState({ eventCooldown: 0, defeat: null, victory: false })
  store.getState().debugAddEquipment('rifle')
  const key = (e) => (typeof e.title === 'object' ? e.title.key : e.title)
  const before = store.getState().journal.filter((e) => key(e) === 'journal.titles.attack').length
  const deadline = Date.now() + 10000
  return await new Promise((res) => {
    const iv = setInterval(() => {
      const g = store.getState()
      const pos = g.pos
      const s = window.__lionHunt?.state
      if (s) {
        s.predator = 'hyena'
        s.mode = 'chase'; s.timer = 5
        s.px = pos.x; s.pz = pos.z; s.lx = pos.x; s.lz = pos.z
      }
      const now = g.journal.filter((e) => key(e) === 'journal.titles.attack').length
      if (now > before || g.defeat === 'death') {
        clearInterval(iv)
        res({ triggered: true, cooldown: g.eventCooldown })
      } else if (Date.now() > deadline) {
        clearInterval(iv)
        res({ triggered: false, cooldown: g.eventCooldown })
      }
    }, 80)
  })
})
check('touching a hyena triggers a hyena attack (non-lion predator)', hyenaTouch.triggered && hyenaTouch.cooldown > 0, JSON.stringify(hyenaTouch))

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
