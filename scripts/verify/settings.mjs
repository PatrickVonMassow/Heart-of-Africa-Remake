// Headless verification for CLAUDE.md §7.1.20 (comfort and audio settings)
// and the lion-feed depiction of §7.1.12: balance defaults (mouse
// sensitivity halved, walk speed 1.5x, ambience noise at 20 %), the lowered
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
  noise: window.__balance.ambienceNoiseVolume,
}))
check('default mouse sensitivity halved (0.0011)', bal.mouse === 0.0011, `${bal.mouse}`)
check('default walk speed 1.5x (7.5)', bal.walk === 7.5, `${bal.walk}`)
check('default ambience noise volume 20 % (0.2)', bal.noise === 0.2, `${bal.noise}`)

// --- First-person eye height -------------------------------------------------
const eyeY = await page.evaluate(() => window.__placeCamera?.position.y)
check('first-person eye height lowered to 1.5', Math.abs(eyeY - 1.5) < 1e-6, `${eyeY}`)

// --- Debug menu: new controls, German labels, live effect --------------------
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
await page.waitForTimeout(300)
const adjusted = await page.evaluate(() => ({
  mouse: window.__balance.mouseSensitivity,
  noise: window.__balance.ambienceNoiseVolume,
}))
check('mouse sensitivity applies at runtime', adjusted.mouse === 0.002, `${adjusted.mouse}`)
check('ambience volume applies at runtime', adjusted.noise === 0.5, `${adjusted.noise}`)
await page.screenshot({ path: `${OUT}67-settings-debug-menu.png` })
console.log('shot 67-settings-debug-menu.png')

// --- English labels ----------------------------------------------------------
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(600)
txt = await page.evaluate(() => document.body.innerText)
check('debug menu (en): mouse sensitivity field', txt.includes('Mouse sensitivity (first-person)'), '')
check('debug menu (en): ambience volume field', txt.includes('Ambience noise volume'), '')
await page.evaluate(() => window.__setLang('de'))
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

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
