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

// Leave the starting place into travel mode first — with NO cushion behind it.
// The first world frame is taken from exactly this instant (see the blank-frame
// check below), which is the state point 489 was measured in.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.setJournalOpen(false)
  if (g.mode === 'place') g.leavePlace()
})

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

// A frame is only worth judging once the scene has finished BUILDING: after a
// jump the terrain chunks stream in over seconds, and until they land the
// picture is empty paper — into which a named subject projects exactly as well
// as into a finished one, so the shutter (point 375) passed it. That is not
// theory: on a loaded host this suite wrote a 47 kB, wholly blank
// `18-worldmodel-bambara-village-niger` and exited 0.
//
// That wait now lives in the SHUTTER itself (point 489, `sceneReady-core.mjs`),
// because this suite was not the only one racing the streaming — `collision`
// wrote an empty `52-collision-port-wall.png` the same way. Every frame below
// therefore waits for the renderer's own per-frame counters to stand still
// before it is written, and a scene that never gets there refuses the frame
// loudly instead of writing half a picture. Nothing suite-local is needed here.
//
// THE LIVE PROOF of that (point 489): the very first world frame is taken
// straight out of the scene switch above, with nothing waiting in between — the
// state in which this host drew empty paper. The traveller starts at Cairo, so
// the Nile delta frame is the one that can be taken there, and its own bytes are
// the evidence: measured on this host, the picture BEFORE the wait was 37-48 kB
// (a dark frame, then a flat white wash, 14-16k triangles) and the finished one
// 1008 kB (715k triangles). The floor is set an order of magnitude below the
// finished picture and four times above the blank ones, so it separates the two
// without pretending to be a golden-image comparison (point 361 — no frame is
// compared against a reference here).
const BLANK_FRAME_BYTES = 200000
const firstTravelFrame = await shot('10-worldmodel-nile-delta-cairo', {
  world: { lat: 30.0, lon: 31.3 },
  label: 'the Nile delta at Cairo',
})
const firstOk = firstTravelFrame.length >= BLANK_FRAME_BYTES
console.log(
  `${firstOk ? 'PASS' : 'FAIL'}  the first world frame after the scene switch shows the terrain, not the background ` +
    `(${firstTravelFrame.length} bytes, floor ${BLANK_FRAME_BYTES})`,
)
if (!firstOk) {
  errors.push(
    `the first travel frame is ${firstTravelFrame.length} bytes — a blank picture; the scene-readiness wait did not hold (point 489)`,
  )
}

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
  await shot('18-worldmodel-bambara-village-niger', {
    world: { lat: poc.village.lat, lon: poc.village.lon },
    label: 'the Bambara village on the Niger',
  })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.125))
  await jump(poc.lat, poc.lon)
  await shot('19-worldmodel-communication-erratic', {
    world: { lat: poc.lat, lon: poc.lon },
    label: `the erratic ${poc.upstreamDeg.toFixed(1)}° upstream of the Bambara village`,
  })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))

  // Work-order 585: the erratic stands ON the ground, and on dry ground. The
  // report was a boulder out in the river with daylight under it, and the two
  // halves of that live in different places — the SITE decides where the block
  // stands, the SCENE decides how high it is drawn, and the defect was the
  // scene lifting it off the site's ground with a floor value of its own. So
  // both are read here from the live run: the height the mesh was given against
  // the height the site says the ground is, and the terrain under the block
  // against the water.
  // AND THE COMPARISON IS AGAINST A SECOND SOURCE, not against itself (four-eyes
  // review by GPT-5.6 Sol, 11.08.2026). This check used to read `r.y` against
  // `r.groundY` — BOTH fields of the same site object — so it proved only that the
  // scene copied the number it was handed. A block drawn a metre high on a site
  // that also said a metre would have passed. The height the block is drawn at is
  // now held against the terrain the WORLD reports under it, sampled independently,
  // which is the field the bird's-eye mesh is built from; the site's own value is
  // reported beside it so a divergence names which of the two moved.
  // The quantity is the LOWEST ground under the whole footprint — the centre
  // sample is the wrong one (Sol's re-review, 11.08.2026): a base above the
  // footprint minimum but below the centre would have passed, and that IS the
  // float this point was filed for. So the footprint is re-sampled here on a
  // DENSE grid of its own, not on the site's ring pattern, and the drawn base
  // must equal that minimum within a tolerance smaller than the smallest float a
  // player can see (the block is ~3 world units tall; 0.02 is under 1 % of it).
  const seat = await page.evaluate(async () => {
    const t = await import('/src/world/terrain.ts')
    const r = window.__communicationRock
    const seed = window.__game.getState().seed
    const centre = t.sampleTerrain(r.lat, r.lon, seed)
    const rock = await import('/src/world/communicationRock.ts')
    const rad = rock.ROCK_FOOTPRINT_UNITS / 10 // world units → degrees
    let lo = Infinity
    let hi = -Infinity
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const dLat = (i / 4) * rad
        const dLon = (j / 4) * rad
        if (Math.hypot(dLat, dLon) > rad + 1e-12) continue
        const h = t.sampleTerrain(r.lat + dLat, r.lon + dLon, seed).height
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
    }
    return { drawnY: r.y, groundY: r.groundY, type: centre.type, terrainH: centre.height, lo, hi }
  })
  const SEAT_TOLERANCE = 0.02
  const seated = Math.abs(seat.drawnY - seat.lo) <= SEAT_TOLERANCE
  console.log(
    `${seated ? 'PASS' : 'FAIL'}  the erratic is drawn at the lowest ground under its footprint ` +
      `(drawn ${seat.drawnY.toFixed(4)}, footprint ${seat.lo.toFixed(4)}–${seat.hi.toFixed(4)}, ` +
      `site ${seat.groundY.toFixed(4)})`,
  )
  if (!seated) {
    errors.push(
      `the erratic is drawn at y ${seat.drawnY}, the lowest ground under its footprint is ` +
        `${seat.lo} (its site says ${seat.groundY})`,
    )
  }
  const dry = seat.type !== 'water' && seat.type !== 'ocean' && seat.groundY <= seat.terrainH + 1e-9
  console.log(
    `${dry ? 'PASS' : 'FAIL'}  the erratic stands on dry ground, its base not above it (${seat.type})`,
  )
  if (!dry) errors.push(`the erratic stands on ${seat.type} with its base at ${seat.groundY}`)

  // Point 487, the errand's end, driven in the REAL browser against the
  // placement the scene drew (window.__communicationRock, not a coordinate this
  // script computed): digging away from the block finds nothing, digging at it
  // recovers the artefact, and handing it to the chief in his own village
  // closes the loop. The store transitions themselves are pinned in
  // src/state/store.rockArtefact.test.ts — what this adds is the proof that the
  // spot the picture shows and the spot that yields are the same spot.
  const reachDeg = await page.evaluate(() => window.__balance.digRadius / 10)
  const digAt = async (lat, lon) => {
    await jump(lat, lon, 400)
    return page.evaluate(() => {
      const g = window.__game.getState()
      g.debugAddEquipment('shovel')
      g.dig()
      const s = window.__game.getState()
      return { artefact: s.rockArtefact, keys: s.journal.map((e) => e.text.key) }
    })
  }
  // The procedural caches are cleared for the negative probe so only the
  // boulder's own branch can answer, then put back.
  const caches = await page.evaluate(() => {
    const sites = window.__game.getState().treasureSites
    window.__game.setState({ treasureSites: [] })
    return sites
  })
  const away = await digAt(poc.lat + reachDeg * 4, poc.lon + reachDeg * 4)
  const awayOk = away.artefact === 'buried' && !away.keys.includes('journal.rockArtefact')
  console.log(
    `${awayOk ? 'PASS' : 'FAIL'}  digging clear of the erratic recovers nothing (state ${away.artefact})`,
  )
  if (!awayOk) errors.push(`a dig ${(reachDeg * 4).toFixed(2)}° off the erratic recovered ${away.artefact}`)

  const atRock = await digAt(poc.lat, poc.lon)
  const atRockOk = atRock.artefact === 'carried' && atRock.keys.includes('journal.rockArtefact')
  console.log(
    `${atRockOk ? 'PASS' : 'FAIL'}  digging at the erratic the scene drew recovers the artefact and journals it`,
  )
  if (!atRockOk) errors.push(`the dig at the drawn erratic left the artefact ${atRock.artefact}`)

  const handed = await page.evaluate(() => {
    const g = window.__game.getState()
    g.enterPlace('bambara-village')
    window.__game.getState().handArtefactToChief()
    const s = window.__game.getState()
    return { artefact: s.rockArtefact, keys: s.journal.map((e) => e.text.key) }
  })
  const handedOk = handed.artefact === 'given' && handed.keys.includes('journal.artefactGiven')
  console.log(
    `${handedOk ? 'PASS' : 'FAIL'}  the artefact laid in the chief's hands solves the puzzle and is journaled`,
  )
  if (!handedOk) errors.push(`the hand-over left the artefact ${handed.artefact}`)

  // Back onto the map for the remaining frames, with the world as it was.
  await page.evaluate((sites) => {
    const g = window.__game.getState()
    if (g.mode === 'place') g.leavePlace()
    window.__game.setState({ treasureSites: sites })
    window.__game.getState().setJournalOpen(false)
  }, caches)
  // Wait on the STATE, not the wall clock: the map frames below may only be
  // taken once the traveller is back out of the settlement.
  await page.waitForFunction(() => window.__game.getState().mode === 'travel', null, { timeout: 20000 })
}

// The Nile delta is already photographed above, out of the scene switch itself.
const shots = [
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
