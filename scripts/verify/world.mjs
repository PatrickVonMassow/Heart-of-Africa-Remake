// Verification for the world model (CLAUDE.md §7.1.3): browser-only remainder.
// The data-sanity asserts (counts, terrain sampling, coast/river distances)
// moved to the fast Vitest suite (src/world/world.test.ts); what stays here
// needs a real browser: console-error-free rendering and screenshots of the
// bird's-eye view at characteristic locations. Dev server only.
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync, rmSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
mkdirSync(OUT, { recursive: true })

// Point 204: the shared launcher, so VERIFY_GL selects the backend these
// acceptance screenshots are taken on (this suite used to hard-launch the
// bundled Chromium with ANGLE, so its pictures were WebGL 2 whatever the run
// asked for).
const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page) // point 204: fail loud if the requested backend silently fell back
await page.waitForTimeout(2500)

// --- Screenshots of the travel view at characteristic locations ------------
const jump = async (lat, lon, ms = 2500) => {
  await page.evaluate(([la, lo]) => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    g.debugJumpTo(la, lo)
  }, [lat, lon])
  await page.waitForTimeout(ms)
}

// Leave the starting place into travel mode first.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.setJournalOpen(false)
  if (g.mode === 'place') g.leavePlace()
})
await page.waitForTimeout(2000)

// Each frame NAMES a place, so the shutter (point 375) proves that place is in
// the rendered picture before the file is written — projected through the live
// camera, never assumed from the jump having been requested. This suite is the
// case that motivated the rule: two runs on identical code photographed
// different places under `12-worldmodel-lake-victoria`, and both exited 0.
const shot = frameShutter(page, OUT)

// FRAME_SUBJECT_SELFTEST=1 proves the shutter still bites, the way
// VOICE_STALL_SELFTEST / STARTUP_STALL_SELFTEST do for their gates: stand in
// Cairo, claim Lake Victoria, and require the capture to be REFUSED and no file
// to be written. Without this the mechanism could rot into an always-green
// check and nobody would learn of it from a passing run.
if (process.env.FRAME_SUBJECT_SELFTEST) {
  const probeShot = frameShutter(page, OUT, { timeout: 3000 })
  const misaimed = `${OUT}999-frame-subject-selftest.png`
  rmSync(misaimed, { force: true })
  await jump(30.0, 31.3) // the traveller stands at the Nile delta …
  let refusal = null
  try {
    // … while the frame claims a lake 3600 km away.
    await probeShot('999-frame-subject-selftest', { world: { lat: -0.8, lon: 33.0 }, label: 'Lake Victoria' })
  } catch (e) {
    refusal = String(e.message ?? e)
  }
  const written = existsSync(misaimed)
  const ok = !!refusal && !written
  console.log(ok ? 'PASS  the shutter refuses a mis-aimed frame' : 'FAIL  the shutter refuses a mis-aimed frame')
  console.log(`      refusal: ${refusal ?? 'NONE — the frame was accepted'}; file written: ${written}`)
  await browser.close()
  process.exit(ok ? 0 : 1)
}

// A frame is only worth judging once the scene is actually DRAWING: right after
// the start the terrain chunks are still building and the picture is empty
// paper, into which a subject projects just as well as into a finished one. Poll
// the renderer's OWN frame clock (never a wall-clock sleep, CLAUDE.md §7.2)
// until frames are arriving at a real rate again.
const waitForLiveFrames = async () => {
  await page
    .waitForFunction(
      () => {
        const p = window.__perf
        if (!p || typeof p.frames !== 'function') return false
        const f = p.frames()
        if (f.length < 40) return false
        return f.slice(-30).every((e) => e.dt > 0 && e.dt < 400)
      },
      null,
      { timeout: 90000 },
    )
    .catch(() => {})
}
await waitForLiveFrames()

// Work-order 482: the communication PoC's two ends of the errand — the Bambara
// village standing on the Niger, and the erratic upstream where 487 will dig.
// The coordinates come from the scene's OWN dev hook, so the frames are aimed at
// what the renderer actually placed for this run's seed, never at a coordinate
// copied into this script.
const poc = await page.evaluate(() => window.__communicationRock ?? null)
if (!poc) {
  errors.push('window.__communicationRock is missing — the erratic was not placed')
} else {
  // Both frames are taken inside the player's own zoom range (point 172:
  // 0.125-0.5), close enough that they show what they claim — at the wide
  // default a village and a single block of stone are a few pixels of nothing.
  // The village is framed a step wider so its huts AND the water fit; the
  // erratic at the closest zoom, where its shape is the evidence.
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.25))
  await jump(poc.village.lat, poc.village.lon)
  await waitForLiveFrames()
  await shot('18-worldmodel-bambara-village-niger', {
    world: { lat: poc.village.lat, lon: poc.village.lon },
    label: 'the Bambara village on the Niger',
  })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.125))
  await jump(poc.lat, poc.lon)
  await waitForLiveFrames()
  await shot('19-worldmodel-communication-erratic', {
    world: { lat: poc.lat, lon: poc.lon },
    label: `the erratic ${poc.upstreamDeg.toFixed(1)}° upstream of the Bambara village`,
  })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
}

const shots = [
  [30.0, 31.3, '10-worldmodel-nile-delta-cairo', 'the Nile delta at Cairo'],
  [15.6, 32.6, '11-worldmodel-khartoum-confluence', 'the Nile confluence at Khartoum'],
  [-0.8, 33.0, '12-worldmodel-lake-victoria', 'Lake Victoria'],
  [-3.05, 37.3, '13-worldmodel-kilimanjaro', 'Kilimanjaro'],
  [-5.9, 12.8, '14-worldmodel-congo-mouth-boma', 'the Congo mouth at Boma'],
  [-17.9, 25.9, '15-worldmodel-victoria-falls', 'Victoria Falls'],
  [-33.9, 18.6, '16-worldmodel-cape-town', 'Cape Town'],
  [13.2, 14.2, '17-worldmodel-lake-chad', 'Lake Chad'],
]
for (const [lat, lon, name, label] of shots) {
  await jump(lat, lon)
  await shot(name, { world: { lat, lon }, label })
}

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
