// Headless polish verification, theme polish-settlement: the settlement as a place:
// town plan, orientation markers, season, fabric, cold-weather dress, campfire
// shadows, the painted edge, the small stone step and the head clearance under the
// eaves (design.md §2.6/§6.1/§17/§19).
// Dev server only. Split out of polish.mjs by theme; the boot and the shared
// helpers live in ./_polish.mjs, and every section below owns its staging.
import { waitForStable, waitForReadingStable, waitForSceneBuilt } from './_browser.mjs'
import { capturePixels } from './frameSubject.mjs'
import { judgeEavesColumn, judgeShelterRoof } from './eavesColumn.mjs'
import { READ_GAP_FRAMES, READ_GAP_NET_MS, READ_GAP_MS } from './cropLuma.mjs'
import { groundSamples as readGroundSamples, bandRatio as readBandRatio } from './edgeBandReading.mjs'
import { settledEdgeShot } from './edgeBandSettle.mjs'
import sharp from 'sharp'
import { section, check, page, frame, nextFrames, goToPlace, finishPolishSuite } from './_polish.mjs'

// --- Settlement plan on the map (design.md §6.1, point 79) --------------------
// Inside a place the map opens as a plan of the town: functional buildings
// marked and named, no continental canvas.
if (section('town-plan')) {
  await goToPlace('maasai-village')
  await page.evaluate(() => window.__ui.getState().toggleMap())
  await page.waitForTimeout(400)
  const plan = await page.evaluate(() => {
    const el = document.querySelector('.map-place-plan')
    const labels = [...document.querySelectorAll('.plan-building-label')].map((n) => n.textContent)
    return { present: !!el, labels, canvas: !!document.querySelector('.map-overlay canvas') }
  })
  await frame('98-place-plan', { element: '.map-place-plan', label: 'the town plan' })
  check('inside a settlement the map shows the town plan', plan.present && !plan.canvas, JSON.stringify({ canvas: plan.canvas }))
  check('the plan names the functional buildings', plan.labels.length >= 2, `labels [${plan.labels.join(', ')}]`)
  await page.evaluate(() => window.__ui.getState().toggleMap())
  await page.waitForTimeout(200)
}

// --- Orientation after meeting the chief (design.md §17) -----------------------------
if (section('orientation-markers')) {
  await goToPlace('maasai-village')
  const before = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
  check('no building markers before meeting the chief', before === 0, `${before}`)
  const toast = await page.evaluate(() => {
    // Standing before the head man is what orients the traveller now; the gift
    // that used to buy it retired with the goodwill state (point 1052).
    window.__game.getState().callChiefOut()
    return window.__game.getState().toast
  })
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
  check('meeting the chief unlocks the building markers', after >= 1, `${after} markers`)
  check('the orientation announces itself', !!toast && toast.length > 0, `"${toast}"`)
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  // AIM the camera at a marked building before photographing its marker. The
  // frame used to be shot from wherever the previous check had left the camera,
  // so whether a marker was in the picture at all was chance — the shutter
  // (point 375) refused the frame and that is how the missing aim was found.
  // The chief's hut is the marker the shutter judges (it is the first
  // `.building-highlight` in DOM order, the layout's first interactive), so
  // stand back from it on its own bearing and face it.
  const marked = await page.evaluate(() => {
    const it = (window.__placeLayout?.interactives ?? [])[0] ?? null
    if (!it) return null
    const p = window.__placePlayer
    const [mx, mz] = it.pos
    const d = Math.hypot(mx, mz) || 1
    // Stand 14 m from the hut on the line toward the settlement centre — the open
    // ground every layout keeps clear — and far enough back that the marker at
    // ~5.6 m sits well inside the vertical field of view (the pitch is left as it
    // stands, so the distance, not a tilt, frames the marker).
    p.x = mx - (mx / d) * 14
    p.z = mz - (mz / d) * 14
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(mx - p.x, mz - p.z) + Math.PI
    return { type: it.type, x: mx, z: mz }
  })
  check('the settlement offers a marked building to photograph', !!marked, JSON.stringify(marked))
  await page.waitForTimeout(400)
  await frame('93-orientation-highlight', { element: '.building-highlight', label: `the marker over the ${marked?.type ?? 'important'} building` })

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

  // A settlement whose chief was not met stays unmarked. (The check name below
  // keeps its old wording: it is the ledger identity.)
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
}

// --- The season inside a settlement (design.md §19.13, point 120g) ------------
// The travel scene's Climate component does not run here, so the settlement
// derives the weather from its OWN coordinates. Overcast must dim the sun AND
// gray the dome: a dimmed sun under a bright blue sky reads as a bug. The
// §19.10 fire is a fixed point light, so its glow carries further for it.
if (section('settlement-season')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })

  // Poll until the WHOLE season reading settles — sun, sky, tint and rain, the
  // values the checks below assert — and say whether it truly did (point 499).
  // Watching only `sun` over a 6 s window measured a half-lerped state on the
  // slower container host and blamed the product for it: dry grayMix 0.146 where
  // the preset is 0, wet sun 2.348 where the rains take it to 1.44. Given the
  // time, every one of these reaches its target exactly, so the lerp was never
  // the bug — the window was.
  const settle = async (label) => {
    const r = await waitForReadingStable(page, () => window.__placeSeason(), { settleMs: 500, samples: 3, requireChange: true, timeout: 60000 })
    check(`the ${label} settlement season reading settles before it is read`, r.settled, `after ${r.waitedMs} ms`)
    return r.value
  }
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(0))
  const dry = await settle('dry')
  await frame('110-village-season-dry', { place: 'maasai-village', label: 'the settlement in the dry season' })

  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
  const wet = await settle('wet')
  await frame('111-village-season-wet', { place: 'maasai-village', label: 'the settlement in the wet season' })

  check(
    'the dry-season settlement stands under the clear preset sky',
    dry.sky.grayMix === 0 && dry.sky.cloudBoost === 0,
    JSON.stringify(dry.sky),
  )
  // Point 387 — one of the four checks that were red on `main` itself
  // (27./28.07.2026): dry {sun 2.4, hemi 0.8} against wet {sun 1.993, hemi
  // 0.664}, a 17 % dimming under a bar of 0.5. VERDICT: the CHECK's STAGING was
  // wrong — neither the product nor the bar. It read the settlement light
  // HALF-LERPED, and point 499's `settle()` above (the WHOLE reading, not `sun`
  // alone) now waits for the state the rains actually reach. The bar is
  // UNCHANGED at 0.5 and stays what §19.9's overcast promises: a dimming a
  // player can see, not a nudge.
  // MEASURED 07.08.2026, quiet machine, both backends (spread across runs
  // < 0.01 on sun): WebGL 2 sun 2.386 -> 1.440 / hemi 0.795 -> 0.480, WebGPU sun
  // 2.377 -> 1.440 / hemi 0.792 -> 0.480. The drop is ~0.94 against the bar of
  // 0.5 — the criterion no longer sits on its own edge.
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
  await frame('114-village-rain', { place: 'maasai-village', label: 'the rain inside the settlement' })
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
  // Leave a DIRECTLY entered place behind (place->place, no travel scene, so no
  // capture), as a whole run always has; the capture section below stages its
  // own. Enter without leaving first, and reset the calendar.
  await page.evaluate(() => {
    const g = window.__game.getState()
    g.debugJumpToMonth(1)
    g.enterPlace('maasai-village') // from cairo, a direct place->place enter
  })
  await page.waitForFunction(() => !!window.__placeLayout, null, { timeout: 30000 })
}

// --- Settlement fabric per plan (design.md §2.6/§4.5) -------------------------
// Screenshot evidence of the port/village difference: the Congo street
// village's single axis (101) vs Cairo's organic lane fabric (102); the
// masai ring already shows in shot 98.
if (section('settlement-fabric')) {
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
    await frame(shot.replace(/\.png$/, ''), { element: '.map-place-plan', label: `the ${placeId} town plan` })
    check(`${placeId}: the town plan draws the plan fabric`, fabric.plan && fabric.dwellings >= 6, JSON.stringify(fabric))
    await page.evaluate(() => window.__ui.getState().toggleMap())
    await page.waitForTimeout(200)
  }
}
// --- Cold-weather dress (design.md §19.13, point 120g) ---
// It hops between settlements, and each leave remounts the travel scene, which
// makes the next enter capture a panorama — the state the travel-panorama-capture
// fallback check asserts is absent, which is why that section stages its own
// direct enter.
// The Zulu isipuku (Mayr 1907) is a cloak worn over the everyday dress in cold
// weather, so the Zulu village must dress for its austral winter and shed the
// cloak in its summer; the San, Somali and Hausa cases rest on Passarge, Swayne
// and Barth, while a people without a seasonal rule stays bare in any month.
// See src/systems/dress.ts for the per-people evidence.
if (section('cold-weather-dress')) {
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

  // Point 137: four of the dressed peoples, each at its own village in its own
  // month, and the Maasai as a people that never dresses. The pure mapping is
  // covered in src/systems/dress.test.ts; this is the live half.
  const somaliKarif = await dressAt('somali-village', 8) // August — the karif on the Haud
  await frame('113-somali-karif-tobe', { place: 'somali-village', label: 'the Somali karif dress' })
  const somaliJilal = await dressAt('somali-village', 2) // February — jilal, dry and HOT
  const hausaHarmattan = await dressAt('hausa-village', 1) // January — the harmattan
  const hausaWet = await dressAt('hausa-village', 8) // August — the rains

  const zuluWinter = await dressAt('zulu-village', 7) // July — austral winter
  await frame('112-zulu-winter-cloaks', { place: 'zulu-village', label: 'the Zulu winter cloaks' })
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
  await frame('135-fire-cook-shelter-rain', { place: 'bemba-village', label: 'the cook shelter over the fire' })
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
if (section('campfire-shadows')) {
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
  // The pairs below are read off PIXELS, so the scene must have finished drawing
  // (point 499). After 1.5 s it has not here: both probe points then landed on the
  // same unrendered ground and every contrast came out as exactly 0.0 — ON and OFF
  // alike, three stones each, which is a blind probe rather than a missing shadow.
  // Built, the same measurement reads OFF 8/-5/12 and ON 56/40/53, each on its
  // side of the bars (OFF under 20, ON at 25 or more). Neither threshold below is
  // touched.
  await waitForSceneBuilt(page)

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
    const { data, info } = await sharp(await capturePixels(page, 'campfire light contrast')).raw().toBuffer({ resolveWithObject: true })
    return firePairs.map((p) => +(lumAt(data, info, p.lit) - lumAt(data, info, p.shadow)).toFixed(1))
  }

  // Campfire shadows are now level-driven (point 276): ON at the medium default,
  // so the OFF state must be FORCED via the debug flag, not assumed from the
  // default (which used to be off under point 289 alone).
  // Poll the cube-map tear-down/rebuild out rather than sleeping a fixed 1.5 s on
  // it: the measurement is the condition, so read it until two successive reads
  // agree, and judge the reading it settles on.
  const settledContrasts = async () => {
    let prev = await fireContrasts()
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 400))))
      const cur = await fireContrasts()
      if (cur.every((c, i) => Math.abs(c - prev[i]) <= 4)) return cur
      prev = cur
    }
    return prev
  }
  await page.evaluate(() => window.__ui.getState().setFireShadowsEnabled(false))
  const contrastOff = await settledContrasts()
  await page.evaluate(() => window.__ui.getState().setFireShadowsEnabled(true))
  const contrastOn = await settledContrasts()
  await frame('138-fire-shadows-on', { local: { x: -3.5, z: 2.5, y: 0.5 }, label: 'the fire pit and its stone ring' })
  await page.evaluate(() => {
    window.__ui.getState().setFireShadowsEnabled(false)
    window.__ui.getState().setSeasonWetnessOverride(null)
  })

  // Measured on both backends across the readings recorded here: OFF contrast
  // about -5 to 12, ON contrast about 34 to 57.
  //
  // Point 387 — the ON check was red on `main` at per-stone [1.6, -1.3, 0]:
  // three readings of three different signs, all sitting on zero. VERDICT: the
  // CHECK's STAGING, not the product and not the bar. The pairs were read off
  // pixels 1.5 s after entering the village, before the scene was drawn, so both
  // probe points landed on the same unrendered ground — a blind probe reads no
  // shadow whether or not one is cast. The scene is waited for and the cube-map
  // rebuild polled out above (`settledContrasts`), and the bar stays 25 with the
  // 2-of-3 majority: nothing here was loosened to reach green.
  // MEASURED 07.08.2026, quiet machine: ON [54.1, 42.1, 48.1] on WebGL 2 and
  // [47.5, 34.3, 42.2] on WebGPU (OFF [7.8, -0.5, 1.7] and [8.4, -1.3, 4.0]).
  // Per-stone spread across the two backends is ~7 units, and the weakest stone
  // sits 9 above the bar — this is not a criterion deciding on noise.
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

// --- The settlement edge painted on the ground (design.md §2.6, point 352/488) ---
// The band must TELL THE TRUTH, so this measures it in the rendered picture in
// four kinds of place, in both seasons (the wetness override forces dry and
// wet), and against the leave check itself in one village — a step visible only
// in the dry-season straw would be half a feature.
if (section('settlement-edge')) {
  // Ground crops: how far inside / outside the boundary each sample sits.
  //
  // THE INSIDE CROP SITS INSIDE THE BAND, NOT ON ITS INNER EDGE (work-order
  // 688). It stood at −5 m, which was well clear of the band this check was
  // written against — but the band was widened to 8 m in play on 27.08.2026 and
  // the crops were not re-aimed with it. −5 then sat just inside the band's own
  // inner edge (radius − 4, ± the 0.4 m wander), close enough for its crop to
  // straddle it — the least stable ground on the whole
  // profile, and whether the criterion passed came down to which bearing the
  // corridor scan happened to pick.
  //
  // MEASURED, band on / band off, over the whole ray at 1 m steps:
  //   bambara (dry)  −5 ×0.690  −3 ×0.695  −2 ×0.704  0 ×0.857  +1 ×0.968  +2 ×0.999
  //   bambara (wet)  −5 ×0.838  −3 ×0.723  −2 ×0.709  0 ×0.837  +1 ×0.961  +2 ×0.998
  //   capetown (wet) −5 ×0.867  −3 ×0.798  −2 ×0.776  0 ×0.904  +1 ×0.985  +2 ×1.000
  //   giza (dry)     −5 ×0.864  −3 ×0.875  −2 ×0.878  0 ×0.948  +1 ×0.991  +2 ×1.000
  //   giza (wet)     −5 ×0.820  −3 ×0.799  −2 ×0.797  0 ×0.907  +1 ×0.982  +2 ×1.000
  // The visible fall runs from about −1.4 to +1.4, exactly the width the band's
  // core says it should. At −3 the sweep is at full strength everywhere and in
  // both seasons; at −5 it is not — bambara in the rains reads ×0.838 there,
  // ABOVE its own boundary crop, and the give-way check had a margin of −0.001
  // against a bar of 0.008. Off −3 the same margins are 0.07 to 0.16: the bar is
  // unchanged and is no longer decided by noise.
  const SAMPLES = [
    { name: 'inside', at: -3 },
    { name: 'boundary', at: 0 },
    { name: 'outside', at: 4 },
  ]

  /** Project a ground point through the live place camera (point 172/375: the
   *  picture decides where a crop sits, never an assumed screen position). */
  const groundPixel = (x, z) =>
    page.evaluate(
      ([px, pz]) => {
        const cam = window.__placeCamera
        if (!cam) return null
        const apply = (e, v) => [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
        const eye = apply(cam.matrixWorldInverse.elements, [px, 0, pz, 1])
        const clip = apply(cam.projectionMatrix.elements, eye)
        if (!(clip[3] > 0)) return null
        return { x: clip[0] / clip[3], y: clip[1] / clip[3] }
      },
      [x, z],
    )

  /** A bearing whose corridor across the boundary is free of buildings, fences,
   *  rocks and plants — a hut in a crop would measure the hut, not the ground. */
  const clearBearing = () =>
    page.evaluate(() => {
      const L = window.__placeLayout
      // The boundary per bearing (work-order 1252): it bulges round watched
      // scenes, so the corridor is laid across the edge where it really is, and
      // only where that edge runs square to the ray — a slanted edge would put
      // both sides of the band into one crop.
      const edgeAt = window.__placeBoundaryRadius
      const near = (x, z, ax, az, d) => Math.hypot(x - ax, z - az) < d
      const blocked = (ax, az) => {
        for (const c of L.colliders ?? []) {
          if (c.kind === 'segment') {
            if (near(c.x1, c.z1, ax, az, 4) || near(c.x2, c.z2, ax, az, 4)) return true
          } else if (near(c.x, c.z, ax, az, (c.r ?? Math.hypot(c.hx ?? 0, c.hz ?? 0)) + 4)) return true
        }
        for (const f of L.flora ?? []) if (near(f.x, f.z, ax, az, 4)) return true
        for (const rk of L.rocks ?? []) if (near(rk[0], rk[1], ax, az, 4)) return true
        return false
      }
      for (let i = 0; i < 180; i++) {
        const b = (i / 180) * Math.PI * 2
        const r = edgeAt(b)
        const span = 6 / r
        if (Math.abs(edgeAt(b - span) - r) > 0.5 || Math.abs(edgeAt(b + span) - r) > 0.5) continue
        let ok = true
        for (let d = r - 9; d <= r + 6 && ok; d += 1.5) {
          if (blocked(Math.cos(b) * d, Math.sin(b) * d)) ok = false
        }
        if (ok) return b
      }
      return null
    })

  /** Every pixel's luminance in a crop centred on a ground point. The reads are
   *  kept per PIXEL (point 641): the shot's reading rejects the §19.13 rain
   *  streaks across the reads and then measures the band across the pixels, and
   *  neither is possible once a read has been collapsed to one number.
   *  cropLuma.mjs carries the reasoning and cropLuma.test.mjs pins it. */
  const groundSamples = async (buf, ndc, w, h) => {
    return readGroundSamples(buf, ndc, page.viewportSize(), w, h)
  }

  /** Aim the camera at a ground point ahead by bisecting the pitch on the
   *  PROJECTION — no assumption about the pitch convention or the field of view. */
  const aimAt = async (bearing, distance, standAt) => {
    await page.evaluate(
      ([b, stand]) => {
        const p = window.__placePlayer
        p.x = Math.cos(b) * stand
        p.z = Math.sin(b) * stand
        // Forward is -Z rotated by yaw, so this faces straight out of the place.
        p.yaw = Math.atan2(-Math.cos(b), -Math.sin(b))
        p.pitch = -0.2
      },
      [bearing, standAt],
    )
    const tx = Math.cos(bearing) * distance
    const tz = Math.sin(bearing) * distance
    let lo = -1.4
    let hi = 0.2
    let ndc = null
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      await page.evaluate((v) => { window.__placePlayer.pitch = v }, mid)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      ndc = await groundPixel(tx, tz)
      // pitch 0 is the horizon and + looks UP (design.md §17.5, point 392): a
      // target below the frame centre needs a LOWER pitch, so it is the lower
      // half that stays in play.
      if (!ndc) { hi = mid; continue }
      if (ndc.y > 0) lo = mid
      else hi = mid
      if (Math.abs(ndc.y) < 0.01) break
    }
    return ndc
  }

  /** Let the scene draw N frames — the app's own clock, never the wall clock. */
  const settleFrames = (frames = 3) =>
    page.evaluate(
      (n) =>
        new Promise((res) => {
          let i = 0
          const step = () => (++i >= n ? res() : requestAnimationFrame(step))
          requestAnimationFrame(step)
        }),
      frames,
    )

  /** The gap between two reads of one shot (point 641): far enough apart to be
   *  DIFFERENT PICTURES of the same scene. Both conditions are needed. Frames,
   *  because on a throttled machine time passes while the picture does not; and
   *  the page's own elapsed time, because a fast machine could draw twelve
   *  frames in a fraction of a second. MEASURED here (cropLuma.mjs): a §19.13
   *  streak stays in the crop under 270 ms — the bound the sampling actually
   *  proves — and the scene draws ~6.8 fps headless at giza, so twelve frames are
   *  ~1.75 s and the frame condition alone outlasts the streak about six times
   *  over. The 600 ms is the floor that keeps that true on a machine that draws
   *  faster. This polls the PAGE's clock, which is the clock the rain falls on,
   *  not a sleep in the harness. */
  const readGap = (ms = READ_GAP_MS, frames = READ_GAP_FRAMES) =>
    page.evaluate(
      ([wait, n, netMs]) =>
        new Promise((res) => {
          // The net is WALL CLOCK and lives OUTSIDE the frame loop. Counting
          // frames cannot bound a scene that has stopped drawing them: the
          // counter simply never advances. And a gap that gives up must not
          // pretend it waited — it reports STARVED, and the shot fails rather
          // than measuring reads that sit closer together than the rain needs
          // them to.
          const t0 = performance.now()
          let i = 0
          let done = false
          const finish = (ok) => {
            if (done) return
            done = true
            res(ok)
          }
          const net = setTimeout(() => finish(false), netMs)
          const step = () => {
            if (done) return
            if (++i >= n && performance.now() - t0 >= wait) {
              clearTimeout(net)
              return finish(true)
            }
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
      [ms, frames, READ_GAP_NET_MS],
    )

  const enterFor = async (id) => {
    await page.evaluate((want) => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
      g.enterPlace(want)
    }, id)
    await page.waitForFunction(
      (want) => window.__game.getState().placeId === want && !!window.__placeLayout && !!window.__placeCamera,
      id,
      { timeout: 40000 },
    )
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    await settleFrames(8)
  }

  /** The band's OWN effect on a crop: its luminance with the edge drawn over
   *  its luminance with the edge switched off from the debug menu's own value,
   *  same camera, same frame content. Attribution, not correlation — the
   *  settlement's grass scatter also stops at the edge, and a plain
   *  inside-vs-outside difference could not tell the two apart. It doubles as
   *  the live proof that the calibratable strength lands without a reload. */
  const bandRatio = async (ndc) => {
    // Point 549: three frames were not the band arriving, they were three frames.
    // That repair waited for the crop to STOP MOVING on the new strength and
    // then took three reads — the rains draw over the ground and TRAA jitters
    // it, so a single frame samples that noise instead of measuring the band.
    // The measured spread of `capetown (wet)` across five runs was 6.5 luminance
    // points on an unchanged scene, straddling its own 0.04 bar.
    //
    // Point 641: a shot is FIVE reads of the crop, kept per pixel, combined by
    // the per-pixel median across the reads and then by the crop's mean
    // (cropLuma.mjs). The rain is a transient in TIME and the band is not, so
    // the streak is rejected across the reads while every pixel still counts
    // towards the measurement — a spatial median would reject the streak too,
    // and with it a genuine band leak over part of the crop, which at 0.3 m of
    // clearance is the first real defect this check has to catch (measured: a
    // leak over 8 of the 46 rows reads ×0.968 on the mean and ×1.000 on the
    // spatial median). Five reads, so a streak surviving into two of them still
    // cannot reach the middle value.
    //
    // The isolated WebGPU run exposed another missing-reading cause: maasai
    // dry had healthy inside luminance (ON 73.4, OFF 107.5), but drift of
    // 1.29% / 1.25%. The two-frame absolute settle admitted a slow trend that
    // the full shot rejected. Wait on the shot's OWN timescale and statistic,
    // keeping its 1% bar: edgeBandSettle.mjs advances a full window until its
    // rain-robust halves agree, then measures those same certified reads.
    // This includes the actual frame-bound gap on a cold first draw; a fixed
    // 600 ms projection would underestimate it. No later capture can undo the
    // certificate, and exhausting the wait now fails instead of falling through.
    const shot = async (strength) => {
      await page.evaluate((s) => { window.__balance.placeEdgeBand.strength = s }, strength)
      return settledEdgeShot({
        gap: readGap,
        read: async () => groundSamples(await capturePixels(page, 'edge-band ground luma'), ndc, 150, 46),
      })
    }
    // ON, OFF, ON — and the two ONs averaged. In the rains the ground SOAKS
    // while the shots are taken (the §19.13 wet accumulation keeps darkening
    // it), which biased a plain on/off pair by more than the edge itself; a
    // symmetric triple cancels that linear drift instead of racing it.
    return readBandRatio(shot)
  }

  const readGround = async (id, wetness, seasonName, shoot) => {
    await enterFor(id)
    await page.evaluate((w) => window.__ui.getState().setSeasonWetnessOverride(w), wetness)
    // Point 549: the wet state is WAITED OUT before anything is read, at EVERY
    // place and for BOTH halves of the criterion — the swept ground inside and
    // the open land outside. The rains keep soaking the ground (§19.13) and the
    // settlement light lerps with them, so the crops used to be taken off a
    // moving picture: the same capetown scene read inside ×0.899, ×0.900,
    // ×0.900, ×0.946 and ×0.964 across five runs of unchanged code, and the
    // giza reading moved on its OUTSIDE half instead. This is point 499's
    // `settle()` applied to the ground: the fields the measurement depends on —
    // the soak itself and the light falling on it — polled until they stop.
    const wet = await waitForReadingStable(
      page,
      () => {
        const s = window.__placeSeason()
        return { wetness: s.wetness, groundWet: s.groundWet, sun: s.sun, hemi: s.hemi }
      },
      // A LOAD-PROOF budget, not a tight one (point 641). The soak advances per
      // FRAME, so a machine that draws a quarter of the frames needs about four
      // times the wall clock for the same drying — and the 60 s this used to
      // allow is only 1.7× the 34.9 s the dry settle takes on a quiet machine.
      // Measured under `throttle-probe … --rate 4`: 1 of 3 runs failed here at
      // 60 051 ms with groundWet at 0.133 and still falling — a budget expiring
      // on a converging reading, not a scene that had stopped. The ceiling stays
      // as a net for a settle that genuinely never comes; it costs a green run
      // nothing.
      { settleMs: 400, samples: 3, timeout: 240000 },
    )
    check(
      `${id} (${seasonName}): the ground's wet state settles before the band is measured`,
      wet.settled,
      `after ${wet.waitedMs} ms — ${JSON.stringify(wet.value)}`,
    )
    const bearing = await clearBearing()
    if (bearing === null) {
      check(`${id} (${seasonName}): a clear ground corridor across the edge exists`, false, 'every bearing blocked')
      return null
    }
    const radius = await page.evaluate((b) => window.__placeBoundaryRadius(b), bearing)
    // One standing spot for all three crops, so only the aim moves between them.
    const stand = radius - 6
    const out = {}
    for (const s of SAMPLES) {
      const ndc = await aimAt(bearing, radius + s.at, stand)
      if (!ndc || Math.abs(ndc.y) > 0.35 || Math.abs(ndc.x) > 0.5) {
        check(`${id} (${seasonName}): the ${s.name} ground crop is in the picture`, false, `ndc ${JSON.stringify(ndc)}`)
        return null
      }
      // Every ON/OFF/ON shot waits on its own complete crop window, including
      // the first after the season change or a new camera aim.
      const ratio = await bandRatio(ndc)
      if (ratio.value === null) {
        check(`${id} (${seasonName}): the ${s.name} ground crop could be measured`, false, ratio.detail)
        return null
      }
      out[s.name] = ratio.value
    }
    if (shoot) {
      // Human-viewable evidence, composed so the edge is READABLE rather than
      // merely present: standing just inside the line and looking ALONG it, so
      // the give-way runs across the frame with the swept ground on one side
      // and the open land on the other — a frame looking straight out over it
      // shows the band nearly edge-on and reads as a distance gradient.
      await page.evaluate(
        ([b, r]) => {
          const p = window.__placePlayer
          p.x = Math.cos(b) * (r - 2.5)
          p.z = Math.sin(b) * (r - 2.5)
          p.yaw = Math.PI - b // along the boundary's tangent
          // Shallow enough to keep the horizon in the frame: a picture of
          // nothing but ground shows the band without showing WHERE it is.
          p.pitch = -0.22
        },
        [bearing, radius],
      )
      await settleFrames(6)
      await frame(shoot.name, { place: id, label: shoot.label })
    }
    return out
  }

  // THE SPREAD, RECORDED (point 549). Both halves of this criterion used to move
  // between runs on unchanged code: the INSIDE reading at capetown measured
  // ×0.899, ×0.900, ×0.900, ×0.946 and ×0.964 against `1 - inside > 0.04`, one
  // run over its own bar, and at giza it was the OUTSIDE half — the open land
  // that must read untouched — that drifted (×1.057 on the attempt that failed).
  // Both were reading a wet state still on its way in. With the soak and the
  // light on it polled until they stop, four consecutive WebGL 2 runs reported
  // capetown inside ×0.946, ×0.944, ×0.944, ×0.946 (spread 0.002) and giza
  // inside ×0.905, ×0.906, ×0.906 (three recorded). These figures predate the
  // re-aimed −3 crop and the 8 m band.
  //
  // WHAT STILL ROTATED, AND WHY (point 641). The outside half kept moving —
  // ×1.000, ×1.000, ×0.980, and on 11.08.2026 `giza (wet)` went red at ×0.963,
  // in one of three full runs while the same section passed 3/3 in isolation.
  // The wet state was not the cause and neither was load: the crop was sampled
  // 284 times over 90 s at giza with the band strength fixed and the light
  // constant, and its MEAN jumped from 102.5 to 114.0 — +11.4 % — about every
  // 13 s. The saved frames name it: a §19.13 rain streak, bright and ~14 px
  // wide, falling straight through the 150×46 crop. In one of the three shots a
  // ratio takes, that is the whole red — with the measured ×1.1137
  // contamination, a streak in an ON shot gives ×1.057 (the reading on record,
  // to three decimals), one in the OFF shot ×0.898, and a 4–5 px sliver the
  // ×0.963. A shot is now five reads of the crop, combined per PIXEL by their
  // median across the reads and then by the crop's mean (cropLuma.mjs): the
  // streak is transient and is dropped, while a band effect over any part of
  // the crop is still measured at full strength.
  // The geometry was measured and ruled out in the same pass: at giza the
  // outside crop's near row sits at radius+2.7 m and the band reaches at most
  // radius+2.4 m, the per-row ON/OFF profile reads 1.000 across every row of the
  // crop, and the aim is reproducible to 16 digits between runs — clear, though
  // by only 0.3 m, which is the number to look at first if the offsets or the
  // band's width are ever recalibrated.
  const kinds = [
    // THE CASE THE USER REPORTED (point 581) LEADS. His frame was the Bambara
    // village: pale sand inside, pale sand outside, the master strength already
    // at its ceiling and the line still unreadable. A roster that measures the
    // other three places and not this one cannot say the report is answered, so the
    // sand-on-sand village is measured and PHOTOGRAPHED like the rest.
    { id: 'bambara-village', shoot: { name: '581-sand-village-edge-band', label: 'the swept Bambara village ground giving way at the edge' } },
    { id: 'maasai-village', shoot: { name: '488-village-edge-band', label: 'the swept village ground giving way at the edge' } },
    { id: 'capetown', shoot: { name: '488-port-edge-band', label: 'the port ground giving way at the edge' } },
    { id: 'giza', shoot: { name: '488-monument-edge-band', label: 'the monument plateau giving way at the edge' } },
  ]
  for (const { id, shoot } of kinds) {
    for (const [wetness, seasonName] of [[0, 'dry'], [1, 'wet']]) {
      const r = await readGround(id, wetness, seasonName, wetness === 0 ? shoot : null)
      if (!r) continue
      const shown = `inside ×${r.inside.toFixed(3)} · boundary ×${r.boundary.toFixed(3)} · outside ×${r.outside.toFixed(3)}`
      check(
        `${id} (${seasonName}): the swept ground inside is measurably darkened, the open land outside is untouched`,
        1 - r.inside > 0.04 && Math.abs(1 - r.outside) < 0.025,
        shown,
      )
      check(
        `${id} (${seasonName}): the crop AT the boundary lies between the two — a give-way, not a step`,
        r.inside < r.boundary - 0.008 && r.boundary < r.outside - 0.008,
        shown,
      )
    }
  }
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))

  // The truth check (design.md §2.6): walking straight out over the visible band
  // is the frame in which the place is left. Stepped in the REAL walk loop, not
  // teleported, and judged against the boundary the band draws at.
  {
    await enterFor('maasai-village')
    const bearing = (await clearBearing()) ?? 0
    const crossing = await page.evaluate(async (b) => {
      const p = window.__placePlayer
      // The boundary at this bearing — no circle (work-order 1252).
      const radius = window.__placeBoundaryRadius(b)
      p.x = Math.cos(b) * (radius - 3)
      p.z = Math.sin(b) * (radius - 3)
      p.yaw = Math.atan2(-Math.cos(b), -Math.sin(b))
      p.pitch = 0
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
      const started = Date.now()
      let last = Math.hypot(p.x, p.z)
      while (Date.now() - started < 15000) {
        await new Promise((r) => requestAnimationFrame(r))
        if (!window.__game.getState().placeId) break
        last = Math.hypot(p.x, p.z)
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
      return { left: !window.__game.getState().placeId, last, radius }
    }, bearing)
    check(
      'walking straight over the painted edge is the frame in which the village is left (design.md §2.6)',
      crossing.left && Math.abs(crossing.last - crossing.radius) < 1.5,
      `left at ${crossing.last.toFixed(2)} m of a ${crossing.radius} m boundary`,
    )
  }
}

// --- The walk over a small stone (design.md §2.6, work-order 1149) ------------
// The user's report: "man bleibt an Kieselsteinen im Dorf hängen" — every
// scattered stone claimed a collider of at least half a metre, however small the
// thing the player saw, so an ankle-high pebble stopped him dead. A stone below
// the step height is GROUND now: it raises the walking surface the way an
// excavation's spoil does and holds no collider at all.
//
// The arithmetic is pinned in the unit layer (looseRocks/placeGround/layout
// tests). What only the RENDERED scene can answer is the two halves the player
// actually meets: does the shipped settlement really let him stand where the
// stone is, and does the live camera ride up onto it and down again — read off
// `window.__placeCamera`, the same camera the frame is taken through, rather
// than off the sampler that computes it.
if (section('stone-step')) {
  await goToPlace('bambara-village')
  // The first-person player is installed a frame or two after the layout is
  // published; reading it before that is what an unguarded `__placePlayer.x`
  // throws on.
  const walking = await page
    .waitForFunction(() => !!window.__placePlayer && !!window.__placeCamera && !!window.__placeLayout, null, { timeout: 40000 })
    .then(() => true)
    .catch(() => false)
  check('the village stands with a first-person player in it', walking)
  if (walking) {
  const stone = await page.evaluate(async () => {
    const { looseRockIsGround, looseRockRise, looseRockTop } = await import('/src/scenes/place/looseRocks.ts')
    const { standingClear, PLAYER_RADIUS } = await import('/src/scenes/place/collision.ts')
    const { placeGroundHeight } = await import('/src/scenes/place/placeGround.ts')
    const { ROCK_RADIUS_UNITS } = await import('/src/render/flora.ts')
    const layout = window.__placeLayout
    if (!layout) return null
    // The settlement's surface WITHOUT its stones and with no digging progress
    // (`progress: []`): the shore slopes and the dig sites' own ground rise, and
    // a stone standing on either would hide its own rise in the reading below.
    const bare = (x, z) => placeGroundHeight({ bank: layout.bank, sites: layout.digSites, progress: [], rocks: [] }, x, z)
    // The clearest walked-over stone the settlement has: standable, on flat
    // ground away from the bank, and with room for the player to walk in at it
    // from outside its own rise — so nothing but the stone is under the camera.
    let best = null
    for (const [x, z, scale] of layout.rocks) {
      if (!looseRockIsGround(scale)) continue
      // WELL INSIDE THE SETTLEMENT. The scatter reaches past the walkable rim
      // (`6 + rand() * (radius + 6)` in layout.ts), and standing a player out
      // there ends the visit: the place unmounts under the camera, which is
      // exactly what the first cut of this section measured as "no player".
      if (Math.hypot(x, z) > layout.radius * 0.8) continue
      // NOTHING ELSE UNDER THE WHOLE CROSSING (GPT-6 Astra, cross-vendor
      // reviews of d261418 and 7885fe1). Every height this section reads —
      // the three standpoints AND the two resting eyes of the walk, which lie
      // further out than the standpoints — must stand on ground that is flat
      // but for THIS stone. A second walked-over stone, a shore or an
      // excavation anywhere along that line lifts a baseline and turns correct
      // behaviour into a wrong rise, so the whole line is checked rather than
      // the three points that happen to be read first.
      const others = layout.rocks.filter((r) => r[0] !== x || r[1] !== z)
      const foreign = (px, pz) => others.reduce((m, r) => Math.max(m, looseRockRise(r, px, pz)), 0)
      let lineClear = true
      for (let dx = -2; dx <= 1.6 && lineClear; dx += 0.2) {
        if (bare(x + dx, z) !== 0 || foreign(x + dx, z) !== 0) lineClear = false
      }
      if (!lineClear) continue
      const clear = standingClear(layout.colliders, x, z, PLAYER_RADIUS)
      if (!clear) continue
      // How much open ground surrounds it, measured the way the player meets it.
      let room = 0
      for (; room < 6; room += 0.25) {
        const blocked = [0, Math.PI / 2, Math.PI, -Math.PI / 2].some(
          (a) => !standingClear(layout.colliders, x + Math.sin(a) * (room + 0.25), z + Math.cos(a) * (room + 0.25), PLAYER_RADIUS),
        )
        if (blocked) break
      }
      if (!best || room > best.room) {
        best = { x, z, scale, room, top: looseRockTop(scale), foot: ROCK_RADIUS_UNITS * scale, out: Math.hypot(x, z), rim: layout.radius }
      }
    }
    return best
  })
  check(
    'the village scatters a stone low enough to be walked over, on ground the player can stand on',
    !!stone && stone.room >= 1.5,
    JSON.stringify(stone),
  )
  if (stone) {
    // Three standpoints on one line through the stone: outside its rise, on its
    // centre, and outside it again on the far side.
    const reach = stone.top > 0 ? 0.9 : 0
    // The scene may remount between two standpoints — the module imports above
    // run through the dev server — so every standpoint waits for the player it
    // is about to move rather than assuming the last one's is still there.
    const stand = async (x, z, yaw, pitch) => {
      await page
        .waitForFunction(() => !!window.__placePlayer && !!window.__placeCamera, null, { timeout: 30000 })
        .catch(() => {})
      return page.evaluate(({ x, z, yaw, pitch }) => {
        const p = window.__placePlayer
        if (!p) return false
        p.x = x
        p.z = z
        p.yaw = yaw
        p.pitch = pitch
        return true
      }, { x, z, yaw, pitch })
    }
    const readAt = async (dx) => {
      const stood = await stand(stone.x + dx, stone.z, dx < 0 ? Math.PI / 2 : -Math.PI / 2, -0.2)
      if (!stood) return null
      await nextFrames(4)
      return page.evaluate(() => window.__placeCamera?.position.y ?? null)
    }
    const before = await readAt(-reach)
    const on = await readAt(0)
    const after = await readAt(reach)
    const answered = before !== null && on !== null && after !== null
    check('the live camera answers at all three standpoints', answered, JSON.stringify({ before, on, after }))
    if (answered) {
    // The camera stands the stone's own drawn top higher at its centre than on
    // the open ground a pace away, and comes back down on the other side. The
    // tolerance carries the idle sway that keeps the camera alive at rest.
    const rise = on - (before + after) / 2
    check(
      'the camera rides up onto the small stone and back down again',
      Math.abs(rise - stone.top) < 0.04 && Math.abs(before - after) < 0.04,
      `rise ${rise.toFixed(3)} m against a stone ${stone.top.toFixed(3)} m high ` +
        `(eye ${before.toFixed(3)} / ${on.toFixed(3)} / ${after.toFixed(3)} m)`,
    )
    // THE WALK ITSELF, on the game's own movement input (GPT-6 Astra,
    // cross-vendor review of d261418). Three standpoints prove the surface; the
    // reported bug is that the walk STOPS at the stone, and only a held key
    // crossing it can answer that. The player starts a pace short of the stone,
    // aimed across it, and walks until he is past it or the window runs out.
    const WALK_FROM = 1.6
    // AT A WALKING PACE, not the shipped sprint. `placeWalkSpeed` is 10 m/s and
    // a headless frame is tens of milliseconds, so a crossing at shipped speed
    // can step clean over a pebble's whole footprint between two samples — the
    // measurement would then have nothing on the stone to read. The value is a
    // debug-menu one (§21) and is put back afterwards.
    const shippedPace = await page.evaluate(() => {
      const was = window.__balance.placeWalkSpeed
      window.__balance.placeWalkSpeed = 1.2
      return was
    })
    await stand(stone.x - WALK_FROM, stone.z, Math.atan2(WALK_FROM, 0) + Math.PI, 0)
    await nextFrames(4)
    // The two STANDING readings of this crossing, before and after: a walking
    // camera bobs with the stride, so the height on open ground is read at
    // rest, never off a sample taken mid-step.
    const startEye = await page.evaluate(() => window.__placeCamera?.position.y ?? null)
    const track = []
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
      await nextFrames(1)
      const at = await page.evaluate(() => {
        const p = window.__placePlayer
        return p ? { x: p.x, z: p.z, eye: window.__placeCamera?.position.y ?? null } : null
      })
      if (!at) break
      track.push(at)
      if (at.x > stone.x + 0.8) break
    }
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
    await page.evaluate((was) => { window.__balance.placeWalkSpeed = was }, shippedPace)
    await nextFrames(20)
    const restEye = await page.evaluate(() => window.__placeCamera?.position.y ?? null)
    const crossed = track.length > 0 && track[track.length - 1].x > stone.x + 0.5
    check(
      'a held walk carries the player over the stone rather than stopping at it',
      crossed,
      `from ${(stone.x - WALK_FROM).toFixed(2)} to ${(track.at(-1)?.x ?? NaN).toFixed(2)} ` +
        `across a stone at ${stone.x.toFixed(2)} in ${track.length} steps`,
    )
    if (crossed) {
      // And the walk RIDES it: the eye rose while he stood on the stone and was
      // back on the open ground once he was past it. Judged on the frames that
      // really fell inside the stone's own footprint — a crossing sampled only
      // beside it has seen nothing, which is a coverage verdict and not a red.
      const onStone = track.filter((t) => Math.hypot(t.x - stone.x, t.z - stone.z) <= stone.foot)
      const peak = onStone.length ? Math.max(...onStone.map((t) => t.eye)) : startEye
      check(
        'the eye rises while he stands on the stone and comes back down past it',
        peak - startEye > stone.top * 0.4 && Math.abs(restEye - startEye) < 0.03,
        `flat ${startEye.toFixed(3)} m, peak ${peak.toFixed(3)} m, at rest past it ` +
          `${restEye.toFixed(3)} m, over a stone ${stone.top.toFixed(3)} m high, ` +
          `${track.length} frames sampled`,
        { subjects: onStone.length, minimum: 1, what: 'frames sampled on the stone itself' },
      )
    }

    // …and the picture of the thing itself: the player's own view, two paces
    // short of the stone he is about to walk over.
    await stand(stone.x - 2.2, stone.z, Math.atan2(2.2, 0) + Math.PI, -0.32)
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    await nextFrames(6)
    await frame('1149-village-stone-step', {
      local: { x: stone.x, y: stone.top / 2, z: stone.z },
      label: 'the small stone in the village the walk is carried over',
    })
    }
  }
  }
}

// --- Head clearance under the eaves (design.md §2.6, work-order 349) ----------
// The reported Zulu-village shot: standing under a hut's overhanging roof, the
// near plane cut into the thatch — its underside filled the frame with a hard
// horizontal edge and open sky above it. The pure sweep
// (src/scenes/place/roofClearance.test.ts) proves the arithmetic over every
// place, building type and seed; this asks the RENDERED scene, after a real
// walk driven by the game's own collision resolver: what does the frame draw
// over the player's head, and is the roof a surface when seen from below?
//
// THE SPREAD, RECORDED (point 549, the way point 387 recorded its five).
// `cairo trade house: nothing hangs under the eye at the eaves` was the fourth
// rotator: it FAILED runs 1 and 4 of four consecutive WebGL 2 runs and PASSED
// runs 2 and 3, from standpoints identical to within seven centimetres, its
// downward probe answering either `1.51 m down to ground-disc` or `0.26 m down
// to BoxGeometry`. Measured at the standpoint's own coordinates over 2842
// consecutive frames, the column reads the ground in 2655 of them, a box 0.23–
// 0.28 m under the eye in 115 and a cone at 1.17–1.47 m in 72. The box is the
// CRATE A PORTER CARRIES and the cone his robe (`Porters`,
// src/scenes/place/PlaceLife.tsx): a porter route runs through the standpoint,
// so a single-frame probe was deciding the verdict on a passer-by — a ~4 %
// coin-flip per run, which is what two reds in four runs looks like. Neither the
// eave nor the door was ever at fault; the facade is clean and the crate and
// barrel in `verification/349-eaves-port.png` stand against the wall, out of the
// column. With the window recorded and judged by `judgeEavesColumn`
// (scripts/verify/eavesColumn.mjs), the standing reading is 1.50 m to
// ground-disc every run, and what crossed is named in the line.
if (section('roof-clearance')) {
  // Keep in sync with ROOF_HEADROOM in src/scenes/place/roofClearance.ts.
  const ROOF_HEADROOM = 1.85

  const enterFor = async (id) => {
    await page.evaluate((want) => {
      const g = window.__game.getState()
      g.setJournalOpen(false) // an earlier block may have left the panel over the frame
      if (g.placeId) g.leavePlace()
      g.enterPlace(want)
    }, id)
    await page.waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, id, {
      timeout: 30000,
    })
    await waitForSceneBuilt(page).catch(() => {})
  }

  /** Stand the player on an open bearing around `target` and aim him at it.
   *  `prefer` (a world bearing) is tried first — a trade house is approached
   *  from its DOOR side, where the awning it must be judged by hangs.
   *
   *  Point 549: it reports WHAT IT SEARCHED, never a bare `null`. Three checks
   *  ride on this one search — the village eaves, the port eaves and the cook
   *  shelter — and each of them used to fail as `false` beside the target's
   *  coordinates, which says nothing about why 48 (49 with a preferred one)
   *  bearings were all rejected. Now the miss names how many bearings the disc
   *  edge closed, and which four colliders closed the most and how many each. */
  const searchStandOff = (target, startR, prefer = null) =>
    page.evaluate(
      ([t, start, preferred]) => {
        const reach = (c) => {
          if (c.kind === 'box') return Math.hypot(c.hx, c.hz)
          if (c.kind === 'segment') return c.r + Math.hypot(c.x2 - c.x1, c.z2 - c.z1) / 2
          return c.r
        }
        const others = (window.__placeColliders ?? []).filter(
          (c) => c.kind === 'segment' || Math.hypot((c.x ?? 0) - t.x, (c.z ?? 0) - t.z) > 0.05,
        )
        const centre = (c) => ({
          x: c.kind === 'segment' ? (c.x1 + c.x2) / 2 : c.x,
          z: c.kind === 'segment' ? (c.z1 + c.z2) / 2 : c.z,
        })
        const blocker = (x, z) =>
          others.find((c) => {
            const m = centre(c)
            return Math.hypot(x - m.x, z - m.z) < reach(c) + 0.9
          })
        const radius = window.__placeLayout?.radius ?? 28
        const bearings = []
        if (typeof preferred === 'number') bearings.push(preferred)
        for (let i = 0; i < 48; i++) bearings.push((i / 48) * Math.PI * 2)
        let byDisc = 0
        const byCollider = new Map()
        for (const b of bearings) {
          let blocked = null
          for (let d = start; d >= 1.2 && !blocked; d -= 0.4) {
            const x = t.x + Math.cos(b) * d
            const z = t.z + Math.sin(b) * d
            if (Math.hypot(x, z) > radius - 1.5) {
              blocked = 'disc'
              break
            }
            const c = blocker(x, z)
            if (c) {
              const m = centre(c)
              blocked = `${c.kind}@${m.x.toFixed(1)},${m.z.toFixed(1)}`
            }
          }
          if (blocked === 'disc') byDisc++
          else if (blocked) byCollider.set(blocked, (byCollider.get(blocked) ?? 0) + 1)
          if (blocked) continue
          const p = window.__placePlayer
          p.x = t.x + Math.cos(b) * start
          p.z = t.z + Math.sin(b) * start
          p.pitch = 0
          p.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z))
          return { bearing: b, tried: bearings.indexOf(b) + 1 }
        }
        const worst = [...byCollider.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
        return {
          bearing: null,
          tried: bearings.length,
          detail: `${bearings.length} bearings from r=${start} to r=1.2, all blocked: ${byDisc} by the disc edge (radius ${radius}), the rest by [${worst.map(([k, n]) => `${k}×${n}`).join(', ')}] of ${others.length} colliders`,
        }
      },
      [target, startR, prefer],
    )

  // THE SPREAD, RECORDED (point 549). Three standpoint searches rotated: the
  // zulu hut approach (this search) reported a bare `false` in one of five runs
  // and passed the other four, the cairo trade house (this search) did the
  // same, and the conversational standpoint (the villager-gestures section's
  // own 16-bearing search) reddened once on a loaded machine. With the world
  // seed pinned, the search reporting what it tried, and one retry from a
  // settled scene, four consecutive WebGL 2 runs picked the IDENTICAL
  // standpoint every time — the zulu hut at {x 15.79, z 2.20} on bearing 2.487
  // of 48, the cairo trade house at {x -19.22, z -1.18} on bearing 0.000 of 49,
  // the conversational standpoint on bearing 0.00, the first of 16. A search
  // over a world that does not change no longer produces a verdict that does.
  /** The same search, but never reporting a miss off a scene that may still be
   *  streaming in: a first miss is retried once from a settled state (point
   *  549 — the settled-reading shape point 499 established). */
  const standOff = async (target, startR, prefer = null) => {
    const first = await searchStandOff(target, startR, prefer)
    if (first.bearing != null) return first
    await waitForSceneBuilt(page).catch(() => {})
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
    const again = await searchStandOff(target, startR, prefer)
    if (again.bearing == null) again.detail = `${again.detail} (unchanged on a retry from the settled scene)`
    return again
  }

  /** Hold forward until the walk stops closing on the target — the collider has
   *  been reached. Every step waits for DRAWN frames, never for wall-clock time.
   *
   *  Point 549: the probe is taken at the CLOSEST APPROACH the walk reached, not
   *  at wherever it came to rest. A blocked step SLIDES along the collider, so
   *  the last frames of a stalled walk drift sideways along the wall by however
   *  much the host drew in them — and the eaves probe then reads whatever
   *  happens to stand at that drifted spot. Standing him back on the nearest
   *  point the walk actually reached is a position he really walked to, and it
   *  is the one the check means: at the eaves. (The trade-house rotation that
   *  outlived this repair, from standpoints within seven centimetres, was a
   *  porter's crate — see the section header.) */
  const walkUntilStalled = async (target, maxMs = 20000) => {
    const step = () =>
      page.evaluate(
        (t) =>
          new Promise((r) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
                const p = window.__placePlayer
                r({ d: Math.hypot(p.x - t.x, p.z - t.z), x: p.x, z: p.z })
              }),
            ),
          ),
        target,
      )
    const t0 = Date.now()
    let last = await step()
    let best = last
    let stalled = 0
    while (Date.now() - t0 < maxMs) {
      const now = await step()
      if (now.d < best.d) best = now
      stalled = last.d - now.d < 0.02 ? stalled + 1 : 0
      last = now
      if (stalled >= 3) break
    }
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
    await page.evaluate(
      (b) => {
        const p = window.__placePlayer
        p.x = b.x
        p.z = b.z
      },
      best,
    )
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
  }

  /** What the frame really draws straight above and straight below the eye, over
   *  a WINDOW of frames rather than in one (point 549).
   *
   *  The player stands still here, so the building fabric — the only thing this
   *  criterion is about — reads identically in every frame of the window. What
   *  varies is the settlement's TRAFFIC: measured at the cairo standpoint over
   *  2842 consecutive frames, 115 of them had a porter's carried crate 0.23–0.28 m
   *  under the eye and 72 his robe, and a single-frame probe therefore decided
   *  the verdict by whether a porter happened to be passing. The window is
   *  recorded in ONE round trip and judged by the pure `judgeEavesColumn`. */
  const recordColumn = (frames = 150, maxMs = 6000) =>
    page.evaluate(
      ([n, cap]) =>
        new Promise((res) => {
          const out = []
          let done = false
          const finish = () => {
            if (done) return
            done = true
            res(out)
          }
          const sample = () => {
            const cam = window.__placeCamera
            const y = cam.position.y
            const up = window.__placeRayHit(cam.position.x, y + 6, cam.position.z)
            const down = window.__placeRayHit(cam.position.x, y - 4, cam.position.z)
            out.push({
              camY: y,
              roofY: up.hitDistance == null ? null : y + up.hitDistance,
              roofName: up.hitName,
              drop: down.hitDistance,
              below: down.hitName,
            })
          }
          // The first sample is taken WITHOUT waiting for a frame, so a lane that
          // draws nothing still yields the single reading the old probe took —
          // the window can only ever add to it, never leave the caller with less.
          sample()
          // And the wall clock, not rAF, ends the window: a page that stops
          // ticking must not hang `page.evaluate`, which has no timeout of its own.
          const timer = setTimeout(finish, cap + 500)
          const t0 = performance.now()
          const tick = () => {
            if (done) return
            sample()
            if (out.length >= n || performance.now() - t0 > cap) {
              clearTimeout(timer)
              finish()
            } else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      [frames, maxMs],
    )

  /** Where the player ended up — the standpoint every reading above belongs to. */
  const standpoint = () =>
    page.evaluate(() => {
      const p = window.__placePlayer
      return { x: p.x, z: p.z }
    })

  const eavesCase = async (placeId, label, pick, startR) => {
    await enterFor(placeId)
    // Point 549: `pick` names EVERY building of the kind under test, not the
    // first one the layout happens to list. The eave line is a property of the
    // building type — any hut of it proves the criterion — so a single crowded
    // neighbour is no reason for the check to have nothing to say. It fails
    // only when NO building of the kind can be walked up to, and then it says
    // what blocked each of them.
    const picked = await page.evaluate(pick)
    const targets = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter(Boolean)
    if (!targets.length) {
      check(`${label}: a building to walk up to`, false, 'none found in the layout')
      return null
    }
    let target = null
    let stood = null
    const misses = []
    for (const t of targets) {
      const r = await standOff(t, startR, t.approach ?? null)
      if (r.bearing != null) {
        target = t
        stood = r
        break
      }
      misses.push(`{x ${t.x.toFixed(2)}, z ${t.z.toFixed(2)}}: ${r.detail}`)
    }
    check(
      `${label}: an open approach to walk in on`,
      !!stood,
      stood
        ? `candidate ${misses.length + 1} of ${targets.length} at {x ${target.x.toFixed(2)}, z ${target.z.toFixed(2)}}, bearing ${stood.bearing.toFixed(3)} rad of ${stood.tried} tried`
        : `no clear approach to any of ${targets.length} — ${misses.join(' || ')}`,
    )
    if (!stood) return null
    await walkUntilStalled(target)
    const at = await standpoint()
    const verdict = judgeEavesColumn(await recordColumn(), { headroom: ROOF_HEADROOM })
    const where = `standing at {x ${at.x.toFixed(2)}, z ${at.z.toFixed(2)}}`
    // The near plane never gets INSIDE the roof: the first surface under the eye
    // is the ground he stands on, never thatch he has climbed into.
    check(`${label}: nothing hangs under the eye at the eaves`, verdict.belowClear, `${verdict.belowDetail}, ${where}`)
    // And whatever DOES hang over him clears the eye, the near plane and a margin.
    check(`${label}: the roof over him clears the head`, verdict.roofClears, `${verdict.roofDetail}, ${where}`)
    return { target, probe: { bearing: stood.bearing } }
  }

  /** The photograph a HUMAN judges: the eave line where roof meets wall, taken
   *  a stride back from the collider so the junction is in the picture rather
   *  than a nose-length of dark thatch. The MEASUREMENT above stays where the
   *  walk ended — this only moves the camera for the frame.
   *
   *  The journal is closed HERE, not only at entry: arriving in a port writes
   *  its own entries and the panel re-opens itself behind the walk, so the
   *  port frame came out a third covered by an open journal. Closing it at the
   *  shutter is the only place that holds. */
  const shootEaves = async (name, spot, label, back, pitch) => {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    await page.evaluate(
      ([t, b, step, up]) => {
        const p = window.__placePlayer
        p.x = t.x + Math.cos(b) * step
        p.z = t.z + Math.sin(b) * step
        p.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z))
        p.pitch = up
      },
      [spot.target, spot.probe.bearing, back, pitch],
    )
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
    await frame(name, { local: { x: spot.target.x, z: spot.target.z, y: spot.target.h }, label })
  }

  // The reported case: a Zulu rondavel, whose wide cone sits on a low wall.
  const villageEaves = await eavesCase(
    'zulu-village',
    'zulu village hut',
    () => {
      return (window.__placeLayout?.dwellings ?? [])
        .filter((d) => d.kind === 'hut')
        .map((d) => ({ x: d.x, z: d.z, h: d.h }))
    },
    6,
  )
  if (villageEaves) await shootEaves('349-eaves-village', villageEaves, 'the hut eaves from underneath', 4.2, 0.18)

  // The same in a port: the trade house, approached from its DOOR side, where
  // the awning hangs — the eave a player really walks under there.
  const portEaves = await eavesCase(
    'cairo',
    'cairo trade house',
    () => {
      return (window.__placeLayout?.interactives ?? [])
        .filter((i) => i.type !== 'villager')
        // The door faces local +Z, so the approach bearing is the door's own.
        .map((i) => ({ x: i.pos[0], z: i.pos[1], h: 3.2, approach: Math.atan2(Math.cos(i.rot ?? 0), Math.sin(i.rot ?? 0)) }))
    },
    8,
  )
  // Further back than the village hut: the trade house is a big block, and from
  // a hut's distance its wall simply fills the frame — a picture of masonry, in
  // which no human can judge whether the eave clears a head.
  if (portEaves) await shootEaves('349-eaves-port', portEaves, 'the trade house eaves from underneath', 11, 0.1)

  // The eaves were NOT fenced off: the cook-shelter over the village fire is a
  // roof one may still stand under — and from under it, it must be a SURFACE.
  // A compound people, because only they keep the canopy (the Zulu are
  // dome-dwellers and cook indoors — `src/systems/cookShelter.ts`).
  await enterFor('bemba-village')
  const fire = { x: -3.5, z: 2.5 } // VILLAGE_FIRE in src/scenes/place/layout.ts
  const stoodAtFire = await standOff(fire, 5)
  if (stoodAtFire.bearing == null) {
    check('cook shelter: an open approach to the fire', false, stoodAtFire.detail)
  } else {
    await walkUntilStalled(fire)
    // The same settled window (point 549): the fire is where the village GATHERS,
    // so a villager stepping between the eye and the canopy is the likeliest
    // thing in the whole suite to intercept an upward ray.
    const shelter = judgeShelterRoof(await recordColumn(), { headroom: ROOF_HEADROOM })
    check('the cook-shelter roof is still standable AND reads as a surface from below', shelter.ok, shelter.detail)
  }

  // A roof seen from below must be a real surface, not a back face one can see
  // through: the open thatch dome has no inner shell of its own.
  const thatchSides = await page.evaluate(() => {
    let total = 0
    let solid = 0
    window.__placeScene?.traverse((o) => {
      if (o.name !== 'hut-roof' || !o.material) return
      total++
      if (o.material.side === 2) solid++ // THREE.DoubleSide
    })
    return { total, solid }
  })
  check(
    'every thatch roof draws both faces (no see-through roof from underneath)',
    thatchSides.total > 0 && thatchSides.solid === thatchSides.total,
    `${thatchSides.solid}/${thatchSides.total} roof meshes double-sided`,
  )
}

await finishPolishSuite()
