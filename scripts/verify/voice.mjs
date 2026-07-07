// Headless verification for CLAUDE.md §7.1.19 (journal voice markup and
// read-aloud): markers in both language files are balanced, no marker is
// visible in the UI, the parser produces prosody segments, and the English
// read-aloud actually reaches the speaking state (small WASM model via the
// __ttsForceWasm dev hook; requires network access to the Hugging Face CDN).
// Dev server only (dev hooks).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

// --- Static scan: balanced, known-only tags in both language files ----------
const TAGS = ['awe', 'whisper', 'excited', 'somber', 'weary', 'fear', 'emph', 'mute', 'pause', 'breath']
const SPAN_TAGS = TAGS.filter((t) => t !== 'pause' && t !== 'breath')
for (const lang of ['de', 'en']) {
  const src = readFileSync(fileURLToPath(new URL(`../../src/i18n/${lang}.ts`, import.meta.url)), 'utf8')
  const found = [...src.matchAll(/\[(\/?)([a-z]+)\]/g)]
  const unknown = found.filter((m) => !TAGS.includes(m[2]))
  check(`${lang}.ts: only known voice tags`, unknown.length === 0, unknown.map((m) => m[0]).join(' '))
  for (const tag of SPAN_TAGS) {
    const open = found.filter((m) => m[2] === tag && m[1] === '').length
    const close = found.filter((m) => m[2] === tag && m[1] === '/').length
    check(`${lang}.ts: [${tag}] balanced`, open === close, `${open} open / ${close} close`)
  }
  const moodUse = found.filter((m) => SPAN_TAGS.includes(m[2])).length
  check(`${lang}.ts: journal texts are enriched`, moodUse >= 30, `${moodUse} span tags`)
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
await page.waitForFunction(() => window.__game && window.__voiceMarkup, null, { timeout: 60000 })
await page.waitForTimeout(4000)

// --- Parser: strip and prosody segments -------------------------------------
const parser = await page.evaluate(() => {
  const { stripVoiceMarkup, toSpeechSegments } = window.__voiceMarkup
  const sample =
    '[excited]At last![/excited] [pause]I found it. [whisper]I am afraid.[/whisper] [mute](note)[/mute] [emph]Unbelievable.[/emph]'
  return { stripped: stripVoiceMarkup(sample), segments: toSpeechSegments(sample) }
})
check('parser strips all tags', !/\[[a-z/]+\]/.test(parser.stripped), parser.stripped)
check('parser keeps mute text for display', parser.stripped.includes('(note)'), parser.stripped)
check('parser drops mute text for speech', parser.segments.every((s) => !s.text.includes('note')), '')
const speeds = new Set(parser.segments.map((s) => s.speed))
const volumes = new Set(parser.segments.map((s) => s.volume))
check('parser varies speed by mood', speeds.size >= 3, [...speeds].join(', '))
check('parser varies loudness by mood', volumes.size >= 2, [...volumes].join(', '))
check('parser inserts real pauses', parser.segments.some((s) => s.pauseAfter > 0), '')
check(
  'parser shapes punctuation (whisper → …)',
  parser.segments.some((s) => s.text.includes('afraid...')),
  JSON.stringify(parser.segments.map((s) => s.text)),
)

// --- German: markup stripped, no read-aloud button --------------------------
// The default language is English (par.17); check German explicitly.
await page.evaluate(() => window.__setLang('de'))
await page.waitForTimeout(600)
let txt = await page.evaluate(() => document.body.innerText)
check('German journal: no visible markers', !/\[(\/?)[a-z]+\]/.test(txt), '')
check('German journal: prose intact', txt.includes('Heute beginnt meine Expedition.'), '')
const speakButtonsDe = await page.locator('.journal .speak').count()
check('German journal: no read-aloud button (no German voice yet)', speakButtonsDe === 0, `${speakButtonsDe}`)
await page.screenshot({ path: `${OUT}64-voice-german-journal-clean.png` })
console.log('shot 64-voice-german-journal-clean.png')

// --- English: markup stripped, read-aloud reaches speaking state ------------
await page.evaluate(() => window.__setLang('en'))
await page.waitForTimeout(800)
txt = await page.evaluate(() => document.body.innerText)
check('English journal: no visible markers', !/\[(\/?)[a-z]+\]/.test(txt), '')
check('English journal: prose intact', txt.includes('Today my expedition begins.'), '')
const speakButtonsEn = await page.locator('.journal .speak').count()
check('English journal: read-aloud button present', speakButtonsEn >= 1, `${speakButtonsEn}`)

await page.evaluate(() => {
  window.__ttsForceWasm = true
})

// --- The start entry narrates on the first user gesture (autoplay deferral) --
// No trusted gesture has happened yet; a neutral key press is the first one.
await page.keyboard.press('F8')
let bootSpoke = false
try {
  await page.waitForFunction(
    () => {
      const btns = document.querySelectorAll('.journal .speak')
      const t = btns.length > 0 ? btns[btns.length - 1].textContent : ''
      return t === '…' || t === '■'
    },
    null,
    { timeout: 300000 },
  )
  bootSpoke = true
} catch {
  bootSpoke = false
}
check('the start entry narrates on the first user gesture', bootSpoke, '')
// Let it reach the speaking state, then stop it for the manual-control check.
await page
  .waitForFunction(() => document.querySelector('.journal .speak')?.textContent === '■', null, { timeout: 300000 })
  .catch(() => {})
await page.locator('.journal .speak').last().click()
await page.waitForTimeout(500)

await page.locator('.journal .speak').first().click()
let speaking = false
try {
  await page.waitForFunction(
    () => document.querySelector('.journal .speak')?.textContent === '■',
    null,
    { timeout: 300000 },
  )
  speaking = true
} catch {
  speaking = false
}
check('English read-aloud reaches speaking state (audio playing)', speaking, '')
await page.screenshot({ path: `${OUT}65-voice-english-readaloud.png` })
console.log('shot 65-voice-english-readaloud.png')
// Stop narration via the same control.
await page.locator('.journal .speak').first().click()
await page.waitForTimeout(500)

// --- Auto-narration of a newly appearing entry (no click) --------------------
await page.evaluate(() =>
  window.__game.getState().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' }),
)
let autoSpoke = false
try {
  // The model is already loaded, so only synthesis time remains.
  await page.waitForFunction(
    () => {
      const btns = document.querySelectorAll('.journal .speak')
      return btns.length > 0 && btns[btns.length - 1].textContent === '■'
    },
    null,
    { timeout: 180000 },
  )
  autoSpoke = true
} catch {
  autoSpoke = false
}
check('English: new journal entry auto-narrates without a click', autoSpoke, '')
await page.screenshot({ path: `${OUT}66-voice-auto-narration.png` })
console.log('shot 66-voice-auto-narration.png')
await page.locator('.journal .speak').last().click()
await page.waitForTimeout(400)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
