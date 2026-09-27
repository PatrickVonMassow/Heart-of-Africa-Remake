// Prove the F8 benchmark reached the DEPLOYED build (point 277). The dev hooks
// the verify suites lean on are stripped from production, so this checks the
// only thing that matters to the player: the deployed page loads and F8 opens
// the benchmark overlay (the exit code); whether Esc closes it again and any
// console errors are reported in the JSON line.
//
// Usage: node scripts/check-deployed-benchmark.mjs [url]
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'https://patrickvonmassow.github.io/Heart-of-Africa-Remake/'
/** The benchmark overlay's root (src/ui/BenchmarkOverlay.tsx) — one selector
 *  for opening and closing alike. */
const OVERLAY = '.bench-backdrop'

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--headless=new', '--enable-unsafe-webgpu', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'load', timeout: 90000 })
await page.waitForSelector('canvas', { timeout: 90000 })
await page.waitForTimeout(9000)

await page.keyboard.press('F8')
// The overlay mounts behind a dynamic import — give the chunk time to arrive.
const overlay = await page
  .waitForSelector(OVERLAY, { timeout: 45000 })
  .catch(() => null)
const opened = overlay !== null
const text = opened ? ((await overlay.textContent()) ?? '').slice(0, 120).replace(/\s+/g, ' ') : ''

if (opened) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
}
const closed = opened ? (await page.$(OVERLAY)) === null : false

console.log(JSON.stringify({ url: URL, opened, closed, text, errors: errors.slice(0, 5) }, null, 2))
await browser.close()
process.exit(opened ? 0 : 1)
