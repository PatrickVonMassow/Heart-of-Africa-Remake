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
  // Point 107: the settlement scatter/fence InstancedMeshes must opt OUT of
  // frustum culling — their bounding sphere is computed at the origin, not over
  // the spread instances, so with culling ON the whole mesh (all rocks/fences)
  // vanished whenever the camera looked away from the settlement centre (user
  // report: "stones disappear at certain spots, reappear when you move").
  const culled = await page.evaluate(() => {
    const scene = window.__scenePass?.scene
    if (!scene) return { checked: 0, culled: 0 }
    let checked = 0
    let culled = 0
    scene.traverse((o) => {
      if (o.isInstancedMesh) {
        checked++
        if (o.frustumCulled) culled++
      }
    })
    return { checked, culled }
  })
  check(
    'settlement instanced meshes opt out of origin-sphere frustum culling (point 107)',
    culled.checked > 0 && culled.culled === 0,
    JSON.stringify(culled),
  )

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

  // Point 102 (a): in Cairo no VISIBLE panorama silhouette may fall inside the
  // Giza skyline's excluded azimuth span — otherwise an animal drifts across the
  // pyramids (the user's report). Asserted on the dev state, not on pixels.
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  const gizaExcl = await page.evaluate(() => {
    const spans = window.__placeSkylineExclusion ?? []
    const info = Object.values(window.__placePanoramaWildlifeInfo ?? {})
    const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d))
    const inSpan = (az) => spans.some((s) => Math.abs(wrap(az - s.center)) <= s.half)
    const violating = info.filter((v) => v.visible !== false && inSpan(v.azimuth)).length
    return { skyline: window.__placeSkyline, spanCount: spans.length, sils: info.length, violating }
  })
  check(
    'no Cairo panorama silhouette crosses the Giza skyline span (point 102)',
    gizaExcl.skyline === 'giza-pyramids' && gizaExcl.spanCount >= 1 && gizaExcl.sils >= 3 && gizaExcl.violating === 0,
    JSON.stringify(gizaExcl),
  )
  await page.screenshot({ path: `${OUT}105-cairo-panorama-giza-clear.png` })
  console.log('shot 105-cairo-panorama-giza-clear.png')
}

// --- Panorama wildlife (design.md §2) ---------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('maasai-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "maasai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
// The panorama animals stream in over the first seconds of the scene.
await page.waitForFunction(() => (window.__placePanoramaWildlife ?? 0) >= 3, null, { timeout: 20000 }).catch(() => {})
const wildlife = await page.evaluate(() => window.__placePanoramaWildlife ?? 0)
check('distant wildlife drifts through the panorama', wildlife >= 3, `${wildlife} animals`)
// No silhouette may stand sunken behind the ground disc's false horizon
// (user-reported black back-slivers): without a live capture the standing
// height is clamped to the disc plane. Points 92/94: every silhouette also
// stays SMALL (bounded subtended angle) and HAZED toward the sky (not a flat
// near-black blob).
await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 10000 }).catch(() => {})
const wInfo = await page.evaluate(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}))
check(
  'no panorama silhouette sinks below the settlement ground plane',
  wInfo.length >= 3 && wInfo.every((w) => w.y >= 0),
  `y [${wInfo.map((w) => w.y.toFixed(2)).join(', ')}]`,
)
check(
  'every panorama silhouette reads small (bounded subtended angle, point 94)',
  wInfo.length >= 3 && wInfo.every((w) => w.apparentDeg <= 2.6),
  `apparentDeg [${wInfo.map((w) => w.apparentDeg.toFixed(2)).join(', ')}]`,
)
check(
  'every panorama silhouette is hazed toward the sky, not flat black (point 94)',
  wInfo.length >= 3 && wInfo.every((w) => w.hazeLum > 0.42),
  `hazeLum [${wInfo.map((w) => w.hazeLum.toFixed(2)).join(', ')}]`,
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
await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "maasai-village", { timeout: 30000 })
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

// --- The season inside a settlement (design.md §19.13, point 120g) ------------
// The travel scene's Climate component does not run here, so the settlement
// derives the weather from its OWN coordinates. Overcast must dim the sun AND
// gray the dome: a dimmed sun under a bright blue sky reads as a bug. The
// §19.10 fire is a fixed point light, so its glow carries further for it.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })

  const read = () => page.evaluate(() => window.__placeSeason())
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(0))
  await page.waitForTimeout(2500) // the lights lerp toward the target
  const dry = await read()
  await page.screenshot({ path: `${OUT}110-village-season-dry.png` })
  console.log('shot 110-village-season-dry.png')

  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
  await page.waitForTimeout(2500)
  const wet = await read()
  await page.screenshot({ path: `${OUT}111-village-season-wet.png` })
  console.log('shot 111-village-season-wet.png')

  check(
    'the dry-season settlement stands under the clear preset sky',
    dry.sky.grayMix === 0 && dry.sky.cloudBoost === 0,
    JSON.stringify(dry.sky),
  )
  check(
    'the rains dim the settlement sun and sky light',
    wet.sun < dry.sun - 0.5 && wet.hemi < dry.hemi,
    JSON.stringify({ dry: { sun: dry.sun, hemi: dry.hemi }, wet: { sun: wet.sun, hemi: wet.hemi } }),
  )
  check(
    'the rains gray the settlement dome and thicken its cloud deck',
    wet.sky.grayMix > 0.5 && wet.sky.cloudBoost > 0.5,
    JSON.stringify(wet.sky),
  )
  check(
    'the fire glow carries further under the overcast sun (§19.10)',
    14 / wet.sun > 14 / dry.sun,
    `fire-to-sun ratio dry ${(14 / dry.sun).toFixed(2)} -> wet ${(14 / wet.sun).toFixed(2)}`,
  )
  // Leave no forced weather behind for the checks below.
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
}

// --- Travel panorama capture (design.md §2.5, point 81) -----------------------
// Entering from the travel scene captures the REAL surroundings as the
// first-person horizon: at the riverside Nubian village the Nile must show in
// the north/east sectors (direction-true), while a direct place->place enter
// (no travel scene) falls back to the geometry backdrop.
{
  const before = await page.evaluate(() => window.__placePanoramaActive ?? null)
  check('a direct enter without the travel scene falls back (no capture)', before === false, `active ${before}`)
  // Point 96 gate: this leave happens AFTER several settlement visits (the
  // suite has entered masai, swahili, capetown, timbuktu, mongo and cairo by
  // now) — exactly the recipe that used to freeze the main thread 13-16 s on
  // synchronous shader re-links. With the module-singleton meshes/materials/
  // CSM the travel programs survive the place visits, so the transition must
  // stay fluid.
  const leaveMs = await page.evaluate(async () => {
    const t0 = performance.now()
    window.__game.getState().leavePlace()
    await new Promise((resolve) => {
      const poll = () => {
        if (!window.__game.getState().placeId) requestAnimationFrame(() => resolve(null))
        else setTimeout(poll, 16)
      }
      poll()
    })
    return Math.round(performance.now() - t0)
  })
  check('leaving after several settlement visits stays fluid (point 96)', leaveMs < 3000, `${leaveMs} ms`)
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 15000 })
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
  // Point 92: with a capture active the visible horizon is the band cylinder,
  // whose horizon line sits at EYE_HEIGHT (1.5). The silhouettes must stand ON
  // that visible line — not hovering above it and not sunk below into black
  // clipped slivers. So every y sits close to the horizon (feet just below).
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  const capW = await page.evaluate(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}))
  check(
    'with a capture active, silhouettes stand on the visible horizon line (point 92)',
    capW.length >= 3 && capW.every((w) => Math.abs(w.y - w.visibleY) < 1.0 && w.y <= w.visibleY + 0.2),
    `y vs horizon [${capW.map((w) => `${w.y.toFixed(2)}/${w.visibleY.toFixed(2)}`).join(', ')}]`,
  )
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
// --- Cold-weather dress (design.md §19.13, point 120g) ---
// LAST in the file on purpose: it hops between settlements, and each leave
// remounts the travel scene, which makes the next enter capture a panorama —
// exactly the state the fallback check above asserts is absent.
// --- (checks) ------------------------
// The Zulu isipuku is the ONE period-sourced case (Mayr 1907): a cloak worn
// over the everyday dress in cold weather. So the Zulu village must dress for
// its austral winter and shed the cloak in its summer — while the peoples the
// research found no evidence for stay bare in any month, however cold their
// own ground gets. See src/systems/dress.ts for the per-people evidence.
{
  // NOTE: debugJumpToMonth is ONE-indexed (dayOfMonthJump clamps to 1..12 then
  // subtracts one; Hud.tsx calls it as i + 1). A zero-based probe lands a month
  // early and CLAMPS 0 to January — several checks here passed by luck that way,
  // because June is also austral winter and July is also the Sahel's rains.
  const dressAt = async (placeId, month) => {
    await page.evaluate(() => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
    })
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeDress, null, { timeout: 30000 })
    await page.waitForTimeout(300)
    return page.evaluate(() => window.__placeDress ?? null)
  }

  // Point 137: the six dressed peoples, each at its own village in its own
  // month, against the fifteen that never dress. The pure mapping is covered in
  // src/systems/dress.test.ts; this is the live half.
  const somaliKarif = await dressAt('somali-village', 8) // August — the karif on the Haud
  await page.screenshot({ path: `${OUT}113-somali-karif-tobe.png` })
  console.log('shot 113-somali-karif-tobe.png')
  const somaliJilal = await dressAt('somali-village', 2) // February — jilal, dry and HOT
  const hausaHarmattan = await dressAt('hausa-village', 1) // January — the harmattan
  const hausaWet = await dressAt('hausa-village', 8) // August — the rains

  const zuluWinter = await dressAt('zulu-village', 7) // July — austral winter
  await page.screenshot({ path: `${OUT}112-zulu-winter-cloaks.png` })
  console.log('shot 112-zulu-winter-cloaks.png')
  const zuluSummer = await dressAt('zulu-village', 1) // January — austral summer
  const maasaiWinter = await dressAt('maasai-village', 7) // the equator has no winter
  const sanWinter = await dressAt('san-village', 7) // Passarge's -5C Kalahari mornings

  check(
    'the Zulu wear the cold-weather cloak in their winter (Mayr, period source)',
    Array.isArray(zuluWinter?.cloaks) && zuluWinter.cloaks.length > 1,
    JSON.stringify(zuluWinter),
  )
  check(
    'and shed it in their summer — the cloak is the cold garment, not the dress',
    zuluSummer?.cloaks == null,
    JSON.stringify(zuluSummer),
  )
  check(
    'the equatorial Maasai never dress for a cold season they do not have',
    maasaiWinter?.cloaks == null,
    JSON.stringify(maasaiWinter),
  )
  check(
    'the San close the leather cloak in the Kalahari winter (Passarge)',
    Array.isArray(sanWinter?.cloaks),
    JSON.stringify(sanWinter),
  )
  check(
    'the Somali muffle the tobe over the HEAD in the karif (Swayne, period)',
    Array.isArray(somaliKarif?.cloaks) && somaliKarif.wear === 'head',
    JSON.stringify(somaliKarif),
  )
  check(
    'and wear it draped in jilal — the driest season is NOT the cold one',
    somaliJilal?.cloaks == null,
    JSON.stringify(somaliJilal),
  )
  check(
    'the Hausa zenne appears in the harmattan and is RANK-gated (Barth)',
    Array.isArray(hausaHarmattan?.cloaks) && hausaHarmattan.rankOnly === true,
    JSON.stringify(hausaHarmattan),
  )
  check(
    'and is gone in the rains — the Hausa answer the dust wind, not the calendar',
    hausaWet?.cloaks == null,
    JSON.stringify(hausaWet),
  )
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
