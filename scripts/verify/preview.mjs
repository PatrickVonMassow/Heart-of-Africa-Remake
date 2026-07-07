// Checks that the production build (npm run preview, port 4173) renders
// without console errors (CLAUDE.md §7.1.1).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
await page.screenshot({ path: `${OUT}09-production-build.png` })
console.log('CONSOLE ERRORS:', errors.length === 0 ? 'none' : errors.join(' | '))
const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'))
const hasStatus = await page.evaluate(() => !!document.querySelector('.status-bar'))
const ok = hasCanvas && hasStatus && errors.length === 0
console.log(ok ? 'PASS  production build renders (canvas + status bar)' : 'FAIL')
await browser.close()
process.exit(ok ? 0 : 1)
