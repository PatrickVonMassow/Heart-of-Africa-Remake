// Headless verification for CLAUDE.md §7.1.31 (settlement orientation after
// a gift and distant panorama wildlife, design.md §17/§2). Dev server only.
import { launchVerifyBrowser, waitForStable, assertBackend } from './_browser.mjs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

/**
 * Point 181: do the §2.5 panorama silhouettes stand on ground the frame really
 * DRAWS under them, or hang in the sky?
 *
 * The old gate compared each silhouette's y with the EYE_HEIGHT constant it had
 * just been placed at, so it passed for years while the picture showed animals
 * dangling over the captured band (the user's Cairo pyramid screenshot). This
 * one asks the rendered scene instead: stand the player on the silhouette's own
 * bearing, then ray-probe its feet — the first surface behind them must be no
 * further than the feet themselves. A floating silhouette finds nothing until
 * the panorama band or the sky dome, far beyond, and fails loudly.
 */
const probeSilhouetteFooting = async (page, check, label) => {
  const count = await page.evaluate(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length)
  const rows = []
  for (let i = 0; i < count; i++) {
    const stood = await page.evaluate((idx) => {
      const it = (window.__placePanoramaWildlifeInfo ?? {})[idx]
      if (!it || !it.visible) return false
      const p = window.__placePlayer
      const r = (window.__placeLayout?.radius ?? 40) * 0.9
      const d = Math.hypot(it.x, it.z) || 1
      p.x = (it.x / d) * r
      p.z = (it.z / d) * r
      p.pitch = 0
      p.yaw = Math.atan2(-(it.x - p.x), -(it.z - p.z))
      return true
    }, i)
    if (!stood) continue
    // Let the camera follow the teleport before probing from it.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const row = await page.evaluate((idx) => {
      const it = (window.__placePanoramaWildlifeInfo ?? {})[idx]
      if (!it || !it.visible || !window.__placeRayHit) return null
      const hit = window.__placeRayHit(it.x, it.y, it.z)
      return {
        ratio: hit.hitDistance == null ? Infinity : hit.hitDistance / hit.targetDistance,
        name: hit.hitName ?? 'sky',
      }
    }, i)
    if (row) rows.push(row)
  }
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = 0
    p.z = 0
  })
  check(
    `${label}: every panorama silhouette's feet meet drawn ground (point 181)`,
    rows.length >= 2 && rows.every((r) => r.ratio <= 1.05),
    `surface behind the feet [${rows.map((r) => `${r.ratio.toFixed(2)}×@${r.name}`).join(', ')}]`,
  )
}

const browser = await launchVerifyBrowser()
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
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page) // point 204: fail loud if the requested backend silently fell back
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
  const skyBuf = await page.screenshot()
  await sharp(skyBuf).toFile(`${OUT}100-cairo-giza-skyline.png`)
  console.log('shot 100-cairo-giza-skyline.png')

  // Point 273: Menkaure's red-granite base casing read as a floating RED ERROR
  // BAND at this distant skyline scale, so it was removed (kept only at the
  // walkable site). Prove no strongly red-dominant pixels remain over the
  // pyramid silhouette — a red-granite stripe would light many up. The sky is
  // warm haze (r≈g≈b-ish) and the pyramids are tawny (r>g>b but not RED), so a
  // true red band (r well above BOTH g and b) is the error signature.
  {
    const { data, info } = await sharp(skyBuf).raw().toBuffer({ resolveWithObject: true })
    let redBand = 0
    let total = 0
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * info.channels]
      const g = data[i * info.channels + 1]
      const b = data[i * info.channels + 2]
      total++
      // A saturated brick-red: red clearly dominates green AND blue.
      if (r > 90 && r > g * 1.6 && r > b * 1.9) redBand++
    }
    const frac = redBand / total
    check(
      'no red granite error band on the Cairo skyline pyramids (point 273)',
      frac < 0.002,
      `red-dominant pixel fraction ${frac.toFixed(5)}`,
    )
  }

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
// Points 92/94: every silhouette stays SMALL (bounded subtended angle) and
// HAZED toward the sky (not a flat near-black blob), and its feet meet ground
// the frame draws (point 181) rather than the horizon-at-infinity constant.
await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 10000 }).catch(() => {})
const wInfo = await page.evaluate(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}))
check(
  'every panorama silhouette sits on the ground line it was placed on',
  wInfo.length >= 3 && wInfo.every((w) => w.y >= w.visibleY && w.y <= w.visibleY + 0.2),
  `y vs line [${wInfo.map((w) => `${w.y.toFixed(2)}/${w.visibleY.toFixed(2)}`).join(', ')}]`,
)
await probeSilhouetteFooting(page, check, 'maasai-village (no capture)')
// Point 255 (3): the silhouettes must WALK the horizon, not glide along it.
// Their stride phase rides the ground they cover on the ring, so over the same
// interval each one's phase advance divided by its (scale-normalised, point 286)
// gait speed is the SAME constant — a wall-clock bob would advance them all
// alike whatever their speed.
{
  const sample = () =>
    page.evaluate(() =>
      Object.values(window.__placePanoramaWildlifeInfo ?? {}).map((w) => ({ gait: w.gait, speed: w.gaitSpeed })),
    )
  const before = await sample()
  await page.waitForTimeout(1200)
  const after = await sample()
  const rates = before
    .map((b, i) => ({ d: after[i].gait - b.gait, speed: b.speed }))
    .filter((r) => r.speed > 0)
    .map((r) => r.d / r.speed)
  const spread = rates.length ? (Math.max(...rates) - Math.min(...rates)) / Math.max(...rates) : 1
  check(
    'the panorama silhouettes stride with the ground they cover, not the clock (point 255)',
    rates.length >= 3 && rates.every((r) => r > 0) && spread < 0.02,
    `phase per unit walked [${rates.map((r) => r.toFixed(2)).join(', ')}], spread ${(spread * 100).toFixed(1)}%`,
  )
}
// Point 286: the silhouettes must WALK FORWARD, never backward. The facing is
// derived from the ring velocity, so each visible silhouette's displacement over
// an interval must project POSITIVELY onto its facing (forward = (sin yaw,
// cos yaw)), and a moving one must actually advance. The reverted bug set the
// yaw exactly π off the tangent, so every silhouette moonwalked.
{
  const snap = () =>
    page.evaluate(() => {
      const info = window.__placePanoramaWildlifeInfo ?? {}
      const out = {}
      for (const k of Object.keys(info)) out[k] = { x: info[k].x, z: info[k].z, yaw: info[k].yaw, visible: info[k].visible }
      return out
    })
  const b0 = await snap()
  await page.waitForTimeout(1200)
  const b1 = await snap()
  const along = []
  for (const k of Object.keys(b0)) {
    const p = b0[k]
    const q = b1[k]
    if (!q || p.visible === false || q.visible === false) continue
    const dx = q.x - p.x
    const dz = q.z - p.z
    along.push({ a: dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw), d: Math.hypot(dx, dz) })
  }
  check(
    'every panorama silhouette walks forward along its facing, never backward (point 286)',
    along.length >= 3 && along.every((r) => r.a >= -1e-3) && along.some((r) => r.d > 1e-3 && r.a > 0),
    `along-facing displacement [${along.map((r) => r.a.toFixed(3)).join(', ')}]`,
  )
}
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
  // Poll until the dome-gray lerp settles (point 200), not a fixed wall wait.
  await waitForStable(page, () => window.__placeSeason().sun, { settleMs: 200, timeout: 6000 })
  const dry = await read()
  await page.screenshot({ path: `${OUT}110-village-season-dry.png` })
  console.log('shot 110-village-season-dry.png')

  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
  await waitForStable(page, () => window.__placeSeason().sun, { settleMs: 200, timeout: 6000 })
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
  // Point 143: the settlement's own rain and flora, which were MISSING — the
  // rain field lived only in the travel scene and the tint only in the travel
  // terrain, so a player stood in a village at the peak of its rains and saw
  // neither. Both must now move with the season.
  check(
    'it rains inside the settlement in the wet season, and clears in the dry',
    wet.rain > 0.5 && dry.rain === 0,
    `rain wet ${wet.rain.toFixed(2)} -> dry ${dry.rain.toFixed(2)}`,
  )
  check(
    'the settlement ground/flora tint bleaches to straw and deepens to green',
    wet.tint > 0.75 && dry.tint < 0.25,
    `tint wet ${wet.tint.toFixed(2)} -> dry ${dry.tint.toFixed(2)}`,
  )
  await page.screenshot({ path: `${OUT}114-village-rain.png` })
  console.log('shot 114-village-rain.png')
  // Leave no forced weather behind for the checks below.
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))

  // A desert PORT never rains, on the real calendar, in any month — Cairo is
  // hyper-arid and wetnessAt returns 0 there. (The debug override deliberately
  // forces a season everywhere to test the renderer, so this uses real months.)
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  let cairoMaxRain = 0
  for (let m = 1; m <= 12; m++) {
    await page.evaluate(() => { const g = window.__game.getState(); if (g.placeId) g.leavePlace() })
    await page.evaluate((mm) => window.__game.getState().debugJumpToMonth(mm), m)
    await page.evaluate(() => window.__game.getState().enterPlace('cairo'))
    await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })
    await page.waitForTimeout(200)
    cairoMaxRain = Math.max(cairoMaxRain, await page.evaluate(() => window.__placeSeason().rain))
  }
  check('Cairo stays bone dry in every month (hyper-arid, no rain)', cairoMaxRain === 0, `max rain ${cairoMaxRain.toFixed(3)}`)
  // Restore what the panorama check below expects: standing in a DIRECTLY
  // entered place (place->place, no travel scene, so no capture). Enter without
  // leaving first, and reset the calendar.
  await page.evaluate(() => {
    const g = window.__game.getState()
    g.debugJumpToMonth(1)
    g.enterPlace('maasai-village') // from cairo, a direct place->place enter
  })
  await page.waitForFunction(() => !!window.__placeLayout, null, { timeout: 30000 })
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
  // Point 227: the LEAVE capture (the traveller stands inside his own place's
  // approach ring on the first travel frames) must contain the surrounding
  // TERRAIN. It used to fire before the streamed chunk meshes mounted and
  // baked a terrainless band — only water sheets and landmarks — which a
  // re-entry then drew as a hard grey horizon line over the backdrop. The
  // capture is now gated on the committed chunk set, so the band's bottom
  // quarter (near ground at an inland village) must be opaque ground.
  {
    await page.waitForFunction(() => window.__placePanorama?.placeId === 'maasai-village', null, { timeout: 45000 }).catch(() => {})
    const leaveBand = await page.evaluate(async () => {
      if (window.__placePanorama?.placeId !== 'maasai-village' || !window.__panoCaptureForDump) return null
      const url = await window.__panoCaptureForDump()
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const cnv = document.createElement('canvas')
      cnv.width = img.width
      cnv.height = img.height
      const ctx = cnv.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, Math.floor(img.height * 0.75), img.width, Math.floor(img.height * 0.25)).data
      let opaque = 0
      const total = data.length / 4
      for (let i = 0; i < total; i++) if (data[i * 4 + 3] > 200) opaque++
      return { frac: opaque / total }
    })
    check(
      'the leave capture bakes the surrounding terrain into the band (point 227)',
      !!leaveBand && leaveBand.frac > 0.7,
      leaveBand ? `bottom-quarter opaque ${leaveBand.frac.toFixed(3)}` : 'no maasai capture',
    )
  }
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
  // Points 92/181: with a capture active the silhouettes must still stand on
  // DRAWN ground. Anchoring them to the band's horizon-at-infinity (a hard
  // EYE_HEIGHT constant) put nothing under their feet — the town's ground disc
  // and the backdrop relief end below that line and the band showed through the
  // gap, so the animals hung in the sky. The ray probe measures the rendered
  // scene, which the old |y − EYE_HEIGHT| comparison never could.
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  await probeSilhouetteFooting(page, check, 'nubian-village (capture active)')
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

// --- Silhouette footing in Cairo, capture active (point 181) -------------------
// The REPORTED case: Cairo carries the Giza skyline and its captured band shows
// the pyramids and the Nile below the horizon line, so a silhouette anchored to
// that line hung in the sky over a pyramid flank. Re-enter Cairo out of the
// travel scene — the only way to get a live capture — and probe the footing.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  await page.evaluate(() => window.__game.getState().debugJumpTo(30.05, 31.55)) // Cairo's approach ring
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'cairo', null, { timeout: 60000 }).catch(() => {})
  await page.evaluate(() => window.__game.getState().enterPlace('cairo'))
  await page.waitForFunction(() => window.__game.getState().placeId === 'cairo' && !!window.__placePlayer, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(2500)
  const capActive = await page.evaluate(() => window.__placePanoramaActive ?? false)
  check('re-entering Cairo from the travel scene shows the captured band', capActive === true, `active ${capActive}`)
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  await probeSilhouetteFooting(page, check, 'cairo (capture active, Giza skyline)')
  // Human-viewable evidence: aim at a silhouette and shoot it against the band.
  await page.evaluate(() => {
    const it = Object.values(window.__placePanoramaWildlifeInfo ?? {}).filter((w) => w.visible)[0]
    if (!it) return
    const p = window.__placePlayer
    const r = (window.__placeLayout?.radius ?? 40) * 0.9
    const d = Math.hypot(it.x, it.z) || 1
    p.x = (it.x / d) * r
    p.z = (it.z / d) * r
    p.pitch = 0
    p.yaw = Math.atan2(-(it.x - p.x), -(it.z - p.z))
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}136-cairo-silhouette-footing.png` })
  console.log('shot 136-cairo-silhouette-footing.png')
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = 0
    p.z = 0
  })
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

// --- Walkable Giza monument site (design.md §4.4, point 273) -------------------
// Jump onto the Giza marker so the "Space to enter" hint arms, confirm entry
// with the Space use key, then check that the three great pyramids and the
// sand-buried Sphinx render as collidable masses on the walkable plateau —
// with a screenshot standing back from the cluster.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  // Giza's river-cleared position (src/world/geo.ts). Jumping onto the marker
  // arms the enter hint; a Space press then confirms entry (design.md §2.3).
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.7726, 30.7554))
  await page.waitForFunction(() => window.__ui.getState().enterPlaceId === 'giza', null, { timeout: 15000 })
  const gizaPrompt = await page.evaluate(() => window.__ui.getState().prompt ?? '')
  check('the enter hint arms and names Giza (discovered, localized)', /Giza|Gizeh/.test(gizaPrompt), gizaPrompt)
  // Wait for the approach capture (points 227/335): the band may only be shot
  // once the terrain ring around the capture point is committed, so entering
  // before it lands would leave the monument on the geometry backdrop and make
  // the horizon check below vacuous.
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'giza', null, { timeout: 60000 }).catch(() => {})
  // Re-set the live position right before the press (Space re-derives from it).
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.7726, 30.7554))
  await page.keyboard.press('Space')
  await page.waitForFunction(
    () => window.__game.getState().placeId === 'giza' && !!window.__placeLayout && !!window.__placeMonuments,
    null,
    { timeout: 30000 },
  )
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await waitForStable(page)
  const site = await page.evaluate(() => ({
    mode: window.__game.getState().mode,
    monuments: window.__placeMonuments,
    colliders: window.__placeLayout?.colliders?.length ?? 0,
    interactives: window.__placeLayout?.interactives?.length ?? 0,
  }))
  check('Space enters the walkable Giza site', site.mode === 'place', JSON.stringify({ mode: site.mode }))
  check(
    'the three great pyramids and the buried Sphinx render',
    site.monuments?.pyramids === 3 && site.monuments?.sphinxBuried === true,
    JSON.stringify(site.monuments),
  )
  check(
    'the monuments are collidable and the site has no trade/elder',
    site.colliders >= 4 && site.interactives === 0,
    JSON.stringify({ colliders: site.colliders, interactives: site.interactives }),
  )
  // Stand back near the southern spawn, look north over the cluster, and shoot.
  await page.evaluate(() => {
    const p = window.__placePlayer
    const r = window.__placeLayout?.radius ?? 60
    p.x = 0
    p.z = r - 12
    p.yaw = 0 // yaw 0 faces −Z (north), toward the pyramids
  })
  await page.waitForTimeout(1000)
  const siteBuf = await page.screenshot()
  await sharp(siteBuf).toFile(`${OUT}139-giza-walkable-site.png`)
  console.log('shot 139-giza-walkable-site.png')

  // Point 273: the plateau must read as warm DESERT SAND, not a pale, cool,
  // wavy parchment. Sample the near foreground (the bottom-centre strip, always
  // ground) and assert the mean is a warm sand tone: clearly warm (r > g > b, a
  // real r−b spread) and not the washed-out pale grey the old port-earth ground
  // showed on the open disc.
  {
    const meta = await sharp(siteBuf).metadata()
    const W = meta.width
    const H = meta.height
    const cw = Math.round(W * 0.4)
    const { data, info } = await sharp(siteBuf)
      .extract({
        left: Math.round(W / 2 - cw / 2),
        top: Math.round(H * 0.84),
        width: cw,
        height: Math.round(H * 0.12),
      })
      .raw()
      .toBuffer({ resolveWithObject: true })
    let rs = 0
    let gs = 0
    let bs = 0
    const n = info.width * info.height
    for (let i = 0; i < n; i++) {
      rs += data[i * info.channels]
      gs += data[i * info.channels + 1]
      bs += data[i * info.channels + 2]
    }
    const r = rs / n
    const g = gs / n
    const b = bs / n
    check(
      'the walkable Giza ground reads as warm desert sand (point 273)',
      r > g && g > b && r - b > 22 && r > 120,
      `mean ground rgb ${r.toFixed(0)}/${g.toFixed(0)}/${b.toFixed(0)}`,
    )
  }

  // Point 335: no FOREIGN flat band across the horizon. The reported picture
  // showed a long grey/silver strip along the horizon line, with the desert's
  // own dunes and ridge visible above AND below it. The monument is a late
  // third place kind, so first pin that it takes the band path at all.
  {
    const bandActive = await page.evaluate(() => window.__placePanoramaActive ?? false)
    check(
      'the monument site shows its captured travel band like any settlement (point 335)',
      bandActive === true,
      `band active ${bandActive}`,
    )

    // The gate, measured per PIXEL ROW on the artefact that carries the defect.
    //
    // What made the strip foreign was a HOLE: the capture reached 900 wu while
    // the travel scene streams terrain to ~144, and the sea plane / river
    // ribbons / lake sheets have no such bound — so a column of the band ran
    // terrain, then NOTHING (the far field past the window), then a lone water
    // sheet floating at the top. Drawn over the geometry backdrop that hole let
    // the backdrop's relief through above and below the sheet, which is exactly
    // the reported picture. A column of real surroundings can never do that:
    // ground is contiguous from the horizon down, so every opaque run is ONE
    // run. Counting columns whose opaque rows are split by a transparent gap
    // therefore isolates the defect with no assumed tone, row or distance.
    //
    // (The frame-level reading — a flat non-ground strip sandwiched between
    // ground — cannot be the gate: east of Giza the world really does put the
    // Red Sea and the trimmed Arabian shelf on the horizon, and that reads the
    // same way while being the surroundings the band is meant to show.)
    const bandGaps = await page.evaluate(async () => {
      if (!window.__panoCaptureForDump) return null
      const url = await window.__panoCaptureForDump()
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      const OPAQUE = 40
      let split = 0
      let worst = 0
      for (let x = 0; x < c.width; x++) {
        let first = -1
        let last = -1
        for (let y = 0; y < c.height; y++) {
          if (d[(y * c.width + x) * 4 + 3] > OPAQUE) {
            if (first < 0) first = y
            last = y
          }
        }
        if (first < 0) continue
        let clear = 0
        for (let y = first; y <= last; y++) if (d[(y * c.width + x) * 4 + 3] <= OPAQUE) clear++
        if (clear > 0) {
          split++
          if (clear > worst) worst = clear
        }
      }
      return { width: c.width, splitColumns: split, worstGapRows: worst }
    })
    // Measured on this very state: with the capture reaching 900 wu the band
    // split 231/3072 of Giza's columns (and 168/3072 of Cairo's — the defect was
    // never Giza-only, just most visible on an open plateau), gaps up to 11 rows;
    // bounded to the committed ring it splits none, and a settlement's worst is
    // 3 columns of one-row silhouette antialiasing.
    check(
      'the Giza band holds no floating strip over a hole in the surroundings (point 335)',
      bandGaps !== null && bandGaps.splitColumns / bandGaps.width < 0.02,
      bandGaps === null ? 'no capture to read' : `${bandGaps.splitColumns}/${bandGaps.width} columns split, worst gap ${bandGaps.worstGapRows} rows`,
    )

    // Human-viewable evidence from two standpoints on the site.
    const radius = await page.evaluate(() => window.__placeLayout?.radius ?? 60)
    const posts = [
      ['south rim', 0, radius * 0.75, Math.PI / 2],
      ['east rim', radius * 0.7, 0, Math.PI],
    ]
    let shot = 0
    for (const [, px, pz, yaw] of posts) {
      await page.evaluate(
        ([x, z, y]) => {
          const p = window.__placePlayer
          p.x = x
          p.z = z
          p.yaw = y
          p.pitch = 0
        },
        [px, pz, yaw],
      )
      await page.waitForTimeout(600)
      shot++
      await page.screenshot({ path: `${OUT}141-giza-horizon-${shot}.png` })
      console.log(`shot 141-giza-horizon-${shot}.png`)
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
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

  // Point 142 — "the young men are gone": a transhumant village visibly thins
  // in its away season while the children and the elder remain. The Maasai
  // direction is PERIOD (Thomson: up to the highlands in the DRY season).
  const walkersAt = async (placeId, month) => {
    await page.evaluate(() => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
    })
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeWalkers, null, { timeout: 30000 })
    return page.evaluate(() => window.__placeWalkers.states.length)
  }
  const maasaiDry = await walkersAt('maasai-village', 7) // July: at the highland camps
  const maasaiWet = await walkersAt('maasai-village', 4) // April: the rains, everyone home
  check(
    'the Maasai village thins in the dry season — the young men are gone (point 142)',
    maasaiDry < maasaiWet && maasaiDry >= 1,
    `walkers July ${maasaiDry} vs April ${maasaiWet}`,
  )
  // The warming fire (point 142, the §4.9 fire image): the village fire burns
  // harder where the place's own season is cold or dust-chilled.
  const blazeAt = async (placeId, month) => {
    await page.evaluate(() => { const g = window.__game.getState(); if (g.placeId) g.leavePlace() })
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })
    return page.evaluate(() => window.__placeSeason().fireBlaze)
  }
  const tuaregJan = await blazeAt('tuareg-village', 1) // Ahaggar at 2110 m, Saharan winter
  const mongoJan = await blazeAt('mongo-village', 1) // the basin has no season
  check(
    'the village fire burns harder in a cold season, and not in the seasonless basin (point 142)',
    tuaregJan > 1.35 && mongoJan < 1.15,
    `blaze tuareg Jan ${tuaregJan.toFixed(2)} vs mongo Jan ${mongoJan.toFixed(2)}`,
  )

  const bembaJul = await walkersAt('bemba-village', 7)
  const bembaJan = await walkersAt('bemba-village', 1)
  check(
    'the sedentary Bemba never thin — no month empties them (the negative case)',
    bembaJul === bembaJan,
    `walkers July ${bembaJul} vs January ${bembaJan}`,
  )

  // The cook-fire's rain shelter (design.md §19.10, point 256). Under a downpour
  // the compound peoples' fire keeps a cook-shelter canopy and burns on, while a
  // dome-dweller's open fire is beaten down by the rain — the picture must show
  // the difference, not blaze on unaffected.
  const fireInRain = async (placeId) => {
    await page.evaluate(() => { const g = window.__game.getState(); if (g.placeId) g.leavePlace() })
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })
    // Force a heavy downpour so the rain-response is at full strength, like the
    // settlement-season checks above.
    await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
    // Poll the quantity the check actually reads. Waiting only for the SUN to
    // settle raced the override: in a fast-loading village the sun had not yet
    // started moving, so two successive reads matched, waitForStable returned
    // at once and the rain was still sampled at 0. Fail soft on the poll — the
    // assertion below judges the value, so a harness timeout can never mask a
    // real product failure.
    await page
      .waitForFunction(() => window.__placeSeason().rain > 0.5, null, { timeout: 15000 })
      .catch(() => {})
    await waitForStable(page, () => window.__placeSeason().sun, { settleMs: 200, timeout: 6000 })
    const s = await page.evaluate(() => window.__placeSeason())
    return { sheltered: s.fireSheltered, rain: s.rain, rainFactor: s.fireRainFactor }
  }
  const bembaFire = await fireInRain('bemba-village') // a cook-shelter people
  await page.screenshot({ path: `${OUT}135-fire-cook-shelter-rain.png` })
  console.log('shot 135-fire-cook-shelter-rain.png')
  const maasaiFire = await fireInRain('maasai-village') // a dome-dweller, no canopy
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
  check(
    'the compound village keeps its fire under a cook-shelter in the rain (point 256)',
    bembaFire.sheltered === true && bembaFire.rain > 0.5,
    `bemba sheltered=${bembaFire.sheltered} rain=${bembaFire.rain.toFixed(2)}`,
  )
  check(
    'the dome-dweller village has no canopy — its open fire is damped by the rain (point 256)',
    maasaiFire.sheltered === false && maasaiFire.rainFactor < bembaFire.rainFactor,
    `maasai sheltered=${maasaiFire.sheltered} factor=${maasaiFire.rainFactor.toFixed(2)} vs bemba ${bembaFire.rainFactor.toFixed(2)}`,
  )
}

// --- Campfire shadows (design.md §19.10): with the debug toggle ON, an occluder
// between the fire and the ground measurably darkens the ground behind it -------
{
  // A dry, weather-free village at a fixed standpoint facing the fire pit.
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.evaluate(() => {
    window.__ui.getState().setSeasonWetnessOverride(0)
    window.__game.getState().enterPlace('maasai-village')
  })
  await page.waitForFunction(() => !!window.__placePlayer && !!window.__placeCamera, null, { timeout: 30000 })
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    p.x = -3.5
    p.z = 8.0
    p.yaw = 0 // facing the fire pit at (-3.5, 2.5)
  })
  await page.waitForTimeout(1500)

  // The fire ring's stones ARE the visible occluders (light at the pit centre,
  // 1.1 m up): each stone's fire-shadow lands radially outward at ~1.2 m from
  // the pit centre, and its LIT twin sits at the SAME radius on the mid-angle
  // between two stones — same sun, same AO, same fire falloff, so the only
  // difference is the blocked light. All points lie inside the pit collider
  // (r 1.3), where no walker can stand on them; judging the WITHIN-frame
  // contrast (lit twin minus shadow point) makes the gate immune to global
  // frame drift (flame flicker, TRAA settling). Three stone pairs, 2-of-3
  // majority, so one walker crossing a sight line cannot flip the verdict.
  const firePairs = await page.evaluate(() => {
    const FIRE = [-3.5, 2.5]
    const R = 1.2
    const cam = window.__placeCamera
    const proj = (p) => {
      const v = cam.matrixWorldInverse.elements
      const x = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12]
      const y = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13]
      const z = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14]
      const e = cam.projectionMatrix.elements
      const w = e[3] * x + e[7] * y + e[11] * z + e[15]
      return [
        ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w) * 0.5 + 0.5,
        1 - (((e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * 0.5 + 0.5),
      ]
    }
    // Stones 1..3 of the 7-stone ring: their outward shadows face the camera.
    return [1, 2, 3].map((i) => {
      const a = (i / 7) * Math.PI * 2
      const m = ((i + 0.5) / 7) * Math.PI * 2
      return {
        stone: i,
        shadow: proj([FIRE[0] + Math.cos(a) * R, 0, FIRE[1] + Math.sin(a) * R]),
        lit: proj([FIRE[0] + Math.cos(m) * R, 0, FIRE[1] + Math.sin(m) * R]),
      }
    })
  })
  const lumAt = (raw, info, [nx, ny]) => {
    const px = Math.round(nx * info.width)
    const py = Math.round(ny * info.height)
    let sum = 0
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((py + dy) * info.width + (px + dx)) * info.channels
        sum += (raw[i] + raw[i + 1] + raw[i + 2]) / 3
      }
    return sum / 9
  }
  const fireContrasts = async () => {
    const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true })
    return firePairs.map((p) => +(lumAt(data, info, p.lit) - lumAt(data, info, p.shadow)).toFixed(1))
  }

  // Campfire shadows are now level-driven (point 276): ON at the medium default,
  // so the OFF state must be FORCED via the debug flag, not assumed from the
  // default (which used to be off under point 289 alone).
  await page.evaluate(() => window.__ui.getState().setFireShadowsEnabled(false))
  await page.waitForTimeout(1500) // cube map tear-down + TRAA settle
  const contrastOff = await fireContrasts()
  await page.evaluate(() => window.__ui.getState().setFireShadowsEnabled(true))
  await page.waitForTimeout(1500) // cube map + TRAA settle
  const contrastOn = await fireContrasts()
  await page.screenshot({ path: `${OUT}138-fire-shadows-on.png` })
  console.log('shot 138-fire-shadows-on.png')
  await page.evaluate(() => {
    window.__ui.getState().setFireShadowsEnabled(false)
    window.__ui.getState().setSeasonWetnessOverride(null)
  })

  // Measured on both backends: OFF contrast 3-12, ON contrast 42-57.
  const majority = (xs, ok) => xs.filter(ok).length >= 2
  check(
    'fire shadows OFF (forced): the ground behind a ring stone is as lit as beside it',
    majority(contrastOff, (c) => c < 20),
    `lit-minus-shadow per stone [${contrastOff.join(', ')}]`,
  )
  check(
    'fire shadows ON: the ground behind a ring stone is measurably darker than beside it (design.md §19.10)',
    majority(contrastOn, (c) => c >= 25),
    `lit-minus-shadow per stone [${contrastOn.join(', ')}]`,
  )
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
