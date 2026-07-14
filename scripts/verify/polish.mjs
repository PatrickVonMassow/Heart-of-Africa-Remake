// Headless verification for CLAUDE.md §7.1.31 (settlement orientation after
// a gift and distant panorama wildlife, design.md §17/§2). Dev server only.
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
await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
})

// --- Giza skyline behind Cairo (design.md §4.4, point 82) ----------------------
// The game starts inside Cairo: the great pyramids stand as the western
// skyline silhouette (point-69 pattern, like Cape Town's Table Mountain).
{
  const sky = await page.evaluate(() => window.__placeSkyline ?? 'none')
  check('Cairo mounts the Giza pyramid skyline', sky === 'giza-pyramids', `${sky}`)
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = -(window.__placeLayout.radius - 8)
    p.z = 0
    p.yaw = Math.PI / 2
    p.pitch = 0.02
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}100-cairo-giza-skyline.png` })
  console.log('shot 100-cairo-giza-skyline.png')
}

// --- Panorama wildlife (design.md §2) ---------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('masai-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "masai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
// The panorama animals stream in over the first seconds of the scene.
await page.waitForFunction(() => (window.__placePanoramaWildlife ?? 0) >= 3, null, { timeout: 20000 }).catch(() => {})
const wildlife = await page.evaluate(() => window.__placePanoramaWildlife ?? 0)
check('distant wildlife drifts through the panorama', wildlife >= 3, `${wildlife} animals`)
// No silhouette may stand sunken behind the ground disc's false horizon
// (user-reported black back-slivers): every standing height is clamped to
// the disc plane or follows genuinely rising relief.
await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 10000 }).catch(() => {})
const groundYs = await page.evaluate(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}))
check(
  'no panorama silhouette sinks below the settlement ground plane',
  groundYs.length >= 3 && groundYs.every((y) => y >= 0),
  `groundY [${groundYs.map((y) => y.toFixed(2)).join(', ')}]`,
)

// --- Settlement plan on the map (design.md §6.1, point 79) --------------------
// Inside a place the map opens as a plan of the town: functional buildings
// marked and named, no continental canvas.
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(400)
const plan = await page.evaluate(() => {
  const el = document.querySelector('.map-place-plan')
  const labels = [...document.querySelectorAll('.plan-building-label')].map((n) => n.textContent)
  return { present: !!el, labels, canvas: !!document.querySelector('.map-overlay canvas') }
})
await page.screenshot({ path: `${OUT}98-place-plan.png` })
console.log('shot 98-place-plan.png')
check('inside a settlement the map shows the town plan', plan.present && !plan.canvas, JSON.stringify({ canvas: plan.canvas }))
check('the plan names the functional buildings', plan.labels.length >= 2, `labels [${plan.labels.join(', ')}]`)
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(200)

// --- Orientation after a gift (design.md §17) ---------------------------------------
const before = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('no building markers before the gift', before === 0, `${before}`)
const toast = await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddGift('emerald') // revered in the east
  g.giveGift('emerald')
  return window.__game.getState().toast
})
await page.waitForTimeout(600)
const after = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('the gift unlocks the building markers', after >= 1, `${after} markers`)
check('the orientation announces itself', !!toast && toast.length > 0, `"${toast}"`)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}93-orientation-highlight.png` })
console.log('shot 93-orientation-highlight.png')

// Persistence: leaving and re-entering keeps the orientation.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
})
await page.waitForTimeout(600)
await page.evaluate(() => window.__game.getState().enterPlace('masai-village'))
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "masai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
const again = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('the orientation persists across re-entry', again >= 1, `${again} markers`)

// A settlement without a gift stays unmarked.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('swahili-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "swahili-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
const other = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('other settlements stay unmarked without a gift', other === 0, `${other}`)

// --- Port skyline landmarks (design.md §4.4 Part C) ---------------------------
// Cape Town: Table Mountain stands as a flat-topped massif behind the town.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('capetown')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'capetown', { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(1200)
const skyline = await page.evaluate(() => window.__placeSkyline)
check('Cape Town mounts the Table Mountain skyline', skyline === 'table-mountain', `${skyline}`)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  const p = window.__placePlayer
  p.x = 0
  p.z = window.__placeLayout.radius - 3
  p.yaw = 0
})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}96-capetown-table-mountain.png` })
console.log('shot 96-capetown-table-mountain.png')

// Timbuktu: the Djinguereber mosque stands inside the town fabric, with a
// collider (an oriented box like every rectangular building).
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('timbuktu')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'timbuktu', { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(1200)
const mosque = await page.evaluate(() => {
  const d = window.__placeLayout.dwellings.find((dd) => dd.kind === 'mosque')
  return d ? { x: d.x, z: d.z, door: d.door } : null
})
check('Timbuktu builds the Djinguereber mosque', !!mosque, JSON.stringify(mosque))
if (mosque) {
  await page.evaluate((m) => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    // Stand back from the door point (guaranteed free ground) facing the mosque.
    const dx = m.x - m.door[0]
    const dz = m.z - m.door[1]
    const dl = Math.hypot(dx, dz) || 1
    // Stand on the door approach (kept free by the layout rules), close
    // enough that no neighbouring house can block the view.
    p.x = m.door[0] - (dx / dl) * 5
    p.z = m.door[1] - (dz / dl) * 5
    p.pitch = 0.3 // tilt up so the minaret is in frame
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(m.x - p.x, m.z - p.z) + Math.PI
  }, mosque)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}97-timbuktu-djinguereber.png` })
  console.log('shot 97-timbuktu-djinguereber.png')
}

// --- Travel panorama capture (design.md §2.5, point 81) -----------------------
// Entering from the travel scene captures the REAL surroundings as the
// first-person horizon: at the riverside Nubian village the Nile must show in
// the north/east sectors (direction-true), while a direct place->place enter
// (no travel scene) falls back to the geometry backdrop.
{
  const before = await page.evaluate(() => window.__placePanoramaActive ?? null)
  check('a direct enter without the travel scene falls back (no capture)', before === false, `active ${before}`)
  await page.evaluate(() => { const g = window.__game.getState(); g.leavePlace() })
  // Generous timeout: after several place mounts the main thread stalls
  // ~13-16 s on this transition (pre-existing, measured on the pre-baked-
  // texture build too; TASKS point 96), so 15 s raced the stall under load.
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  // Compass probe (point 90): a magenta pillar is injected due WEST of the
  // capture point for exactly this capture — seed-independent orientation
  // proof (real water shifts with each seed's dune cover).
  await page.evaluate(() => { window.__panoProbeOffset = { dx: -8, dz: 0 } })
  await page.waitForTimeout(2500) // travel scene mounts, frame loop runs
  await page.evaluate(() => { delete window.__placePanorama }) // fresh capture signal
  await page.evaluate(() => window.__game.getState().debugJumpTo(21.8, 31.65)) // approach ring
  // Wait for the CAPTURE ITSELF (the async readback hook names the place) —
  // under full-suite load the frame loop may need many seconds for it.
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'nubian-village', null, { timeout: 45000 }).catch(() => {})
  await page.evaluate(() => window.__game.getState().enterPlace('nubian-village'))
  await page.waitForFunction(() => window.__game.getState().placeId === 'nubian-village' && !!window.__placePlayer, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(2000)
  const pano = await page.evaluate(() => ({
    active: window.__placePanoramaActive ?? false,
    fractions: window.__placePanorama?.waterFractions ?? null,
  }))
  check('entering from the travel scene shows the captured panorama', pano.active === true, JSON.stringify(pano))
  const f = pano.fractions
  // The Nile must show as a clearly DIRECTIONAL water signal: real water
  // pixels overall, concentrated in some sectors while others stay dry
  // (which way the river bends around the village depends on the run's
  // camera height over the bank dunes — the geography itself is fixed).
  const total = f ? f.reduce((a, b) => a + b, 0) : 0
  const max = f ? Math.max(...f) : 0
  const min = f ? Math.min(...f) : 1
  // Water present with a leading sector; the strict east-west proof lives in
  // the rendered-pixel check below (the band mirror made per-sector ratios a
  // weak discriminator with the low camera).
  check(
    'the Nile shows as a water signal in the band',
    !!f && total > 0.003 && max > total * 0.3 && min >= 0,
    `sectors ${f ? f.map((x) => x.toFixed(4)).join('/') : 'n/a'}`,
  )
  await page.evaluate(() => { const p = window.__placePlayer; p.x = 0; p.z = 0; p.yaw = 0; p.pitch = 0.02 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}99-travel-panorama.png` })
  console.log('shot 99-travel-panorama.png')

  // Magenta-pillar orientation proof: the probe stood due west of the
  // capture point, so its colour must show looking WEST and not EAST.
  const countMagenta = async () => {
    const buf = await page.screenshot()
    const crop = await sharp(buf).extract({ left: 100, top: 250, width: 1240, height: 380 }).raw().toBuffer({ resolveWithObject: true })
    const { data, info } = crop
    let hit = 0
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * info.channels]
      const g = data[i * info.channels + 1]
      const b = data[i * info.channels + 2]
      if (r > 150 && b > 150 && g < 90) hit++
    }
    return hit
  }
  // Condition-based probing: poll until the pillar shows (west) or the
  // window ends (east must stay empty) — fixed sleeps starve under load.
  const magentaPx = async (yaw, pollMs) => {
    await page.evaluate((y) => { const p = window.__placePlayer; p.x = 0; p.z = 0; p.yaw = y; p.pitch = 0.02 }, yaw)
    const deadline = Date.now() + pollMs
    let best = 0
    do {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120))))
      best = Math.max(best, await countMagenta())
      if (best > 200) break
    } while (Date.now() < deadline)
    return best
  }
  const westProbe = await magentaPx(Math.PI / 2, 20000)
  const eastProbe = await magentaPx(-Math.PI / 2, 2500)
  await page.evaluate(() => { delete window.__panoProbeOffset })
  check(
    'the band is compass-true: a probe placed due west shows west, not east',
    westProbe > 200 && eastProbe < westProbe / 10,
    `west ${westProbe}px, east ${eastProbe}px`,
  )
}

// --- Settlement fabric per plan (design.md §2.6/§4.5) -------------------------
// Screenshot evidence of the port/village difference: the Congo street
// village's single axis (101) vs Cairo's organic lane fabric (102); the
// masai ring already shows in shot 98.
for (const [placeId, shot] of [
  ['mongo-village', '101-street-village-plan.png'],
  ['cairo', '102-cairo-lane-plan.png'],
]) {
  await page.evaluate((id) => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
    g.enterPlace(id)
  }, placeId)
  await page
    .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, placeId, { timeout: 30000 })
    .catch(() => {})
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__ui.getState().toggleMap())
  await page.waitForTimeout(400)
  const fabric = await page.evaluate(() => ({
    plan: !!document.querySelector('.map-place-plan'),
    paths: window.__placeLayout.paths.length,
    dwellings: window.__placeLayout.dwellings.length,
  }))
  await page.screenshot({ path: `${OUT}${shot}` })
  console.log(`shot ${shot}`)
  check(`${placeId}: the town plan draws the plan fabric`, fabric.plan && fabric.dwellings >= 6, JSON.stringify(fabric))
  await page.evaluate(() => window.__ui.getState().toggleMap())
  await page.waitForTimeout(200)
}

// --- Sphinx at travel scale (design.md §4.4, point 91) -------------------------
// The Giza field's Sphinx is a modelled couchant lion now; screenshot it from
// the travel camera just south of the field (the skyline-scale view is shot
// 100 above).
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    window.__ui.getState().setTravelZoom(0.25) // closest zoom, sphinx readable
    window.__game.getState().debugJumpTo(29.955, 30.67) // just south-east of the field
  })
  await page.waitForTimeout(2500) // travel scene settles, landmark chunk streams in
  const giza = await page.evaluate(() => window.__culturalLandmarks)
  check('the Giza field (with the Sphinx) is mounted at travel scale', !!giza?.ids?.includes('giza'), JSON.stringify(giza))
  await page.screenshot({ path: `${OUT}103-giza-sphinx-travel.png` })
  console.log('shot 103-giza-sphinx-travel.png')
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
