// Checks that the production build (npm run preview, port 4173) renders
// without console errors (CLAUDE.md §7.1.1).
import { launchVerifyBrowser } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { fileURLToPath } from 'node:url'
import { installTtsCache } from './ttsCache.mjs'

// The one DELIBERATELY UNSEEDED suite (verify-seed.mjs `UNSEEDED_SUITES`, point 557):
// the ?seed hook is DEV-only, so the production build randomises its world whatever
// the URL says. The launcher announces that in this suite's own output rather than
// leaving the reader to assume a pin that cannot exist here.
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
// THE STARTUP PRE-WARM PULLS ~90 MB (measured 26.08.2026). speech.ts warms the
// Kokoro model at game start, so a page navigated with `waitUntil: 'networkidle'`
// waits out the whole CDN download — the model request was still open when the
// 30 s navigation timed out, and this suite died in both attempts of every run.
// The cache voice.mjs records and marks complete serves it from disk instead;
// here it is only consumed, exactly as handwriting.mjs consumes it.
await installTtsCache(page)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
// The production build carries no dev hooks (no window.__game, no __camera), so
// no subject can be projected here — and the frame's claim IS the whole picture:
// that the built app renders at all. Declared, not inferred (point 375).
await frameShutter(page, OUT)('09-production-build', {
  general: 'the production build renders at all — the whole first picture is the subject, and the built app exposes no dev hook to project one',
})
console.log('CONSOLE ERRORS:', errors.length === 0 ? 'none' : errors.join(' | '))
const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'))
const hasStatus = await page.evaluate(() => !!document.querySelector('.status-bar'))
const ok = hasCanvas && hasStatus && errors.length === 0
console.log(ok ? 'PASS  production build renders (canvas + status bar)' : 'FAIL')
await browser.close()
process.exit(ok ? 0 : 1)
