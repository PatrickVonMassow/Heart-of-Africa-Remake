// Headless verification for the world/settlement/water enrichments
// (CLAUDE.md §7.1 pts. 3/4/12/15/20/21): region-border name labels,
// swimmable enclosed sea vs. blocked open ocean, river cascades/springs/
// lake surfaces, lion leave phase with consumed carcass, elephant
// trampling, debug dropdowns + renderer row + wheel-zoom gate, settlement
// size tiers, village-life walkers and the landscape backdrop.
// Dev server only (dev hooks).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
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
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(300)

// === Settlement sizes + village life + backdrop (§7.1.15) ====================
const cairo = await page.evaluate(() => ({
  radius: window.__placeLayout.radius,
  dwellings: window.__placeLayout.dwellings.length,
  backdrop: window.__placeBackdrop ?? 0,
}))
check('Cairo (size 3): walkable radius 36', cairo.radius === 36, `${cairo.radius}`)
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
check('Boma (size 1): walkable radius 28', boma.radius === 28, `${boma.radius}`)
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

// === Travel view =============================================================
await page.evaluate(() => window.__game.getState().leavePlace())
await page.waitForTimeout(1500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// --- Rivers: cascades, springs, lake surfaces (§7.1.21) ----------------------
const rivers = await page.evaluate(() => window.__rivers)
check('Rivers: 5 waterfall cascades', rivers?.falls === 5, `${rivers?.falls}`)
check('Rivers: at least one spring', (rivers?.springs ?? 0) >= 1, `${rivers?.springs}`)
check('Rivers: 8 lake surfaces', rivers?.lakes === 8, `${rivers?.lakes}`)

// --- River current sweeps the traveller downstream (design.md §11) -----------
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
  window.__game.getState().leavePlace()
})
const drift = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const gi = await import('/src/world/geoIndex.ts')
  const terr = await import('/src/world/terrain.ts')
  const g = () => window.__game.getState()
  const seed = g().seed
  // Find a river-water point with real flow near a centre coordinate.
  const findRiver = (clat, clon) => {
    for (let r = 0; r <= 0.7; r += 0.04) {
      for (let a = 0; a < 20; a++) {
        const lat = clat + Math.cos((a / 20) * 6.2832) * r
        const lon = clon + Math.sin((a / 20) * 6.2832) * r
        const t = terr.sampleTerrain(lat, lon, seed).type
        const f = gi.riverFlow(lat, lon)
        if ((t === 'water' || t === 'ocean') && f.strength > 0.3) return { lat, lon }
      }
    }
    return null
  }
  const place = (spot) => {
    const w = geo.latLonToWorld(spot.lat, spot.lon)
    window.__game.setState({ pos: { x: w.x, z: w.z } })
  }
  const stepDelta = (spot) => {
    place(spot)
    const p0 = { ...g().pos }
    g().driftCurrent(0.1)
    const p1 = g().pos
    return Math.hypot(p1.x - p0.x, p1.z - p0.z)
  }
  // Idle sweep on a calm stretch of the White Nile — and time/provisions must
  // advance with the drifted distance (design.md §11).
  const calm = findRiver(9, 31)
  let idleMove = 0
  let dayGain = 0
  let foodDrop = 0
  if (calm) {
    place(calm)
    window.__game.setState({ day: 100, foodDays: 300 })
    const p0 = { ...g().pos }
    const day0 = g().day
    const food0 = g().foodDays
    for (let i = 0; i < 8; i++) g().driftCurrent(0.1)
    idleMove = Math.hypot(g().pos.x - p0.x, g().pos.z - p0.z)
    dayGain = g().day - day0
    foodDrop = food0 - g().foodDays
  }
  // At a waterfall (Victoria Falls, Zambezi): a higher boost sweeps harder.
  const falls = findRiver(-17.93, 25.86)
  let base = 0
  let boosted = 0
  if (falls) {
    window.__balance.currentWaterfallBoost = 1
    base = stepDelta(falls)
    window.__balance.currentWaterfallBoost = 4
    boosted = stepDelta(falls)
  }
  return { calm: !!calm, falls: !!falls, idleMove, base, boosted, dayGain, foodDrop }
})
check('the river current sweeps an idle traveller downstream', drift.calm && drift.idleMove > 0.3, JSON.stringify(drift))
check('the current is stronger near a waterfall (varying strength)', drift.falls && drift.boosted > drift.base * 1.5, JSON.stringify(drift))
check('being swept by the current consumes time and provisions', drift.dayGain > 0 && drift.foodDrop > 0, JSON.stringify(drift))

// --- Region border labels (§7.1.3) -------------------------------------------
await page.evaluate(() => window.__game.getState().debugJumpTo(17.2, -2))
await page.waitForTimeout(2500)
const labels = await page.evaluate(() => [...document.querySelectorAll('.region-label')].map((e) => e.textContent))
check(
  'Border labels: both regions named on their sides',
  labels.includes('North') && labels.includes('West'),
  JSON.stringify([...new Set(labels)]),
)

// --- Biome borders meander, not straight lines (design.md §3, point 10) -------
// The south desert edge is a pure threshold border (no per-tile noise term), so
// without the domain warp it would be a straight meridian; the warp makes its
// longitude vary with latitude.
const biomeEdge = await page.evaluate(() => {
  const seed = window.__game.getState().seed
  const T = window.__terrainType
  const edges = []
  for (let lat = -28; lat <= -15; lat += 1) {
    let edge = null
    for (let lon = 12; lon <= 22; lon += 0.1) if (T(lat, lon, seed) === 'desert') edge = lon
    if (edge !== null) edges.push(edge)
  }
  const m = edges.reduce((a, b) => a + b, 0) / (edges.length || 1)
  const sd = Math.sqrt(edges.reduce((a, b) => a + (b - m) ** 2, 0) / (edges.length || 1))
  return { n: edges.length, sd }
})
check('biome borders meander instead of running straight', biomeEdge.n >= 6 && biomeEdge.sd > 0.18, JSON.stringify(biomeEdge))

// --- Enclosed sea swimmable, open ocean blocked (§7.1.4) ---------------------
// Gulf of Sidra: sea inside the continent outline.
const swim = await page.evaluate(async () => {
  const g = window.__game.getState()
  g.debugJumpTo(31.8, 18.5)
  // Mark the water penalty as already announced so its (benign) first-time
  // toast does not stand in for the ocean-blocked message this test checks.
  window.__game.setState({ penaltyJournaled: { jungle: true, water: true, mountain: true } })
  window.__game.getState().setToast(null)
  const before = { ...window.__game.getState().pos }
  for (let i = 0; i < 20; i++) window.__game.getState().moveTravel(0, -1, 0.05)
  const after = window.__game.getState().pos
  return {
    moved: Math.hypot(after.x - before.x, after.z - before.z),
    toast: window.__game.getState().toast,
  }
})
check('Enclosed sea (Gulf of Sidra) is swimmable', swim.moved > 0.5 && !swim.toast, `moved ${swim.moved.toFixed(2)}`)

// Open Atlantic far west of the Sahara coast: outside the outline.
const blocked = await page.evaluate(async () => {
  const g = window.__game.getState()
  g.debugJumpTo(25.0, -19.5)
  window.__game.getState().setToast(null)
  const before = { ...window.__game.getState().pos }
  for (let i = 0; i < 10; i++) window.__game.getState().moveTravel(-1, 0, 0.05)
  const after = window.__game.getState().pos
  return {
    moved: Math.hypot(after.x - before.x, after.z - before.z),
    toast: window.__game.getState().toast,
  }
})
check(
  'Open ocean blocks with the notice',
  blocked.moved < 0.01 && typeof blocked.toast === 'string' && blocked.toast.length > 0,
  `moved ${blocked.moved.toFixed(3)}, toast: ${blocked.toast ? 'yes' : 'no'}`,
)

// --- Mountains are climbable without a rope, slower and dangerous
//     (§7.1.4, design.md §7/§11) -------------------------------------------------
// March east into the Emi Koussi massif: now passable hands-free (with a
// warning), and faster with the rope in hand. Random hazards are switched off
// so the passability comparison is deterministic. A canteen prevents desert
// dehydration drift.
const climb = await page.evaluate(async () => {
  const g = window.__game.getState()
  window.__balance.randomEventsEnabled = false
  g.debugAddEquipment('canteen')
  g.debugSet({ foodDays: 300 })
  g.takeInHand(null)
  g.debugJumpTo(19.87, 17.4)
  g.setToast(null)
  // 180 steps (the overland pace was lowered 30%, so more steps cover the reach).
  for (let i = 0; i < 180; i++) window.__game.getState().moveTravel(1, 0, 0.05)
  const noRope = { lon: window.__game.getState().pos.x / 10, toast: window.__game.getState().toast }
  window.__game.getState().debugAddEquipment('rope')
  // Single-step speed on the Emi Koussi summit (guaranteed mountain terrain):
  // the rope lowers the time cost, so one step covers more ground.
  const stepAt = (withRope) => {
    const st = window.__game.getState()
    st.takeInHand(withRope ? 'rope' : null)
    st.debugJumpTo(19.87, 18.55)
    const p0 = { ...window.__game.getState().pos }
    window.__game.getState().moveTravel(1, 0, 0.05)
    const p1 = { ...window.__game.getState().pos }
    return Math.hypot(p1.x - p0.x, p1.z - p0.z)
  }
  const noRopeStep = stepAt(false)
  const ropeStep = stepAt(true)
  return { noRope, noRopeStep, ropeStep }
})
check(
  'Mountain is climbable without a rope (with a warning)',
  climb.noRope.lon > 18.6 && typeof climb.noRope.toast === 'string' && climb.noRope.toast.length > 0,
  `reached lon ${climb.noRope.lon.toFixed(2)}, warned: ${climb.noRope.toast ? 'yes' : 'no'}`,
)
check(
  'With the rope in hand the climb is faster (more ground per step)',
  climb.ropeStep > climb.noRopeStep * 1.3,
  `step without ${climb.noRopeStep.toFixed(3)} vs with rope ${climb.ropeStep.toFixed(3)}`,
)

// A fall wounds the traveller and can cost a carried item (design.md §11).
const fall = await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugSetAffliction('wounds', 0)
  g.takeInHand(null)
  for (let i = 0; i < 8; i++) {
    window.__game.getState().debugAddEquipment('machete')
    window.__game.getState().debugAddEquipment('canteen')
  }
  const inv = () => (window.__game.getState().equipment.machete ?? 0) + (window.__game.getState().equipment.canteen ?? 0)
  const before = inv()
  let woundedSeen = false
  for (let i = 0; i < 30; i++) {
    window.__game.getState().debugTriggerMountainFall()
    if (window.__game.getState().afflictions.wounds > 0) woundedSeen = true
  }
  return { woundedSeen, before, after: inv() }
})
check('A fall while climbing wounds the traveller', fall.woundedSeen, '')
check('Repeated falls can cost carried items', fall.after < fall.before, `items ${fall.before} → ${fall.after}`)

// --- Movement-penalty reason is visible (§7.1.4 / design.md §11) --------------
// Pure mapping: each slowing terrain names its relieving item.
const penalties = await page.evaluate(() => {
  const mp = window.__movement.movementPenalty
  return {
    jungleNone: mp('jungle', null),
    jungleMachete: mp('jungle', 'machete'),
    waterNone: mp('water', null),
    waterCanoe: mp('water', 'canoe'),
    mountainNone: mp('mountain', null),
    mountainRope: mp('mountain', 'rope'),
    savanna: mp('savanna', null),
  }
})
check('Movement penalty: jungle needs a machete', penalties.jungleNone === 'jungle' && penalties.jungleMachete === null)
check('Movement penalty: water needs a canoe', penalties.waterNone === 'water' && penalties.waterCanoe === null)
check('Movement penalty: mountain needs a rope', penalties.mountainNone === 'mountain' && penalties.mountainRope === null)
check('Movement penalty: open savanna has none', penalties.savanna === null)

// HUD hint: in jungle without a machete the reason is shown, and it clears once
// the machete is in hand.
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
    g.takeInHand(null)
    g.debugJumpTo(s.lat, s.lon)
  }, jungleSpot)
  await page.waitForTimeout(250)
  const hint = await page.evaluate(() => {
    const el = document.querySelector('.movement-penalty')
    if (!el) return { text: '' }
    const r = el.getBoundingClientRect()
    const bar = document.querySelector('.status-bar')?.getBoundingClientRect()
    // In the status-bar band at the top-right: right of centre and vertically
    // overlapping the status bar (not stacked below it).
    const withinBar = !!bar && r.top < bar.bottom && r.right <= window.innerWidth
    return {
      text: el.textContent ?? '',
      topRight: r.left > window.innerWidth / 2 && withinBar,
      hintTop: Math.round(r.top),
      barBottom: bar ? Math.round(bar.bottom) : null,
    }
  })
  await page.screenshot({ path: `${OUT}84-movement-penalty.png` })
  console.log('shot 84-movement-penalty.png')
  // Ensure a machete is owned (earlier fall tests may have dropped them all).
  await page.evaluate(() => {
    window.__game.getState().debugAddEquipment('machete')
    window.__game.getState().takeInHand('machete')
  })
  await page.waitForTimeout(250)
  const hintMachete = await page.evaluate(() => document.querySelector('.movement-penalty')?.textContent ?? '')
  check('Movement penalty hint shows in jungle without a machete', hint.text.toLowerCase().includes('machete'), `"${hint.text}"`)
  check('Movement penalty hint sits in the top-right status-bar band', hint.topRight === true, `hintTop ${hint.hintTop} vs barBottom ${hint.barBottom}`)
  check('Movement penalty hint clears with a machete in hand', hintMachete === '', `"${hintMachete}"`)

  // Point 7: the penalty is journaled only the first time, then only the
  // status-bar hint carries it (design.md §11).
  const once = await page.evaluate(async (s) => {
    const g = () => window.__game.getState()
    window.__balance.randomEventsEnabled = false
    window.__game.setState({ penaltyJournaled: { jungle: false, water: false, mountain: false } })
    g().takeInHand(null)
    const key = 'journal.titles.penaltyJungle'
    const countJungle = () => g().journal.filter((e) => e.title?.key === key).length
    g().debugJumpTo(s.lat, s.lon)
    const before = countJungle()
    for (let i = 0; i < 6; i++) { g().moveTravel(1, 0, 0.03); await new Promise((r) => setTimeout(r, 20)) }
    const afterFirst = countJungle()
    const flag = g().penaltyJournaled.jungle
    g().debugJumpTo(s.lat, s.lon)
    for (let i = 0; i < 6; i++) { g().moveTravel(0, 1, 0.03); await new Promise((r) => setTimeout(r, 20)) }
    const afterSecond = countJungle()
    return { before, afterFirst, afterSecond, flag }
  }, jungleSpot)
  check('movement penalty is journaled the first time', once.afterFirst === once.before + 1, JSON.stringify(once))
  check('the penalty type is marked as announced', once.flag === true, JSON.stringify(once))
  check('a later encounter adds no second journal entry', once.afterSecond === once.afterFirst, JSON.stringify(once))
} else {
  check('Movement penalty hint: a jungle tile was found', false, 'no jungle tile located')
}

// --- Lion: carcass consumed, lion moves on (§7.1.12) -------------------------
await page.evaluate(() => {
  const pos = window.__game.getState().pos
  const s = window.__lionHunt.state
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
  for (let k = 0; k < 34; k++) {
    let maxd = 0
    for (const a of members) for (const b of members) maxd = Math.max(maxd, Math.hypot(a.x - b.x, a.z - b.z))
    spreads.push(maxd)
    headingSnaps.push(members.map((m) => m.heading ?? 0))
    await sleep(180)
  }
  const cF = { x: mean(members, 'x'), z: mean(members, 'z') }
  const centreMoved = Math.hypot(cF.x - c0.x, cF.z - c0.z)
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
await page.waitForTimeout(1600)
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
  const deadline = Date.now() + 15000
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
  // Weave: drive one chase and watch the prey's heading offset from straight-away.
  const offs = []
  if (await startChase(4000)) {
    for (let k = 0; k < 45 && s.mode === 'chase'; k++) {
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

// --- Debug menu: dropdowns, renderer row, wheel-zoom gate (§7.1.20) ----------
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' })))
await page.waitForTimeout(500)
const menu = await page.evaluate(() => ({
  selects: document.querySelectorAll('.debug-menu select').length,
  text: document.body.innerText,
}))
check('Debug menu: three dropdown selectors', menu.selects >= 3, `${menu.selects}`)
check(
  'Debug menu: renderer row shows the backend',
  menu.text.includes('Renderer') && (menu.text.includes('WebGL 2') || menu.text.includes('WebGPU')),
  '',
)
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
// event (zoom-in), while the zoom-out gate is asserted directly on the store.
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
// Gate: zoom-out beyond the default distance is clamped to 1 while locked and
// permitted (up to 4) once unlocked (design.md §21).
const gate = await page.evaluate(() => {
  const ui = window.__ui
  ui.getState().setWheelZoomEnabled(false)
  ui.getState().setTravelZoom(2)
  const gated = ui.getState().travelZoom
  ui.getState().setWheelZoomEnabled(true)
  ui.getState().setTravelZoom(2)
  const wide = ui.getState().travelZoom
  ui.getState().setTravelZoom(10)
  const maxOut = ui.getState().travelZoom
  ui.getState().setTravelZoom(0.01)
  const maxIn = ui.getState().travelZoom
  ui.getState().setTravelZoom(3)
  ui.getState().setWheelZoomEnabled(false)
  const clamped = ui.getState().travelZoom
  return { gated, wide, maxOut, maxIn, clamped }
})
const zoom = { zoomedIn, ...gate }
check('Wheel zoom: zooming in works without the unlock', zoom.zoomedIn < 1, `${zoom.zoomedIn.toFixed(2)}`)
check('Wheel zoom: zoom-out gated at the default level', zoom.gated === 1, `${zoom.gated}`)
check('Wheel zoom: zooms out beyond default once unlocked', zoom.wide > 1, `${zoom.wide.toFixed(2)}`)
check('Wheel zoom: range spans 0.25x-4x', zoom.maxOut === 4 && zoom.maxIn === 0.25, `${zoom.maxIn}-${zoom.maxOut}`)
check('Wheel zoom: disabling the unlock clamps back to default', zoom.clamped === 1, `${zoom.clamped}`)
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
