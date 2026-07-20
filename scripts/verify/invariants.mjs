// Pillar 1 of point 184: a CONTINUOUS global-invariant harness. Where enrichments
// SPOT-checks one region, this DRIVES a long route across regions/biomes and, every
// frame, checks global invariants over ALL wildlife via frustum projection
// (window.__camera.onScreen — the point-172 picture standard, never an assumed
// radius) and the sim clock (point 177). It runs at the ACHIEVABLE zoom 0.5 (the
// hardest reachable view, point 172) on whichever backend VERIFY_GL selects, so the
// WebGPU-only class is hunted on the real backend the player uses.
//
// It covers the invariants with an UNAMBIGUOUS driven test: I1 (NO POP-IN — no animal
// may appear INSIDE the rendered frame the frame it first joins the herds, the class
// the user hit repeatedly, points 165/183) and I5 (no living animal on an impassable
// OCEAN cell — the §19.5 open-ocean backstop). Deliberately NOT layered in here:
//  - I3 wedge / I4 drama-resolves / I7 predator tunnelling are EVENT-driven and rarely
//    fire under a moving-player drive; the enrichments suite STAGES them explicitly,
//    which is the right place for them.
//  - I6 interpenetration has no clean driven threshold: the game PACKS herds tightly
//    and leaves predators UNRENDERED (point 146), so a distance bar flags intended
//    clustering — "too close" needs the engine's own separation equilibrium, which the
//    enrichments §19.5 body-spacing spot check already owns (tried here and reverted).
//  - I2 floating needs a rendered-y hook the data model does not expose.
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
await page.evaluate(() => {
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false
})
await page.waitForTimeout(3000)

// Representative regions/biomes to drive through (lat, lon of a spot with wildlife).
// The dry-season override keeps the shore seeders active (the point-183 pop path).
const ROUTE = [
  { name: 'maasai-savanna', lat: -2.5, lon: 36.4 },
  { name: 'congo-jungle', lat: 0.4, lon: 22.5 },
  { name: 'sahel', lat: 14, lon: 2 },
  { name: 'nile-corridor', lat: 25.6, lon: 32.6 },
  { name: 'zambezi-south', lat: -16.5, lon: 26.5 },
  { name: 'west-guinea', lat: 7.5, lon: -6 },
]

// Drive one stop at the achievable zoom 0.5, scanning EVERY frame for a new animal
// that is on-screen the frame it joins (I1). Continuous held-key driving keeps the
// camera glued to the player, so a later camera reveal never counts as a pop.
const drivePopIn = (stop) =>
  page.evaluate(async (stop) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    window.__game.getState().debugJumpTo(stop.lat, stop.lon)
    window.__ui.getState().setTravelZoom(0.5)
    window.__ui.getState().setSeasonWetnessOverride(0)
    await sleep(1500) // let the jump's big camera lerp finish before driving
    const herds = window.__wildlife.herdsRef.current
    const SP = Object.keys(herds)
    // Drive N sim-seconds, running onFrame each frame. Continuous held-key driving
    // keeps the camera GLUED to the player (small lag), so no teleport-lerp sweep.
    const driveFor = (simSecs, onFrame) =>
      new Promise((resolve) => {
        const s0 = window.__wildlife.simTime()
        const tick = () => {
          if (onFrame) onFrame()
          if (window.__wildlife.simTime() - s0 < simSecs) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
    const prevSpeed = window.__balance.travelSpeed
    window.__balance.travelSpeed = 6
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }))
    // WARMUP: drive a few sim-seconds WITHOUT scanning so the region's post-jump
    // streaming/seeding settles — that initial population is not a driving pop (the
    // teleport-artifact the point-165 check warns about). Only AFTER it settles do we
    // baseline `seen`, so the scan below counts only genuinely NEW on-screen spawns.
    await driveFor(6, null)
    const seen = new Set()
    for (const sp of SP) for (const a of herds[sp] ?? []) seen.add(a)
    const pops = []
    const oceanViols = []
    const seedNum = window.__game.getState().seed
    const U = 10
    let frame = 0
    await driveFor(12, () => {
      const pos = window.__game.getState().pos
      for (const sp of SP)
        for (const a of herds[sp] ?? []) {
          if (seen.has(a)) continue
          seen.add(a)
          // I1: a NEW animal must not appear inside the frame. Tag the spawn path so
          // a finding can be traced (shoreSeed = the dry-shore guarantee, chunk = the
          // ordinary/vicinity spawn, young = a calf, drink = a shore visitor).
          if (!a.dead && window.__camera.onScreen(a.x, a.z)) {
            pops.push({
              region: stop.name,
              sp,
              dist: +Math.hypot(a.x - pos.x, a.z - pos.z).toFixed(1),
              shoreSeed: !!a.shoreSeed,
              chunk: a.chunk ?? null,
              young: !!a.young,
              drink: !!a.drink,
            })
          }
        }
      // I5 (throttled ~1/3 s): no living animal may stand on an OCEAN cell (the
      // impassable sea) — the §19.5 open-ocean backstop must catch every stray. A
      // STATE check, so a periodic sample suffices (and keeps the frame loop light).
      if (frame++ % 10 === 0) {
        for (const sp of SP)
          for (const a of herds[sp] ?? []) {
            if (a.dead) continue
            if (window.__terrainType(-a.z / U, a.x / U, seedNum) === 'ocean') {
              oceanViols.push({ region: stop.name, sp, x: +a.x.toFixed(0), z: +a.z.toFixed(0) })
            }
          }
      }
    })
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
    window.__balance.travelSpeed = prevSpeed
    window.__ui.getState().setSeasonWetnessOverride(null)
    return { pops, oceanViols }
  }, stop)

const allPops = []
const allOcean = []
for (const stop of ROUTE) {
  const { pops, oceanViols } = await drivePopIn(stop)
  allPops.push(...pops)
  allOcean.push(...oceanViols)
  console.log(`  route ${stop.name}: ${pops.length} pop(s), ${oceanViols.length} ocean`)
}
check(
  'I1 no pop-in: no animal appears inside the frame the frame it joins, across the driven route (point 184 Pillar 1)',
  allPops.length === 0,
  JSON.stringify(allPops.slice(0, 15)),
)
check(
  'I5 no animal on the impassable ocean, across the driven route (point 184 Pillar 1)',
  allOcean.length === 0,
  JSON.stringify(allOcean.slice(0, 15)),
)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
