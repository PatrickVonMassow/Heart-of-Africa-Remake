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
await page.waitForTimeout(4000)
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
await page.waitForTimeout(2200)
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
await page.evaluate(() => window.__game.getState().enterPlace('masai-village'))
await page.waitForTimeout(2200)
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

// --- Rivers: cascades, springs, lake surfaces (§7.1.21) ----------------------
const rivers = await page.evaluate(() => window.__rivers)
check('Rivers: 5 waterfall cascades', rivers?.falls === 5, `${rivers?.falls}`)
check('Rivers: at least one spring', (rivers?.springs ?? 0) >= 1, `${rivers?.springs}`)
check('Rivers: 8 lake surfaces', rivers?.lakes === 8, `${rivers?.lakes}`)
// Point 13: every river renders as one continuous, never-buried ribbon.
check('Rivers: no interior gaps (all continuous)', rivers?.gaps === 0, `gaps ${rivers?.gaps}`)
check('Rivers: surface never buried under the terrain', rivers?.buried === 0, `buried ${rivers?.buried}`)
check('Rivers: the Nile is a single continuous strip', rivers?.report?.nile?.strips === 1, JSON.stringify(rivers?.report?.nile))
// TASKS pt. 11: every lake surface clears its highest interior bed sample —
// a buried sheet showed through in flickering blotches (Lake Victoria).
check(
  'Lakes: every surface sits above its interior bed (no blotchy show-through)',
  Array.isArray(rivers?.lakeInfo) && rivers.lakeInfo.length === 8 && rivers.lakeInfo.every((l) => l.y > l.bedMax),
  JSON.stringify(rivers?.lakeInfo),
)

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
    // it is contained in the bar's DOM and its box stays within the bar's box.
    const insideBar = bar.contains(el) && r.top >= br.top - 1 && r.bottom <= br.bottom + 1
    return {
      topRight: r.left > window.innerWidth / 2 && insideBar,
      hintTop: Math.round(r.top),
      barBottom: Math.round(br.bottom),
    }
  })
  await page.screenshot({ path: `${OUT}84-movement-penalty.png` })
  console.log('shot 84-movement-penalty.png')
  check('Movement penalty hint sits inside the status bar (right-aligned)', hint.topRight === true, `hintTop ${hint.hintTop} vs barBottom ${hint.barBottom}`)
} else {
  check('Movement penalty hint: a jungle tile was found', false, 'no jungle tile located')
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
const waterSpot = await findTile('water', 2, -6, 12, 34)
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
  // Zoom in for legible evidence (zoom-in below 1 is always allowed).
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.3))
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}88-canoe-ride.png` })
  console.log('shot 88-canoe-ride.png')

  // On land with the canoe still in the pack: it is dragged behind, not ridden.
  await page.evaluate((s) => window.__game.getState().debugJumpTo(s.lat, s.lon), landSpot)
  await page.waitForTimeout(300)
  await page.evaluate(() => { const p = window.__game.getState().pos; window.__game.setState({ pos: { x: p.x, z: p.z - 2 } }) })
  await page.waitForTimeout(500)
  const drag = await page.evaluate(() => window.__player)
  check('Canoe: on land the explorer drags the canoe (not ridden)', drag?.carrying === true && drag?.canoeing === false, JSON.stringify(drag))
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
  const camp = document.querySelector('.camp-toggle')?.getBoundingClientRect()
  const jbtn = document.querySelector('.journal-toggle')?.getBoundingClientRect()
  return { jBottom: j?.bottom ?? null, campTop: camp?.top ?? null, jbtnTop: jbtn?.top ?? null, jRight: j?.right ?? null, vw: window.innerWidth }
})
check(
  'journal panel ends above the camp button (with a gap)',
  journalFit.jBottom !== null && journalFit.campTop !== null && journalFit.jBottom <= journalFit.campTop - 4,
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
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8))
await page.waitForTimeout(2500)
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
  herds.elephant.push(...members)
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
  const prey = { x: spot.x, z: spot.z, y: 0.2, rot: 0, scale: 1, phase: 0.5 }
  herds.zebra.push(prey)
  const eleph = { x: spot.x + 7, z: spot.z, y: 0.2, rot: 0, scale: 1, phase: 0, heading: 0 }
  herds.elephant.push(eleph)
  const pf0 = { x: prey.x, z: prey.z }
  for (let k = 0; k < 10; k++) { eleph.x = spot.x + 7; eleph.z = spot.z; await sleep(120) }
  const movedWhileFar = Math.hypot(prey.x - pf0.x, prey.z - pf0.z)
  const dNearStart = Math.hypot(prey.x - (spot.x + 2), prey.z - spot.z)
  let dNearEnd = dNearStart
  for (let k = 0; k < 55; k++) { eleph.x = spot.x + 2; eleph.z = spot.z; await sleep(110); dNearEnd = Math.hypot(prey.x - eleph.x, prey.z - eleph.z) }

  return { ok: true, centreMoved, maxSpread, maxTurn, movedWhileFar, dNearStart, dNearEnd }
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
  for (let lat = 3; lat >= -12 && spots.length < 32; lat -= 0.4)
    for (let lon = 29; lon <= 37 && spots.length < 32; lon += 0.4)
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
// union across shores makes the sample large enough to be reliable.
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
            if (a.drink) drinkers.push(`${sp}:${a.drink.tx.toFixed(2)},${a.drink.tz.toFixed(2)}`)
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

// --- Point 4: spawn spacing and animal-animal collision -----------------------
// design.md §19: animals spawn with natural spacing (no two inside one another)
// and never walk through each other — overlapping animals part at once. The
// elephant×smaller-prey pair stays exempt (trampling is designed; its own test
// above still passes). Body radii mirror Wildlife.tsx BODY_RADIUS.
await pinFamily(-2.9, 34.2)
const spacing = await page.evaluate(async () => {
  const RAD = { elephant: 1.3, giraffe: 0.9, zebra: 0.7, wildebeest: 0.75, antelope: 0.6, warthog: 0.45, flamingo: 0.25 }
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
})
check('spawned animals keep body spacing (no two inside one another)',
  spacing.animals > 5 && spacing.worst >= 0.7, JSON.stringify(spacing))

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
  // Reset the kill flight too: the zoom tests above leave it mid fly-off, and
  // under full-suite RAF throttling finishing that cycle plus the fresh fly-in
  // can exceed the landing window — from idle it spawns at the view ring like
  // any real kill's flock (setup only; the descent itself stays live).
  window.__vultures.killFlight.current.mode = 'idle'
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
    if (
      f.mode === 'active' &&
      Math.hypot(f.x - rem.x, f.z - rem.z) < 2.5 &&
      window.__vultures.killDescend.current > 0.7
    ) { out.flockLanded = true; break }
    await sleep(100)
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
  window.__game.getState().enterPlace('masai-village')
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
// Jump-to dropdown really jumps (Timbuktu at lat 16.77, lon -3).
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
  jumped !== null && Math.abs(jumped.x - -30) < 1 && Math.abs(jumped.z - -167.7) < 1,
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
await page.waitForTimeout(2500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
const zorder = await page.evaluate(async () => {
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

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
