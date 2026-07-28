// Scratch probe (point 300): dump the gait dev info from a live place.
import { launchVerifyBrowser } from './_browser.mjs'
const BASE = process.env.BASE_URL ?? 'http://localhost:5199/'
const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)))
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)))
await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('maasai-village')
})
await page.waitForFunction(() => window.__game.getState().placeId === 'maasai-village' && !!window.__placeLayout, null, { timeout: 30000 })
await page.waitForTimeout(3000)
const dump = await page.evaluate(() => ({
  sil: window.__placePanoramaWildlifeInfo ?? null,
  goats: window.__placeGoatGait ?? null,
}))
console.log('SIL', JSON.stringify(Object.values(dump.sil ?? {}).map((w) => ({ pitch: w.pitch, fY: w.frontY, bY: w.backY, gap: w.footGap, h: w.worldHeight, st: w.stance, vis: w.visible, drop: w.drop }))))
console.log('GOATS', JSON.stringify(dump.goats))
const series = []
for (let k = 0; k < 8; k++) {
  series.push(
    await page.evaluate(() => ({
      t: performance.now(),
      sil: Object.values(window.__placePanoramaWildlifeInfo ?? {}).map((w) => ({ x: w.x, z: w.z, st: w.stance, f: w.foot, g: w.gait })),
      goats: Object.values(window.__placeGoatGait ?? {}).map((w) => ({ x: w.x, z: w.z, st: w.stance, f: w.foot, d: w.dist })),
    })),
  )
  await page.waitForTimeout(120)
}
console.log('SERIES')
for (const s of series) console.log(JSON.stringify(s))
await browser.close()
