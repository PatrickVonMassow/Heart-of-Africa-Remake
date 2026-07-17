// Headless verification for the world/settlement/water enrichments
// (CLAUDE.md §7.1 pts. 3/4/12/15/20/21): the browser-only remainder. The pure
// and store-driven asserts (movementPenalty mapping, biome-border/terrain
// classification, driftCurrent, moveTravel swim/ocean, mountain climb & fall,
// canoe-on-land malus, once-only penalty/danger journaling, wheel-zoom clamp)
// moved to the fast Vitest suite (src/systems/movement.test.ts,
// src/state/store.travel.test.ts, src/world/world.test.ts), and the HUD-render
// asserts (.movement-penalty text, the .inv-active glow, the DebugMenu
// dropdown/renderer-row presence) to src/ui/StatusBar.test.tsx, Hud.test.tsx and
// DebugMenu.test.tsx. What stays here needs a real browser: RAF-driven wildlife
// behaviour, in-scene settlement/river/graveyard geometry via the dev hooks,
// the drei <Html> map/region labels, real layout geometry (getBoundingClientRect
// hit-tests), a real WheelEvent zoom, the screenshots and the console-error
// gate. Dev server only (dev hooks).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

// Wildlife spawns in the render loop, which headless Chromium throttles — under
// full-suite CPU load a fixed sleep after a jump is not enough for herds to
// stream in. Poll until live animals exist so the wildlife checks are reliable
// (this only waits for the spawn, it does not relax any assertion).
const waitForHerds = (min = 6, timeout = 30000) =>
  page
    .waitForFunction(
      (m) => {
        const h = window.__wildlife?.herdsRef?.current
        if (!h) return false
        let n = 0
        // Count only real streamed animals (chunk-tagged): animals injected or
        // relocated by earlier tests have no chunk and would otherwise satisfy
        // the wait long before the local herds actually streamed in.
        for (const sp of Object.keys(h)) n += h[sp].filter((a) => !a.dead && a.chunk !== undefined).length
        return n >= m
      },
      min,
      { timeout },
    )
    .then(() => true)
    .catch(() => false)

// The family scenarios additionally need a live parent+calf pair among the
// grazer herds; under full-suite load the herds can take a while to stream in
// after a jump, so poll for the family instead of scanning once (this only
// waits for the spawn, it does not relax any assertion).
const waitForFamily = (timeout = 30000) =>
  page
    .waitForFunction(
      () => {
        const h = window.__wildlife?.herdsRef?.current
        if (!h) return false
        for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
          for (const a of h[sp] ?? []) {
            if (a.child && !a.child.dead && !a.dead && a.child.caught === undefined && a.child.inWater === undefined)
              return true
          }
        }
        return false
      },
      null,
      { timeout },
    )
    .then(() => true)
    .catch(() => false)

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
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
// The game starts inside Cairo: wait for the place scene's layout hook
// instead of a fixed sleep (load-dependent under the full regression).
await page.waitForFunction(() => !!window.__placeLayout, null, { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(700)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(300)
// Keep the wildlife/geometry checks deterministic (random events are covered by
// events.mjs and store.events.test.ts); several removed blocks used to disable
// them, so pin it off once for the whole run.
await page.evaluate(() => { window.__balance.randomEventsEnabled = false })

// === Settlement sizes + village life + backdrop (§7.1.15) ====================
const cairo = await page.evaluate(() => ({
  radius: window.__placeLayout.radius,
  dwellings: window.__placeLayout.dwellings.length,
  backdrop: window.__placeBackdrop ?? 0,
}))
check('Cairo (size 3): walkable radius 48', cairo.radius === 48, `${cairo.radius}`)
check('Cairo: landscape backdrop mesh present', cairo.backdrop > 1000, `${cairo.backdrop} vertices`)

await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1200)
await page.evaluate(() => window.__game.getState().enterPlace('boma'))
await page
  .waitForFunction(
    (want) => window.__game.getState().placeId === want && !!window.__placeLayout,
    "boma",
    { timeout: 30000 },
  )
  .catch(() => {})
await page.waitForTimeout(500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
const boma = await page.evaluate(() => ({
  radius: window.__placeLayout.radius,
  dwellings: window.__placeLayout.dwellings.length,
}))
check('Boma (size 1): walkable radius 36', boma.radius === 36, `${boma.radius}`)
check(
  'Major city clearly bigger than small station',
  cairo.dwellings > boma.dwellings * 1.4,
  `Cairo ${cairo.dwellings} vs Boma ${boma.dwellings} dwellings`,
)

await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(800)
await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
await page
  .waitForFunction(
    (want) => window.__game.getState().placeId === want && !!window.__placeLayout,
    "maasai-village",
    { timeout: 30000 },
  )
  .catch(() => {})
await page.waitForTimeout(500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
const village = await page.evaluate(() => ({
  walkers: window.__placeWalkers ? window.__placeWalkers.states.length : 0,
  backdrop: window.__placeBackdrop ?? 0,
}))
check('Village: inhabitants with daily routines present', village.walkers >= 3, `${village.walkers} walkers`)
check('Village: landscape backdrop mesh present', village.backdrop > 1000, `${village.backdrop} vertices`)
await page.screenshot({ path: `${OUT}77-enrich-village-life.png` })
console.log('shot 77-enrich-village-life.png')

// Point 14: the backdrop of a mountainous settlement (Berber Village, at the
// Atlas) must read as a distant range on the horizon, not loom over the camera
// and arc overhead (the former clipping error). The steepest backdrop vertex
// stays at a low elevation angle from the eye-height camera.
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(800)
await page.evaluate(() => window.__game.getState().enterPlace('berber-village'))
await page.waitForFunction(() => window.__placeBackdropInfo, null, { timeout: 30000 })
await page.waitForTimeout(1200)
const berber = await page.evaluate(() => window.__placeBackdropInfo)
check(
  'Berber Village: mountainous backdrop stays a distant range (no looming/clipping)',
  berber.maxElevationDeg < 25,
  `max elevation ${berber.maxElevationDeg?.toFixed(1)}°`,
)
await page.screenshot({ path: `${OUT}86-berber-backdrop.png` })
console.log('shot 86-berber-backdrop.png')

// === Travel view =============================================================
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// --- Point 12: map points show "?" until discovered --------------------------
// Every place/landmark label is rendered; an undiscovered one shows a muted "?",
// a visited place (Cairo) shows its real name, and sighting a landmark reveals it.
const labelsBefore = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('.map-label')]
  return {
    undiscovered: labels.filter((l) => l.classList.contains('undiscovered') && l.textContent.trim() === '?').length,
    cairoNamed: labels.some((l) => !l.classList.contains('undiscovered') && /Kair|Cairo/.test(l.textContent)),
    kiliHidden: !labels.some((l) => /Kilim/.test(l.textContent)),
    seen: window.__game.getState().landmarksSeen.includes('kilimanjaro'),
  }
})
check('undiscovered map points show a "?" label', labelsBefore.undiscovered > 0, JSON.stringify(labelsBefore))
check('a visited place (Cairo) shows its real name', labelsBefore.cairoNamed, JSON.stringify(labelsBefore))
check('an unsighted landmark (Kilimanjaro) is hidden behind "?"', labelsBefore.kiliHidden && !labelsBefore.seen, JSON.stringify(labelsBefore))
await page.evaluate(() =>
  window.__game.setState({ landmarksSeen: [...window.__game.getState().landmarksSeen, 'kilimanjaro'] }),
)
await page.waitForTimeout(400)
const kiliRevealed = await page.evaluate(() =>
  [...document.querySelectorAll('.map-label')].some((l) => /Kilim/.test(l.textContent)),
)
check('a sighted landmark reveals its real name', kiliRevealed, '')

// --- Cultural landmarks (§7.1.3, design.md §4.4) -----------------------------
// The eight built cultural landmarks (Meroë, Giza, Great Zimbabwe, Lalibela,
// Kilwa, Aksum, Gondar, Bandiagara) mount into the travel scene (dev hook)
// and their labels reveal on sighting.
const cultural = await page.evaluate(() => window.__culturalLandmarks)
check(
  'eight cultural landmarks are placed in the travel world',
  cultural?.count === 8 &&
    ['meroe', 'giza', 'great-zimbabwe', 'lalibela', 'kilwa', 'aksum', 'gondar', 'bandiagara'].every((id) =>
      cultural.ids.includes(id),
    ),
  JSON.stringify(cultural),
)
// The four natural point-landmarks mount alongside them (design.md §4.4).
const naturalSites = await page.evaluate(() => window.__naturalSites)
check(
  'four natural sites are placed in the travel world',
  naturalSites?.count === 4 &&
    ['ngorongoro', 'lengai', 'okavango', 'sudd'].every((id) => naturalSites.ids.includes(id)),
  JSON.stringify(naturalSites),
)
// Position the camera over each site and confirm a non-black frame renders.
for (const c of [
  { id: 'meroe', lat: 16.94, lon: 33.75 },
  { id: 'great-zimbabwe', lat: -20.27, lon: 30.93 },
  { id: 'lalibela', lat: 12.03, lon: 39.04 },
  { id: 'kilwa', lat: -8.96, lon: 39.51 },
  { id: 'aksum', lat: 14.13, lon: 38.72 },
  { id: 'gondar', lat: 12.61, lon: 37.47 },
  { id: 'bandiagara', lat: 14.35, lon: -3.4 },
  { id: 'ngorongoro', lat: -3.16, lon: 35.58 },
  { id: 'lengai', lat: -2.76, lon: 35.9 },
  { id: 'okavango', lat: -19.5, lon: 22.9 },
  { id: 'sudd', lat: 8.0, lon: 30.5 },
]) {
  await page.evaluate((s) => window.__game.getState().debugJumpTo(s.lat, s.lon), c)
  await page.waitForTimeout(500)
  // A rendered scene (terrain + geometry) compresses to a sizeable PNG; an empty
  // black frame would be tiny. Combined with the console-error gate this confirms
  // the camera-over-the-site frame renders.
  const buf = await page.screenshot({ clip: { x: 480, y: 300, width: 320, height: 320 } })
  check(`cultural landmark ${c.id} renders a non-black frame`, buf.length > 3000, `png bytes ${buf.length}`)
}
// Reveal a site's label and screenshot it as evidence.
await page.evaluate(() => window.__game.getState().debugJumpTo(16.94, 33.75)) // Meroë
await page.evaluate(() =>
  window.__game.setState({ landmarksSeen: [...window.__game.getState().landmarksSeen, 'meroe'] }),
)
await page.waitForTimeout(500)
const meroeRevealed = await page.evaluate(() =>
  [...document.querySelectorAll('.map-label')].some((l) => /Mero/.test(l.textContent)),
)
check('the Meroë pyramids reveal their name once sighted', meroeRevealed, '')
await page.screenshot({ path: `${OUT}91-cultural-landmark-meroe.png` })
console.log('shot 91-cultural-landmark-meroe.png')

// Stage-2 evidence: one new cultural site (Aksum stelae) and one natural site
// (Ngorongoro crater) with their labels revealed.
await page.evaluate(() => window.__game.getState().debugJumpTo(14.13, 38.72)) // Aksum
await page.evaluate(() =>
  window.__game.setState({ landmarksSeen: [...window.__game.getState().landmarksSeen, 'aksum'] }),
)
await page.waitForTimeout(1800)
const aksumRevealed = await page.evaluate(() =>
  [...document.querySelectorAll('.map-label')].some((l) => /Aksum/.test(l.textContent)),
)
check('the Aksum stelae reveal their name once sighted', aksumRevealed, '')
await page.screenshot({ path: `${OUT}94-cultural-landmark-aksum.png` })
console.log('shot 94-cultural-landmark-aksum.png')
await page.evaluate(() => window.__game.getState().debugJumpTo(-3.16, 35.58)) // Ngorongoro
await page.evaluate(() =>
  window.__game.setState({ landmarksSeen: [...window.__game.getState().landmarksSeen, 'ngorongoro'] }),
)
await page.waitForTimeout(1800)
const ngoroRevealed = await page.evaluate(() =>
  [...document.querySelectorAll('.map-label')].some((l) => /Ngorongoro/.test(l.textContent)),
)
check('the Ngorongoro crater reveals its name once sighted', ngoroRevealed, '')
await page.screenshot({ path: `${OUT}95-natural-site-ngorongoro.png` })
console.log('shot 95-natural-site-ngorongoro.png')

// --- Exploration map: parchment look + fog of war (§7.1.3, design.md §19) -----
// Explore a swath of the north, open the map and confirm the explored area is a
// cleared (lighter) window through the fog while the unexplored south stays
// darker under the veil — plus the parchment/frame render (non-blank canvas).
await page.evaluate(() => {
  const g = window.__game.getState()
  for (let lat = 30; lat >= 10; lat -= 1.5) for (let lon = 8; lon <= 38; lon += 1.5) g.debugJumpTo(lat, lon)
  window.__ui.getState().toggleMap()
})
await page.waitForTimeout(500)
const mapPix = await page.evaluate(() => {
  const c = document.querySelector('.map-overlay canvas')
  if (!c) return null
  const ctx = c.getContext('2d')
  const lum = (x, y) => {
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
    return 0.299 * d[0] + 0.587 * d[1] + 0.587 * d[2]
  }
  return { explored: lum(c.width * 0.5, c.height * 0.28), fogged: lum(c.width * 0.5, c.height * 0.9) }
})
check(
  'exploration map: explored area is cleared while the unexplored is under fog',
  mapPix !== null && mapPix.explored > mapPix.fogged + 25,
  JSON.stringify(mapPix),
)
await page.locator('.map-overlay').screenshot({ path: `${OUT}92-map-fog-of-war.png` })
console.log('shot 92-map-fog-of-war.png')

// Point 89: the opened map sits BOTTOM-LEFT, clear of the inventory bar and the
// bottom-right camp/map/journal buttons, and shows a "you are here" marker.
const atlasPlace = await page.evaluate(() => {
  const ov = document.querySelector('.map-overlay')
  if (!ov) return null
  const o = ov.getBoundingClientRect()
  const rect = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null }
  const btn = (re) => { const b = [...document.querySelectorAll('button')].find((x) => re.test(x.textContent || '')); return b ? b.getBoundingClientRect() : null }
  const overlaps = (a, b) => !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
  return {
    left: o.left, right: o.right, bottom: o.bottom, vw: window.innerWidth, vh: window.innerHeight,
    bottomGap: window.innerHeight - o.bottom,
    overlapInv: overlaps(o, rect('.inventory-bar')),
    overlapJournalBtn: overlaps(o, btn(/Journal|Tagebuch/)),
    hasPlayer: !!document.querySelector('.map-overlay .map-player'),
  }
})
check(
  'the opened map is anchored bottom-left (point 89)',
  atlasPlace && atlasPlace.left < atlasPlace.vw * 0.2 && atlasPlace.bottom > atlasPlace.vh * 0.5 && atlasPlace.right < atlasPlace.vw * 0.65,
  JSON.stringify(atlasPlace),
)
check(
  'the map overlaps neither the inventory bar nor the bottom-right buttons (point 89)',
  atlasPlace && !atlasPlace.overlapInv && !atlasPlace.overlapJournalBtn,
  JSON.stringify(atlasPlace),
)
check('the atlas shows a you-are-here marker (point 89)', !!atlasPlace?.hasPlayer, JSON.stringify(atlasPlace))
// Point 115: the map keeps the SAME bottom gap to the controls as the journal
// panel (bottom: 56px), not the old raised 88px.
check(
  'the opened map bottom gap matches the journal (~56px, point 115)',
  atlasPlace && Math.abs(atlasPlace.bottomGap - 56) <= 6,
  `bottomGap ${atlasPlace?.bottomGap}`,
)
await page.evaluate(() => window.__ui.getState().toggleMap())

// Point 89: inside a settlement the town plan shows the live player marker too.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.enterPlace('cairo')
})
await page.waitForFunction(() => window.__game.getState().placeId === 'cairo', null, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(400)
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(300)
const planMarker = await page.evaluate(() => {
  const m = document.querySelector('.map-place-plan .map-player.map-player-svg')
  const svg = document.querySelector('.map-place-plan svg')
  if (!m || !svg) return { present: false }
  // The marker's RENDERED centre must follow its `transform` attribute, not be
  // stranded at the plate corner by a clobbering CSS transform (point 109). Map
  // the attribute's view-box coordinate through the svg's client box and compare.
  const vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number)
  const tr = (m.getAttribute('transform') || '').match(/translate\(([-\d.]+) ([-\d.]+)\)/)
  const sr = svg.getBoundingClientRect()
  const mr = m.getBoundingClientRect()
  const mc = { x: mr.x + mr.width / 2, y: mr.y + mr.height / 2 }
  if (!tr || vb[2] === 0) return { present: true, tracked: false }
  const scale = sr.width / vb[2]
  const expx = sr.x + (Number(tr[1]) - vb[0]) * scale
  const expy = sr.y + (Number(tr[2]) - vb[1]) * scale
  const drift = Math.hypot(mc.x - expx, mc.y - expy)
  const cornerDist = Math.hypot(mc.x - sr.x, mc.y - sr.y)
  return { present: true, tracked: drift < 12, drift: Math.round(drift), cornerDist: Math.round(cornerDist) }
})
check('the town plan shows a you-are-here marker (point 89)', planMarker.present, JSON.stringify(planMarker))
check(
  'the town-plan marker renders at its transform, not the plate corner (point 109)',
  planMarker.tracked && planMarker.cornerDist > 40,
  JSON.stringify(planMarker),
)
await page.evaluate(() => { window.__ui.getState().toggleMap(); window.__game.getState().leavePlace() })
await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 }).catch(() => {})

// --- Rivers: cascades, springs, lake surfaces (§7.1.21) ----------------------
const rivers = await page.evaluate(() => window.__rivers)
check('Rivers: 5 waterfall cascades', rivers?.falls === 5, `${rivers?.falls}`)
check('Rivers: at least one spring', (rivers?.springs ?? 0) >= 1, `${rivers?.springs}`)
check('Rivers: 8 lake surfaces', rivers?.lakes === 8, `${rivers?.lakes}`)
// Point 13: every river renders as one continuous, never-buried ribbon.
check('Rivers: no interior gaps (all continuous)', rivers?.gaps === 0, `gaps ${rivers?.gaps}`)
check('Rivers: surface never buried under the terrain', rivers?.buried === 0, `buried ${rivers?.buried}`)
// Confluence bank rule (user-reported artifact): tributaries mask their bank
// foam where their edges lie inside the joined water — the Nile system's
// joining rivers must report interior edges, while the masking stays LOCAL
// (only a small fraction of all edge vertices, never whole rivers).
{
  const rep = rivers?.report ?? {}
  const joined = ['white-nile', 'blue-nile'].map((id) => rep[id]?.interiorEdges ?? 0)
  const totals = Object.values(rep).reduce(
    (a, r) => ({ interior: a.interior + (r.interiorEdges ?? 0), strips: a.strips + r.strips }),
    { interior: 0, strips: 0 },
  )
  check('Rivers: confluence edges are masked (Nile tributaries report them)', joined.every((n) => n > 0), `white/blue nile ${joined.join('/')}`)
  check('Rivers: bank masking stays local (small interior fraction)', totals.interior > 0 && totals.interior < 400, `total interior edges ${totals.interior}`)
}
check('Rivers: the Nile is a single continuous strip', rivers?.report?.nile?.strips === 1, JSON.stringify(rivers?.report?.nile))
// TASKS pt. 11: every lake surface clears its highest interior bed sample —
// a buried sheet showed through in flickering blotches (Lake Victoria).
check(
  'Lakes: every surface sits above its interior bed (no blotchy show-through)',
  Array.isArray(rivers?.lakeInfo) && rivers.lakeInfo.length === 8 && rivers.lakeInfo.every((l) => l.y > l.bedMax),
  JSON.stringify(rivers?.lakeInfo),
)
// §7.1 pt. 21 screenshot evidence (71-73): the real water courses at the Nile
// (Aswan), Victoria Falls and Lake Victoria.
for (const [name, lat, lon] of [
  ['71-water-nile-aswan', 24.1, 32.9],
  ['72-water-victoria-falls', -17.92, 25.85],
  ['73-water-lake-victoria', -1.0, 33.0],
  // Point 156: footprints clear of the widened band — Khartoum at the
  // confluence and the Sudd's papyrus field on the White Nile.
  ['126-clearance-khartoum', 15.6, 32.5],
  ['127-clearance-sudd', 8.0, 30.5],
]) {
  await page.evaluate(([a, o]) => window.__game.getState().debugJumpTo(a, o), [lat, lon])
  await page.waitForTimeout(1500) // let the chunks and water surfaces stream in
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log(`shot ${name}.png`)
}

// --- Region border labels (§7.1.3) -------------------------------------------
await page.evaluate(() => window.__game.getState().debugJumpTo(17.2, -2))
// The drei <Html> labels mount a frame or two after the jump; on a cold first
// border visit that can exceed a fixed sleep. Poll until both are present (this
// only waits for the mount, it does not relax the assertion below).
await page
  .waitForFunction(
    () => {
      const l = [...document.querySelectorAll('.region-label')].map((e) => e.textContent)
      return l.includes('North') && l.includes('West')
    },
    null,
    { timeout: 10000 },
  )
  .catch(() => {})
const labels = await page.evaluate(() => [...document.querySelectorAll('.region-label')].map((e) => e.textContent))
check(
  'Border labels: both regions named on their sides',
  labels.includes('North') && labels.includes('West'),
  JSON.stringify([...new Set(labels)]),
)

// HUD hint geometry: in jungle without a machete the movement-penalty hint
// renders inside the status bar. Its TEXT (shown/cleared) is asserted in Vitest
// (StatusBar.test); what stays here is the real-layout geometry
// (getBoundingClientRect) that a jsdom test cannot measure. __terrainType is
// used only to locate a jungle tile (setup), not as an assertion.
const jungleSpot = await page.evaluate(() => {
  const seed = window.__game.getState().seed
  for (let lat = 3; lat >= -6; lat -= 0.5) {
    for (let lon = 14; lon <= 28; lon += 0.5) {
      if (window.__terrainType(lat, lon, seed) === 'jungle') return { lat, lon }
    }
  }
  return null
})
if (jungleSpot) {
  await page.evaluate((s) => {
    const g = window.__game.getState()
    // No machete in the pack, so the jungle penalty applies (possession-based).
    window.__game.setState({ equipment: { ...g.equipment, machete: 0, canoe: 0 } })
    g.debugJumpTo(s.lat, s.lon)
  }, jungleSpot)
  await page.waitForTimeout(250)
  const hint = await page.evaluate(() => {
    const bar = document.querySelector('.status-bar')
    const el = document.querySelector('.movement-penalty')
    if (!el || !bar) return { topRight: false }
    const r = el.getBoundingClientRect()
    const br = bar.getBoundingClientRect()
    // The hint is an actual child of the status bar (not a floating panel):
    // it is contained in the bar's DOM, its box stays within the bar's box,
    // and it sits at the bar's CENTRE (design.md §17.1).
    const insideBar = bar.contains(el) && r.top >= br.top - 1 && r.bottom <= br.bottom + 1
    const centreOff = Math.abs(r.left + r.width / 2 - (br.left + br.width / 2))
    return {
      centred: centreOff < br.width * 0.1 && insideBar,
      centreOff: Math.round(centreOff),
      hintTop: Math.round(r.top),
      barBottom: Math.round(br.bottom),
    }
  })
  await page.screenshot({ path: `${OUT}84-movement-penalty.png` })
  console.log('shot 84-movement-penalty.png')
  check('Movement penalty hint sits centred inside the status bar', hint.centred === true, `centreOff ${hint.centreOff}, hintTop ${hint.hintTop} vs barBottom ${hint.barBottom}`)
} else {
  check('Movement penalty hint: a jungle tile was found', false, 'no jungle tile located')
}

// Status-bar right zone (design.md §17.1, user-reported layout bug): the
// health bar hugs the BAR'S RIGHT EDGE — not the slot right after the stats —
// and an active affliction badge renders to the LEFT of the health bar.
// Real-layout geometry, so it lives here rather than in jsdom.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    window.__game.setState({ afflictions: { ...g.afflictions, dehydration: true } })
  })
  await page.waitForTimeout(150)
  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.status-bar')
    const health = document.querySelector('.health-bar')
    const badge = document.querySelector('.affliction-badge')
    if (!bar || !health) return { ok: false, why: 'missing elements' }
    const br = bar.getBoundingClientRect()
    const hr = health.getBoundingClientRect()
    const rightGap = br.right - hr.right
    const badgeLeftOfBar = badge ? badge.getBoundingClientRect().right <= hr.left + 1 : false
    return { ok: rightGap >= 0 && rightGap < 40 && badgeLeftOfBar, rightGap: Math.round(rightGap), badgeLeftOfBar }
  })
  await page.evaluate(() => {
    const g = window.__game.getState()
    window.__game.setState({ afflictions: { ...g.afflictions, dehydration: false } })
  })
  check(
    'health bar hugs the status bar right edge, badges to its left',
    layout.ok === true,
    `rightGap ${layout.rightGap}px, badgeLeftOfBar ${layout.badgeLeftOfBar}`,
  )
}

// --- Canoe depiction: ridden on water, dragged on land (§7.1.4, design.md §7) --
// With a canoe in the pack, travelling a water tile rides it (seated in the
// hull); on land the explorer drags it behind him; with no canoe he just walks.
// The Player component exposes __player.{canoeing,carrying}.
const findTile = (ty, lat0, lat1, lon0, lon1) =>
  page.evaluate(
    ({ ty, lat0, lat1, lon0, lon1 }) => {
      const seed = window.__game.getState().seed
      for (let lat = lat0; lat >= lat1; lat -= 0.3)
        for (let lon = lon0; lon <= lon1; lon += 0.3)
          if (window.__terrainType(lat, lon, seed) === ty) return { lat, lon }
      return null
    },
    { ty, lat0, lat1, lon0, lon1 },
  )
// Prefer the Nile's Nubian cataract stretch for the ride: its cross-channel
// bed slope is where the hull used to sink under the flat ribbon (the
// "flooded canoe"), so the evidence screenshot documents exactly that spot.
const waterSpot =
  (await findTile('water', 27, 25.5, 31.4, 33.2)) ?? (await findTile('water', 2, -6, 12, 34))
const landSpot = await findTile('desert', 24, 14, -6, 26)
if (waterSpot && landSpot) {
  await page.evaluate((s) => {
    const g = window.__game.getState()
    window.__game.setState({ equipment: { ...g.equipment, canoe: 1 } })
    g.debugJumpTo(s.lat, s.lon)
  }, waterSpot)
  await page.waitForTimeout(400)
  const ride = await page.evaluate(() => window.__player)
  check('Canoe: the explorer rides the canoe on water', ride?.canoeing === true && ride?.carrying === false, JSON.stringify(ride))
  // Zoom in for legible evidence (zoom-in below 1 is always allowed). The
  // camera and the freshly jumped-to chunks need a moment to settle, or the
  // shot catches a mid-transition view instead of the close-up.
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.3))
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}88-canoe-ride.png` })
  console.log('shot 88-canoe-ride.png')

  // On land with the canoe still in the pack: it is dragged behind, not ridden.
  await page.evaluate((s) => window.__game.getState().debugJumpTo(s.lat, s.lon), landSpot)
  await page.waitForTimeout(300)
  await page.evaluate(() => { const p = window.__game.getState().pos; window.__game.setState({ pos: { x: p.x, z: p.z - 2 } }) })
  await page.waitForTimeout(500)
  const drag = await page.evaluate(() => window.__player)
  check('Canoe: on land the explorer drags the canoe (not ridden)', drag?.carrying === true && drag?.canoeing === false, JSON.stringify(drag))
  // The dragged hull lies ON the terrain (design.md §7/§11): its far end
  // rests just above its own ground sample, with a bounded pose. The full
  // behaviour matrix (slopes, stones, animals, village edges) is pure-tested
  // in src/scenes/travel/canoeDrag.test.ts.
  check(
    'Canoe: the dragged hull rests on the ground behind (not buried, not floating)',
    typeof drag?.drag?.farY === 'number' &&
      Math.abs(drag.drag.farY - drag.drag.ground - 0.15) < 0.2 &&
      Math.abs(drag.drag.pitch) <= 0.66 &&
      Math.abs(drag.drag.roll) <= 0.36,
    JSON.stringify(drag?.drag),
  )
  await page.screenshot({ path: `${OUT}89-canoe-carry.png` })
  console.log('shot 89-canoe-carry.png')
  await page.evaluate(() => window.__ui.getState().setTravelZoom(1))

  // Stow the canoe (remove it): neither ridden nor dragged.
  await page.evaluate(() => {
    const g = window.__game.getState()
    window.__game.setState({ equipment: { ...g.equipment, canoe: 0 } })
  })
  await page.waitForTimeout(300)
  const none = await page.evaluate(() => window.__player)
  check('Canoe: no canoe in the pack, neither ridden nor dragged', none?.canoeing === false && none?.carrying === false, JSON.stringify(none))

  // --- Point 152: the swimmer floats ON the water, never walks the bed -------
  // Lake Edward is the witness case (user screenshot): its sheet spans the
  // lake-wide bedMax high above the carved rift bed, so a terrain-height
  // figure visibly walked the bottom under the water.
  const swim = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const g = window.__game.getState()
    window.__game.setState({ equipment: { ...g.equipment, canoe: 0 } })
    // The lake CENTER from the data (pure, import-safe): a border scan once
    // hit a cell where the coarse __terrainType and the sim's sampleTerrain
    // disagree (land at height 0.34) and the figure never swam.
    const lakes = await import('/src/world/data/lakes.ts')
    const edward = lakes.LAKES.find((l) => l.id === 'edward' || /edward/i.test(l.id))
    if (!edward) return { found: false }
    const spot = [edward.center[1], edward.center[0]]
    g.debugJumpTo(spot[0], spot[1])
    await sleep(800)
    return { found: true, spot, player: window.__player }
  })
  const swimGap = swim.found
    ? swim.player.surfaceY - (swim.player.refY + swim.player.figureLocalY)
    : NaN
  check(
    'a swimmer floats chest-deep ON the lake sheet — never on the carved bed (point 152)',
    swim.found && swim.player.swimming === true &&
      swim.player.surfaceY - swim.player.refY > 0.2 && // the bed genuinely lies below the sheet here
      Math.abs(swimGap - 0.35) < 0.12, // immersion, within the swim bob
    JSON.stringify({ spot: swim.spot, swimming: swim.player?.swimming, swimGap, surfOverBed: swim.found ? swim.player.surfaceY - swim.player.refY : null }),
  )
  await page.screenshot({ path: `${OUT}125-swim-lake-edward.png` })
  // State hygiene: the swim check leaves the player mid-Lake-Edward; jump
  // back to the Cairo reach so the downstream checks (vicinity seeding,
  // scripted hunts) run over their usual streamed chunks.
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.5, 31.4))
  await page.waitForTimeout(800)

  // --- Point 136 (the playability claim itself): a long driven canoe passage
  // down the Nile stays on water the whole way. Before the widening, steering
  // along the kinked course kept slipping the traveller onto land.
  const passage = await page.evaluate(async (spot) => {
    const hydro = await import('/src/world/hydro.ts')
    const g = window.__game.getState()
    window.__game.setState({ equipment: { ...g.equipment, canoe: 1 } })
    g.debugJumpTo(spot.lat, spot.lon) // a verified Nile water tile
    const st = () => window.__game.getState()
    let onWater = 0
    let offWater = 0
    for (let i = 0; i < 240; i++) {
      const p = st().pos
      const lat = -p.z / 10
      const lon = p.x / 10
      const flow = hydro.riverFlowExact(lat, lon)
      if (flow.strength <= 0) break // lost the river entirely
      // moveTravel takes a world-space direction (x east, z south).
      st().moveTravel(flow.dirLon, -flow.dirLat, 0.03)
      const q = st().pos
      const t = window.__terrainType(-q.z / 10, q.x / 10, st().seed)
      if (t === 'water') onWater++
      else offWater++
    }
    return { onWater, offWater }
  }, waterSpot)
  check(
    'Canoe: a long driven passage down the Nile stays on water the whole way (point 136)',
    passage.onWater >= 200 && passage.offWater === 0,
    JSON.stringify(passage),
  )

  // --- Injured figure: a wound shows on the explorer, scaling with severity ----
  // (§7.1.35, design.md §6). __player.wounds mirrors the toggled wound meshes.
  await page.evaluate(() => {
    const g = window.__game.getState()
    window.__game.setState({ afflictions: { ...g.afflictions, wounds: 2 } })
    window.__ui.getState().setTravelZoom(0.3)
  })
  await page.waitForTimeout(500)
  const hurt = await page.evaluate(() => window.__player)
  check('Injured figure: a severe wound shows on the explorer', hurt?.wounds === 2, JSON.stringify(hurt))
  await page.screenshot({ path: `${OUT}90-wounded-explorer.png` })
  console.log('shot 90-wounded-explorer.png')
  await page.evaluate(() => {
    const g = window.__game.getState()
    window.__game.setState({ afflictions: { ...g.afflictions, wounds: 0 } })
    window.__ui.getState().setTravelZoom(1)
  })
  await page.waitForTimeout(300)
  const healed = await page.evaluate(() => window.__player)
  check('Injured figure: healed explorer shows no wound', healed?.wounds === 0, JSON.stringify(healed))
} else {
  check('Canoe: a water tile and a land tile were found', false, `water=${JSON.stringify(waterSpot)} land=${JSON.stringify(landSpot)}`)
}

// --- Point 5: the journal panel stops above the camp/journal buttons ----------
// The open journal must not reach the bottom and cover the camp/journal toggle
// buttons; its bottom edge sits above their top edges with a small gap.
await page.evaluate(() => window.__game.getState().setJournalOpen(true))
await page.waitForTimeout(300)
const journalFit = await page.evaluate(() => {
  const j = document.querySelector('.journal')?.getBoundingClientRect()
  // The map button is always present (the camp button is conditional, point 93),
  // so gate the clearance on it — it shares the row's top edge.
  const map = document.querySelector('.map-toggle')?.getBoundingClientRect()
  const jbtn = document.querySelector('.journal-toggle')?.getBoundingClientRect()
  return { jBottom: j?.bottom ?? null, mapTop: map?.top ?? null, jbtnTop: jbtn?.top ?? null, jRight: j?.right ?? null, vw: window.innerWidth }
})
check(
  'journal panel ends above the map button (with a gap)',
  journalFit.jBottom !== null && journalFit.mapTop !== null && journalFit.jBottom <= journalFit.mapTop - 4,
  JSON.stringify(journalFit),
)
check(
  'journal panel ends above the journal button (with a gap)',
  journalFit.jBottom !== null && journalFit.jbtnTop !== null && journalFit.jBottom <= journalFit.jbtnTop - 4,
  JSON.stringify(journalFit),
)
check(
  'journal panel keeps a small gap to the right screen edge',
  journalFit.jRight !== null && journalFit.jRight <= journalFit.vw - 8,
  JSON.stringify(journalFit),
)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// --- Point 93: the bottom-right row orders map LEFT of journal, no overlap ----
const btnRow = await page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null }
  const map = r('.map-toggle'), journal = r('.journal-toggle'), camp = r('.camp-toggle')
  const overlaps = (a, b) => !!a && !!b && !(a.right <= b.left || a.left >= b.right)
  return {
    hasMap: !!map, hasJournal: !!journal,
    mapLeftOfJournal: !!map && !!journal && map.right <= journal.left + 1,
    overlapMapJournal: overlaps(map, journal),
    overlapCampMap: overlaps(camp, map),
  }
})
check('the map button sits left of the journal button (point 93)', btnRow.hasMap && btnRow.hasJournal && btnRow.mapLeftOfJournal, JSON.stringify(btnRow))
check('the bottom-right buttons do not overlap (point 93)', !btnRow.overlapMapJournal && !btnRow.overlapCampMap, JSON.stringify(btnRow))

// --- Lion: carcass consumed, lion moves on (§7.1.12) -------------------------
await page.evaluate(() => {
  const pos = window.__game.getState().pos
  const s = window.__lionHunt.state
  s.victim = null // a generic grazer feed (not a calf hunt)
  s.victimHunt = false
  s.px = pos.x + 5
  s.pz = pos.z - 3
  s.lx = s.px + 0.7
  s.lz = s.pz + 0.25
  s.mode = 'feed'
  s.timer = 0.4
})
await page.waitForTimeout(1200)
const leave = await page.evaluate(() => {
  const h = window.__lionHunt
  return {
    mode: h.state.mode,
    preyVisible: h.prey.current?.visible,
    stainVisible: h.stain.current?.visible,
    lionVisible: h.lion.current?.visible,
  }
})
check(
  'Lion moves on once the carcass is consumed (stain remains)',
  leave.mode === 'leave' && leave.preyVisible === false && leave.stainVisible === true && leave.lionVisible === true,
  `mode ${leave.mode}, prey ${leave.preyVisible}, stain ${leave.stainVisible}`,
)
await page.evaluate(() => {
  window.__lionHunt.state.mode = 'idle'
  window.__lionHunt.state.timer = 60
})

// --- Elephant trampling (§7.1.12) --------------------------------------------
// Jump to open savanna so herds exist, then ring a victim with elephants.
// Poll for a prey herd instead of a fixed sleep: under full-regression load
// the streaming takes far longer than usual to fill the plains.
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page
  .waitForFunction(
    () => {
      const h = window.__wildlife?.herdsRef?.current
      return !!h && ['zebra', 'antelope', 'giraffe'].some((sp) => (h[sp] ?? []).some((a) => !a.dead))
    },
    null,
    { timeout: 25000 },
  )
  .catch(() => {})
await page.waitForTimeout(600)
const trample = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w?.herdsRef?.current
  if (!herds) return { ok: false, why: 'no herds built' }
  const victimSpecies = ['zebra', 'antelope', 'giraffe'].find((sp) => herds[sp].length > 0)
  if (!victimSpecies) return { ok: false, why: 'no prey herd nearby' }
  const victim = herds[victimSpecies][0]
  // Ring of elephants around the victim: the wander offsets (±4.5) keep at
  // least one of them within trampling range at any time.
  for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [4.5, 4.5], [-4.5, -4.5]]) {
    herds.elephant.push({ x: victim.x + dx, z: victim.z + dz, y: victim.y, rot: 0, scale: 1, phase: 0 })
  }
  const deadline = Date.now() + 8000
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      if (victim.dead) {
        clearInterval(iv)
        resolve({ ok: true, stains: w.stains.current.length, species: victimSpecies })
      } else if (Date.now() > deadline) {
        clearInterval(iv)
        resolve({ ok: false, why: 'no trample within 8s' })
      }
    }, 150)
  })
})
check(
  'Elephant tramples a smaller animal (dead over a stain)',
  trample.ok === true && trample.stains >= 1,
  trample.ok ? `${trample.species}, ${trample.stains} stain(s)` : trample.why,
)
// TASKS pt. 12: every stain lies in the local slope plane (position + unit
// ground normal) — a horizontal disc on a hillside read as a Pac-Man.
const stainNormals = await page.evaluate(() => {
  const list = window.__wildlife.stains.current
  return list.map((st) => ({
    unit: +Math.hypot(st.nx, st.ny, st.nz).toFixed(3),
    nyPositive: st.ny > 0,
  }))
})
check(
  'blood stains carry a unit ground normal (slope-conforming decal)',
  stainNormals.length >= 1 && stainNormals.every((n) => Math.abs(n.unit - 1) < 0.01 && n.nyPositive),
  JSON.stringify(stainNormals.slice(0, 4)),
)

// Elephant herds roam together in gentle arcs; prey dodge only at the last
// moment (point 4). Set up on an open savanna patch near the player.
const herdTest = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w?.herdsRef?.current
  if (!herds) return { ok: false, why: 'no herds' }
  const terr = await import('/src/world/terrain.ts')
  const geo = await import('/src/world/geo.ts')
  const seed = window.__game.getState().seed
  const typeAt = (x, z) => {
    const ll = geo.worldToLatLon(x, z)
    return terr.sampleTerrain(ll.lat, ll.lon, seed).type
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__game.getState().pos
  let spot = null
  for (let r = 8; r <= 320 && !spot; r += 8) {
    for (let a = 0; a < 20 && !spot; a++) {
      const gx = p.x + Math.cos((a / 20) * Math.PI * 2) * r
      const gz = p.z + Math.sin((a / 20) * Math.PI * 2) * r
      if ([[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12], [9, 9], [-9, -9]].every(([dx, dz]) => typeAt(gx + dx, gz + dz) === 'savanna')) spot = { x: gx, z: gz }
    }
  }
  if (!spot) return { ok: false, why: 'no open savanna patch found' }
  const clear = () => {
    herds.elephant.length = 0
    for (const sp of ['zebra', 'antelope', 'giraffe']) herds[sp].length = 0
  }
  const mean = (arr, k) => arr.reduce((s, m) => s + m[k], 0) / arr.length

  // A herd of 5 sharing a herd id, clustered together.
  clear()
  const members = []
  for (let i = 0; i < 5; i++) {
    members.push({ x: spot.x + ((i % 3) - 1) * 2.2, z: spot.z + (Math.floor(i / 3) - 0.5) * 2.2, y: 0.2, rot: 0, scale: 1, phase: i * 1.3, herd: 424242 })
  }
  herds.elephant.unshift(...members) // front: stay inside the behaviour window
  const c0 = { x: mean(members, 'x'), z: mean(members, 'z') }
  const spreads = []
  const headingSnaps = []
  // Track the farthest the herd centre gets from its start, not just the
  // endpoint: the amble curves in arcs (and headless RAF is throttled), so a
  // net start→end distance can be small even though the herd clearly roamed.
  let maxCentreDisp = 0
  for (let k = 0; k < 44; k++) {
    let maxd = 0
    for (const a of members) for (const b of members) maxd = Math.max(maxd, Math.hypot(a.x - b.x, a.z - b.z))
    spreads.push(maxd)
    headingSnaps.push(members.map((m) => m.heading ?? 0))
    maxCentreDisp = Math.max(maxCentreDisp, Math.hypot(mean(members, 'x') - c0.x, mean(members, 'z') - c0.z))
    await sleep(180)
  }
  const cF = { x: mean(members, 'x'), z: mean(members, 'z') }
  const centreMoved = Math.max(maxCentreDisp, Math.hypot(cF.x - c0.x, cF.z - c0.z))
  const maxSpread = Math.max(...spreads)
  let maxTurn = 0
  for (let s = 1; s < headingSnaps.length; s++) {
    for (let m = 0; m < members.length; m++) {
      let dh = headingSnaps[s][m] - headingSnaps[s - 1][m]
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      maxTurn = Math.max(maxTurn, Math.abs(dh) / 0.18)
    }
  }

  // Prey dodges only at the last moment: far elephant → no dodge; near → flee.
  clear()
  // Inject at the FRONT: the behaviour loop processes at most MAX_INSTANCES
  // animals per species, and with the streamed population near its cap an
  // appended animal falls outside that window and never behaves at all.
  const prey = { x: spot.x, z: spot.z, y: 0.2, rot: 0, scale: 1, phase: 0.5 }
  herds.zebra.unshift(prey)
  const eleph = { x: spot.x + 7, z: spot.z, y: 0.2, rot: 0, scale: 1, phase: 0, heading: 0 }
  herds.elephant.unshift(eleph)
  const pf0 = { x: prey.x, z: prey.z }
  for (let k = 0; k < 10; k++) { eleph.x = spot.x + 7; eleph.z = spot.z; await sleep(120) }
  const movedWhileFar = Math.hypot(prey.x - pf0.x, prey.z - pf0.z)
  const dNearStart = Math.hypot(prey.x - (spot.x + 2), prey.z - spot.z)
  let dNearEnd = dNearStart
  for (let k = 0; k < 55; k++) { eleph.x = spot.x + 2; eleph.z = spot.z; await sleep(110); dNearEnd = Math.hypot(prey.x - eleph.x, prey.z - eleph.z) }

  // Diagnostics kept in the report: whether the injected pair was still being
  // simulated at the end (streaming can remove or displace injected animals).
  const diag = {
    preyIdx: herds.zebra.indexOf(prey),
    zebraN: herds.zebra.length,
    elephIdx: herds.elephant.indexOf(eleph),
    elephN: herds.elephant.length,
    playerDist: Math.hypot(window.__game.getState().pos.x - spot.x, window.__game.getState().pos.z - spot.z),
    dodge: prey.dodgeHeading ?? null,
  }
  return { ok: true, centreMoved, maxSpread, maxTurn, movedWhileFar, dNearStart, dNearEnd, diag }
})
check('an elephant herd roams (its centre moves)', herdTest.ok && herdTest.centreMoved > 1.5, JSON.stringify(herdTest))
check('the herd stays together (does not disperse)', herdTest.ok && herdTest.maxSpread < 16, JSON.stringify(herdTest))
check('elephants turn only in gentle arcs (no sharp turns)', herdTest.ok && herdTest.maxTurn < 1.2, JSON.stringify(herdTest))
check('prey does not dodge a distant elephant', herdTest.ok && herdTest.movedWhileFar < 0.5, JSON.stringify(herdTest))
check('prey darts away from a close elephant (last-moment dodge)', herdTest.ok && herdTest.dNearEnd > herdTest.dNearStart + 0.5, JSON.stringify(herdTest))

// --- Point 1: the dodge heading stays stable (no ~90° oscillation) -----------
// A prey straddled by two elephants ~90° apart must flee a single, steady
// direction — the old nearest-threat pick flip-flopped its facing between the
// two flankers. Keep the elephants flanking the fleeing prey and watch its
// persisted dodgeHeading: it must barely change and never reverse.
const oscillate = await page.evaluate(async () => {
  const herds = window.__wildlife.herdsRef.current
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  herds.elephant.length = 0
  for (const sp of ['zebra', 'antelope', 'giraffe', 'wildebeest', 'warthog']) herds[sp].length = 0
  const p = window.__game.getState().pos
  const prey = { x: p.x, z: p.z, y: 0.2, rot: 0, scale: 1, phase: 0.5 }
  herds.zebra.push(prey)
  // Two elephants flanking the prey ~90° apart (slightly asymmetric), pinned
  // relative to the prey each frame so they keep pace and it stays in range.
  const a = { x: prey.x + 2.2, z: prey.z + 2.2, y: 0.2, rot: 0, scale: 1, phase: 0, heading: 0 }
  const b = { x: prey.x + 2.6, z: prey.z - 1.6, y: 0.2, rot: 0, scale: 1, phase: 0, heading: 0 }
  herds.elephant.push(a, b)
  const start = { x: prey.x, z: prey.z }
  const samples = []
  const faces = []
  for (let k = 0; k < 34; k++) {
    a.x = prey.x + 2.2; a.z = prey.z + 2.2
    b.x = prey.x + 2.6; b.z = prey.z - 1.6
    await sleep(70)
    if (typeof prey.dodgeHeading === 'number') samples.push(prey.dodgeHeading)
    if (typeof prey.face === 'number') faces.push(prey.face)
  }
  // Disengage: remove the threats and keep sampling the RENDERED facing — the
  // end of a flight must not snap the body back to some resting orientation
  // (the old bug: yaw fell back to the spawn rot within one frame).
  herds.elephant.length = 0
  for (let k = 0; k < 12; k++) {
    await sleep(70)
    if (typeof prey.face === 'number') faces.push(prey.face)
  }
  const wrap = (d) => {
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }
  // Per-frame turn stays rate-limited (the heading can never snap): the cap is
  // PREY_DODGE_TURN·dt = 8·0.1 = 0.8 rad on a throttled frame, so a step well
  // under that proves no snap (the old bug jumped ~1.57 rad / 90°).
  let maxDelta = 0
  for (let i = 1; i < samples.length; i++) maxDelta = Math.max(maxDelta, Math.abs(wrap(samples[i] - samples[i - 1])))
  // The RENDERED facing obeys the same cap across the whole episode,
  // including the moment the flight disengages (FACE_TURN·dt ≤ 0.7 throttled).
  let maxFaceDelta = 0
  for (let i = 1; i < faces.length; i++) maxFaceDelta = Math.max(maxFaceDelta, Math.abs(wrap(faces[i] - faces[i - 1])))
  // The whole flee stays in one steady direction: the heading never wanders far
  // from where it settled (the old bug swung ~90° between the two flankers).
  const base = samples[Math.min(3, samples.length - 1)] ?? 0
  let spread = 0
  for (let i = 3; i < samples.length; i++) spread = Math.max(spread, Math.abs(wrap(samples[i] - base)))
  const moved = Math.hypot(prey.x - start.x, prey.z - start.z)
  herds.zebra.length = 0
  return { n: samples.length, nFace: faces.length, maxDelta: +maxDelta.toFixed(3), maxFaceDelta: +maxFaceDelta.toFixed(3), spread: +spread.toFixed(3), moved: +moved.toFixed(2) }
})
check('a fleeing prey dodges without oscillating (stable heading)',
  oscillate.n >= 8 && oscillate.maxDelta < 0.85 && oscillate.spread < 0.6 && oscillate.moved > 0.5,
  JSON.stringify(oscillate))
check('the rendered facing never snaps — not even when the flight disengages',
  oscillate.nFace >= 12 && oscillate.maxFaceDelta < 0.9,
  JSON.stringify(oscillate))

// A tailing elephant at the trigger ring must not flap the dodge on and off
// (hysteresis + adopted resting orientation): the rendered facing stays under
// the turn cap through repeated engage/disengage cycles.
const ringFlap = await page.evaluate(async () => {
  const herds = window.__wildlife.herdsRef.current
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  herds.elephant.length = 0
  for (const sp of ['zebra', 'antelope', 'giraffe', 'wildebeest', 'warthog']) herds[sp].length = 0
  const p = window.__game.getState().pos
  const prey = { x: p.x, z: p.z, y: 0.2, rot: 0, scale: 1, phase: 0.5 }
  herds.zebra.push(prey)
  const eleph = { x: prey.x + 3.0, z: prey.z, y: 0.2, rot: 0, scale: 1, phase: 0, heading: 0 }
  herds.elephant.push(eleph)
  const faces = []
  for (let k = 0; k < 40; k++) {
    // Re-pin the elephant right at the trigger ring of the prey's CURRENT
    // spot every few polls — engage, escape past the ring, engage again.
    if (k % 4 === 0) { eleph.x = prey.x + 3.0; eleph.z = prey.z }
    await sleep(70)
    if (typeof prey.face === 'number') faces.push(prey.face)
  }
  const wrap = (d) => {
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }
  let maxFaceDelta = 0
  for (let i = 1; i < faces.length; i++) maxFaceDelta = Math.max(maxFaceDelta, Math.abs(wrap(faces[i] - faces[i - 1])))
  herds.elephant.length = 0
  herds.zebra.length = 0
  return { n: faces.length, maxFaceDelta: +maxFaceDelta.toFixed(3) }
})
check('a tailing elephant at the ring cannot flip the facing (hysteresis holds)',
  ringFlap.n >= 20 && ringFlap.maxFaceDelta < 0.9, JSON.stringify(ringFlap))

// Elephants face their line of travel (they used to render their random
// spawn orientation while walking a different heading).
const elephantFacing = await page.evaluate(async () => {
  const herds = window.__wildlife.herdsRef.current
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  herds.elephant.length = 0
  const p = window.__game.getState().pos
  const e = { x: p.x + 6, z: p.z, y: 0.2, rot: 2.4, scale: 1, phase: 0, heading: 0.7, herd: 771177 }
  herds.elephant.push(e)
  await sleep(2500) // roam a little; the facing settles onto the heading
  const wrap = (d) => {
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }
  const off = typeof e.face === 'number' && typeof e.heading === 'number' ? Math.abs(wrap(e.face - e.heading)) : null
  herds.elephant.length = 0
  return { off: off === null ? null : +off.toFixed(3), heading: +(+e.heading).toFixed(3) }
})
check('an elephant faces its line of travel (facing tracks the roam heading)',
  elephantFacing.off !== null && elephantFacing.off < 0.6, JSON.stringify(elephantFacing))

// --- Prey flees smoothly, never teleporting (point 7) ------------------------
// When a predator becomes active the prey must run away by accumulating into
// its position, not snap outward by a fixed offset (the old scatter bug).
const flee = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const lh = window.__lionHunt.state
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  lh.mode = 'idle'; lh.timer = 999
  for (const sp of ['zebra', 'antelope', 'giraffe', 'wildebeest', 'warthog', 'elephant']) herds[sp] = herds[sp].filter(() => false)
  const p = window.__game.getState().pos
  const z = { x: p.x + 3, z: p.z, y: 0.2, rot: 0, scale: 1, phase: 0.5 }
  herds.zebra.push(z)
  await sleep(200)
  const before = { x: z.x, z: z.z }
  // Activate a predator right next to the prey and pin it there.
  lh.predator = 'cheetah'; lh.mode = 'chase'; lh.timer = 999
  lh.lx = p.x; lh.lz = p.z; lh.px = z.x; lh.pz = z.z
  let prev = { x: z.x, z: z.z }
  let maxStep = 0
  let samples = 0
  for (let i = 0; i < 25; i++) {
    lh.lx = p.x; lh.lz = p.z // keep the predator pinned
    await sleep(40)
    const step = Math.hypot(z.x - prev.x, z.z - prev.z)
    if (i > 0) { maxStep = Math.max(maxStep, step); samples++ }
    prev = { x: z.x, z: z.z }
  }
  const total = Math.hypot(z.x - before.x, z.z - before.z)
  lh.mode = 'idle'; lh.timer = 60
  return { total, maxStep, samples, movedAway: total > 1 }
})
check('prey flees the predator (moves away)', flee.movedAway === true, JSON.stringify(flee))
check('the flee never teleports (no single-frame jump)', flee.maxStep < 2, JSON.stringify(flee))

// --- Zoom-aware streaming despawn (point 5) ----------------------------------
// Animals stay alive while they may be on screen and only despawn well beyond
// the view; the kept radius scales with the bird's-eye zoom. Moves are made in
// world space (pos is {x,z}) so a fixed distance can be compared against the
// zoom-scaled despawn radius.
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
// The elephant/oscillation/flee tests above emptied herd arrays while their
// chunk keys stayed registered — restock so the area streams in fresh.
await page.evaluate(() => window.__wildlife.restock())
await waitForHerds()
const stream = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const sp5 = ['zebra', 'antelope', 'giraffe', 'elephant', 'flamingo']
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const setPos = (x, z) => window.__game.setState({ pos: { x, z } })
  const nearest = () => {
    const p = window.__game.getState().pos
    let best = null
    let bd = Infinity
    // Only real streamed animals (with a chunk tag) can despawn; skip any
    // leftover injected animals from earlier tests (no chunk).
    for (const sp of sp5) for (const a of herds[sp]) { if (a.dead || !a.chunk) continue; const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < bd) { bd = d; best = a } }
    return best
  }
  const hasMark = (k) => sp5.some((sp) => herds[sp].some((a) => a.__mark === k))

  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(1)
  const p0 = { ...window.__game.getState().pos }
  const m1 = nearest()
  if (!m1) return { ok: false, why: 'no animals spawned' }
  m1.__mark = 'A'
  // Cross a chunk boundary (CHUNK_SIZE 24) but stay well within view.
  setPos(p0.x + 36, p0.z)
  await sleep(1200)
  const survivesCross = hasMark('A')
  // Move far past the zoom-1 despawn radius (~160 world units).
  setPos(p0.x + 600, p0.z + 600)
  await sleep(1600)
  const goneWhenFar = !hasMark('A')

  // At a wider zoom the same distance is still in view and is kept.
  window.__game.getState().debugJumpTo(-2.2, 34.8)
  await sleep(1600)
  window.__ui.getState().setTravelZoom(3)
  const p3 = { ...window.__game.getState().pos }
  const m3 = nearest()
  if (!m3) return { ok: false, why: 'no animals (zoom 3)' }
  m3.__mark = 'B'
  window.__ui.getState().setTravelZoom(1)
  setPos(p3.x + 230, p3.z)
  await sleep(1600)
  const goneAtZoom1 = !hasMark('B')
  // Reset, remark, repeat at zoom 3 (wider despawn radius keeps it).
  window.__game.getState().debugJumpTo(-2.2, 34.8)
  await sleep(1600)
  window.__ui.getState().setTravelZoom(3)
  const p3b = { ...window.__game.getState().pos }
  const m3b = nearest()
  if (!m3b) return { ok: false, why: 'no animals (zoom 3b)' }
  m3b.__mark = 'C'
  setPos(p3b.x + 230, p3b.z)
  await sleep(1600)
  const keptAtZoom3 = hasMark('C')
  window.__ui.getState().setTravelZoom(1)
  window.__ui.getState().setWheelZoomEnabled(false)
  return { ok: true, survivesCross, goneWhenFar, goneAtZoom1, keptAtZoom3 }
})
check('an animal survives a chunk-boundary crossing while in view', stream.ok && stream.survivesCross, JSON.stringify(stream))
check('an animal despawns once well outside the view', stream.ok && stream.goneWhenFar, JSON.stringify(stream))
check('zoom-out keeps animals the default view would despawn', stream.ok && stream.goneAtZoom1 && stream.keptAtZoom3, JSON.stringify(stream))

// --- Scavenging of a non-lion carcass (point 5) ------------------------------
// A carcass that was not eaten by the lion (e.g. trampled) draws a vulture that
// flies in, lands and consumes it, dissolving it as a lion kill does.
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page.waitForTimeout(1600)
const scavenge = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const sp5 = ['zebra', 'antelope', 'giraffe', 'elephant', 'flamingo']
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // Clear any leftover carcasses so the scavenger targets ours.
  for (const sp of sp5) herds[sp] = herds[sp].filter((a) => !a.dead)
  w.scavenger.current.target = null
  const p = window.__game.getState().pos
  const carcass = { x: p.x + 3, z: p.z + 3, y: 0.2, rot: 0, scale: 1, phase: 0, dead: true, chunk: 'inject' }
  herds.zebra.push(carcass)
  let landed = false
  let dissolveStarted = false
  // The scavenger now flies in from beyond the view ring (design.md §19), so
  // the approach itself takes several seconds before it can land.
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const sc = w.scavenger.current
    if (sc.target === carcass && sc.landed) landed = true
    if (typeof carcass.dissolve === 'number' && carcass.dissolve < 9) dissolveStarted = true
    if (landed && dissolveStarted) break
    await sleep(120)
  }
  // Fast-forward the consumption and confirm the carcass is removed.
  carcass.dissolve = 0.02
  let removed = false
  const d2 = Date.now() + 4000
  while (Date.now() < d2) {
    if (!herds.zebra.includes(carcass)) { removed = true; break }
    await sleep(100)
  }
  return { landed, dissolveStarted, removed }
})
check('a scavenger flies in and lands on a non-lion carcass', scavenge.landed, JSON.stringify(scavenge))
check('the scavenged carcass dissolves and is removed', scavenge.dissolveStarted && scavenge.removed, JSON.stringify(scavenge))

// --- Point 56: the traveller collides with animals -----------------------------
// design.md §19: the bird's-eye traveller cannot walk through wildlife. Pin a
// live animal ahead of the player (clear of him), drive straight at it, and
// confirm his path never enters the animal's body — he is turned aside (slides
// around) rather than passing through it (which would drop the distance to ~0).
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
// Poll until streamed animals exist: the injected test zebra borrows a live
// chunk key from them, and under load the streaming lags a fixed sleep.
await page
  .waitForFunction(
    () => {
      const h = window.__wildlife?.herdsRef?.current
      if (!h) return false
      for (const sp of Object.keys(h)) if (h[sp].some((a) => a.chunk && !a.dead)) return true
      return false
    },
    null,
    { timeout: 25000 },
  )
  .catch(() => {})
await page.waitForTimeout(400)
const animalHit = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const p0 = window.__game.getState().pos
  const ax = p0.x + 2.6 // 2.6 east — clear of the player (body+player ≈ 1.2)
  const az = p0.z
  // A VALID nearby chunk key (borrowed from any live streamed animal) keeps
  // the injected zebra out of the streaming despawn entirely: with an invalid
  // key it was despawned and re-injected each poll, and under full-regression
  // load the player could drive through it inside that gap. Front insertion
  // keeps it inside the MAX_INSTANCES behaviour window.
  const liveChunk = (() => {
    const h = window.__wildlife.herdsRef.current
    if (!h) return undefined
    for (const sp of Object.keys(h)) for (const a of h[sp]) if (a.chunk && !a.dead) return a.chunk
    return undefined
  })()
  const zebra = { x: ax, z: az, y: 0.2, rot: 0, scale: 1, phase: 0, chunk: liveChunk ?? 'collide-test' }
  // Clear the drive corridor of every OTHER animal (point 135e): the
  // guarantee seeders (vicinity, dry shore) can stand a grazer on the
  // straight line to the pinned target, and the traveller then collides —
  // correctly — with the wrong body and never reaches the test target.
  {
    const p0 = window.__game.getState().pos
    const h0 = window.__wildlife.herdsRef.current
    if (h0) {
      for (const sp of Object.keys(h0)) {
        for (const a of h0[sp]) {
          if (a === zebra || a.dead) continue
          const onCorridor =
            a.x > Math.min(p0.x, ax) - 4 && a.x < Math.max(p0.x, ax) + 4 &&
            Math.abs(a.z - az) < 6
          if (onCorridor) a.z += 25 // shove it well off the line
        }
      }
    }
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })) // drive east, straight at it
  let minDist = Infinity
  let reached = false // the player got within engaging range at some point
  const t0 = Date.now()
  while (Date.now() - t0 < 2500) {
    // Fallback: should the zebra be streamed out regardless, re-add and re-pin
    // it — the real game collides against genuinely streamed animals, this
    // only keeps the fixed test target present.
    const herds = window.__wildlife.herdsRef.current
    if (herds && !herds.zebra.includes(zebra)) herds.zebra.unshift(zebra)
    zebra.x = ax
    zebra.z = az
    const p = window.__game.getState().pos
    const d = Math.hypot(p.x - ax, p.z - az)
    minDist = Math.min(minDist, d)
    if (d < 2) reached = true
    await sleep(20)
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }))
  // Escape phase (regression for the collision blocker): once stopped against the
  // animal, steering must still work — drive back WEST, away from it, and confirm
  // the traveller actually moves clear instead of being pinned to the boundary.
  // Condition-polled with a generous timeout: the distance covered per wall-clock
  // window is frame-count-dependent and collapses under full-regression load
  // (a fixed 1500 ms window flaked at escaped 1.36 vs 5.3 standalone).
  const contact = window.__game.getState().pos
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' })) // drive west, away
  const t1 = Date.now()
  let escaped = 0
  while (Date.now() - t1 < 12000) {
    const herds2 = window.__wildlife.herdsRef.current
    if (herds2 && !herds2.zebra.includes(zebra)) herds2.zebra.unshift(zebra)
    zebra.x = ax
    zebra.z = az
    escaped = contact.x - window.__game.getState().pos.x // >0 means moved west, away
    if (escaped > 1.6) break // clear of the boundary — not pinned
    await sleep(20)
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }))
  const herds = window.__wildlife.herdsRef.current
  if (herds) herds.zebra = herds.zebra.filter((a) => a !== zebra)
  return { minDist, reached, escaped }
})
check(
  'the traveller collides with an animal (drives into it but never enters its body)',
  animalHit.reached && animalHit.minDist > 0.95,
  JSON.stringify(animalHit),
)
check(
  'steering still works after the collision (the traveller drives back clear, not pinned)',
  animalHit.escaped > 1.5,
  JSON.stringify(animalHit),
)

// --- Carcasses do not accumulate off-screen (freeze fix) ---------------------
// A single scavenger cannot keep up with every kill, so carcasses left far off
// the screen are culled silently; only near (visible) ones linger. Without this
// the herd arrays grow without bound and eventually stall the frame loop.
const carcassBound = await page.evaluate(async () => {
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const sp5 = ['zebra', 'antelope', 'giraffe', 'elephant', 'flamingo']
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (const sp of sp5) herds[sp] = herds[sp].filter((a) => !a.dead)
  w.scavenger.current.target = null
  const p = window.__game.getState().pos
  const near = { x: p.x + 3, z: p.z + 3, y: 0.2, rot: 0, scale: 1, phase: 0, dead: true, chunk: 'near' }
  herds.zebra.push(near)
  for (let i = 0; i < 300; i++) {
    herds.zebra.push({ x: p.x + 900 + i, z: p.z + 900, y: 0.2, rot: 0, scale: 1, phase: 0, dead: true, chunk: `far${i}` })
  }
  const before = herds.zebra.filter((a) => a.dead).length
  // Player stays put; a few frames are enough for the per-frame cull.
  await sleep(700)
  const list = w.herdsRef.current.zebra
  const after = list.filter((a) => a.dead).length
  return { before, after, nearKept: list.includes(near) }
})
check('off-screen carcasses are culled (bounded growth)', carcassBound.before >= 300 && carcassBound.after < 30, JSON.stringify(carcassBound))
check('a carcass in view is kept (dissolves on screen, not popped)', carcassBound.nearKept === true, JSON.stringify(carcassBound))

// --- Family life: young that nurse, parents that guard, bathing (§7.1.8) ------
// design.md §19 richer interactions: grazer/elephant herds raise a calf that
// keeps close to a parent; a parent moves between an approaching predator and
// its calf (defends the young); and some shore visitors wade in and bathe.
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page.evaluate(() => window.__wildlife.restock())
await waitForHerds()
// A calf keeps close to its parent only after a few spawn+follow frames; give
// the family behaviours a moment to settle once the herds are present.
await page.waitForTimeout(2000)
const familyLife = await page.evaluate(() => {
  const herds = window.__wildlife.herdsRef.current
  const SP = ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe', 'elephant']
  let young = 0, close = 0
  for (const sp of SP)
    for (const a of herds[sp] ?? []) {
      if (a.young && a.parent && !a.parent.dead) {
        young++
        if (Math.hypot(a.x - a.parent.x, a.z - a.parent.z) < 5) close++
      }
    }
  return { young, close }
})
check('herds raise young that keep close to a parent (nursing)', familyLife.young > 0 && familyLife.close > 0, JSON.stringify(familyLife))

// --- No jitter (design.md §19): a playing calf's step direction must not saw
// back and forth between frames (the old play/follow boundary ping-pong).
// Track any hopping calf's position; count per-sample direction reversals.
const calfJitter = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const SP = ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe']
  let samples = 0
  let flips = 0
  let tracked = null
  let last = null
  let lastStep = null
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && samples < 40) {
    if (!tracked || tracked.dead || tracked.hop === undefined) {
      tracked = null
      for (const sp of SP) {
        tracked = (herds[sp] ?? []).find((a) => a.young && a.hop !== undefined && !a.dead)
        if (tracked) break
      }
      last = null
      lastStep = null
    }
    if (tracked) {
      if (last) {
        const dx = tracked.x - last.x
        const dz = tracked.z - last.z
        const m = Math.hypot(dx, dz)
        if (m > 0.01) {
          if (lastStep && dx * lastStep.dx + dz * lastStep.dz < 0) flips++
          lastStep = { dx, dz }
          samples++
        }
      }
      last = { x: tracked.x, z: tracked.z }
    }
    await sleep(80)
  }
  return { samples, flips }
})
check(
  'a playing calf moves without direction sawtooth (no trembling)',
  calfJitter.samples >= 20 && calfJitter.flips / Math.max(1, calfJitter.samples) < 0.15,
  JSON.stringify(calfJitter),
)

// A parent does NOT orbit a lion that is FEEDING on other prey near its calf
// (point 118): the guard only engages a HUNTING lion, so beside a feeder the
// family flees instead of the parent oscillating around it forever. Force a lion
// feeding beside a calf and sample the parent: its step direction must not
// saw-tooth and it must move AWAY from the lion. (Runs after the ambient
// playing-calf check above so its lion-feed disturbance cannot starve it.)
const guardFlee = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const s = window.__lionHunt.state
  const SP = ['zebra', 'wildebeest', 'antelope', 'warthog']
  let calf = null, parent = null, decoy = null
  for (const sp of SP) for (const a of herds[sp] ?? []) {
    if (!calf && a.young && a.parent && !a.parent.dead && !a.dead && a.inWater === undefined && a.parent.inWater === undefined) { calf = a; parent = a.parent }
  }
  if (!calf) return { error: 'no pair' }
  for (const sp of SP) for (const a of herds[sp] ?? []) { if (!decoy && a !== calf && a !== parent && !a.dead && !a.young && a.inWater === undefined) decoy = a }
  if (!decoy) return { error: 'no decoy' }
  parent.child = calf; calf.parent = parent
  decoy.x = calf.x + 2; decoy.z = calf.z + 1
  s.mode = 'feed'; s.victim = decoy; s.timer = 60
  s.lx = calf.x + 2; s.lz = calf.z + 1; s.px = s.lx; s.pz = s.lz // lion feeding ~2 from the calf
  const dStart = Math.hypot(parent.x - s.lx, parent.z - s.lz)
  let last = null, lastStep = null, flips = 0, samples = 0
  for (let i = 0; i < 20; i++) {
    await sleep(150)
    if (last) {
      const dx = parent.x - last.x, dz = parent.z - last.z
      if (Math.hypot(dx, dz) > 0.02) { if (lastStep && dx * lastStep.dx + dz * lastStep.dz < 0) flips++; lastStep = { dx, dz }; samples++ }
    }
    last = { x: parent.x, z: parent.z }
  }
  const dEnd = Math.hypot(parent.x - s.lx, parent.z - s.lz)
  s.mode = 'idle'; s.timer = 0; s.victim = null; s.victimHunt = false // calm the scene again
  return { reversalRate: +(flips / Math.max(1, samples)).toFixed(2), fled: dEnd - dStart, samples }
})
check(
  'a parent flees a feeding lion beside its calf instead of orbiting it (point 118)',
  guardFlee && !guardFlee.error && guardFlee.samples >= 6 && guardFlee.reversalRate < 0.2 && guardFlee.fled > 2,
  JSON.stringify(guardFlee),
)

// A calf trampled by an elephant takes its parent with it (point 119): the
// parent throws itself before the elephant's feet and is trampled too. Grief,
// not a rescue — it must CLOSE on the elephant (ordinary prey dodges away) and
// end up dead over its own stain. Park an elephant on a calf and watch both.
const trampleGrief = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const SP = ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe']
  let calf = null, parent = null
  for (const sp of SP) for (const a of herds[sp] ?? []) {
    if (!calf && a.young && a.parent && !a.dead && !a.parent.dead && a.inWater === undefined && a.parent.inWater === undefined) { calf = a; parent = a.parent }
  }
  if (!calf) return { error: 'no pair' }
  parent.x = calf.x + 9; parent.z = calf.z // park it clear so the approach is measurable
  const eleph = { x: calf.x, z: calf.z, y: calf.y, rot: 0, scale: 1, phase: 0, heading: 0 }
  herds.elephant.push(eleph)
  const stains0 = w.stains.current.length
  let calfDead = false
  for (let i = 0; i < 40 && !calfDead; i++) { await sleep(100); calfDead = calf.dead === true }
  const charged = parent.trampleTo !== undefined // it inherited the grief
  // Measure the approach against the elephant the grief ACTUALLY charges —
  // the nearest living one — not against the injected decoy: with a natural
  // herd nearby the parent (correctly) went for a different animal and the
  // decoy-based "closed" metric read negative on a successful trample
  // (point 135d — a measurement bug, not a sim bug).
  const target = (() => {
    let best = null
    let bd = Infinity
    for (const e of herds.elephant) {
      if (e.dead) continue
      const d = Math.hypot(parent.x - e.x, parent.z - e.z)
      if (d < bd) { bd = d; best = e }
    }
    return best
  })()
  const d0 = target ? Math.hypot(parent.x - target.x, parent.z - target.z) : NaN
  let parentDead = false
  for (let i = 0; i < 60 && !parentDead; i++) { await sleep(100); parentDead = parent.dead === true }
  const d1 = target ? Math.hypot(parent.x - target.x, parent.z - target.z) : NaN
  const stainsAdded = w.stains.current.length - stains0
  const idx = herds.elephant.indexOf(eleph)
  if (idx >= 0) herds.elephant.splice(idx, 1) // calm the scene for the next check
  return { calfDead, charged, parentDead, closed: d0 - d1, stainsAdded }
})
check(
  'a parent whose calf is trampled throws itself before the elephant and is trampled too (point 119)',
  trampleGrief && !trampleGrief.error && trampleGrief.calfDead && trampleGrief.charged &&
    trampleGrief.parentDead && trampleGrief.closed > 2 && trampleGrief.stainsAdded >= 2,
  JSON.stringify(trampleGrief),
)

// Bathing needs shore visitors, which only spawn where a savanna herd sits
// within reach of water. Find savanna tiles near water for the current seed
// (so this does not depend on hand-picked coordinates), then roam them until a
// herd with drink targets has streamed in and some of them also bathe.
const shoreSpots = await page.evaluate(() => {
  const seed = window.__game.getState().seed
  const T = window.__terrainType
  const nearWater = (lat, lon) => {
    for (let dlat = -0.35; dlat <= 0.35; dlat += 0.1)
      for (let dlon = -0.35; dlon <= 0.35; dlon += 0.1)
        if (T(lat + dlat, lon + dlon, seed) === 'water') return true
    return false
  }
  const spots = []
  // East/central African lakes-and-rivers belt — plenty of savanna shoreline.
  // Keep the spots spread out: neighbouring scan cells respawn the very same
  // deterministic herds, which would only re-count the same drinkers.
  // A wide band and a generous spot cap: the bathe flag is a 40% roll per
  // drinker and re-seeds per run, so a small drinker sample fails ~3% of
  // runs by pure chance — the roam must be able to gather a real sample.
  for (let lat = 4; lat >= -16 && spots.length < 48; lat -= 0.4)
    for (let lon = 27; lon <= 38 && spots.length < 48; lon += 0.4)
      if (
        T(lat, lon, seed) === 'savanna' &&
        nearWater(lat, lon) &&
        spots.every(([sl, sn]) => Math.hypot(sl - lat, sn - lon) > 1.2)
      )
        spots.push([lat, lon])
  return spots
})
// Aggregate drinkers/bathers over ALL roamed shores: ~40 % of drinkers bathe,
// so a single shore with a handful of drinkers can easily hold none — the
// union across shores makes the sample large enough to be reliable. The roam
// runs at zoom 1: the streaming ring scales with the zoom, and the closer 0.5
// default streams too small a shore population for a reliable sample.
await page.evaluate(() => {
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(1)
})
const bathe = { drinkers: 0, bathers: 0, animalsSeen: 0 }
const drinkerKeys = new Set() // unique drinkers only — respawns must not re-count
for (const spot of shoreSpots) {
  await page.evaluate((s) => window.__game.getState().debugJumpTo(s[0], s[1]), spot)
  // A shore spot can fall into a settlement's enter radius — the place scene
  // then unmounts the wildlife. Step back out and skip such a spot.
  const inTravel = await page.evaluate(() => {
    if (window.__game.getState().mode !== 'travel') {
      window.__game.getState().leavePlace()
      return false
    }
    return true
  })
  if (!inTravel) continue
  await page.evaluate(() => window.__wildlife.restock())
  await waitForHerds()
  const gotDrinkers = await page
    .waitForFunction(
      () => {
        const h = window.__wildlife?.herdsRef?.current
        if (!h) return false
        let d = 0
        for (const sp of Object.keys(h)) d += h[sp].filter((a) => a.drink && !a.dead).length
        return d >= 1 // any drinker lets this shore contribute to the aggregate
      },
      null,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false)
  if (gotDrinkers) {
    const here = await page.evaluate(() => {
      const h = window.__wildlife?.herdsRef?.current
      const drinkers = []
      let bathers = 0, animals = 0
      if (h)
        for (const sp of Object.keys(h))
          for (const a of h[sp]) {
            animals++
            // Key by SPAWN position (deterministic per chunk), not the drink
            // target: bank targets legitimately collapse onto the same shore
            // point since the banks-only rule, which broke the unique count.
            if (a.drink) drinkers.push(`${sp}:${a.x.toFixed(1)},${a.z.toFixed(1)}`)
            if (a.bathe) bathers++
          }
      return { drinkers, bathers, animals }
    })
    for (const k of here.drinkers) if (!drinkerKeys.has(k)) drinkerKeys.add(k)
    bathe.drinkers = drinkerKeys.size
    bathe.bathers += here.bathers
    bathe.animalsSeen += here.animals
    if (bathe.bathers > 0) break
  } else {
    // Even a shore whose drinker gate timed out tells us whether animals
    // spawned at all (environment stall vs. assignment issue).
    bathe.animalsSeen += await page.evaluate(() => {
      const h = window.__wildlife?.herdsRef?.current
      let n = 0
      if (h) for (const sp of Object.keys(h)) n += h[sp].filter((a) => !a.dead).length
      return n
    })
  }
}
check('some shore visitors wade in and bathe', bathe.bathers > 0 && bathe.bathers <= bathe.drinkers, `${JSON.stringify(bathe)} spots=${shoreSpots.length}`)
// Back to the game defaults (disabling the unlock clamps the zoom to 0.5).
await page.evaluate(() => window.__ui.getState().setWheelZoomEnabled(false))

// Return to the herd-dense plains for the predator-guard check below.
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page.evaluate(() => window.__wildlife.restock())
await waitForHerds()
await waitForFamily()
await page.waitForTimeout(1500)

// Parent defends its calf: inject a predator at a fixed point near a calf; a
// guarding parent moves toward that point (to interpose), a fleeing one away.
// Measuring the parent's distance to the fixed predator point is robust to the
// calf's own motion (both animals move, so a relative offset would be noisy).
const guard = await page.evaluate(async () => {
  const herds = window.__wildlife.herdsRef.current
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] ?? []) if (a.child && !a.child.dead && !a.dead) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  const L = window.__lionHunt.state
  const lx = calf.x + 5, lz = calf.z
  // Start the parent on the far side of the calf: the guard standoff sits 2.2
  // from the calf toward the predator, so a parent that happens to stand right
  // at the pin point would correctly move AWAY to it — seed a deterministic
  // approach instead.
  parent.x = calf.x - 3
  parent.z = calf.z
  L.mode = 'chase'; L.lx = lx; L.lz = lz; L.px = calf.x; L.pz = calf.z
  const dist = () => Math.hypot(parent.x - lx, parent.z - lz)
  const before = dist()
  // Keep re-pinning the predator so it stays the fixed threat while frames run.
  const t0 = Date.now()
  while (Date.now() - t0 < 2800) { L.lx = lx; L.lz = lz; L.mode = 'chase'; await new Promise((r) => setTimeout(r, 60)) }
  const after = dist()
  L.mode = 'idle'; L.timer = 60
  return { found: true, before: +before.toFixed(2), after: +after.toFixed(2) }
})
check('a parent moves to guard its calf from a predator', guard.found && guard.after < guard.before - 0.05, JSON.stringify(guard))

// --- Lion hunt: varied chase directions and a weaving prey (point 7) ---------
// The lion now approaches from a random direction (chase no longer always runs
// the same way), and the prey weaves left/right to shake it.
const hunt = await page.evaluate(async () => {
  const s = window.__lionHunt.state
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const startChase = async (budget) => {
    // Force a fresh hunt: drop to idle and keep re-arming the spawn until a new
    // chase begins (the spawn picks a random savanna spot and lion approach).
    s.mode = 'idle'
    s.timer = 0
    const t0 = Date.now()
    while (s.mode !== 'chase' && Date.now() - t0 < budget) {
      if (s.mode === 'idle') s.timer = 0
      await sleep(40)
    }
    return s.mode === 'chase'
  }
  // Collect the initial chase heading of several hunts.
  const headings = []
  const tAll = Date.now()
  while (headings.length < 8 && Date.now() - tAll < 45000) {
    if (await startChase(2500)) { headings.push(s.lionHeading); await sleep(60) }
  }
  let vx = 0, vz = 0
  for (const h of headings) { vx += Math.sin(h); vz += Math.cos(h) }
  const R = headings.length ? Math.hypot(vx, vz) / headings.length : 1
  // Weave: drive one GENERIC chase (a calf hunt has no weaving scripted prey, so
  // retry until s.victim is null) and watch the prey's heading offset from
  // straight-away.
  const offs = []
  let generic = false
  const tw = Date.now()
  while (!generic && Date.now() - tw < 25000) {
    if (await startChase(4000) && s.victim === null) generic = true
  }
  if (generic) {
    for (let k = 0; k < 45 && s.mode === 'chase' && s.victim === null; k++) {
      const away = Math.atan2(s.px - s.lx, s.pz - s.lz)
      let o = s.preyHeading - away
      while (o > Math.PI) o -= Math.PI * 2
      while (o < -Math.PI) o += Math.PI * 2
      offs.push(o)
      await sleep(100)
    }
  }
  let signChanges = 0
  for (let i = 1; i < offs.length; i++) if (offs[i] * offs[i - 1] < 0) signChanges++
  const amp = offs.length ? Math.max(...offs.map(Math.abs)) : 0
  s.mode = 'idle'; s.timer = 60
  return { count: headings.length, R: Math.round(R * 100) / 100, weaveSamples: offs.length, signChanges, amp: Math.round(amp * 100) / 100 }
})
check('lion hunts run in varied directions (not always the same way)', hunt.count >= 5 && hunt.R < 0.85, JSON.stringify(hunt))
check('the fleeing prey weaves side to side (zigzag)', hunt.signChanges >= 2 && hunt.amp > 0.4, JSON.stringify(hunt))

// --- Predator variety, prey variety and the food web (points 6/8) ------------
// Several predators roam (lion, cheetah, leopard, hyena), each region-fitting,
// and each takes prey from its own food web (predator → grazer → grassland).
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page.waitForTimeout(1000)
const preyVar = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const s = window.__lionHunt.state
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // Mirror the maps in Wildlife.tsx (design.md §19).
  const REGION_PREY = {
    east: ['wildebeest', 'zebra', 'antelope', 'warthog'],
    south: ['wildebeest', 'zebra', 'antelope', 'warthog'],
    central: ['antelope', 'warthog', 'zebra'],
    west: ['antelope', 'warthog', 'zebra'],
    north: ['antelope', 'warthog'],
  }
  const REGION_PREDATORS = {
    east: ['lion', 'cheetah', 'hyena', 'leopard'],
    south: ['lion', 'cheetah', 'hyena', 'leopard'],
    central: ['lion', 'leopard'],
    west: ['lion', 'leopard'],
    north: ['lion', 'cheetah', 'leopard'],
  }
  const PREDATOR_PREY = {
    lion: ['wildebeest', 'zebra', 'antelope', 'warthog'],
    hyena: ['wildebeest', 'zebra', 'warthog'],
    cheetah: ['antelope', 'warthog'],
    leopard: ['antelope', 'warthog'],
  }
  const startChase = async (budget) => {
    s.mode = 'idle'; s.timer = 0
    const t0 = Date.now()
    while (s.mode !== 'chase' && Date.now() - t0 < budget) { if (s.mode === 'idle') s.timer = 0; await sleep(40) }
    return s.mode === 'chase'
  }
  const prey = []
  const predators = []
  const preyMismatch = []
  const predMismatch = []
  const webMismatch = []
  const tAll = Date.now()
  while (prey.length < 16 && Date.now() - tAll < 70000) {
    if (await startChase(2500)) {
      const ll = geo.worldToLatLon(s.px, s.pz)
      const region = geo.regionAt(ll.lat, ll.lon)
      prey.push(s.prey)
      predators.push(s.predator)
      if (!REGION_PREY[region]?.includes(s.prey)) preyMismatch.push({ prey: s.prey, region })
      if (!REGION_PREDATORS[region]?.includes(s.predator)) predMismatch.push({ predator: s.predator, region })
      // Food web: prey must be in the predator's scheme intersected with the region.
      const web = PREDATOR_PREY[s.predator].filter((p) => REGION_PREY[region].includes(p))
      if (web.length && !web.includes(s.prey)) webMismatch.push({ predator: s.predator, prey: s.prey, region })
      await sleep(60)
    }
  }
  s.mode = 'idle'; s.timer = 60
  return {
    count: prey.length,
    distinctPrey: [...new Set(prey)],
    distinctPredators: [...new Set(predators)],
    preyMismatch, predMismatch, webMismatch,
  }
})
check('several kinds of predator hunt (lion + others)', preyVar.distinctPredators.length >= 2, JSON.stringify(preyVar))
check('every predator fits the region and period', preyVar.count >= 6 && preyVar.predMismatch.length === 0, JSON.stringify(preyVar))
check('the predator takes more than one kind of prey', preyVar.distinctPrey.length >= 2, JSON.stringify(preyVar))
check('every hunted prey fits the region and the predator food web',
  preyVar.count >= 6 && preyVar.preyMismatch.length === 0 && preyVar.webMismatch.length === 0, JSON.stringify(preyVar))

// --- Point 2: a predator eating a calf — struggle, parent sacrifice -----------
// design.md §19: a caught calf struggles for a few seconds before the kill
// completes (no stain/shrink yet); in that window a parent charges the predator
// and, reaching it, is eaten instead so the calf escapes; a parent that only got
// close by the time the window ends is eaten alongside the calf. The predation is
// resolved by the herds off the calf's `caught` timer, so it can be forced by
// hand (the live LionHunt is pinned idle first). Each scenario re-finds a live
// family (the inline finder skips animals a prior scenario killed).
const pinFamily = async (lat, lon) => {
  await page.evaluate((c) => window.__game.getState().debugJumpTo(c[0], c[1]), [lat, lon])
  // Restock: earlier tests may have emptied herd arrays while the chunk keys
  // stayed registered, leaving the area barren — re-stream it deterministically
  // so every family scenario is self-contained.
  await page.evaluate(() => window.__wildlife.restock())
  await waitForHerds()
  await waitForFamily()
  await page.waitForTimeout(2200) // let calves settle beside their parents
  await page.evaluate(() => {
    const s = window.__lionHunt.state
    s.mode = 'idle'; s.timer = 99999; s.victim = null; s.victimHunt = false
    // Remove elephants so a stray trampling can't pre-empt the predation path.
    window.__wildlife.herdsRef.current.elephant.length = 0
  })
}

// (1) The caught calf struggles unharmed for the first seconds, then is killed.
await pinFamily(-2.2, 34.8)
const struggle = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) if (a.child && !a.child.dead && !a.dead && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  parent.child = undefined // isolate the calf so we see the plain struggle→death
  calf.parent = undefined
  const stains = window.__wildlife.stains
  const stains0 = stains.current.length
  calf.caught = 5
  await sleep(700)
  const during = { dead: !!calf.dead, caught: calf.caught, stainsSame: stains.current.length === stains0 }
  calf.caught = 0.05 // fast-forward the end of the window
  await sleep(500)
  const after = { dead: !!calf.dead, lionFed: !!calf.lionFed, dissolve: typeof calf.dissolve === 'number', stainsUp: stains.current.length > stains0 }
  return { found: true, during, after }
})
check('a caught calf struggles unharmed for the first seconds (no stain/shrink yet)',
  struggle.found && struggle.during.dead === false && struggle.during.caught > 0 && struggle.during.caught < 5 && struggle.during.stainsSame,
  JSON.stringify(struggle))
check('after the struggle window the calf is killed (stain + carcass)',
  struggle.found && struggle.after.dead && struggle.after.lionFed && struggle.after.dissolve && struggle.after.stainsUp,
  JSON.stringify(struggle))

// (2) A parent charges the predator at the caught calf and sacrifices itself, so
// the calf is freed and escapes.
await pinFamily(-2.6, 35.1)
const sacrifice = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) if (a.child && !a.child.dead && !a.dead && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  calf.caught = 5
  calf.x = parent.x + 5; calf.z = parent.z // pinned 5 units off; the parent must run to it
  const d0 = Math.hypot(parent.x - calf.x, parent.z - calf.z)
  await sleep(400)
  const dCharged = Math.hypot(parent.x - calf.x, parent.z - calf.z)
  await sleep(1800) // let the charge reach the predator
  return {
    found: true, d0: +d0.toFixed(2), dCharged: +dCharged.toFixed(2),
    parentDead: !!parent.dead, parentLionFed: !!parent.lionFed,
    calfDead: !!calf.dead, calfFreed: calf.caught === undefined && calf.parent === undefined,
  }
})
check('a parent charges the predator as soon as its calf is eaten',
  sacrifice.found && sacrifice.dCharged < sacrifice.d0 - 1, JSON.stringify(sacrifice))
check('the parent sacrifices itself and the calf gets up and escapes',
  sacrifice.found && sacrifice.parentDead && sacrifice.parentLionFed && sacrifice.calfDead === false && sacrifice.calfFreed,
  JSON.stringify(sacrifice))

// (3) A parent that only got close by the time the window ends is eaten too.
await pinFamily(-3.0, 34.5)
const bothDie = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) if (a.child && !a.child.dead && !a.dead && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  calf.x = parent.x + 2.8; calf.z = parent.z // close, but the window shuts before the parent reaches
  calf.caught = 0.03
  await sleep(500)
  return { found: true, calfDead: !!calf.dead, parentDead: !!parent.dead, bothLionFed: !!calf.lionFed && !!parent.lionFed }
})
check('a parent that arrives too late is eaten alongside the calf (both die)',
  bothDie.found && bothDie.calfDead && bothDie.parentDead && bothDie.bothLionFed, JSON.stringify(bothDie))

// (4) A calf caught with no parent in reach dies alone; the parent survives.
await pinFamily(-2.0, 35.4)
const onlyCalf = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) if (a.child && !a.child.dead && !a.dead && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  calf.x = parent.x + 20; calf.z = parent.z // parent far off — cannot reach in time
  calf.caught = 0.03
  await sleep(500)
  return { found: true, calfDead: !!calf.dead, parentDead: !!parent.dead }
})
check('a calf caught with no parent near dies alone (parent survives)',
  onlyCalf.found && onlyCalf.calfDead && onlyCalf.parentDead === false, JSON.stringify(onlyCalf))

// (5) End-to-end: a real LionHunt runs a calf down (parent NOT detached), the
// calf is caught and struggles, the parent charges in and sacrifices itself, and
// the calf escapes. This drives the whole chase→catch→struggle→sacrifice→escape
// chain (the isolated scenarios above force `caught` by hand). The predator
// starts close so the catch is reliable even under headless RAF throttling, and
// the parent is parked out of reach so its living shield (§19) cannot make its
// station before the catch — the struggle window still saves the calf.
await pinFamily(-2.8, 35.3)
const e2e = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  // Pick the family nearest the player: the herd arrays accumulate far-off
  // animals across the earlier scenarios, and a chase farther than 90 units
  // from the player aborts to idle before it can ever catch.
  const p = window.__game.getState().pos
  let parent = null, calf = null, bd = 80
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) {
      if (!a.child || a.child.dead || a.dead || a.child.caught !== undefined) continue
      const d = Math.hypot(a.child.x - p.x, a.child.z - p.z)
      if (d < bd) { bd = d; parent = a; calf = a.child }
    }
  }
  if (!parent) return { found: false }
  // Park the parent 22 units off: too far to shield the calf mid-chase
  // (the lion pounces from 1.5 within a beat), close enough that its charge
  // crosses the distance well inside the 5 s struggle window.
  parent.x = calf.x - 22; parent.z = calf.z
  const s = window.__lionHunt.state
  s.predator = 'lion'
  s.victim = calf; s.victimHunt = true
  s.lx = calf.x + 1.5; s.lz = calf.z
  s.px = calf.x; s.pz = calf.z
  s.lionHeading = Math.atan2(calf.x - s.lx, calf.z - s.lz)
  s.mode = 'chase'
  let caughtSeen = false
  const t0 = Date.now()
  while (Date.now() - t0 < 12000) {
    if (calf.caught !== undefined) caughtSeen = true
    if (parent.dead || calf.dead) break
    await sleep(50)
  }
  s.mode = 'idle'; s.timer = 60; s.victim = null; s.victimHunt = false
  const calfEscaped = !calf.dead && calf.caught === undefined && calf.parent === undefined
  // The struggle window can resolve within 1-2 frames when the parent nurses
  // right beside the calf, so 50ms polling may miss `caught` — but the
  // sacrifice outcome itself is proof of the catch: it only ever fires while
  // the calf's caught timer is running.
  const catchEvidenced = caughtSeen || (!!parent.dead && calfEscaped)
  return {
    found: true, caughtSeen, catchEvidenced,
    parentDead: !!parent.dead, calfDead: !!calf.dead, calfEscaped,
  }
})
check('a real hunt catches a calf, the parent sacrifices itself and the calf escapes',
  e2e.found && e2e.catchEvidenced && e2e.parentDead && e2e.calfDead === false && e2e.calfEscaped,
  JSON.stringify(e2e))

// (6) Visible choreography (design.md §19): from a real chase distance the
// hunted calf flees (it no longer stands nursing while run down) while its
// parent does NOT flee with it — it holds itself between the hunter and the
// calf (living shield) over visible real time, and the hunter takes the
// blocking parent in the calf's place, before any catch.
await pinFamily(-2.4, 34.6)
const choreo = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const p = window.__game.getState().pos
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) if (a.child && !a.child.dead && !a.dead && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  // Relocate the family beside the player so the chase stays well inside the
  // 90-unit hunt-abort radius regardless of where this seed spawned it. The
  // choreography itself (flee, charge, sacrifice) is live behaviour from here on.
  calf.x = p.x + 14; calf.z = p.z
  parent.x = p.x + 15.8; parent.z = p.z
  await sleep(300) // settle: the calf nurses beside its parent
  const s = window.__lionHunt.state
  s.predator = 'lion'
  s.victim = calf; s.victimHunt = true
  s.lx = calf.x + 12; s.lz = calf.z
  s.px = calf.x; s.pz = calf.z
  s.lionHeading = Math.atan2(calf.x - s.lx, calf.z - s.lz)
  s.mode = 'chase'
  const calf0 = { x: calf.x, z: calf.z }
  let calfMoved = 0
  let caughtSeen = false
  let betweenSamples = 0
  let samples = 0
  let tParentDead = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    calfMoved = Math.max(calfMoved, Math.hypot(calf.x - calf0.x, calf.z - calf0.z))
    if (calf.caught !== undefined) caughtSeen = true
    if (parent.dead) { tParentDead = Date.now(); break }
    if (calf.dead || s.mode === 'idle') break
    // The shield holds its line: the parent sits closer to the hunter than the
    // calf does, and stays near the calf.
    samples++
    const dLP = Math.hypot(s.lx - parent.x, s.lz - parent.z)
    const dLC = Math.hypot(s.lx - calf.x, s.lz - calf.z)
    if (dLP < dLC && Math.hypot(parent.x - calf.x, parent.z - calf.z) < 5) betweenSamples++
    await sleep(50)
  }
  const out = {
    found: true,
    calfMoved: +calfMoved.toFixed(2),
    samples,
    betweenShare: samples ? +(betweenSamples / samples).toFixed(2) : 0,
    caughtSeen,
    shieldMs: tParentDead ? tParentDead - t0 : null,
    parentDead: !!parent.dead,
    calfDead: !!calf.dead,
    calfFreed: calf.caught === undefined && calf.parent === undefined && !calf.dead,
  }
  s.mode = 'idle'; s.timer = 99999; s.victim = null; s.victimHunt = false
  return out
})
check('the hunted calf flees the chase instead of standing at its parent',
  choreo.found && choreo.calfMoved > 2, JSON.stringify(choreo))
check('the parent holds itself between the hunter and the fleeing calf (living shield)',
  choreo.found && choreo.samples >= 5 && choreo.betweenShare > 0.8, JSON.stringify(choreo))
check('the hunter takes the blocking parent in the calf\'s place before any catch',
  choreo.found && choreo.shieldMs !== null && choreo.shieldMs >= 400 &&
  choreo.parentDead && choreo.caughtSeen === false && choreo.calfDead === false && choreo.calfFreed,
  JSON.stringify(choreo))

// --- Point 3: playful calves, water accidents, waterfall deaths ---------------
// design.md §19: calves gambol in hop-bouts around the parent; a calf on open
// water struggles and drifts, its parent wades in and pulls it back to the
// bank; in water near a waterfall calf or parent is swept over and dies, and a
// calf that goes over is followed by its plunging parent. The water states are
// forced by relocating live families (the drama itself is live behaviour).

// (1) Gambol: some calf breaks into a hop-bout (hop state + real movement).
await pinFamily(-2.2, 34.8)
const play = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const calves = []
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || []) if (a.young && !a.dead && a.parent && !a.parent.dead) calves.push(a)
  }
  if (!calves.length) return { found: false }
  const start = calves.map((c) => ({ x: c.x, z: c.z }))
  let hopped = 0
  let movedWhileHopping = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 25000) {
    calves.forEach((c, i) => {
      if (c.hop !== undefined && c.hop > 0.3) {
        hopped++
        if (Math.hypot(c.x - start[i].x, c.z - start[i].z) > 0.4) movedWhileHopping++
      }
    })
    if (hopped > 3 && movedWhileHopping > 0) break
    await sleep(120)
  }
  return { found: true, calves: calves.length, hopped, movedWhileHopping }
})
check('calves gambol in playful hop-bouts (hop state + movement)',
  play.found && play.hopped > 3 && play.movedWhileHopping > 0, JSON.stringify(play))

// Juveniles render through their own baby-schema geometry (design.md §19): a
// proportionally bigger head on a shorter neck, a shorter body, leggy stance,
// no adult ornaments. With live families present, the per-species calf
// instanced meshes carry the young while the adults render separately.
const calfRender = await page.evaluate(() => {
  const refs = window.__wildlife.calfMeshRefs.current
  let calves = 0
  for (const sp of Object.keys(refs)) calves += refs[sp] ? refs[sp].count : 0
  return { calves }
})
check('juveniles render through their own baby-schema calf meshes',
  calfRender.calves >= 1, JSON.stringify(calfRender))

// (2) Fall-in and rescue at Lake Victoria's west shore: the calf placed on the
// water starts to struggle, the parent wades in from farther inland, pulls it
// out and both walk back to land alive.
await waitForFamily()
// The rescue is the CALM-water behaviour — pin the season dry so the austral
// rains can never swell the drama current under this check (point 122).
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(0))
await page.waitForTimeout(400)
const rescue = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const seed = window.__game.getState().seed
  const T = window.__terrainType
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || [])
      if (a.child && !a.child.dead && !a.dead && a.child.inWater === undefined && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  // Land→water transition on the lake's west shore (scan rows eastward).
  let waterLL = null, landLL = null
  outer: for (let lat = -1.2; lat <= -0.2; lat += 0.05) {
    for (let lon = 30.8; lon <= 33.4; lon += 0.04) {
      const here = T(lat, lon, seed)
      if (here !== 'water' && here !== 'ocean' && T(lat, lon + 0.04, seed) === 'water') {
        landLL = [lat, lon - 0.02]
        waterLL = [lat, lon + 0.1]
        if (T(waterLL[0], waterLL[1], seed) !== 'water') waterLL = [lat, lon + 0.04]
        break outer
      }
    }
  }
  if (!waterLL) return { found: true, noWater: true }
  // No player jump: the water drama resolves in the full-list pre-pass, so the
  // family can be relocated to the far shore while the player (and with it the
  // family's spawn chunk) stays put — a jump would despawn the family's chunk
  // and orphan the relocated objects out of the herd arrays.
  const U = 10
  calf.x = waterLL[1] * U; calf.z = -waterLL[0] * U
  // Parent farther inland, so the wade-in approach is measurable.
  parent.x = landLL[1] * U - 5; parent.z = -landLL[0] * U
  const out = { found: true, fellIn: false, parentApproached: false, rescued: false, backOnLand: false, bothAlive: false }
  let d0 = null
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    if (calf.inWater !== undefined) out.fellIn = true
    const d = Math.hypot(parent.x - calf.x, parent.z - calf.z)
    if (d0 === null) d0 = d
    if (out.fellIn && d < d0 - 2) out.parentApproached = true
    if (calf.rescued) out.rescued = true
    if (out.rescued && calf.inWater === undefined && !calf.dead) {
      out.backOnLand = true
      out.bothAlive = !calf.dead && !parent.dead
      break
    }
    await sleep(100)
  }
  out.state = { inWater: calf.inWater, rescued: !!calf.rescued, calfDead: !!calf.dead, parentDead: !!parent.dead }
  return out
})
check('a calf on open water starts to struggle and its parent wades in',
  rescue.found && !rescue.noWater && rescue.fellIn && rescue.parentApproached, JSON.stringify(rescue))
check('the parent pulls the calf out and both return to the bank alive',
  rescue.found && rescue.rescued && rescue.backOnLand && rescue.bothAlive, JSON.stringify(rescue))

// --- Point 122: the swollen river of the rains, and drowning ------------------
// design.md §19.8: in a SWOLLEN current the self-rescue must not fire — an
// animal carried too long drowns (dead, sinking, never scavenged). The same
// mid-channel setup in the dry season still clambers out on its own: the
// season, not the script, decides the fate. One self-contained evaluate per
// season: it stages a calf on a strong lower-Nile flow (no waterfall within
// drift reach) with its parent held far beyond wading range, RETRIES with the
// next family if the calf never enters the water state (the scripted lion may
// be hunting exactly that calf, which blocks the fall-in), then follows that
// one calf to its fate.
const runDrownScenario = async () =>
  page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const hydro = await import('/src/world/hydro.ts')
    const herds = window.__wildlife.herdsRef.current
    const seed = window.__game.getState().seed
    // Strong mid-channel flow on the lower Nile (lat 29..27 holds no falls).
    let spot = null
    outer: for (let lat = 29; lat >= 27; lat -= 0.04) {
      for (let lon = 30.4; lon <= 31.8; lon += 0.04) {
        if (window.__terrainType(lat, lon, seed) !== 'water') continue
        if (hydro.riverFlowExact(lat, lon).strength >= 0.9) { spot = [lat, lon]; break outer }
      }
    }
    if (!spot) return { noSpot: true }
    const families = []
    for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
      for (const a of herds[sp] || [])
        if (a.child && !a.child.dead && !a.dead && a.child.inWater === undefined && a.child.caught === undefined)
          families.push(a)
    }
    const U = 10
    let calf = null
    let tries = 0
    for (const parent of families.slice(0, 8)) {
      tries++
      const c = parent.child
      // Slightly offset per attempt: a rejected predecessor still stands at
      // the spot, and stacking candidates trips the body separation.
      c.x = spot[1] * U + (tries - 1) * 0.4
      c.z = -spot[0] * U
      // Far beyond wading reach for the whole drown window (WADE_SPEED 4.2).
      parent.x = c.x - 180
      parent.z = c.z
      const t0 = Date.now()
      while (Date.now() - t0 < 1500 && c.inWater === undefined && !c.dead) await sleep(100)
      if (c.inWater !== undefined) { calf = c; break }
      // Never entered the water state (the water sweep can win the race when
      // the calf is the lion's current victim or mid-catch — states the drama
      // entry excludes but the sweep does not): try the next family.
    }
    if (!calf) return { staged: false, tries }
    const out = { staged: true, tries, drowned: false, rescued: false, out: false, lionFed: false }
    const t1 = Date.now()
    while (Date.now() - t1 < 45000) {
      if (calf.rescued) out.rescued = true
      if (calf.dead) { out.drowned = true; out.lionFed = !!calf.lionFed; break }
      if (calf.inWater === undefined && !calf.dead) { out.out = true; break }
      await sleep(150)
    }
    return out
  })
// (a) Forced rains: the current holds the calf under until it drowns.
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
await page.waitForTimeout(400)
const drowned = await runDrownScenario()
check('in the forced rains a calf in a strong current drowns — dead, never rescued (point 122)',
  !drowned.noSpot && drowned.staged && drowned.drowned && !drowned.rescued && drowned.lionFed,
  JSON.stringify(drowned))
// (b) The dry season: the SAME setup still clambers out alive on its own.
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(0))
await page.waitForTimeout(400)
const clambered = await runDrownScenario()
check('in the dry season the same mid-channel calf clambers out alive (point 122)',
  !clambered.noSpot && clambered.staged && clambered.out && !clambered.drowned,
  JSON.stringify(clambered))
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
await page.waitForTimeout(300)

// (3) Waterfall: a calf in the water inside Victoria Falls' reach is swept over
// and dies; its parent plunges after it and dies too. The player stays on the
// plains — the drama resolves in the full-list pre-pass wherever it happens.
await waitForFamily()
const plunge = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const seed = window.__game.getState().seed
  const T = window.__terrainType
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || [])
      if (a.child && !a.child.dead && !a.dead && a.child.inWater === undefined && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  const WF = { lat: -17.93, lon: 25.86 }
  let waterLL = null
  outer: for (let dl = 0; dl <= 0.18; dl += 0.03) {
    for (const [dlat, dlon] of [[dl, 0], [-dl, 0], [0, dl], [0, -dl], [dl, dl], [-dl, -dl]]) {
      if (T(WF.lat + dlat, WF.lon + dlon, seed) === 'water') { waterLL = [WF.lat + dlat, WF.lon + dlon]; break outer }
    }
  }
  if (!waterLL) return { found: true, noWater: true }
  const U = 10
  calf.x = waterLL[1] * U; calf.z = -waterLL[0] * U
  parent.x = calf.x + 6; parent.z = calf.z + 2
  const out = { found: true, calfSwept: false, parentGotPlunge: false, parentPlunged: false }
  const t0 = Date.now()
  while (Date.now() - t0 < 25000) {
    if (calf.dead) out.calfSwept = true
    if (parent.plungeTo) out.parentGotPlunge = true
    if (parent.dead) { out.parentPlunged = true; break }
    await sleep(80)
  }
  return out
})
check('a calf in the water at a waterfall is swept over and dies',
  plunge.found && !plunge.noWater && plunge.calfSwept, JSON.stringify(plunge))
check('the parent plunges after its swept-over calf and dies with it',
  plunge.found && plunge.parentGotPlunge && plunge.parentPlunged, JSON.stringify(plunge))

// (4) A rescuing parent wading inside the falls' reach is swept over itself;
// the calf (outside the reach) survives and struggles on.
await waitForFamily()
const sweptRescuer = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const seed = window.__game.getState().seed
  const T = window.__terrainType
  let parent = null, calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || [])
      if (a.child && !a.child.dead && !a.dead && a.child.inWater === undefined && a.child.caught === undefined) { parent = a; calf = a.child; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  const WF = { lat: -17.93, lon: 25.86 }
  let calfLL = null, parentLL = null
  for (let dl = 0.24; dl <= 0.45; dl += 0.03) {
    for (const [dlat, dlon] of [[dl, 0], [-dl, 0], [0, dl], [0, -dl]]) {
      if (!calfLL && T(WF.lat + dlat, WF.lon + dlon, seed) === 'water') calfLL = [WF.lat + dlat, WF.lon + dlon]
    }
  }
  for (let dl = 0; dl <= 0.18; dl += 0.03) {
    for (const [dlat, dlon] of [[dl, 0], [-dl, 0], [0, dl], [0, -dl]]) {
      if (!parentLL && T(WF.lat + dlat, WF.lon + dlon, seed) === 'water') parentLL = [WF.lat + dlat, WF.lon + dlon]
    }
  }
  if (!calfLL || !parentLL) return { found: true, noWater: true }
  const U = 10
  calf.x = calfLL[1] * U; calf.z = -calfLL[0] * U
  parent.x = parentLL[1] * U; parent.z = -parentLL[0] * U
  const out = { found: true, calfFellIn: false, parentSwept: false, calfAlive: false }
  const t0 = Date.now()
  while (Date.now() - t0 < 20000) {
    if (calf.inWater !== undefined) out.calfFellIn = true
    if (parent.dead) { out.parentSwept = true; break }
    await sleep(80)
  }
  out.calfAlive = !calf.dead
  return out
})
check('a rescuing parent wading into the falls\' reach is swept over (calf survives)',
  sweptRescuer.found && !sweptRescuer.noWater && sweptRescuer.calfFellIn && sweptRescuer.parentSwept && sweptRescuer.calfAlive,
  JSON.stringify(sweptRescuer))

// --- Point 123: the drying waterhole — mire, vigil, and the predators' find --
// The mire ROLL is pure-tested; live, the states are forced like the other
// dramas and the behaviour chain is asserted: the mired calf holds its spot,
// the parent stands vigil beside it instead of following the herd, a forced
// hunt takes BOTH at the waterhole (the mud never frees the calf for the
// sacrifice escape), and without a predator the mud releases.
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(0))
await page.waitForTimeout(400)
const mire = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  let parent = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || [])
      if (a.child && !a.child.dead && !a.dead && a.child.inWater === undefined && a.child.caught === undefined && a.child.mired === undefined) { parent = a; break }
    if (parent) break
  }
  if (!parent) return { found: false }
  const calf = parent.child
  calf.mired = 0
  parent.x = calf.x - 15
  parent.z = calf.z
  const start = { x: calf.x, z: calf.z }
  await sleep(4000)
  const held = Math.hypot(calf.x - start.x, calf.z - start.z)
  const vigil0 = Math.hypot(parent.x - calf.x, parent.z - calf.z)
  await sleep(2000)
  const vigil1 = Math.hypot(parent.x - calf.x, parent.z - calf.z)
  // The predators find the pair (target bias): force the hunt's next pick
  // window and let the chase run — the mud holds the calf, so the parent's
  // charge costs its life WITHOUT freeing it, and the countdown takes both.
  const st = window.__lionHunt.state
  st.mode = 'chase'
  st.victim = calf
  st.victimHunt = true
  st.lx = calf.x - 12
  st.lz = calf.z + 2
  st.px = calf.x
  st.pz = calf.z
  st.timer = 0 // the hunt loop waits its idle timer out before acting
  const t0 = Date.now()
  while (Date.now() - t0 < 45000 && (!calf.dead || !parent.dead)) await sleep(200)
  const bothDeadAtWater =
    calf.dead && parent.dead &&
    Math.hypot(calf.x - start.x, calf.z - start.z) < 5 &&
    Math.hypot(parent.x - start.x, parent.z - start.z) < 8
  window.__lionHunt.state.mode = 'idle'
  window.__lionHunt.state.timer = 60
  return { found: true, held, vigil0, vigil1, calfDead: !!calf.dead, parentDead: !!parent.dead, bothDeadAtWater }
})
check(
  'a mired calf holds its spot and its parent stands vigil beside it (point 123)',
  mire.found && mire.held < 0.6 && mire.vigil0 < 2.2 && mire.vigil1 < 2.2,
  JSON.stringify(mire),
)
check(
  'the hunt takes calf AND vigil parent at the waterhole — the mud never frees the calf (point 123)',
  mire.found && mire.bothDeadAtWater,
  JSON.stringify(mire),
)
// Without a predator, the mud RELEASES (the drama always resolves): shorten
// the window through the balance hook, then watch the calf come free alive.
await waitForFamily() // the kill scenario above consumed a family (135 class)
const release = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  // Poll for a family whose calf is FREE of every drama state — the kill
  // scenario just consumed one and the remaining calves can be mid-state
  // for a while (point 135 class: waitForFamily alone is not specific enough).
  let parent = null
  const tf = Date.now()
  while (!parent && Date.now() - tf < 12000) {
    for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
      for (const a of herds[sp] || [])
        if (a.child && !a.child.dead && !a.dead && a.child.inWater === undefined && a.child.caught === undefined && a.child.mired === undefined) { parent = a; break }
      if (parent) break
    }
    if (!parent) await sleep(300)
  }
  if (!parent) return { found: false }
  const calf = parent.child
  const prev = window.__balance.waterDrama.mireSeconds
  window.__balance.waterDrama.mireSeconds = 5
  calf.mired = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 15000 && calf.mired !== undefined && !calf.dead) await sleep(200)
  window.__balance.waterDrama.mireSeconds = prev
  return { found: true, released: calf.mired === undefined && !calf.dead }
})
check(
  'without a predator the mud releases the calf alive (point 123 — the drama always resolves)',
  release.found && release.released,
  JSON.stringify(release),
)
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
await page.waitForTimeout(300)


// --- Point 4: spawn spacing and animal-animal collision -----------------------
// design.md §19: animals spawn with natural spacing (no two inside one another)
// and never walk through each other — overlapping animals part at once. The
// elephant×smaller-prey pair stays exempt (trampling is designed; its own test
// above still passes). Body radii mirror Wildlife.tsx BODY_RADIUS.
await pinFamily(-2.9, 34.2)
// Freshly restocked animals may briefly overlap until the separation behaviour
// has run a few frames — under load that takes visibly longer, so poll until
// the spacing holds instead of sampling a single instant.
const spacing = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const RAD = { elephant: 1.3, giraffe: 0.9, zebra: 0.7, wildebeest: 0.75, antelope: 0.6, warthog: 0.45, flamingo: 0.25 }
  const sample = () => {
    const herds = window.__wildlife.herdsRef.current
    const all = []
    for (const sp of Object.keys(RAD)) {
      for (const a of herds[sp] ?? []) {
        if (a.dead || a.caught !== undefined || a.inWater !== undefined || a.rescued !== undefined) continue
        if (a.chunk === undefined) continue // only real streamed animals
        all.push({ x: a.x, z: a.z, r: RAD[sp] * a.scale, sp })
      }
    }
    let worst = Infinity
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const A = all[i], B = all[j]
        if ((A.sp === 'elephant') !== (B.sp === 'elephant')) continue // trample pair exempt
        const minD = A.r + B.r
        const d = Math.hypot(A.x - B.x, A.z - B.z)
        worst = Math.min(worst, d / minD)
      }
    }
    return { animals: all.length, worst: +worst.toFixed(3) }
  }
  let s = sample()
  const deadline = Date.now() + 8000
  while (Date.now() < deadline && !(s.animals > 5 && s.worst >= 0.7)) {
    await sleep(200)
    s = sample()
  }
  return s
})
check('spawned animals keep body spacing (no two inside one another)',
  spacing.animals > 5 && spacing.worst >= 0.7, JSON.stringify(spacing))

// --- No animal stands in river/lake water (design.md §19): the water-drama
// participants own their moments; everyone else is set back to land by the
// backstop sweep. Flamingos are shoreline waders and exempt. Poll until the
// sweep (1/7 of the animals per frame) has settled everyone.
const inWater = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const seed = window.__game.getState().seed
  const count = () => {
    const herds = window.__wildlife.herdsRef.current
    let bad = 0
    let seen = 0
    for (const sp of Object.keys(herds)) {
      if (sp === 'flamingo') continue
      for (const a of herds[sp]) {
        if (a.dead || a.inWater !== undefined || a.rescued || a.plungeTo) continue
        if (a.child && !a.child.dead && a.child.inWater !== undefined) continue
        seen++
        const lat = -a.z / 10
        const lon = a.x / 10
        const t = window.__terrainType(lat, lon, seed)
        if (t === 'water' || t === 'ocean') bad++
      }
    }
    return { bad, seen }
  }
  let r = count()
  const deadline = Date.now() + 6000
  while (Date.now() < deadline && r.bad > 0) {
    await sleep(250)
    r = count()
  }
  return r
})
check('no animal stands in river/lake water (banks only)', inWater.seen > 10 && inWater.bad === 0, JSON.stringify(inWater))

const parting = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  // Two live grazers of the same species, neither in a scripted drama.
  let a = null, b = null, sp = null
  for (const s of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    const live = (herds[s] ?? []).filter(
      (x) => !x.dead && x.caught === undefined && x.inWater === undefined && !x.rescued && !x.plungeTo,
    )
    if (live.length >= 2) { a = live[0]; b = live[1]; sp = s; break }
  }
  if (!a) return { found: false }
  const RAD = { zebra: 0.7, wildebeest: 0.75, antelope: 0.6, warthog: 0.45 }
  const minD = RAD[sp] * (a.scale + b.scale)
  // Drop B onto A: they must part instead of standing inside one another.
  b.x = a.x
  b.z = a.z
  const t0 = Date.now()
  let d = 0
  while (Date.now() - t0 < 8000) {
    d = Math.hypot(a.x - b.x, a.z - b.z)
    if (d >= minD * 0.9) break
    await sleep(80)
  }
  return { found: true, sp, minD: +minD.toFixed(2), d: +d.toFixed(2), parted: d >= minD * 0.9 }
})
check('an animal placed onto another parts from it (no walking through)',
  parting.found && parting.parted, JSON.stringify(parting))

// --- Point 5: vultures fly in and off beyond the view (zoom-aware) ------------
// design.md §19: no vulture pops into or out of the picture. The scavenger
// spawns beyond the zoom-aware view ring, flies in and lands; after the meal it
// flies off and despawns only well outside the view. The kill flock flies the
// same pattern.
const vulFlight = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const p = () => window.__game.getState().pos
  // These view-ring distance checks are calibrated at zoom 1; the default zoom
  // is closer (0.5), so unlock and set zoom 1 to reach the calibrated ring.
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(1)
  for (const sp of Object.keys(herds)) herds[sp] = herds[sp].filter((a) => !a.dead)
  herds.elephant.length = 0
  // Inject FIRST, then reset the flight: the re-pick that follows must find
  // our carcass as the nearest valid target (a frame between reset and inject
  // could otherwise bind the scavenger to some far natural kill).
  const carcass = { x: p().x + 5, z: p().z + 5, y: 0.2, rot: 0, scale: 1, phase: 0, dead: true, chunk: 'inject-p5' }
  herds.zebra.push(carcass)
  const sc = w.scavenger.current
  sc.target = null
  sc.mode = 'idle'
  const out = { spawnDist: null, landed: false, outSeen: false, hideDist: null }
  let t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    herds.elephant.length = 0 // no tramples: the injected carcass stays the nearest target
    if (sc.target === carcass && sc.mode === 'in') {
      out.spawnDist = +Math.hypot(sc.x - p().x, sc.z - p().z).toFixed(1)
      break
    }
    await sleep(40)
  }
  t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    herds.elephant.length = 0
    if (sc.landed) { out.landed = true; break }
    await sleep(100)
  }
  carcass.dissolve = 0.02 // fast-forward the meal; the carcass is removed
  t0 = Date.now()
  let lastOut = null
  while (Date.now() - t0 < 30000) {
    if (sc.mode === 'out') {
      out.outSeen = true
      lastOut = Math.hypot(sc.x - p().x, sc.z - p().z)
    }
    if (out.outSeen && sc.mode === 'idle') { out.hideDist = +lastOut.toFixed(1); break }
    await sleep(60)
  }
  return out
})
check('the scavenger spawns beyond the view ring and flies in (no popping in)',
  vulFlight.spawnDist !== null && vulFlight.spawnDist > 100 && vulFlight.landed, JSON.stringify(vulFlight))
check('after the meal the scavenger flies off and despawns only well outside the view',
  vulFlight.outSeen && vulFlight.hideDist !== null && vulFlight.hideDist > 130, JSON.stringify(vulFlight))

// Zoom-aware ring: at a wider zoom the flight spawns proportionally farther out.
const vulZoom = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const p = () => window.__game.getState().pos
  window.__ui.getState().setWheelZoomEnabled(true) // zoom-out past 1 is gated
  window.__ui.getState().setTravelZoom(2)
  for (const sp of Object.keys(herds)) herds[sp] = herds[sp].filter((a) => !a.dead)
  herds.elephant.length = 0
  // Inject FIRST, then reset the flight (see above): zoom 2 streams in fresh
  // chunks whose animals could otherwise die and outbid our carcass.
  const carcass = { x: p().x + 5, z: p().z + 5, y: 0.2, rot: 0, scale: 1, phase: 0, dead: true, chunk: 'inject-p5z' }
  herds.zebra.push(carcass)
  const sc = w.scavenger.current
  sc.target = null
  sc.mode = 'idle'
  let spawnDist = null
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    herds.elephant.length = 0 // zoom 2 streams in fresh elephants — no tramples
    if (sc.target === carcass && sc.mode === 'in') {
      spawnDist = +Math.hypot(sc.x - p().x, sc.z - p().z).toFixed(1)
      break
    }
    await sleep(40)
  }
  // Clean up: consume the carcass and reset the zoom.
  carcass.dissolve = 0.01
  await sleep(200)
  sc.target = null
  sc.mode = 'idle'
  window.__ui.getState().setTravelZoom(1)
  window.__ui.getState().setWheelZoomEnabled(false)
  return { spawnDist }
})
check('a wider zoom pushes the vulture spawn ring proportionally out',
  vulZoom.spawnDist !== null && vulZoom.spawnDist > 200, JSON.stringify(vulZoom))

// The kill-circling flock flies in and off the same way (no popping).
const killFlock = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = () => window.__game.getState().pos
  const L = window.__lionHunt.state
  const f = window.__vultures.killFlight.current
  // Calibrated at zoom 1 (default is the closer 0.5).
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(1)
  // Purge carcasses from earlier checks: a leftover hunt remnant would now
  // legitimately hold the flock on site (it consumes the scrap) and mask
  // the fly-off this check asserts.
  const herds = window.__wildlife.herdsRef.current
  for (const sp of Object.keys(herds)) herds[sp] = herds[sp].filter((a) => !a.dead)
  f.mode = 'idle'
  L.victim = null
  L.victimHunt = false
  L.px = p().x + 8
  L.pz = p().z
  L.lx = L.px + 0.7
  L.lz = L.pz + 0.25
  L.mode = 'feed'
  L.timer = 90
  const out = { spawnDist: null, arrived: false, outSeen: false, hideDist: null }
  let t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    if (f.mode === 'in' && out.spawnDist === null) out.spawnDist = +Math.hypot(f.x - p().x, f.z - p().z).toFixed(1)
    if (f.mode === 'active') { out.arrived = true; break }
    await sleep(50)
  }
  L.mode = 'idle'
  L.timer = 99999
  t0 = Date.now()
  let lastOut = null
  while (Date.now() - t0 < 30000) {
    if (f.mode === 'out') {
      out.outSeen = true
      lastOut = Math.hypot(f.x - p().x, f.z - p().z)
    }
    if (out.outSeen && f.mode === 'idle') { out.hideDist = +lastOut.toFixed(1); break }
    await sleep(60)
  }
  return out
})
check('the kill flock flies in from beyond the view ring and settles over the kill',
  killFlock.spawnDist !== null && killFlock.spawnDist > 100 && killFlock.arrived, JSON.stringify(killFlock))
check('when the kill scene ends the flock flies off and despawns well outside the view',
  killFlock.outSeen && killFlock.hideDist !== null && killFlock.hideDist > 130, JSON.stringify(killFlock))

// --- Point 6: the predator never despawns in view (zoom-aware) ----------------
// design.md §19: after the meal the predator trots off and leaves the stage
// only well beyond the visible surroundings; a chase that strays aborts past
// the same ring — nothing vanishes in sight.
const leaveOffstage = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = () => window.__game.getState().pos
  const L = window.__lionHunt.state
  // Calibrated at zoom 1 (default is the closer 0.5).
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(1)
  L.victim = null
  L.victimHunt = false
  L.px = p().x + 80
  L.pz = p().z
  L.lx = L.px + 0.7
  L.lz = L.pz + 0.25
  L.mode = 'feed'
  L.timer = 0.1 // carcass done at once → leave
  const out = { sawLeave: false, hideDist: null }
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    if (L.mode === 'leave') out.sawLeave = true
    if (out.sawLeave && L.mode === 'idle') {
      out.hideDist = +Math.hypot(L.lx - p().x, L.lz - p().z).toFixed(1)
      break
    }
    await sleep(80)
  }
  L.mode = 'idle'
  L.timer = 99999
  return out
})
check('after the meal the predator walks off and despawns only outside the view',
  leaveOffstage.sawLeave && leaveOffstage.hideDist !== null && leaveOffstage.hideDist > 100,
  JSON.stringify(leaveOffstage))

const chaseAbort = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = () => window.__game.getState().pos
  const L = window.__lionHunt.state
  // Calibrated at zoom 1 (default is the closer 0.5).
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(1)
  L.victim = null
  L.victimHunt = false
  L.mode = 'chase'
  L.lx = p().x + 90
  L.lz = p().z
  L.px = p().x + 400 // prey far beyond the ring: the chase strays outward
  L.pz = p().z
  L.lionHeading = Math.atan2(L.px - L.lx, L.pz - L.lz)
  L.preyHeading = L.lionHeading
  let abortDist = null
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    if (L.mode !== 'chase') {
      abortDist = +Math.hypot(L.lx - p().x, L.lz - p().z).toFixed(1)
      break
    }
    await sleep(60)
  }
  L.mode = 'idle'
  L.timer = 99999
  return { abortDist }
})
check('a strayed chase aborts only beyond the view ring (not in sight)',
  chaseAbort.abortDist !== null && chaseAbort.abortDist > 100, JSON.stringify(chaseAbort))

// --- Point 83: the walk-off obeys the land constraint --------------------------
// A predator leaving straight toward the sea must deflect along the coast —
// never standing on an ocean cell — while still making distance.
const coastLeave = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const g = window.__game.getState()
  const seed = g.seed
  // Find a west coast: scan west from inland Senegal until the sea, then
  // stand the lion just inside the land edge (world x = lon*10, z = -lat*10).
  let coastLon = null
  for (let lon = -15.5; lon > -18.5; lon -= 0.05) {
    if (window.__terrainType(14.7, lon, seed) === 'ocean') { coastLon = lon; break }
  }
  if (coastLon === null) return { ok: false, why: 'no coast found' }
  const before = { lat: g.pos ? -g.pos.z / 10 : null, lon: g.pos ? g.pos.x / 10 : null }
  const startLon = coastLon + 0.12 // on land, a stride from the water
  g.debugJumpTo(14.7, startLon + 0.15)
  await sleep(600)
  const L = window.__lionHunt.state
  L.victim = null
  L.victimHunt = false
  L.lx = startLon * 10
  L.lz = -14.7 * 10
  L.px = L.lx
  L.pz = L.lz
  L.heading = -Math.PI / 2 // due west, straight at the sea
  L.mode = 'leave'
  const start = { x: L.lx, z: L.lz }
  const out = { ok: true, everOcean: false, samples: 0, moved: 0 }
  const t0 = Date.now()
  while (Date.now() - t0 < 8000 && L.mode === 'leave') {
    if (window.__terrainType(-L.lz / 10, L.lx / 10, seed) === 'ocean') out.everOcean = true
    out.samples++
    out.moved = Math.hypot(L.lx - start.x, L.lz - start.z)
    await sleep(80)
  }
  L.mode = 'idle'
  L.timer = 99999
  if (before.lat !== null) g.debugJumpTo(before.lat, before.lon) // leave the world as found
  return out
})
check('the predator walk-off never stands on an ocean cell (deflects at the coast)',
  coastLeave.ok && coastLeave.samples > 30 && !coastLeave.everOcean, JSON.stringify(coastLeave))
check('the deflected walk-off still makes distance along the shore',
  coastLeave.ok && coastLeave.moved > 8, JSON.stringify(coastLeave))
// Restore the default (closer) zoom and re-lock for the checks that follow.
await page.evaluate(() => {
  window.__ui.getState().setTravelZoom(1)
  window.__ui.getState().setWheelZoomEnabled(false)
})

// Zoom-aware ring: at a narrower zoom the stage edge sits closer in.
const leaveZoom = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = () => window.__game.getState().pos
  const L = window.__lionHunt.state
  window.__ui.getState().setTravelZoom(0.5) // view ring 50 → offstage past 80
  L.victim = null
  L.victimHunt = false
  L.px = p().x + 60
  L.pz = p().z
  L.lx = L.px + 0.7
  L.lz = L.pz + 0.25
  L.mode = 'feed'
  L.timer = 0.1
  let hideDist = null
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    if (L.mode === 'idle') {
      hideDist = +Math.hypot(L.lx - p().x, L.lz - p().z).toFixed(1)
      break
    }
    await sleep(60)
  }
  L.mode = 'idle'
  L.timer = 99999
  window.__ui.getState().setTravelZoom(1)
  return { hideDist }
})
check('the predator despawn ring scales with the zoom (narrow zoom hides sooner)',
  leaveZoom.hideDist !== null && leaveZoom.hideDist >= 80 && leaveZoom.hideDist < 100,
  JSON.stringify(leaveZoom))

// --- Point 7: a finished hunt leaves a prey remnant for the kill flock --------
// design.md §19: the predator does not strip its kill bare — a small carcass
// scrap stays at the site, and the vultures ALREADY CIRCLING the kill descend
// onto it and finish it; no new scavenger flies in for a flocked kill. A feed
// that ends without a kill (a rescued calf) leaves nothing.
const remnant = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const w = window.__wildlife
  const herds = w.herdsRef.current
  const p = () => window.__game.getState().pos
  const L = window.__lionHunt.state
  window.__ui.getState().setTravelZoom(1)
  for (const sp of Object.keys(herds)) herds[sp] = herds[sp].filter((a) => !a.dead)
  const sc = w.scavenger.current
  sc.target = null
  sc.mode = 'idle'
  // Park the kill flock CIRCLING OVER THE KILL, as it genuinely is during a
  // real feed (the zoom tests above leave it mid fly-off; a fresh fly-in from
  // the ring would let the predator finish its whole walk-off first and
  // falsify the lands-while-leaving timing below).
  window.__vultures.killFlight.current.mode = 'active'
  window.__vultures.killFlight.current.x = p().x + 6
  window.__vultures.killFlight.current.z = p().z
  window.__vultures.killDescend.current = 0
  L.victim = null
  L.victimHunt = false
  L.prey = 'zebra'
  L.px = p().x + 6
  L.pz = p().z
  L.lx = L.px + 0.7
  L.lz = L.pz + 0.25
  L.mode = 'feed'
  L.timer = 0.3
  const out = {
    remnantFound: false,
    small: false,
    flockLanded: false,
    consumed: false,
    scavengerUninvolved: true,
  }
  let rem = null
  let t0 = Date.now()
  while (Date.now() - t0 < 10000) {
    rem = herds.zebra.find((a) => a.dead && Math.hypot(a.x - L.px, a.z - L.pz) < 1.5)
    if (rem) break
    await sleep(60)
  }
  if (!rem) { L.mode = 'idle'; L.timer = 99999; return out }
  out.remnantFound = true
  out.small = rem.scale < 0.6
  // The circling flock descends and lands on the scrap (flight active at the
  // site, descend blend at the ground) — while the ground scavenger never
  // takes it as a target.
  const kf = () => window.__vultures.killFlight.current
  t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    if (sc.target === rem) out.scavengerUninvolved = false
    const f = kf()
    // The flock must start its descent while the predator is still walking
    // off in sight — not only after the whole leave despawned (user report).
    if (out.modeAtDescend === undefined && window.__vultures.killDescend.current > 0.5) out.modeAtDescend = L.mode
    if (
      f.mode === 'active' &&
      Math.hypot(f.x - rem.x, f.z - rem.z) < 2.5 &&
      window.__vultures.killDescend.current > 0.7
    ) { out.flockLanded = true; break }
    await sleep(100)
  }
  // While the flock feeds, no landed bird may sink into the terrain: the dev
  // hook reports the frame's minimum bird clearance above its own ground.
  if (out.flockLanded) {
    out.minClearance = Infinity
    for (let i = 0; i < 12; i++) {
      const c = window.__vultures.clearance.current
      if (typeof c === 'number' && Number.isFinite(c)) out.minClearance = Math.min(out.minClearance, c)
      await sleep(100)
    }
  }
  t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    if (sc.target === rem) out.scavengerUninvolved = false
    if (out.flockLanded && rem.dissolve !== undefined) rem.dissolve = Math.min(rem.dissolve, 0.02) // fast-forward the meal
    if (!herds.zebra.includes(rem)) { out.consumed = true; break }
    await sleep(100)
  }
  L.mode = 'idle'
  L.timer = 99999
  return out
})
check('a finished hunt leaves a small prey remnant at the kill site',
  remnant.remnantFound && remnant.small, JSON.stringify(remnant))
check('the circling kill flock descends on the remnant and finishes it (scavenger uninvolved)',
  remnant.flockLanded && remnant.consumed && remnant.scavengerUninvolved, JSON.stringify(remnant))
check('the flock lands while the predator is still walking off in sight',
  remnant.modeAtDescend === 'leave', `mode at descend: ${remnant.modeAtDescend}`)
check('no landed vulture sinks into the terrain while feeding',
  typeof remnant.minClearance === 'number' && remnant.minClearance > -0.05,
  `min clearance ${remnant.minClearance}`)

const noRemnant = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const L = window.__lionHunt.state
  let calf = null
  for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
    for (const a of herds[sp] || [])
      if (a.young && !a.dead && a.caught === undefined && a.inWater === undefined && a.parent && !a.parent.dead) { calf = a; break }
    if (calf) break
  }
  if (!calf) return { found: false }
  const countDead = () => Object.keys(herds).reduce((n, sp) => n + herds[sp].filter((a) => a.dead).length, 0)
  const deadBefore = countDead()
  L.victim = calf // alive — as after a successful rescue
  L.victimHunt = true
  L.px = calf.x
  L.pz = calf.z
  L.lx = calf.x + 0.7
  L.lz = calf.z + 0.25
  L.mode = 'feed'
  L.timer = 0.3
  await sleep(2500)
  const out = { found: true, deadBefore, deadAfter: countDead(), calfAlive: !calf.dead, mode: L.mode }
  L.mode = 'idle'
  L.timer = 99999
  L.victim = null
  L.victimHunt = false
  return out
})
check('a feed that ends without a kill leaves no remnant',
  noRemnant.found && noRemnant.deadAfter === noRemnant.deadBefore && noRemnant.calfAlive,
  JSON.stringify(noRemnant))

// --- Point 15: animals never stand in the impassable open ocean --------------
// Jump to the west coast (clear of any settlement's enter radius) so genuine
// open-ocean cells are in probing reach; the travel scene must stay mounted.
await page.evaluate(() => window.__game.getState().debugJumpTo(4.9, 6.1))
await page.waitForFunction(() => window.__wildlife && window.__game.getState().mode === 'travel', null, { timeout: 15000 })
await page.waitForTimeout(600)
const oceanBackstop = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const herds = window.__wildlife.herdsRef.current
  const seed = window.__game.getState().seed
  const T = window.__terrainType
  const p = window.__game.getState().pos
  // Probe outward from the player for a genuine open-ocean cell.
  let sea = null
  outer: for (let r = 3; r <= 60 && !sea; r += 1.5) {
    for (let k = 0; k < 16; k++) {
      const lat = -p.z / 10 + (Math.cos((k / 16) * Math.PI * 2) * r) / 10
      const lon = p.x / 10 + (Math.sin((k / 16) * Math.PI * 2) * r) / 10
      if (T(lat, lon, seed) === 'ocean') { sea = [lat, lon]; break outer }
    }
  }
  if (!sea) return { found: false }
  const zebra = { x: sea[1] * 10, z: -sea[0] * 10, y: 0.2, rot: 0, scale: 1, phase: 0, chunk: 'inject-p15' }
  herds.zebra.push(zebra)
  let rescuedToLand = false
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const ll = { lat: -zebra.z / 10, lon: zebra.x / 10 }
    if (T(ll.lat, ll.lon, seed) !== 'ocean') { rescuedToLand = true; break }
    await sleep(120)
  }
  const endType = T(-zebra.z / 10, zebra.x / 10, seed)
  herds.zebra = herds.zebra.filter((a) => a !== zebra)
  return { found: true, rescuedToLand, endType }
})
check('an animal on an open-ocean cell is set back to the nearest land',
  oceanBackstop.found && oceanBackstop.rescuedToLand && oceanBackstop.endType !== 'ocean',
  JSON.stringify(oceanBackstop))

// --- Point 8: whole-continent debug zoom without haze -------------------------
// design.md §21: the debug-unlocked zoom reaches a view of the whole continent
// (a coarse far-terrain sheet streams in), and in that debug-only range no
// --- Point 151: the season belongs to the PLACE, never to the traveller ------
// The "flying plants" witness: with the real June calendar, the field's value
// at the user's reported spot (13.4N/31.8E, the Sahel's ITCZ edge) and the
// slot greens must NOT move while the player travels — the old single uniform
// lerped toward the player's own greenness every frame, sliding every crown
// in view with each step.
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
// June of the current game year (debugJumpToMonth is ONE-indexed).
await page.evaluate(() => window.__game.getState().debugJumpToMonth(6))
await page.waitForTimeout(4000) // let the lerped slot greens settle
const fieldWitness = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__game.getState().debugJumpTo(13.4, 31.8)
  await sleep(800)
  const read = () => window.__vegetation.seasonTintAt(13.4, 31.8)
  // Baseline: how much the fixed-spot value drifts over 2 s while the player
  // STANDS (the slot greens keep lerping toward the June targets — that
  // calendar tail is legitimate and identical in both phases).
  const s0 = read()
  await sleep(2000)
  const s1 = read()
  const standDrift = Math.abs(s1 - s0)
  // Now travel hard across the wetness gradient the bug lived on: with the
  // old player-position uniform this phase drifted MASSIVELY more than the
  // standing phase; with the field it must not differ.
  const m0 = read()
  // Position changes WITHOUT day advance (debugJumpTo, not moveTravel):
  // travelling advances the calendar, which legitimately moves the field —
  // the bug under test was the POSITION dependence alone.
  let far = 0
  for (let i = 1; i <= 10; i++) {
    const lat = 13.4 + i * 0.35 // north across the ITCZ gradient
    window.__game.getState().debugJumpTo(lat, 31.8)
    await sleep(120)
    far = Math.max(far, Math.hypot((31.8 - 31.8) * 10, (lat - 13.4) * 10))
  }
  window.__game.getState().debugJumpTo(13.4, 31.8)
  await sleep(300)
  const m1 = read()
  const moveDrift = Math.abs(m1 - m0)
  return { standDrift, moveDrift, moved: far }
})
check(
  'the season field does not move when the player does (point 151 — the flying-plants witness)',
  fieldWitness.moved > 1 &&
    fieldWitness.moveDrift < fieldWitness.standDrift + 0.006 &&
    fieldWitness.moveDrift < 0.03,
  JSON.stringify(fieldWitness),
)
// Human-viewable evidence at BOTH reported spots: stable flora in the June/
// July gradient (123: the Gezira between the Nile arms; 124: the Nile at 18N).
await page.evaluate(() => window.__game.getState().debugJumpTo(13.4, 31.8))
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}123-season-field-gezira-june.png` })
await page.evaluate(() => window.__game.getState().debugJumpToMonth(7))
await page.waitForTimeout(3000)
await page.evaluate(() => window.__game.getState().debugJumpTo(18.1, 33.9))
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}124-season-field-nile-july.png` })
// Restore the calendar for the downstream checks (state hygiene: the later
// sections set their own months/overrides but must not START skewed).
await page.evaluate(() => window.__game.getState().debugJumpToMonth(1))
await page.waitForTimeout(1500)

// Season weather (design.md §19, point 120c): forcing the rainy season via the
// debug override must rain visibly (rain streak opacity up) and pull the fog
// in toward overcast; forcing dry must clear it again. Checked at zoom 1,
// before the zoom section below — the zoomed-out view is deliberately
// season-free.
const season = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const read = () => ({
    wet: window.__climate.seasonWetness(),
    rain: window.__climate.rainOpacity(),
    far: window.__climate.fog()?.far ?? 0,
    tint: window.__vegetation.seasonTint(),
  })
  window.__ui.getState().setSeasonWetnessOverride(1)
  let wet = read()
  for (let i = 0; i < 60 && (wet.rain < 0.4 || wet.tint < 0.85); i++) { await sleep(250); wet = read() }
  window.__ui.getState().setSeasonWetnessOverride(0)
  let dry = read()
  for (let i = 0; i < 80 && (dry.rain > 0.1 || dry.tint > 0.15); i++) { await sleep(250); dry = read() }
  window.__ui.getState().setSeasonWetnessOverride(null)
  return { wet, dry }
})
check(
  'forcing the rainy season rains and pulls the fog in; dry clears it (point 120c)',
  season.wet.wet === 1 && season.wet.rain > 0.4 && season.dry.wet === 0 &&
    season.dry.rain <= 0.1 && season.wet.far < season.dry.far - 20,
  JSON.stringify(season),
)
check(
  'the land greens in the rains and dries to straw (shared season tint, point 120d)',
  season.wet.tint > 0.85 && season.dry.tint < 0.15,
  JSON.stringify({ wetTint: season.wet.tint, dryTint: season.dry.tint }),
)

// Point 147(a) — CORRECT: every village and port lands in a plausible climate,
// swept. This is the check that would have caught both of the season's model
// bugs: the Fang village classified as northern Sahara (0.000 wetness in its
// wettest month) and the Somali village that a move would have given the
// Congo's rains. The assertion is concrete: no settlement in the tropics may be
// bone dry all year — that is the fallback-desert signature.
const placeClimate = await page.evaluate(async () => {
  const geo = await import('/src/world/geodata.ts')
  const g = await import('/src/world/geo.ts')
  const s = await import('/src/systems/season.ts')
  const day = (m) => (Date.UTC(1890, m, 15) - Date.UTC(1890, 0, 1)) / 86400000
  return g.PLACES.map((p) => {
    const el = geo.elevationAt(p.lat, p.lon)
    let maxWet = 0
    for (let m = 0; m < 12; m++) maxWet = Math.max(maxWet, s.wetnessAt(day(m), p.lat, p.lon, 1890, el))
    return { id: p.id, lat: p.lat, lon: p.lon, zone: s.climateZoneAt(p.lat, p.lon, el), maxWet }
  })
})
// The genuine deserts, which SHOULD be dry all year (Cairo and any Saharan
// settlement) — everything else in the tropics must get a real wet season.
const KNOWN_DRY = new Set(['cairo'])
const boneDryTropical = placeClimate.filter(
  (p) => Math.abs(p.lat) < 18 && p.maxWet < 0.12 && !KNOWN_DRY.has(p.id) && !p.zone.startsWith('sahara'),
)
check(
  'no tropical settlement is bone dry all year (the fallback-desert bug class)',
  boneDryTropical.length === 0,
  boneDryTropical.length ? JSON.stringify(boneDryTropical) : `${placeClimate.length} places swept`,
)
check(
  'every settlement classifies into a known climate zone',
  placeClimate.every((p) => typeof p.zone === 'string' && p.zone.length > 0),
  `zones: ${[...new Set(placeClimate.map((p) => p.zone))].join(', ')}`,
)

// Point 138 — the Nile flood: remote-fed, so it crests in OCTOBER at places
// where it never rains. Read through the APP's dev hook (__rivers), never a
// dynamic import: after HMR a URL import gets a FRESH module instance whose
// NILE_FLOOD is untouched, and reads a rise of 0 at full flood.
{
  await page.evaluate(() => window.__game.getState().debugJumpTo(24.09, 32.9)) // the Aswan reach
  await page.waitForTimeout(1200)
  const surfAt = async (month) => {
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.waitForTimeout(4500) // the rise blends at 0.02/frame
    return page.evaluate(() => ({
      y: window.__rivers.surfaceAt(24.09, 32.9),
      rise: window.__rivers.floodRise(),
    }))
  }
  const apr = await surfAt(4)
  await page.screenshot({ path: `${OUT}117-nile-low-april.png` })
  const oct = await surfAt(10)
  await page.screenshot({ path: `${OUT}118-nile-flood-october.png` })
  console.log('shot 117-nile-low-april.png, 118-nile-flood-october.png')
  check(
    'the Nile crests in October and sits low in April (point 138, remote-fed)',
    oct.y !== null && apr.y !== null && oct.y - apr.y > 0.3,
    `April ${apr.y?.toFixed(3)} (rise ${apr.rise.toFixed(2)}) -> October ${oct.y?.toFixed(3)} (rise ${oct.rise.toFixed(2)})`,
  )
  // The flood must not break the ribbon invariants: one continuous strip,
  // never buried (CLAUDE §7.1 pt. 21) — checked AT FLOOD, not just at low water.
  const rep = await page.evaluate(() => ({ gaps: window.__rivers.gaps, buried: window.__rivers.buried }))
  check(
    'ribbon continuity and never-buried hold at flood peak',
    rep.gaps === 0 && rep.buried === 0,
    JSON.stringify(rep),
  )
  await page.evaluate(() => window.__game.getState().debugJumpToMonth(1))
  await page.waitForTimeout(1500)
}

// Point 139 — the Okavango INVERSION: the delta peaks in the LOCAL dry season
// (Andersson and Livingstone, both PERIOD — the water is the Angolan rains
// arriving half a year late). Asserted so nobody "corrects" it back to
// flooding with the local rains.
{
  await page.evaluate(() => window.__game.getState().debugJumpTo(-19.2, 22.9)) // the delta
  await page.waitForTimeout(1200)
  const deltaAt = async (month) => {
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.waitForTimeout(4500) // the swell blends at 0.02/frame
    return page.evaluate(() => ({
      flood: window.__naturalSites.deltaFlood(),
      scale: window.__naturalSites.deltaWaterScale(),
    }))
  }
  const jan = await deltaAt(1) // Botswana's own rains — and LOW water
  await page.screenshot({ path: `${OUT}119-okavango-low-january.png` })
  const jul = await deltaAt(7) // the local dry season — and the FLOOD
  await page.screenshot({ path: `${OUT}120-okavango-flood-july.png` })
  console.log('shot 119-okavango-low-january.png, 120-okavango-flood-july.png')
  check(
    'the Okavango delta is FULLER in the local dry season than in the local rains (point 139)',
    jul.scale !== null && jan.scale !== null && jul.scale > jan.scale + 0.2,
    `January scale ${jan.scale?.toFixed(2)} (flood ${jan.flood.toFixed(2)}) -> July ${jul.scale?.toFixed(2)} (flood ${jul.flood.toFixed(2)})`,
  )
  await page.evaluate(() => window.__game.getState().debugJumpToMonth(1))
  await page.waitForTimeout(1000)
}

// Point 140 — the harmattan pall: the Sahel's dry-season dust. In January the
// sky whitens toward the pall and the sight lines close HARDER than under
// rain; in August (the rains) there is no dust at all. The counter-intuitive
// look (muted sunsets, reddened noon sun) is pinned in the pure tests.
{
  await page.evaluate(() => window.__game.getState().debugJumpTo(12.5, 8.0)) // Sahel
  await page.waitForTimeout(1200)
  const at = async (month) => {
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.waitForTimeout(4000)
    return page.evaluate(() => ({
      dust: window.__climate.dust(),
      fogFar: window.__climate.fog()?.far ?? null,
    }))
  }
  const jan = await at(1)
  await page.screenshot({ path: `${OUT}121-harmattan-pall-january.png` })
  console.log('shot 121-harmattan-pall-january.png')
  const aug = await at(8)
  check(
    'the harmattan palls the Sahel in January and is gone in the August rains (point 140)',
    jan.dust > 0.8 && aug.dust === 0,
    `dust Jan ${jan.dust.toFixed(2)} -> Aug ${aug.dust.toFixed(2)}`,
  )
  check(
    'the pall closes the sight lines below the rainy-season fog',
    jan.fogFar !== null && aug.fogFar !== null && jan.fogFar < aug.fogFar - 20,
    `fogFar Jan ${jan.fogFar?.toFixed(0)} vs Aug ${aug.fogFar?.toFixed(0)}`,
  )
  await page.evaluate(() => window.__game.getState().debugJumpToMonth(1))
}

// Point 141 — the ice of 1890: permanent caps on exactly the three glaciated
// massifs, the four named near misses BARE (that list IS the test), and
// seasonal snow whitening the High Atlas in February and gone in July.
{
  const ice = await page.evaluate(async () => {
    const t = await import('/src/world/terrain.ts') // pure static data — instance-safe
    const seed = window.__game.getState().seed
    const white = (c) => Math.min(c[0], c[1], c[2]) > 0.75
    const s = (lat, lon) => t.sampleTerrain(lat, lon, seed)
    return {
      kilimanjaro: white(s(-3.07, 37.35).color),
      kenya: white(s(-0.15, 37.31).color),
      rwenzori: white(s(0.39, 29.87).color),
      elgon: white(s(1.12, 34.53).color),
      rasDashen: white(s(13.24, 38.37).color),
      cameroon: white(s(4.2, 9.17).color),
      emiKoussi: white(s(19.87, 18.55).color),
    }
  })
  check(
    'permanent ice caps the three glaciated massifs and NONE of the near misses (point 141)',
    ice.kilimanjaro && ice.kenya && ice.rwenzori &&
      !ice.elgon && !ice.rasDashen && !ice.cameroon && !ice.emiKoussi,
    JSON.stringify(ice),
  )

  // Seasonal Atlas snow, measured as the FRACTION of near-white pixels over the
  // massif crest (a mean over the whole frame dilutes it into sand).
  await page.evaluate(() => window.__game.getState().debugJumpTo(31.06, -7.91)) // Toubkal
  await page.waitForTimeout(1500)
  const whiteFrac = async (month) => {
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.waitForTimeout(2500)
    const buf = await page.screenshot({ clip: { x: 400, y: 280, width: 560, height: 320 } })
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
    let white = 0
    const px = info.width * info.height
    for (let i = 0; i < px; i++) {
      const r = data[i * info.channels]
      const g = data[i * info.channels + 1]
      const b = data[i * info.channels + 2]
      if (Math.min(r, g, b) > 205) white++
    }
    return white / px
  }
  const feb = await whiteFrac(2)
  await page.screenshot({ path: `${OUT}122-atlas-snow-february.png` })
  console.log('shot 122-atlas-snow-february.png')
  const jul = await whiteFrac(7)
  check(
    'the High Atlas whitens in February and bares in July (seasonal snow, point 141)',
    feb > jul * 3 && feb > 0.02,
    `white fraction Feb ${(feb * 100).toFixed(1)}% vs Jul ${(jul * 100).toFixed(1)}%`,
  )
  await page.evaluate(() => window.__game.getState().debugJumpToMonth(1))
}

// Point 147(b) — VISIBLE, and measured in PIXELS rather than the tint uniform:
// the whole reason this class of check exists. A savanna spot's ground must
// differ on screen between its driest and wettest month, and a Congo spot —
// which has no dry season — must NOT. (The uniform swung 0.00..0.95 while the
// player saw nothing; only the pixels tell the truth.)
// Measured on the REAL calendar (debugJumpToMonth), NOT the debug override —
// the override forces the season everywhere and so would make even the Congo
// swing, which is exactly the relativity under test. The whole point is that
// the Congo's own year has no dry month.
const groundRGB = async (lat, lon, month) => {
  await page.evaluate(([la, lo]) => window.__game.getState().debugJumpTo(la, lo), [lat, lon])
  await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
  // Poll until the field's lerp SETTLES instead of a fixed wait (point
  // 135f): under full-regression load 2600 ms covers too few frames and the
  // measured swing lands just under its gate. Node-side loop — an in-page
  // waitForFunction rejects outright on a transient hook error and a
  // swallowed rejection skipped the wait entirely (the swing collapsed).
  for (let settle = 0; settle < 40; settle++) {
    const a = await page.evaluate(() => window.__vegetation?.seasonTint?.() ?? null)
    await page.waitForTimeout(300)
    const b = await page.evaluate(() => window.__vegetation?.seasonTint?.() ?? null)
    if (a !== null && b !== null && Math.abs(b - a) < 0.002) break
  }
  await page.waitForTimeout(400)
  const buf = await page.screenshot({ clip: { x: 300, y: 320, width: 680, height: 340 } })
  const { channels } = await sharp(buf).stats()
  return channels.slice(0, 3).map((c) => c.mean)
}
const gx = (c) => c[1] - (c[0] + c[2]) / 2
const savDry = await groundRGB(-17.9, 25.9, 7) // Zambezi plateau, July — bone dry
await page.screenshot({ path: `${OUT}115-savanna-dry.png` })
const savWet = await groundRGB(-17.9, 25.9, 1) // January — the summer rains
await page.screenshot({ path: `${OUT}116-savanna-wet.png` })
console.log('shot 115-savanna-dry.png, 116-savanna-wet.png')
const congoDry = await groundRGB(-2.6, 22.4, 8) // basin, its driest month
const congoWet = await groundRGB(-2.6, 22.4, 5) // and its wettest — the swing is small
await page.evaluate(() => window.__game.getState().debugJumpToMonth(1))
const savSwing = Math.abs(gx(savWet) - gx(savDry))
const congoSwing = Math.abs(gx(congoWet) - gx(congoDry))
check(
  'the savanna ground visibly changes on SCREEN between dry and wet (point 147, pixels)',
  savSwing > 8,
  `savanna green-excess swing ${savSwing.toFixed(1)} (dry ${gx(savDry).toFixed(0)} -> wet ${gx(savWet).toFixed(0)})`,
)
check(
  'the Congo basin does NOT swing — it has no dry season, and that is correct',
  congoSwing < savSwing / 2,
  `congo swing ${congoSwing.toFixed(1)} vs savanna ${savSwing.toFixed(1)}`,
)

// The dry season gathers the wildlife at the remaining water (point 120e): a
// wider shore catchment at spawn. Same seed, same chunks — the only variable
// is the forced season, so the drinker counts are deterministic.
const drinkersAt = async (override) => {
  await page.evaluate((o) => window.__ui.getState().setSeasonWetnessOverride(o), override)
  await page.evaluate(() => window.__game.getState().debugJumpTo(-17.9, 25.9)) // the Zambezi
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__wildlife.restock())
  await page.waitForTimeout(2500)
  return page.evaluate(() => {
    const h = window.__wildlife.herdsRef.current
    let drink = 0
    for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe', 'elephant']) {
      for (const a of h[sp] ?? []) if (a.drink) drink++
    }
    return drink
  })
}
const dryDrinkers = await drinkersAt(0)
const wetDrinkers = await drinkersAt(1)
const minDry = await page.evaluate(() => window.__balance.panoramaWildlife.dryShoreMinDrinkers)
await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
check(
  'the dry season draws more animals to the remaining water (point 120e)',
  // The dry shore is GUARANTEED populated (point 135c seeder); the rains
  // nearly close the drinking belt — water stands everywhere — so the wet
  // count may legitimately be zero.
  dryDrinkers >= minDry && dryDrinkers > wetDrinkers,
  JSON.stringify({ dryDrinkers, wetDrinkers, minDry }),
)

// haze is shown — the fog recedes to the horizon and the ground haze fades.
const continentZoom = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(99)
  const zoom = window.__ui.getState().travelZoom
  let ok = false
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    const fog = window.__climate?.fog()
    if (
      window.__farTerrain?.built() &&
      window.__farTerrain?.visible() &&
      fog && fog.far > 2000 &&
      window.__climate.hazeOpacity() < 0.05
    ) { ok = true; break }
    await sleep(300)
  }
  return {
    zoom,
    ok,
    farVerts: window.__farTerrain?.vertices() ?? 0,
    fogFar: window.__climate?.fog()?.far,
    haze: window.__climate?.hazeOpacity(),
  }
})
check('the debug zoom reaches a whole-continent view (cap 16, far sheet streamed in)',
  continentZoom.zoom === 16 && continentZoom.ok && continentZoom.farVerts > 50000, JSON.stringify(continentZoom))
// Walking while zoomed out must not desync the scene: the water shader's
// world reconstruction tracks the scaled plane (or the sea drifts against
// the land), and the chunk-bound dressing hides (it only covers the chunk
// rectangle, which would read as a dark dressed island on the far sheet).
const zoomedWalk = await page.evaluate(() => {
  const g = window.__game.getState()
  for (let i = 0; i < 10; i++) g.moveTravel(1, 0, 0.05)
  return {
    planeScale: window.__water?.planeScale(),
    meshScale: window.__water?.meshScale(),
    vegVisible: window.__vegetation?.visible(),
  }
})
check('zoomed out, the water plane scale uniform tracks the mesh scale (no sea/land drift)',
  zoomedWalk.planeScale === zoomedWalk.meshScale && zoomedWalk.planeScale > 1, JSON.stringify(zoomedWalk))
check('zoomed out, the chunk-bound dressing hides (no dressed chunk rectangle)',
  zoomedWalk.vegVisible === false, JSON.stringify(zoomedWalk))
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}87-continent-zoom.png` })
console.log('shot 87-continent-zoom.png')
const zoomBack = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__ui.getState().setTravelZoom(1)
  window.__ui.getState().setWheelZoomEnabled(false)
  let ok = false
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    const fog = window.__climate?.fog()
    if (fog && fog.far < 500 && !window.__farTerrain?.visible()) { ok = true; break }
    await sleep(300)
  }
  return { ok, fog: window.__climate?.fog(), veg: window.__vegetation?.visible() }
})
check('back at the default zoom the haze returns and the far sheet hides',
  zoomBack.ok, JSON.stringify(zoomBack))
check('back at the default zoom the dressing returns', zoomBack.veg === true, JSON.stringify(zoomBack))

// --- Point 16: no first-person clipping after the extended zoom-out ----------
// The travel view widens the shared camera's near plane in the debug zoom
// range; a place scene entered right out of that zoom must own it back to the
// first-person default, or every hut wall clips at close range.
const nearAfterZoom = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(12)
  await sleep(600) // let the travel frame apply the widened near plane
  window.__game.getState().enterPlace('maasai-village')
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const cam = window.__placeCamera
    if (cam) {
      await sleep(300) // a couple of place-scene frames
      const near = window.__placeCamera.near
      window.__game.getState().leavePlace()
      window.__ui.getState().setTravelZoom(1)
      window.__ui.getState().setWheelZoomEnabled(false)
      return { near }
    }
    await sleep(100)
  }
  window.__ui.getState().setTravelZoom(1)
  window.__ui.getState().setWheelZoomEnabled(false)
  return { near: null }
})
check('entering a settlement out of the debug zoom restores the near plane (no clipping)',
  nearAfterZoom.near !== null && nearAfterZoom.near <= 0.1,
  JSON.stringify(nearAfterZoom))

// --- Debug menu: jump-to dropdown teleports (§7.1.20) ------------------------
// The dropdown/renderer-row PRESENCE asserts moved to Vitest (DebugMenu.test);
// what stays needs the live store: selecting a place actually teleports there.
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(500)
// Jump-to dropdown really jumps (Timbuktu at lat 16.95, lon -3).
const jumped = await page.evaluate(() => {
  const sel = [...document.querySelectorAll('.debug-menu select')].find((s) =>
    [...s.options].some((o) => o.value === 'timbuktu'),
  )
  if (!sel) return null
  const proto = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  proto.set.call(sel, 'timbuktu')
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  const p = window.__game.getState().pos
  return { x: p.x, z: p.z }
})
check(
  'Jump-to dropdown teleports to the picked place',
  jumped !== null && Math.abs(jumped.x - -30) < 1 && Math.abs(jumped.z - -169.5) < 1,
  jumped ? `pos (${jumped.x.toFixed(1)}, ${jumped.z.toFixed(1)})` : 'select not found',
)
// The elephant graveyard is offered too and jumps onto it (lat -4.9, lon 36.6).
const jumpedGraveyard = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const land = await import('/src/world/data/landmarks.ts')
  const g = land.ELEPHANT_GRAVEYARD
  const sel = [...document.querySelectorAll('.debug-menu select')].find((s) =>
    [...s.options].some((o) => o.value === '#graveyard'),
  )
  if (!sel) return null
  const proto = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  proto.set.call(sel, '#graveyard')
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  const p = window.__game.getState().pos
  const target = geo.latLonToWorld(g.lat, g.lon)
  return { dist: Math.hypot(p.x - target.x, p.z - target.z) }
})
check(
  'Jump-to dropdown offers and reaches the elephant graveyard',
  jumpedGraveyard !== null && jumpedGraveyard.dist < 1,
  jumpedGraveyard ? `dist ${jumpedGraveyard.dist.toFixed(2)}` : 'graveyard option not found',
)

// Wheel zoom (design.md §21): the wheel wiring is proven with one real wheel
// event (zoom-in). The zoom-out clamp/gate is a pure store assert that moved to
// Vitest (store.*.test.ts); what stays is the real WheelEvent a jsdom test
// cannot dispatch against the live bird's-eye scene.
// A single wheel event is used deliberately: after the first zoom the camera
// moves and the newly revealed terrain chunks briefly Suspend the scene
// subtree, dropping its window wheel listener until React remounts it — so
// chaining several synthetic wheel events in the headless run is unreliable.
await page.evaluate(() => window.__ui.getState().setWheelZoomEnabled(false))
// The wheel zoom only responds in the bird's-eye view while its scene is
// mounted. The jump-to dropdown lands on a place marker, which auto-enters the
// settlement (walk-in entry), so leave it and jump to open terrain, then wait
// for the scene's readiness flag before dispatching the wheel.
await page.evaluate(() => {
  const g = window.__game.getState()
  if (g.mode === 'place') g.leavePlace()
  window.__game.getState().debugJumpTo(25, 15) // open Sahara, away from any marker
})
await page.waitForFunction(() => window.__travelWheelReady === true, null, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(300)
let zoomedIn = 1
for (let i = 0; i < 10; i++) {
  const ready = await page.evaluate(() => window.__travelWheelReady === true && window.__game.getState().mode === 'travel')
  if (ready) {
    await page.evaluate(() => window.__ui.getState().setTravelZoom(1))
    await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -600 })))
    await page.waitForTimeout(150)
    zoomedIn = await page.evaluate(() => window.__ui.getState().travelZoom)
    if (zoomedIn < 1) break
  }
  await page.waitForTimeout(250)
}
check('Wheel zoom: zooming in works without the unlock', zoomedIn < 1, `${zoomedIn.toFixed(2)}`)
// Restore the default zoom for the later screenshots.
await page.evaluate(() => {
  window.__ui.getState().setTravelZoom(1)
  window.__ui.getState().setWheelZoomEnabled(false)
})
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))

// --- Journal do-not-disturb (§7.1.20 / design.md §16) -------------------------
const dnd = await page.evaluate(() => {
  const ui = window.__ui.getState()
  const g = () => window.__game.getState()
  g().setJournalOpen(false)
  ui.setJournalDnd(true)
  const before = g().journal.length
  g().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
  const silent = !g().journalOpen
  const stored = g().journal.length === before + 1
  window.__ui.getState().setJournalDnd(false)
  g().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
  const opens = g().journalOpen
  g().setJournalOpen(false)
  return { silent, stored, opens }
})
check('DND: new entry stays silent but is stored', dnd.silent && dnd.stored, '')
check('DND off: new entry opens the journal again', dnd.opens, '')
const f2 = await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2' }))
  const on = window.__ui.getState().journalDnd
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2' }))
  const off = window.__ui.getState().journalDnd
  return { on, off }
})
check('F2 toggles do-not-disturb', f2.on === true && f2.off === false, '')

// --- Elephant graveyard: fallen carcasses + strewn ivory (user request) ------
// The graveyard is a fixed scene decoration; read its layout via the dev hook
// (mounted in the current bird's-eye scene), then jump onto it for a shot.
const graveyard = await page.evaluate(() => (window.__graveyard ? { ...window.__graveyard } : null))
check('elephant graveyard has fallen elephant carcasses', !!graveyard && graveyard.carcasses >= 5, graveyard ? `${graveyard.carcasses} carcasses` : 'no dev hook')
check('elephant graveyard has strewn ivory tusks', !!graveyard && graveyard.tusks >= 10, graveyard ? `${graveyard.tusks} tusks` : 'no dev hook')
check('elephant graveyard has scattered bones', !!graveyard && graveyard.bones >= 8, graveyard ? `${graveyard.bones} bones` : 'no dev hook')
await page.evaluate(() => window.__game.getState().debugJumpTo(-4.9, 36.6)) // onto the graveyard
await page.waitForTimeout(2600)
await page.screenshot({ path: `${OUT}85-elephant-graveyard.png` })
console.log('shot 85-elephant-graveyard.png')

// --- Modal dialogs render above the in-scene labels (user request) -----------
// In a settlement the buildings carry floating map-labels (drei <Html>); an
// opened modal dialog must cover them, not sit behind them.
await page.evaluate(() => window.__game.getState().enterPlace('cairo'))
await page
  .waitForFunction(
    (want) => window.__game.getState().placeId === want && !!window.__placeLayout,
    "cairo",
    { timeout: 30000 },
  )
  .catch(() => {})
await page.waitForTimeout(500)
// The floating labels mount a beat after the layout.
await page.waitForFunction(() => !!document.querySelector('.map-label'), null, { timeout: 15000 }).catch(() => {})
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
// The arrival/checkpoint entries can auto-open the journal a beat later and
// its panel covers the right-side labels (and outranks the dialog backdrop),
// which false-failed both probes under full-suite timing — close it right
// before measuring and wait until the panel is gone.
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForFunction(() => !document.querySelector('.journal'), null, { timeout: 5000 }).catch(() => {})
const zorder = await page.evaluate(async () => {
  window.__game.getState().setJournalOpen(false)
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  const label = [...document.querySelectorAll('.map-label')].find((l) => {
    const r = l.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.top > 80 && r.left > 0 && r.bottom < window.innerHeight - 80
  })
  if (!label) return { ok: false, why: 'no visible label' }
  const r = label.getBoundingClientRect()
  const cx = Math.round(r.left + r.width / 2)
  const cy = Math.round(r.top + r.height / 2)
  const beforeTop = document.elementFromPoint(cx, cy)
  const labelOnTopBefore = label === beforeTop || label.contains(beforeTop)
  window.__ui.getState().setDialog({ kind: 'trade', building: 'shop' })
  await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 80)))
  const afterTop = document.elementFromPoint(cx, cy)
  const backdrop = document.querySelector('.dialog-backdrop')
  const dialogOnTop = !!backdrop && (backdrop === afterTop || backdrop.contains(afterTop))
  window.__ui.getState().setDialog(null)
  return { ok: true, labelOnTopBefore, dialogOnTop }
})
check('a settlement label is hit-tested on top before a dialog opens', zorder.ok && zorder.labelOnTopBefore, JSON.stringify(zorder))
check('a modal dialog covers the in-scene labels', zorder.ok && zorder.dialogOnTop, JSON.stringify(zorder))

// --- A settlement's bird's-eye vicinity is never empty (point 102, part b) ------
// Leaving Cairo (arid north, where the natural chunk spawn is sparse) must still
// leave at least vicinityMinAnimals region-typical grazers within vicinityRadius
// of the leave point — the seeding tops the presence up.
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().enterPlace('cairo')
})
await page
  .waitForFunction(() => window.__game.getState().placeId === 'cairo', null, { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForFunction(() => !!window.__wildlife?.herdsRef?.current, null, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2500)
const vicinity = await page.evaluate(() => {
  const pos = window.__game.getState().pos
  const region = window.__game.getState().region
  const pool = {
    east: ['wildebeest', 'zebra', 'antelope', 'warthog'],
    south: ['wildebeest', 'zebra', 'antelope', 'warthog'],
    central: ['antelope', 'warthog', 'zebra'],
    west: ['antelope', 'warthog', 'zebra'],
    north: ['antelope', 'warthog'],
  }[region] ?? []
  const herds = window.__wildlife.herdsRef.current ?? {}
  const radius = window.__balance.panoramaWildlife.vicinityRadius
  const min = window.__balance.panoramaWildlife.vicinityMinAnimals
  let count = 0
  for (const sp of pool) for (const a of herds[sp] ?? []) if (!a.dead && Math.hypot(a.x - pos.x, a.z - pos.z) <= radius) count++
  return { region, count, radius, min }
})
check(
  'a settlement vicinity holds region-typical animals after leaving (point 102)',
  vicinity.count >= vicinity.min,
  JSON.stringify(vicinity),
)

// --- Region border near a river renders a legible tone, not a black slab -------
// (point 101) A transparent border ribbon wrote no valid MRT normal, so the
// screen-space AO blackened it into "black bars near rivers". Park on land by
// Kabalega Falls, project a near-player border vertex to screen and sample the
// ribbon pixels: they must be a mid-tone sepia, never near-black (nor white).
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
  window.__ui.getState().setWheelZoomEnabled(true)
  window.__ui.getState().setTravelZoom(0.35)
  window.__game.getState().debugJumpTo(2.28, 31.68)
  // Park just to the side of the border line on land so the traveller does not
  // drift downstream and the border sits stably on screen.
  window.__borderPark = { x: 317.28, z: -21 }
})
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => window.__game.setState({ pos: { ...window.__borderPark } }))
  await page.waitForTimeout(120)
}
const borderMat = await page.evaluate(() => {
  const b = window.__regionBorder
  return b ? { matType: b.matType, opaque: b.opaque, ink: b.ink } : null
})
// The opaque STANDARD node material is what writes the ground normal the AO
// needs — the fix that stops the ribbon blackening.
check(
  'region border uses the AO-safe opaque standard node material (point 101)',
  !!borderMat && /Standard/.test(borderMat.matType) && borderMat.opaque === true,
  JSON.stringify(borderMat),
)
const probe = await page.evaluate(() => window.__regionBorder?.screenProbe())
let borderLum = null
if (probe && probe.dist < 12) {
  const clip = { x: Math.max(0, Math.round(probe.sx - 5)), y: Math.max(0, Math.round(probe.sy - 5)), width: 10, height: 10 }
  const buf = await page.screenshot({ clip })
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  const px = data.length / 3
  for (let i = 0; i < data.length; i += 3) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  borderLum = sum / px
}
check(
  'region border near a river renders a legible tone, not a black slab (point 101)',
  borderLum !== null && borderLum > 45 && borderLum < 245,
  `mean luminance ${borderLum === null ? 'n/a' : borderLum.toFixed(1)} at ${JSON.stringify(probe)}`,
)
await page.screenshot({ path: `${OUT}104-region-border-river.png` })
console.log('shot 104-region-border-river.png')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
