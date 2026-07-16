// What the PLAYER sees: mean screen colour, dry month vs wet month, per spot.
import { bootGame } from 'file:///C:/Users/Patri/Documents/Developing/hoa/scripts/verify/_boot.mjs'
import sharp from 'sharp'

const { browser, page, errors } = await bootGame()
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// Ground crop, clear of the HUD bar and the inventory row.
const CROP = { x: 200, y: 300, width: 700, height: 380 }
const mean = async () => {
  const buf = await page.screenshot({ clip: CROP })
  const { channels } = await sharp(buf).stats()
  return channels.slice(0, 3).map((c) => c.mean)
}
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))
// The metric that matters: green EXCESS. A season that only dims moves this by ~0.
const greenEx = (c) => c[1] - (c[0] + c[2]) / 2

const SPOTS = [
  ['Sahel savanna', 12.5, 8.0, 3, 8],       // Apr driest, Sep wettest
  ['East plains', -3.2, 36.0, 8, 4],        // Sep driest, May wettest
  ['S. plateau (Zambezi)', -17.9, 25.9, 6, 0], // Jul driest, Jan wettest
  ['Congo basin', -2.6, 22.4, 7, 4],        // Aug driest, May wettest
]

console.log('spot                     dry RGB              wet RGB              delta')
for (const [name, lat, lon, dryM, wetM] of SPOTS) {
  await page.evaluate(([la, lo]) => window.__game.getState().debugJumpTo(la, lo), [lat, lon])
  await page.waitForTimeout(1500)
  await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), dryM)
  await page.waitForTimeout(2500)
  const d = await mean()
  await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), wetM)
  await page.waitForTimeout(2500)
  const w = await mean()
  const fmt = (c) => c.map((v) => v.toFixed(0).padStart(3)).join(',')
  console.log(`${name.padEnd(24)} ${fmt(d)}   vs   ${fmt(w)}   d=${dist(d, w).toFixed(0).padStart(3)}  greenEx ${greenEx(d).toFixed(0).padStart(3)} -> ${greenEx(w).toFixed(0).padStart(3)}`)
}
console.log('\n(delta = euclidean RGB distance; under ~10 is imperceptible)')
console.log('console errors:', errors.length)
await browser.close()
