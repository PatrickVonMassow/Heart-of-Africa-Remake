// Headless verification for CLAUDE.md §7.1.31 (settlement orientation after
// a gift and distant panorama wildlife, design.md §17/§2). Dev server only.
import { launchVerifyBrowser, waitForStable, waitForReadingStable, waitForSceneBuilt, assertBackend } from './_browser.mjs'
import { frameShutter, capturePixels, waitForSceneReady } from './frameSubject.mjs'
import { judgeFootingSeries, judgePitchSeries, MIN_SLOPED_SAMPLES } from './footingSeries.mjs'
import { judgeStanceSlip } from './stanceSlip.mjs'
import {
  AXIS_SAMPLES,
  CONFIRMED_RATIO,
  KID_HEIGHT,
  MIN_CHILD_PIXELS,
  OCCLUDED_RATIO,
  describeReading,
  judgeTagStandpoint,
} from './tagFrameReading.mjs'
import { judgeEavesColumn, judgeShelterRoof } from './eavesColumn.mjs'
import { FUSE_TOLERANCE, judgeLabelFusion, mergeFusionReadings } from './labelFusion.mjs'
import { READ_COUNT, READ_GAP_FRAMES, CONFIRM_READS, READ_GAP_NET_MS, READ_GAP_MS, SHOT_DRIFT_BAR, luminanceSamples, settleReading, shotDrift, shotReading } from './cropLuma.mjs'
import {
  CHILD_MOTION,
  holdsAGame,
  judgedEnough,
  rescueRate,
  shuffleWindows,
  traceLiveness,
} from './childMotionMetric.mjs'
import { sectionGate } from './sections.mjs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// Point 549: the same world every run. Unseeded, this suite built a new
// settlement layout per attempt and half its checks were a draw — see
// verify-seed.mjs for the measurement. The seed is applied by the LAUNCHER now
// (point 557), so this is the plain URL every other suite carries.
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
// SECTIONS (point 566). Every block below the boot prologue is a named block
// that owns the settlement it works in: `if (section('<slug>')) { … }`. Without
// a request every one runs, in file order, exactly as before; `--section=<slug>`
// (VERIFY_SECTION) runs ONE of them, which is how repairing a single check stops
// costing this suite's whole pass. The names are read out of THIS FILE by
// scripts/verify/sections.mjs, so an unknown one is refused with the list of the
// real ones — and the run is stamped PARTIAL, never counted as suite coverage.
const sections = sectionGate()
const { section } = sections
if (sections.banner()) console.log(sections.banner())

let failures = 0
const check = (name, ok, detail) => {
  // The section tag goes AFTER the ' — ' separator: the check's NAME is its
  // identity for the red ledger and the baseline classifier and must not change.
  const tail = [detail, sections.tag().trim()].filter(Boolean).join('  ')
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${tail ? ' — ' + tail : ''}`)
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
  // The probe BORROWS the camera — it walks the player onto every silhouette's
  // bearing — so it hands the pose back exactly as it found it. It used to reset
  // only x/z and leave the yaw on the last silhouette, and every frame taken
  // afterwards inherited that arbitrary aim: `93-orientation-highlight` was then
  // photographed from a camera facing a panorama animal, and whether a building
  // marker happened to be in the picture was luck (point 375 caught it).
  const pose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
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
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    // `pitch` is part of the pose since point 392 (the view looks up and down),
    // so restoring it restores the aim the caller had — before that it was a
    // stray field the probe itself added, and the undefined branch below is
    // what handed the object back unchanged then.
    if (saved.pitch === undefined) delete p.pitch
    else p.pitch = saved.pitch
  }, pose)
  check(
    `${label}: every panorama silhouette's feet meet drawn ground (point 181)`,
    rows.length >= 2 && rows.every((r) => r.ratio <= 1.05),
    `surface behind the feet [${rows.map((r) => `${r.ratio.toFixed(2)}×@${r.name}`).join(', ')}]`,
  )
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Point 375: every frame below states the subject it must show — the settlement
// it stands in, the building it is aimed at, the overlay it documents — and the
// shutter proves that subject is in the picture before the file is written.
const frame = frameShutter(page, OUT)
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

// SHARED STAGING (point 566). A section is a BLOCK SCOPE, so anything two of
// them use lives HERE, above them, never inside one of them — the shape
// scripts/verify/scope.test.mjs fails in the fast layer.

// Advance the scene by RENDERED frames. The headless frame time here swings
// between ~20 ms and well over a second, so every motion measurement below
// counts frames DRAWN rather than milliseconds elapsed: a fixed wall wait that
// happens to span a stall reads the same pose twice and reports the whole
// panorama as motionless, and one that spans a fast stretch moves a walker too
// little to measure. Both were seen turning green checks red on this suite.
const nextFrames = (n) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let left = count
        const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve())
        requestAnimationFrame(tick)
      }),
    n,
  )
/** Step frames until the page arrow `ready(arg)` reads true, capped. Returns
 *  whether it ever did — the caller ASSERTS on that, so a scene that never gets
 *  there fails loudly instead of quietly measuring nothing. */
const stepUntil = async (ready, arg = null, capFrames = 240) => {
  if (await page.evaluate(ready, arg)) return true
  for (let f = 0; f < capFrames; f++) {
    await nextFrames(1)
    if (await page.evaluate(ready, arg)) return true
  }
  return false
}

/**
 * Stand in `id` by a DIRECT place->place enter (no travel scene, so no panorama
 * capture — that is what the capture section's fallback check reads). It is the
 * setup the sections that work "wherever the suite happens to stand" own for
 * themselves; a no-op once the place is already the one asked for, so a whole
 * run walks exactly the path it always did.
 */
const goToPlace = async (id) => {
  if ((await page.evaluate(() => window.__game.getState().placeId)) === id) return
  await page.evaluate((want) => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
    g.enterPlace(want)
  }, id)
  await page
    .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, id, { timeout: 40000 })
    .catch(() => {})
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
}

// --- Giza skyline behind Cairo (design.md §4.4, point 82) ----------------------
// The game starts inside Cairo: the great pyramids stand as the western
// skyline silhouette (point-69 pattern, like Cape Town's Table Mountain).
if (section('giza-skyline')) {
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
    // No tilt: this frame's composition was accepted at the horizon. (A pitch
    // written here did nothing before point 392 gave the view a vertical axis;
    // now it would aim the camera, so the stray value is gone rather than
    // quietly re-framing an acceptance shot.)
    p.pitch = 0
  })
  await page.waitForTimeout(700)
  const skyBuf = await frame('100-cairo-giza-skyline', { place: 'cairo', label: 'the Giza skyline over Cairo' })

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
  await frame('105-cairo-panorama-giza-clear', { place: 'cairo', label: 'the Cairo panorama with the Giza skyline' })
}

// --- Panorama wildlife (design.md §2) ---------------------------------------------
if (section('panorama-wildlife')) {
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
    // Point 300: the body DIPS onto whichever leg is planted (that is what puts
    // the standing foot on the ground), so the anchor may sit below the line by
    // that dip — `drop` — and never above it.
    wInfo.length >= 3 && wInfo.every((w) => w.y >= w.visibleY - w.drop - 1e-3 && w.y <= w.visibleY + 0.2),
    `y vs line [${wInfo.map((w) => `${w.y.toFixed(2)}/${w.visibleY.toFixed(2)}-${(w.drop ?? 0).toFixed(2)}`).join(', ')}]`,
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
  await probeSilhouetteFooting(page, check, 'maasai-village (no capture)')
  // Point 255 (3): the silhouettes must WALK the horizon, not glide along it.
  // Their stride phase rides the ground they cover on the ring, so over the same
  // interval each one's phase advance divided by its (scale-normalised, point 286)
  // gait speed is the SAME constant — a wall-clock bob would advance them all
  // alike whatever their speed.
  {
    const sample = () =>
      page.evaluate(() =>
        Object.values(window.__placePanoramaWildlifeInfo ?? {}).map((w) => ({
          gait: w.gait,
          speed: w.gaitSpeed,
          cadence: w.cadence,
        })),
      )
    const before = await sample()
    // Wait for the STRIDE to actually advance rather than for a wall clock: on a
    // stalled headless frame a fixed 1200 ms wait read the identical phase twice
    // and reported every rate as 0.000 with a NaN spread.
    const walked = await stepUntil((b) => {
      const now = Object.values(window.__placePanoramaWildlifeInfo ?? {})
      return now.some((w, i) => Math.abs(w.gait - b[i]?.gait) > 0.2)
    }, before)
    const after = await sample()
    // Point 300: each species walks at its OWN cadence (derived from its leg), so
    // the shared constant is no longer the phase per unit walked but the phase per
    // unit walked DIVIDED by that cadence — one full cycle per stride, for every
    // animal whatever its legs. A clock-driven bob would advance them all alike.
    const rates = before
      .map((b, i) => ({ d: after[i].gait - b.gait, speed: b.speed, cadence: b.cadence }))
      .filter((r) => r.speed > 0 && r.cadence > 0)
      .map((r) => r.d / (r.speed * r.cadence))
    const spread = rates.length ? (Math.max(...rates) - Math.min(...rates)) / Math.max(...rates) : 1
    check(
      'the panorama silhouettes stride with the ground they cover, not the clock (points 255/300)',
      walked && rates.length >= 3 && rates.every((r) => r > 0) && spread < 0.02,
      walked
        ? `phase per unit walked ÷ cadence [${rates.map((r) => r.toFixed(3)).join(', ')}], spread ${(spread * 100).toFixed(1)}%`
        : 'MEASURED NOTHING — no silhouette advanced its stride within the frame cap',
    )
  }
  // Point 286: the silhouettes must WALK FORWARD, never backward. The facing is
  // derived from the ring velocity, so each visible silhouette's displacement over
  // an interval must project POSITIVELY onto its facing (forward = (sin yaw,
  // cos yaw)), and a moving one must actually advance. The reverted bug set the
  // yaw exactly π off the tangent, so every silhouette moonwalked.
  //
  // Stepped by RENDERED FRAMES, never by a wall clock: this scene occasionally
  // stalls for over a second headless, and a fixed 1200 ms wait that spans such a
  // stall reads the SAME pose twice and reports every silhouette as motionless —
  // the check then fails on "no one advanced" while the walk itself is fine (seen
  // once, passing on the very next run). Waiting for the drift to actually happen
  // removes the false red without touching what is asserted: a silhouette that
  // still refuses to advance within the cap fails exactly as before.
  {
    const snap = () =>
      page.evaluate(() => {
        const info = window.__placePanoramaWildlifeInfo ?? {}
        const out = {}
        for (const k of Object.keys(info)) out[k] = { x: info[k].x, z: info[k].z, yaw: info[k].yaw, visible: info[k].visible }
        return out
      })
    const b0 = await snap()
    for (let f = 0; f < 240; f++) {
      await nextFrames(1)
      const now = await snap()
      if (Object.keys(b0).some((k) => now[k] && Math.hypot(now[k].x - b0[k].x, now[k].z - b0[k].z) > 0.05)) break
    }
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
  // Point 300: the feet must be PLANTED, not skating. Sample a tracked foot's
  // WORLD position across a series of frames and compare its travel with the
  // body's over the same intervals, counting only the intervals in which that leg
  // never left the ground. A planted foot holds its spot while the body walks on;
  // the old over-driven cadence dragged it along at a large fraction of the
  // body's speed.
  //
  // Point 549 — THE SERIES IS RECORDED IN THE PAGE, ONE SAMPLE PER DRAWN FRAME.
  // The old sampler stepped the scene from Node, one `page.evaluate` per frame,
  // until some animal had covered 5 % of its stride. The scene keeps drawing
  // through those round trips, so the interval was as long as the host was slow —
  // and on this container it grew long enough for the tracked leg to lift, swing
  // and be planted a whole cycle on between two reads. Asking only whether the
  // leg was down at each END then read that replanting as one huge slip: the same
  // unchanged scene reported 0.278, 0.603, 0.727, 0.972 and 1.549 across eight
  // attempts on an idle host, against a bar of 0.25. Recording every frame inside
  // the page makes the sample window the frame it actually is, and lets the
  // judgment demand an UNBROKEN stance across the whole interval, so a wrap is
  // not filtered out — it cannot occur. The judgment itself is the pure,
  // Vitest-covered `judgeStanceSlip` (scripts/verify/stanceSlip.mjs). The
  // renderer now keeps a stance contact in world space even as its body turns,
  // so the judgment reads that world travel directly; compensating for a rigid
  // body's yaw would manufacture movement for a contact whose coordinates did
  // not change. The interval population and the under-0.25 bar are unchanged.
  {
    /** Record the tracked walkers frame by frame, inside the page: one round trip
     *  for the whole series, so no sample window can be stretched by the host.
     *  The reader is named rather than passed as a function — a page-side `new
     *  Function` would be both a lint finding and an indirection for nothing. */
    const recordGait = (kind, frames, maxMs) =>
      page.evaluate(
        ([which, n, cap]) =>
          new Promise((res) => {
            const read = () => {
              const out = {}
              const info = (which === 'panorama' ? window.__placePanoramaWildlifeInfo : window.__placeGoatGait) ?? {}
              for (const k of Object.keys(info)) {
                const w = info[k]
                if (w.visible === false) continue
                out[k] = { x: w.x, z: w.z, yaw: w.yaw, foot: w.foot, stance: w.stance, stride: w.stride }
              }
              return out
            }
            const samples = []
            const t0 = performance.now()
            const step = () => {
              samples.push(read())
              if (samples.length >= n || performance.now() - t0 >= cap) return res(samples)
              requestAnimationFrame(step)
            }
            requestAnimationFrame(step)
          }),
        [kind, frames, maxMs],
      )

    const trackFeet = async (kind, label) => {
      // In chunks, so a fast host stops as soon as it has a verdict's worth of
      // intervals and a slow one still gets its walking time. The stop condition
      // is the MEASUREMENT, never a frame count: a goat crosses its pen at
      // ~0.12 units a second, so how many frames one stance lasts is the host's
      // business, not the check's.
      let samples = []
      let judged = judgeStanceSlip(samples)
      for (let chunk = 0; chunk < 4 && judged.intervals < 8; chunk++) {
        samples = samples.concat(await recordGait(kind, 300, 12000))
        judged = judgeStanceSlip(samples)
      }
      check(`${label}: the planted foot holds its ground spot while the body walks over it (point 300)`, judged.enough && judged.worst < 0.25, judged.detail)
    }
    await trackFeet('panorama', 'panorama silhouette')
    await trackFeet('goat', 'settlement walker (goat)')
  }
  // Point 413: the settlement animals must stay OUT of the settlement's solids and
  // out of one another. The report was a goat crossing a compound fence and, the
  // same night, "wildes Durcheinanderclippen" — goats standing inside one another
  // and inside a tent. Sampled as a SERIES over the walk, never one instant: a
  // wandering animal meets a wall only now and then, and a single frame that
  // happened to catch it in open ground would prove nothing.
  {
    const readOverlap = () =>
      page.evaluate(() => {
        const cs = window.__placeLayout?.colliders ?? []
        const info = window.__placeGoatGait ?? {}
        const ids = Object.keys(info)
        const R = 0.3 // WALKER_RADIUS — the radius the animals move with
        const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
        // How deep a mover at (x,z) sits inside this collider; ≤ 0 is clear.
        const depth = (c, x, z) => {
          if (c.kind === 'box') {
            const sin = Math.sin(c.rot)
            const cos = Math.cos(c.rot)
            const dx = x - c.x
            const dz = z - c.z
            const lx = cos * dx - sin * dz
            const lz = sin * dx + cos * dz
            return R - Math.hypot(lx - clamp(lx, -c.hx, c.hx), lz - clamp(lz, -c.hz, c.hz))
          }
          if (c.kind === 'segment') {
            const ex = c.x2 - c.x1
            const ez = c.z2 - c.z1
            const l2 = ex * ex + ez * ez
            const t = l2 < 1e-12 ? 0 : clamp(((x - c.x1) * ex + (z - c.z1) * ez) / l2, 0, 1)
            return c.r + R - Math.hypot(x - (c.x1 + ex * t), z - (c.z1 + ez * t))
          }
          return c.r + R - Math.hypot(x - c.x, z - c.z)
        }
        let solid = -Infinity
        let pair = Infinity
        for (const id of ids) {
          const g = info[id]
          for (const c of cs) solid = Math.max(solid, depth(c, g.x, g.z))
        }
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = info[ids[i]]
            const b = info[ids[j]]
            pair = Math.min(pair, Math.hypot(a.x - b.x, a.z - b.z))
          }
        }
        return { animals: ids.length, solid, pair }
      })
    const series = []
    for (let k = 0; k < 20; k++) {
      series.push(await readOverlap())
      await nextFrames(3)
    }
    const solids = series.filter((s) => s.animals >= 1)
    const pairs = series.filter((s) => s.animals >= 2)
    const deepest = solids.length > 0 ? Math.max(...solids.map((s) => s.solid)) : 0
    const closest = pairs.length > 0 ? Math.min(...pairs.map((s) => s.pair)) : 0
    check(
      'no settlement animal stands inside a fence, hut or prop (point 413)',
      solids.length >= 10 && deepest < 0.02,
      solids.length >= 10
        ? `${solids.length} samples, deepest penetration ${deepest.toFixed(3)} m`
        : `MEASURED NOTHING — only ${solids.length} samples carried an animal`,
    )
    check(
      'no settlement animal stands inside another one (point 413)',
      pairs.length >= 10 && closest > 0.45,
      pairs.length >= 10
        ? `${pairs.length} samples, closest pair ${closest.toFixed(2)} m`
        : `MEASURED NOTHING — only ${pairs.length} samples carried two animals`,
    )
    // The picture behind the numbers. The probe borrows the camera and hands the
    // pose back exactly as it found it (the lesson of point 375).
    const aimed = await page.evaluate(() => {
      const p = window.__placePlayer
      const herd = Object.values(window.__placeGoatGait ?? {})
      if (!p || herd.length === 0) return null
      const pose = { x: p.x, z: p.z, yaw: p.yaw }
      const cx = herd.reduce((s, g) => s + g.x, 0) / herd.length
      const cz = herd.reduce((s, g) => s + g.z, 0) / herd.length
      const d = Math.hypot(cx - p.x, cz - p.z) || 1
      p.x = cx - ((cx - p.x) / d) * 7
      p.z = cz - ((cz - p.z) / d) * 7
      p.yaw = Math.atan2(-(cx - p.x), -(cz - p.z))
      return { pose, cx, cz }
    })
    if (aimed) {
      await nextFrames(2)
      // The subject is the HERD, so the shutter projects it (point 375): a frame
      // named after the goats must have the goats in it.
      await frame('143-village-goat-separation', {
        local: { x: aimed.cx, y: 0.5, z: aimed.cz },
        label: 'the goats, each on its own ground',
      })
      await page.evaluate((pose) => {
        const p = window.__placePlayer
        if (!p) return
        p.x = pose.x
        p.z = pose.z
        p.yaw = pose.yaw
      }, aimed.pose)
    }
  }
}
// --- The hypothesis over the speaker's head (design.md §13.4, point 485) ------
// The lifetime and the note binding are pinned in the Vitest layer. What only a
// browser can answer is the ATTACHMENT: the note must ride on the FIGURE that
// speaks, not sit at a world coordinate. The delivered bug was exactly that —
// R3F keeps its objects' local matrices itself, so a group moved from a frame
// callback that does not publish the move is read at the position it was born
// with, and every label stood at the scene origin. Measured here against the
// figure's own projected anchor, in the SAME evaluate as the rendered label's
// DOM box, so no frame passes between deciding and measuring.
if (section('speech-hypothesis')) {
  await goToPlace('maasai-village')
  const COME = 'BA-BA-ba-ba-ba'
  const pose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  // The figures are named for this (point 485), so they can be collected out of
  // the scene graph and their world translation read off the matrix.
  const candidates = await page.evaluate(() => {
    const scene = window.__placeScene
    if (!scene) return []
    const found = []
    scene.traverse((o) => {
      if (o.name === 'inhabitant' && found.length < 10) found.push(o)
    })
    window.__speechProbeFigures = found
    return found.map((o) => {
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      return { x: e[12], y: e[13], z: e[14] }
    })
  })
  // The picture is the evidence here, so the speaker must be one the camera can
  // SEE: a figure standing behind a hut still carries its label (drei's <Html>
  // is not depth-tested), and a frame of a note floating over a roof would prove
  // the attachment to nobody. Each candidate is stood in front of and ray-probed
  // against the rendered scene — the same instrument the silhouette footing uses.
  // The first surface drawn along the sight line must be the FIGURE ITSELF, and
  // that is what its DISTANCE says: a hut wall in front reads far too near, and a
  // ray that sails PAST a smaller figure hits the ground far beyond it. Hence the
  // ratio is bounded on BOTH sides — "nothing in front" alone accepted a miss,
  // and a frame of a note over an empty patch of village was the result.
  // Every position here is read LIVE: these figures WALK, and a probe cast at
  // the spot one was standing on when the list was built misses it entirely
  // once a loaded machine lets a second pass between. That stale target is what
  // made this selection find nobody at all on a busy run.
  // Two ranges, because standing 5 m INWARD of a figure can land the camera in a
  // hut — the probe then reads that wall, and a figure the player could plainly
  // walk up to is rejected for the geometry behind the lens. The nearer range is
  // tried before the candidate is given up on.
  const STAND_BACKS = [5, 3.5]
  /** Stand `back` in front of figure `i`, on the outward bearing, and report what
   *  the frame draws at its chest. */
  const aimAt = async (i, STAND_BACK) => {
    await page.evaluate(
      ({ idx, back }) => {
        const figure = window.__speechProbeFigures?.[idx]
        const p = window.__placePlayer
        if (!figure || !p) return
        figure.updateWorldMatrix(true, false)
        const e = figure.matrixWorld.elements
        const at = { x: e[12], z: e[14] }
        // Stand between the settlement centre and the figure, looking OUTWARD:
        // the open village edge then lies behind the speaker instead of a hut
        // wall, so the note and the head under it read against the sky. Falls
        // back to the current bearing for a figure standing on the centre itself.
        const out = Math.hypot(at.x, at.z)
        const len = Math.hypot(at.x - p.x, at.z - p.z) || 1
        const ux = out > 1 ? at.x / out : (at.x - p.x) / len
        const uz = out > 1 ? at.z / out : (at.z - p.z) / len
        p.x = at.x - ux * back
        p.z = at.z - uz * back
        p.pitch = 0
        // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
        p.yaw = Math.atan2(at.x - p.x, at.z - p.z) + Math.PI
      },
      { idx: i, back: STAND_BACK },
    )
    await nextFrames(2)
    return page.evaluate((idx) => {
      const figure = window.__speechProbeFigures?.[idx]
      if (!figure || !window.__placeRayHit) return null
      figure.updateWorldMatrix(true, false)
      const e = figure.matrixWorld.elements
      // THIS figure's chest, and against its position NOW — it may have walked on
      // since the pose was set. The height is taken from the group's own scale
      // rather than a flat metre: the children are barely 0.9 m tall (point 481),
      // so a metre above the feet sailed clean over every one of them and reported
      // the ground beyond as the obstruction — half the candidate list could never
      // qualify, whatever the picture showed.
      const scaleY = Math.hypot(e[4], e[5], e[6])
      const h = window.__placeRayHit(e[12], e[13] + Math.max(0.4, scaleY), e[14])
      return { ratio: h.hitDistance == null ? null : h.hitDistance / h.targetDistance, name: h.hitName }
    }, i)
  }
  let speaker = null
  let speakerIndex = -1
  let speakerBack = STAND_BACKS[0]
  const probes = []
  for (let i = 0; i < candidates.length && speakerIndex < 0; i++) {
    for (const back of STAND_BACKS) {
      const hit = await aimAt(i, back)
      probes.push(hit ? `${hit.ratio == null ? 'sky' : hit.ratio.toFixed(2)}@${hit.name}` : 'none')
      if (hit && hit.ratio !== null && hit.ratio >= 0.85 && hit.ratio <= 1.15) {
        // The pose that VALIDATED it is the pose the block goes on to measure
        // from, so the accepting aim is deliberately the last one performed —
        // and the range it was validated at is the one the shutter re-aims with.
        speaker = candidates[i]
        speakerIndex = i
        speakerBack = back
        break
      }
    }
  }
  check(
    'the settlement offers a figure in clear view to speak over (point 485)',
    !!speaker,
    `chosen #${speakerIndex} of ${candidates.length} named figures; sight lines [${probes.join(', ')}]`,
  )
  if (speaker) {
    // Speak over THAT figure, not over whichever one the scene lists first: the
    // chosen object is given a unique name for the dev hook to resolve. The
    // channel stores the object itself, so a later React render restoring the
    // shared name cannot detach the label.
    // A label shows only over speech the player has ALREADY observed, so the
    // utterance is heard first — that gate is what the label is worth.
    const spoke = await page.evaluate(
      ({ u, idx }) => {
        window.__game.getState().hearUtterance(u)
        const figure = window.__speechProbeFigures?.[idx]
        if (!figure) return false
        figure.name = 'speech-probe-figure'
        // A long lifetime on purpose: the LIFETIME is pure-tested in Vitest, and
        // a label that expired mid-measurement would only make this check flake.
        const ok = window.__speech?.speak('probe-speaker', [u], 'speech-probe-figure', 120) === true
        figure.name = 'inhabitant'
        return ok
      },
      { u: COME, idx: speakerIndex },
    )
    check('a figure can speak over its head at all (point 485)', spoke, `spoke ${spoke}`)
    await nextFrames(3)
    // The anchor point, the figure's own body and the rendered label's DOM box
    // are read in ONE evaluate, so no frame passes between deciding where the
    // speaker is and measuring where its note landed.
    const read = () =>
      page.evaluate((idx) => {
        const pt = window.__speech?.anchorScreen('probe-speaker')
        // THIS speaker's note, not whichever the DOM lists first: since the
        // children speak at their game (point 481) a settlement holds several
        // notes at once, and the unqualified selector measured a child's.
        const el = document.querySelector('.speech-label[data-speaker="probe-speaker"]')
        const figure = window.__speechProbeFigures?.[idx]
        if (!pt || !el || !figure) return null
        figure.updateWorldMatrix(true, false)
        const e = figure.matrixWorld.elements
        const cam = window.__placeCamera
        // The chest at THIS figure's own scale, not a flat metre: a metre above
        // a child's feet is over its head, and once the note rides close over
        // that head (point 582) the two would read as one point.
        const chest = Math.max(0.4, Math.hypot(e[4], e[5], e[6]))
        const v = new (Object.getPrototypeOf(cam.position).constructor)(e[12], e[13] + chest, e[14])
        v.project(cam)
        const r = el.getBoundingClientRect()
        return {
          dx: r.left + r.width / 2 - pt.x,
          dy: r.top + r.height / 2 - pt.y,
          height: r.height,
          bodyX: ((v.x + 1) / 2) * window.innerWidth,
          bodyY: ((1 - v.y) / 2) * window.innerHeight,
          vw: window.innerWidth,
          vh: window.innerHeight,
          labelBottom: r.bottom,
          syllables: el.querySelector('.syllables')?.textContent ?? '',
          reading: el.querySelector('.reading')?.textContent ?? '',
        }
      }, speakerIndex)
    const samples = []
    for (let k = 0; k < 8; k++) {
      const s = await read()
      if (s) samples.push(s)
      await nextFrames(1)
    }
    // Both allowances are expressed in the LABEL'S OWN height, which drei's
    // distanceFactor scales with the distance — a screen constant would pass at
    // one range and fail at another, and this scene picks its speaker afresh
    // every run. Horizontally the label is centred on its anchor and typically
    // lands within a pixel of it; the slack is there because drei's <Html> reads
    // the world matrix in a frame callback of its OWN, so on a frame where it
    // runs first the note trails the walking figure by exactly one step (10 px
    // measured, against a body some 95 px wide at this range). Vertically the
    // CSS lifts the box by 8 px, scaled the same way. What this rejects is the
    // bug it exists for: a label left at the scene origin, hundreds of pixels
    // from its speaker or off the viewport altogether.
    const worstX = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dx) - 0.5 * s.height)) : Infinity
    const worstY = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dy) - 0.35 * s.height)) : Infinity
    check(
      'the note rides on the figure that speaks, not on a world coordinate (point 485)',
      samples.length >= 6 && worstX <= 0 && worstY <= 0,
      samples.length >= 6
        ? `worst sideways offset past half the label height ${worstX.toFixed(1)} px, worst vertical offset past the scaled lift ${worstY.toFixed(1)} px, over ${samples.length} frames`
        : `MEASURED NOTHING — only ${samples.length} frames carried both a label and its anchor`,
    )
    // And the picture must SHOW that: the speaker's own body stands inside the
    // frame, directly under its note. A label over an empty patch of village
    // would satisfy every number above and prove nothing to a human eye.
    const underNote = samples.filter(
      (s) => s.bodyX > 0 && s.bodyX < s.vw && s.bodyY > s.labelBottom && s.bodyY < s.vh,
    )
    check(
      'the speaking figure itself stands in the frame, under its note (point 485)',
      underNote.length >= 6,
      samples.length
        ? `body at (${samples[0].bodyX.toFixed(0)}, ${samples[0].bodyY.toFixed(0)}), label bottom ${samples[0].labelBottom.toFixed(0)} — ${underNote.length}/${samples.length} frames`
        : 'MEASURED NOTHING',
    )
    // Point 485 (1)/(4): the syllables stand BESIDE the reading, never instead of
    // it, and an unwritten reading reads `???`.
    const last = samples[samples.length - 1] ?? { syllables: '', reading: '' }
    check(
      'the label shows the syllables beside the reading, `???` where none is written (point 485)',
      last.syllables === COME && last.reading === '???',
      JSON.stringify(last),
    )
    // Point 485 (3): editing the note in the journal changes the label at once —
    // one source seen twice, nothing copied onto the label.
    await page.evaluate((u) => window.__game.getState().setUtteranceHypothesis(u, 'come here'), COME)
    await nextFrames(2)
    const afterEdit = await read()
    check(
      'a reading written in the journal stands over the head immediately (point 485)',
      !!afterEdit && afterEdit.reading === 'come here',
      JSON.stringify(afterEdit),
    )
    // Re-aim before the shutter: the speaker has kept walking through the
    // measurement, and the frame is the evidence that its note stands over ITS
    // head — so the camera is put back in front of it, wherever it is now.
    await aimAt(speakerIndex, speakerBack)
    // The subject is where the figure stands NOW — it may have walked on since
    // it was chosen — so the shutter judges the frame against the live anchor.
    const at = await page.evaluate((idx) => {
      const figure = window.__speechProbeFigures?.[idx]
      if (!figure) return null
      figure.updateWorldMatrix(true, false)
      const e = figure.matrixWorld.elements
      const label = window.__speech?.labels().find((l) => l.speakerId === 'probe-speaker')
      return {
        x: e[12],
        y: e[13],
        z: e[14],
        // The note's OWN rise, so the shutter aims where the label actually is
        // rather than at a height written down here (point 582 moved it).
        rise: label?.height ?? null,
        mark: figure.userData?.actor?.height ?? null,
        scale: Math.hypot(e[0], e[1], e[2]),
      }
    }, speakerIndex)
    // Point 582: the note floats a hand's breadth over THAT figure's head, at
    // the scale it is drawn — measured in WORLD units against the figure's own
    // record, the same one the Ctrl labels read. A label that fell back to a
    // grown figure's height over a child would stand out here at once.
    check(
      'the note floats close over the speaker’s own head, at its own scale (point 582)',
      !!at && at.rise !== null && at.mark !== null &&
        at.rise > at.mark * at.scale && at.rise - at.mark * at.scale <= 0.5,
      at ? JSON.stringify(at) : 'no speaker',
    )
    await frame('146-speech-hypothesis-label', {
      local: {
        x: (at ?? speaker).x,
        y: (at ?? speaker).y + (at?.rise ?? 1.7),
        z: (at ?? speaker).z,
      },
      label: 'the reading over the speaking figure',
    })
    await page.evaluate((u) => {
      window.__game.getState().setUtteranceHypothesis(u, '')
      window.__speech?.clear()
      delete window.__speechProbeFigures
    }, COME)
  }
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    if (saved.pitch !== undefined) p.pitch = saved.pitch
  }, pose)
}
// --- Guessing a meaning where it is spoken (design.md §13.4, point 588) -------
// The picking rule, the dialog and the note it writes are pinned in the Vitest
// layer. What ONLY a browser can answer is the input path: a real left click on
// the settlement view opens the dialog at all, the pointer lock is given up for
// it and asked back on close, and real keystrokes land in the field. The lock
// itself cannot be exercised here — it is deliberately never engaged under
// browser automation (system-Chrome headless grabs the real OS cursor), so what
// is read is the game's own DECISION counter, while the click, the focus and
// the typing are the genuine article.
if (section('speech-guess')) {
  await goToPlace('maasai-village')
  const GUESS_UTTERANCE = 'BA-BA-ba-ba-ba'
  const guessPose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  // Stage ONE speaker a few steps in front of the player: the click takes the
  // NEAREST speaker, so standing near him is what the highlight is for — and at
  // a distance a player really walks up to, since the note's size follows it.
  const staged = await page.evaluate((u) => {
    const scene = window.__placeScene
    const p = window.__placePlayer
    if (!scene || !p) return false
    let figure = null
    scene.traverse((o) => {
      if (!figure && o.name === 'inhabitant') figure = o
    })
    if (!figure) return false
    figure.updateWorldMatrix(true, false)
    const e = figure.matrixWorld.elements
    p.x = e[12] + 4
    p.z = e[14]
    p.pitch = 0
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(e[12] - p.x, e[14] - p.z) + Math.PI
    // A label shows only over speech the player has ALREADY observed, and a
    // long lifetime keeps this off the expiry clock, which is pure-tested.
    window.__game.getState().hearUtterance(u)
    window.__game.getState().setUtteranceHypothesis(u, '')
    figure.name = 'guess-probe-figure'
    const ok = window.__speech?.speak('guess-speaker', [u], 'guess-probe-figure', 120) === true
    figure.name = 'inhabitant'
    return ok
  }, GUESS_UTTERANCE)
  check('a figure can be staged to speak beside the player (point 588)', staged, `staged ${staged}`)
  await nextFrames(4)
  // What the player sees: which note is highlighted, and what stands under it.
  const highlight = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.speech-label'))
    const targeted = all.filter((el) => el.classList.contains('targeted'))
    const one = targeted[0]
    return {
      labels: all.length,
      targeted: targeted.length,
      speaker: one?.getAttribute('data-speaker') ?? null,
      invite: one?.querySelector('.speech-invite')?.textContent ?? '',
      strayInvites: all.filter(
        (el) => !el.classList.contains('targeted') && el.querySelector('.speech-invite'),
      ).length,
      syllables: Array.from(one?.querySelectorAll('.syllables') ?? []).map((s) => s.textContent),
    }
  })
  check(
    'exactly one note is highlighted, and it is the speaker beside the player (point 588)',
    highlight.targeted === 1 && highlight.speaker === 'guess-speaker',
    JSON.stringify(highlight),
  )
  check(
    'the invitation stands under the highlighted note alone, and does not shout (point 588)',
    highlight.invite.length > 0 &&
      highlight.invite !== highlight.invite.toUpperCase() &&
      highlight.strayInvites === 0,
    `invite ${JSON.stringify(highlight.invite)}, invitations on unhighlighted notes ${highlight.strayInvites}`,
  )
  await frame('148-speech-guess-invitation', {
    element: '.speech-label.targeted',
    label: 'the highlighted note of the nearest speaker, inviting the guess',
  })
  // A point of the settlement view the click can actually land on: the notes are
  // drawn in an overlay of their own, and a click that hit one would prove
  // nothing about the canvas the player clicks.
  const spot = await page.evaluate(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    for (const [fx, fy] of [[0.2, 0.55], [0.8, 0.55], [0.2, 0.35], [0.5, 0.62]]) {
      const x = Math.round(w * fx)
      const y = Math.round(h * fy)
      if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y }
    }
    return null
  })
  check('the settlement view offers a spot to click on (point 588)', !!spot, JSON.stringify(spot))
  if (spot) {
    const lockBefore = await page.evaluate(() => ({ ...window.__placeLock }))
    await page.mouse.click(spot.x, spot.y)
    await nextFrames(2)
    const opened = await page.evaluate(() => {
      const dialog = document.querySelector('.dialog.speech-guess')
      return {
        open: !!dialog,
        spoken: Array.from(dialog?.querySelectorAll('.utterance') ?? []).map((u) =>
          Array.from(u.querySelectorAll('span'))
            .map((s) => s.textContent)
            .join('-'),
        ),
        focused: document.activeElement?.className ?? '',
        lock: { ...window.__placeLock },
      }
    })
    check(
      'a left click on the settlement opens the guess for the highlighted speaker (point 588)',
      opened.open && opened.spoken.join(' ') === highlight.syllables.join(' '),
      `${JSON.stringify(opened.spoken)} against the note's ${JSON.stringify(highlight.syllables)}`,
    )
    check(
      'the pointer is given back when the dialog opens (point 588)',
      opened.lock.releases > lockBefore.releases,
      `releases ${lockBefore.releases} → ${opened.lock.releases}`,
    )
    check(
      'the field takes the keyboard the moment the dialog stands (point 588)',
      String(opened.focused).includes('hypothesis'),
      `focus on ${JSON.stringify(opened.focused)}`,
    )
    // The genuine article: real keystrokes, not a synthetic change event.
    await page.keyboard.type('come here')
    const typed = await page.evaluate(
      () => document.querySelector('.dialog.speech-guess .hypothesis')?.value ?? null,
    )
    check(
      'what the player types reaches the field (point 588)',
      typed === 'come here',
      `field reads ${JSON.stringify(typed)}`,
    )
    await frame('149-speech-guess-dialog', {
      element: '.dialog.speech-guess',
      label: 'the guess at what the villager just said',
    })
    await page.keyboard.press('Enter')
    await nextFrames(2)
    const saved = await page.evaluate(
      (u) => ({
        open: !!document.querySelector('.dialog.speech-guess'),
        reading: window.__game.getState().communication.heard[u]?.hypothesis ?? null,
        lock: { ...window.__placeLock },
      }),
      GUESS_UTTERANCE,
    )
    check(
      'Enter writes the reading into the same note the journal keeps (point 588)',
      !saved.open && saved.reading === 'come here',
      JSON.stringify(saved),
    )
    check(
      'the pointer is asked back when the dialog closes (point 588)',
      saved.lock.grabs > lockBefore.grabs,
      `grabs ${lockBefore.grabs} → ${saved.lock.grabs}`,
    )
    // And Escape leaves the note exactly as it was.
    await page.mouse.click(spot.x, spot.y)
    await nextFrames(2)
    const reopened = await page.evaluate(() => !!document.querySelector('.dialog.speech-guess'))
    if (reopened) await page.keyboard.type(' and never mind')
    await page.keyboard.press('Escape')
    await nextFrames(2)
    const cancelled = await page.evaluate(
      (u) => ({
        open: !!document.querySelector('.dialog.speech-guess'),
        reading: window.__game.getState().communication.heard[u]?.hypothesis ?? null,
      }),
      GUESS_UTTERANCE,
    )
    check(
      'Escape closes the guess and leaves the note unchanged (point 588)',
      reopened && !cancelled.open && cancelled.reading === 'come here',
      `reopened ${reopened}, ${JSON.stringify(cancelled)}`,
    )
  }
  await page.evaluate(
    ({ u, saved }) => {
      window.__game.getState().setUtteranceHypothesis(u, '')
      window.__speech?.clear()
      const p = window.__placePlayer
      if (!p || !saved) return
      p.x = saved.x
      p.z = saved.z
      p.yaw = saved.yaw
      if (saved.pitch !== undefined) p.pitch = saved.pitch
    },
    { u: GUESS_UTTERANCE, saved: guessPose },
  )
}
// Point 300, slope footing: a silhouette on a dune must lie ON the incline —
// its body pitched over its own wheelbase, and each foot then seated on the
// ground under ITS OWN spot — so the planted foot touches the ground drawn
// under it instead of hovering above it. Measured as the vertical
// gap between the tracked foot and that ground, in units of the animal's own
// height, and specifically on the silhouettes standing on a genuinely SLOPED
// spot (front and back footing differ).
// It is measured as a SERIES, and where the slope actually is (point 412). The
// old check read ONE instant at maasai-village and passed while reporting
// `slope over the wheelbase [0.00 x4]` and `pitch [0.000 x4]`: the silhouettes
// there stand on the flat disc-horizon line, so the seating under test was a
// NO-OP in the measured frame — a verdict without its population, the same
// class as retrospective §3.47 one step on. Now many frames are sampled, the
// samples that stood on genuinely sloped ground are COUNTED, and a count of
// zero FAILS. `judgeFootingSeries` holds that decision and is pure-tested in
// scripts/verify/footingSeries.test.mjs.
if (section('panorama-slope-footing')) {
  // The TRACKED leg is only planted for half of each cycle, and a single sampled
  // instant can catch every silhouette mid-swing. Reading the feet in the SAME
  // evaluate as the test keeps the pose from changing between deciding and
  // measuring.
  const readFeet = () =>
    page.evaluate(() =>
      Object.values(window.__placePanoramaWildlifeInfo ?? {})
        .filter((w) => w.visible !== false && w.foot && w.stance)
        .map((w) => ({
          gap: w.footGap,
          h: w.worldHeight,
          slope: Math.abs((w.frontY ?? 0) - (w.backY ?? 0)),
          pitch: w.pitch,
          stretch: w.stretch,
        })),
    )
  const sampleSeries = async (frames) => {
    const out = []
    for (let f = 0; f < frames; f++) {
      out.push(...(await readFeet()))
      await nextFrames(2)
    }
    return out
  }
  const goTo = async (id) => {
    await page.evaluate((want) => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
      g.enterPlace(want)
    }, id)
    await page
      .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, id, { timeout: 40000 })
      .catch(() => {})
    await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 25000 }).catch(() => {})
  }
  // Settlements whose backdrop relief RISES, measured: pedi-village puts every
  // stance sample on a slope (Drakensberg foothills), sidama-village and
  // capetown a smaller share. maasai-village, where this check used to run, and
  // berber-village both measure 0.000 across 150 samples — the flat disc line.
  // The first place that supplies a population is used; falling through them all
  // is itself a failure, never a quiet pass.
  const SLOPED_PLACES = ['pedi-village', 'sidama-village', 'capetown']
  let series = []
  let where = null
  for (const id of SLOPED_PLACES) {
    await goTo(id)
    series = await sampleSeries(30)
    where = id
    if (judgeFootingSeries(series).sloped >= MIN_SLOPED_SAMPLES) break
  }
  // The place goes in the DETAIL, never in the check NAME: the flake and
  // baseline classifiers match checks by name, and a name that moved with the
  // sampling place would read as a different check every run.
  const footing = judgeFootingSeries(series)
  check(
    'every planted panorama foot touches the ground drawn under it, on SLOPED ground (points 300/412)',
    footing.ok,
    `at ${where} — ${footing.detail}`,
  )
  const leaning = judgePitchSeries(series)
  check(
    'no panorama body leans past a stand-able incline, however steep the backdrop reads (points 300/412)',
    leaning.ok,
    `at ${where} — ${leaning.detail}`,
  )
  // Hand the scene back to the settlement the rest of this suite expects.
  await goTo('maasai-village')
}

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

// --- Orientation after a gift (design.md §17) ---------------------------------------
if (section('orientation-markers')) {
  await goToPlace('maasai-village')
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
  // AIM the camera at a marked building before photographing its marker. The
  // frame used to be shot from wherever the previous check had left the camera,
  // so whether a marker was in the picture at all was chance — the shutter
  // (point 375) refused the frame and that is how the missing aim was found.
  // The chief's hut is the marker the shutter judges (it is the first
  // `.building-highlight` in DOM order, the layout's first non-villager
  // interactive), so stand back from it on its own bearing and face it.
  const marked = await page.evaluate(() => {
    const it = (window.__placeLayout?.interactives ?? []).find((i) => i.type !== 'villager')
    if (!it) return null
    const p = window.__placePlayer
    const [mx, mz] = it.pos
    const d = Math.hypot(mx, mz) || 1
    // Stand 14 m from the hut on the line toward the settlement centre — the open
    // ground every layout keeps clear — and far enough back that the marker at
    // ~5.6 m sits well inside the vertical field of view (the place camera builds
    // its rotation from yaw alone, so there is no pitch to tilt up with).
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
}

// --- Port skyline landmarks (design.md §4.4 Part C) ---------------------------
// Cape Town: Table Mountain stands as a flat-topped massif behind the town.
if (section('port-skylines')) {
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
  await frame('96-capetown-table-mountain', { place: 'capetown', label: 'Cape Town under Table Mountain' })

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
      p.pitch = 0 // level: the minaret is in frame from here (see the Cairo note)
      // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
      p.yaw = Math.atan2(m.x - p.x, m.z - p.z) + Math.PI
    }, mosque)
    await page.waitForTimeout(600)
    await frame('97-timbuktu-djinguereber', { local: { x: mosque.x, z: mosque.z, y: 4 }, label: 'the Djinguereber mosque' })
  }
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
if (section('travel-panorama-capture')) {
  await goToPlace('maasai-village')
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
    // Point 387 — red on `main` at "bottom-quarter opaque 0.000", i.e. NOTHING
    // opaque in the band at all. VERDICT: the PRODUCT was wrong, and neither the
    // bar nor the staging. The band really was empty: point 545 found the shot
    // compiling its pipelines asynchronously (0 of 92 objects ready at the
    // shutter, 0 draw calls) and all four sectors covering the whole band
    // because a per-sector renderer viewport is ignored when drawing into a
    // render target. Both are fixed in panoramaCapture.ts; the bar of 0.7 is
    // UNCHANGED.
    // MEASURED 07.08.2026, quiet machine: 1.000 on WebGL 2 and 1.000 on WebGPU —
    // the near ground fills the band's bottom quarter completely, so this
    // criterion is nowhere near its own edge either.
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
  await frame('99-travel-panorama', { place: 'nubian-village', label: 'the surroundings panorama' })

  // Magenta-pillar orientation proof: the probe stood due west of the
  // capture point, so its colour must show looking WEST and not EAST.
  const countMagenta = async () => {
    const buf = await capturePixels(page, 'panorama magenta-pillar orientation')
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
  // Point 387 — red on `main` at "west 0px, east 0px". BOTH probes read zero, so
  // the check was never reporting a MIRRORED band; it was reporting a BLANK one.
  // VERDICT: the PRODUCT was wrong — the same empty-capture defect as the leave
  // check above, fixed in panoramaCapture.ts by point 545 (synchronous pipeline
  // compile at the shutter, one square shot per sector copied into its own
  // column). The bar of 200 px, and the 10:1 west-over-east ratio, are UNCHANGED.
  // MEASURED 07.08.2026, quiet machine: west 34418 px / east 0 px on WebGL 2 and
  // west 54236 px / east 0 px on WebGPU. The west readings differ by backend
  // (different pillar coverage at the same aim), but both are two orders of
  // magnitude above the bar with the east side at exactly zero.
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
if (section('cairo-silhouette-footing')) {
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
  const aimedAt = await page.evaluate(() => {
    const it = Object.values(window.__placePanoramaWildlifeInfo ?? {}).filter((w) => w.visible)[0]
    if (!it) return null
    const p = window.__placePlayer
    const r = (window.__placeLayout?.radius ?? 40) * 0.9
    const d = Math.hypot(it.x, it.z) || 1
    p.x = (it.x / d) * r
    p.z = (it.z / d) * r
    p.pitch = 0
    p.yaw = Math.atan2(-(it.x - p.x), -(it.z - p.z))
    return { x: it.x, z: it.z, y: it.y }
  })
  await page.waitForTimeout(800)
  // The silhouette itself is the subject — it stands far past the walkable disc,
  // so its own reported height is what has to be projected, not the ground.
  await frame(
    '136-cairo-silhouette-footing',
    aimedAt ? { local: aimedAt, label: 'the panorama silhouette on its ground line' } : { place: 'cairo', label: 'the Cairo panorama (no silhouette to aim at)' },
  )
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

// --- Sphinx at travel scale (design.md §4.4, point 91) -------------------------
// The Giza field's Sphinx is a modelled couchant lion now; screenshot it from
// the travel camera just south of the field (the skyline-scale view is shot
// 100 above).
if (section('sphinx-travel')) {
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
  // Giza's own position (the marker jumped to in the block below), not the
  // standpoint: the frame claims the field, so the field must be in the picture.
  await frame('103-giza-sphinx-travel', { world: { lat: 29.98, lon: 30.59 }, label: 'the Giza field with the Sphinx' })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
}

// --- Walkable Giza monument site (design.md §4.4, point 273) -------------------
// Jump onto the Giza marker so the "Space to enter" hint arms, confirm entry
// with the Space use key, then check that the three great pyramids and the
// sand-buried Sphinx render as collidable masses on the walkable plateau —
// with a screenshot standing back from the cluster.
if (section('giza-site')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  // Giza's river-cleared position (src/world/geo.ts). Jumping onto the marker
  // arms the enter hint; a Space press then confirms entry (design.md §2.3).
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.98, 30.59))
  await page.waitForFunction(() => window.__ui.getState().enterPlaceId === 'giza', null, { timeout: 15000 })
  const gizaPrompt = await page.evaluate(() => window.__ui.getState().prompt ?? '')
  check('the enter hint arms and names Giza (discovered, localized)', /Giza|Gizeh/.test(gizaPrompt), gizaPrompt)
  // Wait for the approach capture (points 227/335): the band may only be shot
  // once the terrain ring around the capture point is committed, so entering
  // before it lands would leave the monument on the geometry backdrop and make
  // the horizon check below vacuous.
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'giza', null, { timeout: 60000 }).catch(() => {})
  // Re-set the live position right before the press (Space re-derives from it).
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.98, 30.59))
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
  // Stand at the arrival standpoint, look north over the cluster, and shoot.
  // The APPROACH distance, not the radius (point 390 widened the disc for the
  // desert; the view of the pyramid row must not widen with it).
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = 0
    p.z = window.__placeLayout?.spawnZ ?? 50
    p.yaw = 0 // yaw 0 faces −Z (north), toward the pyramids
  })
  await page.waitForTimeout(1000)
  const siteBuf = await frame('139-giza-walkable-site', { place: 'giza', label: 'the walkable Giza plateau' })

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

    // Point 381: the seam between the walkable ground and the §2.5 panorama
    // must be CLOSED. The reported picture had the plateau end in a hard
    // straight edge and give way to the captured band's low rows and the sky
    // behind them — because the geometry backdrop sank up to 6 units below the
    // ground plane just past the disc rim and never rose back into the eye's
    // grazing line inside its own reach.
    //
    // Read the rendered scene, not the formula: from each standpoint sweep the
    // elevation upward through the horizon and record which surface the frame
    // draws. A closed horizon reads ground-disc → landscape-backdrop → band/sky.
    // A torn one steps straight from the disc to the band or to nothing, which
    // is what this asserts against. Standpoints include the rim, where the
    // grazing line is shallowest and the tear was worst.
    {
      const siteR = await page.evaluate(() => window.__placeLayout?.radius ?? 60)
      const seamBad = []
      let seamProbed = 0
      for (const stand of [
        [0, 0],
        [0, siteR * 0.8],
        [siteR * 0.8, 0],
      ]) {
        await page.evaluate(([x, z]) => {
          const p = window.__placePlayer
          p.x = x
          p.z = z
          p.pitch = 0
        }, stand)
        // Let the camera follow the teleport: the ray probe casts from IT.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const res = await page.evaluate(() => {
          const cam = window.__placeCamera
          const bad = []
          let probed = 0
          for (let ai = 0; ai < 24; ai++) {
            const yaw = (ai / 24) * Math.PI * 2
            const seq = []
            for (let i = 0; i <= 60; i++) {
              const t = ((-6 + i * 0.1) * Math.PI) / 180
              const dx = -Math.sin(yaw) * Math.cos(t)
              const dz = -Math.cos(yaw) * Math.cos(t)
              const dy = Math.sin(t)
              const L = 3500
              const h = window.__placeRayHit(cam.position.x + dx * L, cam.position.y + dy * L, cam.position.z + dz * L)
              const name = h.hitDistance == null ? 'nothing' : h.hitName
              if (seq[seq.length - 1] !== name) seq.push(name)
            }
            probed++
            const disc = seq.indexOf('ground-disc')
            if (disc < 0) continue // a building or monument fills this bearing
            const next = seq[disc + 1]
            if (next === 'panorama-band' || next === 'nothing' || next === undefined) {
              bad.push({ yawDeg: Math.round((yaw * 180) / Math.PI), seq })
            }
          }
          return { probed, bad }
        })
        seamProbed += res.probed
        for (const b of res.bad) seamBad.push({ stand, ...b })
      }
      check(
        'the walkable ground meets the panorama with no torn horizon (point 381)',
        seamProbed > 0 && seamBad.length === 0,
        `${seamProbed} bearings probed, ${seamBad.length} torn${seamBad.length ? ' — ' + JSON.stringify(seamBad.slice(0, 3)) : ''}`,
      )
    }

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
      await frame(`141-giza-horizon-${shot}`, { place: 'giza', label: 'the Giza horizon from the site rim' })
    }

    // Point 390: the walkable sand must reach to where the PICTURE stops
    // offering ground. The desert around the plateau runs unbroken to the
    // horizon, so the old 60 m disc ended the world ~18 m past the outermost
    // mass — the player met an invisible wall (or was thrown back to the
    // bird's-eye view) while standing on the same sand that kept going.
    //
    // The exact radius is pinned in the Vitest layer (it is DERIVED from the
    // §2.5 band); here only the live shape is asserted, plus the picture from
    // the two standpoints the point asks for.
    {
      // Settle on the app's OWN clock (rendered frames), never a wall-clock
      // sleep: the camera follows the teleport on the next frame and the
      // temporal resolve needs a few more.
      const settleFrames = (n) =>
        page.evaluate(
          (k) =>
            new Promise((res) => {
              let i = 0
              const tick = () => (++i >= k ? res(true) : requestAnimationFrame(tick))
              requestAnimationFrame(tick)
            }),
          n,
        )
      const geo = await page.evaluate(() => ({
        radius: window.__placeLayout?.radius ?? 0,
        spawnZ: window.__placeLayout?.spawnZ ?? 0,
      }))
      check(
        'the Giza disc carries the open-plain radius and its own arrival distance (point 390)',
        geo.radius > 90 && geo.spawnZ > 0 && geo.spawnZ < geo.radius - 20,
        JSON.stringify(geo),
      )
      // At the walkable LIMIT the frame must still draw ground running outward:
      // disc first, then the geometry backdrop — never the band or nothing.
      // This is the standpoint the old disc turned into a wall in open sand.
      await page.evaluate((r) => {
        const p = window.__placePlayer
        p.x = 0
        p.z = r - 2
        p.yaw = Math.PI // yaw π faces +Z (south), straight out of the site
        p.pitch = 0
      }, geo.radius)
      await settleFrames(4)
      const edgeGround = await page.evaluate(() => {
        const cam = window.__placeCamera
        const seq = []
        for (let i = 0; i <= 60; i++) {
          const t = ((-6 + i * 0.1) * Math.PI) / 180
          const L = 3500
          const h = window.__placeRayHit(
            cam.position.x,
            cam.position.y + Math.sin(t) * L,
            cam.position.z + Math.cos(t) * L,
          )
          const name = h.hitDistance == null ? 'nothing' : h.hitName
          if (seq[seq.length - 1] !== name) seq.push(name)
        }
        return seq
      })
      const discAt = edgeGround.indexOf('ground-disc')
      check(
        'from the walkable edge the ground runs on to the backdrop (point 390)',
        discAt >= 0 && edgeGround[discAt + 1] === 'landscape-backdrop',
        JSON.stringify(edgeGround),
      )
      await settleFrames(30)
      await frame('390-giza-sand-edge', { place: 'giza', label: 'the open sand seen from the walkable edge' })
      // And from the monument row itself, looking out over the sand the player
      // may now cross. NOT from (0, 0): Khafre stands there (gizaSite.ts), so a
      // camera at the site's geometric centre sits INSIDE the pyramid and the
      // frame came out as a dark slit — a picture that did not show what its
      // name claimed. The standpoint is the open sand just south of the row.
      await page.evaluate(() => {
        const p = window.__placePlayer
        p.x = 0
        p.z = 30
        p.yaw = Math.PI
        p.pitch = 0
      })
      await settleFrames(30)
      await frame('390-giza-sand-open', { place: 'giza', label: 'the open sand seen from beside the monument row' })
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}
// --- Villager arms and gestures (point 479) ---------------------------------
// The figures were cones with sphere heads: nobody could show what he was
// talking about. What is checked here is what needs a real browser — that the
// arms the renderer DRAWS actually take the four poses, that a gesture ends on
// its own while the game runs, and that a figure at rest really stands at rest.
// The state machine itself (bounded duration, one gesture per figure, the
// return to rest) is pinned purely in src/render/gesture.test.ts.
if (section('villager-gestures')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  const gesturesLive = await page
    .waitForFunction(() => !!window.__placeGestures && !!window.__placeTalkers && !!window.__placeRayHit, null, {
      timeout: 40000,
    })
    .then(() => true)
    .catch(() => false)
  check('the conversing pair publishes its live gesture state', gesturesLive)
  if (gesturesLive) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))

    // Stand the player at conversational distance on a bearing whose line to the
    // pair is actually CLEAR — the settlement is dense, and a camera dropped on a
    // fixed bearing can end up inside a hut, which would photograph a wall and
    // prove nothing about an arm.
    //
    // Point 549 — WHY THIS COULD ROTATE ITS VERDICT on an unchanged layout. The
    // search teleported the player and ray-probed inside ONE page call, and
    // `__placeRayHit` casts from the CAMERA, which only follows the player on the
    // next drawn frame. So all sixteen bearings were probed from wherever the
    // camera still stood — one answer, sixteen times, and which answer depended
    // on where the block before had left it. Each bearing is now DRAWN before it
    // is judged (the shape `probeSilhouetteFooting` and the speech probe already
    // use), a first miss is retried from a settled scene, and a real miss names
    // what stood in every line instead of reporting a bare `false`.
    const standAtPair = async () => {
      const centre = await page.evaluate(() => {
        const t = window.__placeTalkers
        return t ? { cx: (t[0].x + t[1].x) / 2, cz: (t[0].z + t[1].z) / 2 } : null
      })
      if (!centre) return { stood: null, tried: 0, blocked: ['the pair publishes no position'] }
      const blocked = []
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const hit = await page.evaluate(
          ([bearing, c]) =>
            new Promise((res) => {
              const p = window.__placePlayer
              p.x = c.cx + Math.sin(bearing) * 3.3
              p.z = c.cz + Math.cos(bearing) * 3.3
              p.yaw = Math.atan2(-(c.cx - p.x), -(c.cz - p.z))
              p.pitch = -0.06
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const h = window.__placeRayHit(c.cx, 1.05, c.cz)
                  res({ x: p.x, z: p.z, hit: h.hitDistance, target: h.targetDistance, name: h.hitName })
                }),
              )
            }),
          [a, centre],
        )
        if (hit.hit == null || hit.hit >= hit.target - 0.45) {
          return { stood: { x: hit.x, z: hit.z, cx: centre.cx, cz: centre.cz, bearing: a }, tried: i + 1, blocked }
        }
        blocked.push(`${a.toFixed(2)}→${hit.name} at ${hit.hit.toFixed(2)} of ${hit.target.toFixed(2)}`)
      }
      return { stood: null, tried: 16, blocked }
    }
    let search = await standAtPair()
    if (!search.stood) {
      // The pair WALKS: a hut that stood in every line a moment ago need not
      // still. Retried once from a settled scene before the miss is believed.
      await waitForSceneBuilt(page).catch(() => {})
      search = await standAtPair()
    }
    const stood = search.stood
    check(
      'a clear standpoint at conversational distance from the pair exists',
      stood != null,
      stood
        ? `bearing ${stood.bearing.toFixed(2)} rad, the ${search.tried}. of 16 tried`
        : `all ${search.tried} bearings blocked: ${search.blocked.join(', ')}`,
    )

    // --- the four poses, one frame each -------------------------------------
    // Long durations so the pose survives the shutter's own settling; the wait
    // is on the GESTURE's own clock, never on the wall clock.
    const HOLD = 12
    const poseAway = (p) =>
      Math.abs(p.left.pitch - 0.04) +
      Math.abs(p.right.pitch - 0.04) +
      Math.abs(p.left.yaw) +
      Math.abs(p.right.yaw) +
      Math.abs(p.lean) +
      Math.abs(p.turn)
    for (const kind of ['beckon', 'point', 'refuse', 'indicate']) {
      const who = 0
      await page.evaluate(([k, hold, w]) => window.__placeForceGesture(w, k, hold), [kind, HOLD, who])
      // Wait for the POSE to be open, not for a reading on the gesture's clock.
      // That clock is the frame delta CLAMPED to 0.1 s, so on a host rendering
      // at 1 FPS under load it advances ten times slower than the wall clock and
      // a threshold in gesture-seconds turns into minutes of waiting. The pose
      // is the thing the frame must show, and it is open after three frames.
      const opened = await page
        .waitForFunction(
          (w) => {
            const g = window.__placeGestures()[w]
            if (!g || !g.kind) return false
            const p = g.pose
            return (
              Math.abs(p.left.pitch - 0.04) + Math.abs(p.right.pitch - 0.04) + Math.abs(p.lean) > 0.5
            )
          },
          who,
          { timeout: 60000 },
        )
        .then(() => true)
        .catch(() => false)
      check(`the ${kind} gesture opens into a pose that can be seen`, opened)
      const shown = await page.evaluate((w) => window.__placeGestures()[w], who)
      check(
        `${kind}: the figure's arms leave the rest pose`,
        !!shown && shown.kind === kind && poseAway(shown.pose) > 0.5,
        shown ? `${shown.kind}, pose distance ${poseAway(shown.pose).toFixed(2)}` : 'no state',
      )
      // The partner keeps still: a gesture belongs to ONE figure.
      const partner = await page.evaluate(() => window.__placeGestures()[1])
      check(
        `${kind}: the listener is not gesturing at the same time`,
        !!partner && partner.kind === null,
        partner ? String(partner.kind) : 'no state',
      )
      if (stood) {
        await nextFrames(4)
        await frame(`479-gesture-${kind}`, {
          local: { x: stood.cx - 0.5, y: 1.15, z: stood.cz },
          label: `the villager's ${kind} gesture`,
        })
      }
    }

    // --- a gesture ENDS by itself, and rest really is rest -------------------
    // A SHORT gesture, so the end arrives within a bounded number of FRAMES even
    // where each frame is a second long.
    await page.evaluate(() => window.__placeForceGesture(0, 'point', 0.6))
    // Read the resting state IN the same poll that observes the end: nothing
    // else poses this pair since point 580, but the read stays inside the poll
    // so the check cannot race whatever drives the arms next.
    const restHandle = await page
      .waitForFunction(
        () => {
          const g = window.__placeGestures()[0]
          if (g.kind !== null) return null
          return { kind: g.kind, left: g.pose.left, right: g.pose.right, lean: g.pose.lean, turn: g.pose.turn }
        },
        null,
        { timeout: 60000 },
      )
      .catch(() => null)
    check('a gesture ends on its own — no figure is left holding a pose', restHandle != null)
    const atRest = restHandle ? await restHandle.jsonValue() : { kind: 'never ended', left: {}, right: {} }
    check(
      'and the figure stands at rest again: both arms down, no lean, no turn',
      atRest.kind === null &&
        atRest.lean === 0 &&
        atRest.turn === 0 &&
        atRest.left.yaw === 0 &&
        atRest.right.yaw === 0,
      JSON.stringify(atRest),
    )

    // --- sampled over the standing conversation -----------------------------
    // A single instant proves nothing about a scheduler: sample across frames.
    // Since point 580 the sample must find the pair QUIET — the two used to
    // cycle the four gestures as ambient dressing, with no utterance behind any
    // of them and at any distance, which is the mute pantomime the user
    // reported. Every gesture in a settlement now belongs to a figure whose
    // words the player can hear (the children's and adults' teaching paths,
    // covered purely in src/communication/spokenGesture.test.ts).
    const samples = []
    for (let i = 0; i < 30; i++) {
      samples.push(await page.evaluate(() => window.__placeGestures()))
      await nextFrames(4)
    }
    const kinds = ['beckon', 'point', 'refuse', 'indicate']
    const bad = samples.filter((s) => s.some((g) => g.kind !== null && !kinds.includes(g.kind)))
    check('every live gesture is one of the four kinds', bad.length === 0, `${bad.length} of ${samples.length} samples`)
    const overrun = samples.filter((s) => s.some((g) => g.kind !== null && g.t > g.duration))
    check('no gesture ever runs past its own duration', overrun.length === 0, `${overrun.length} overruns`)
    const both = samples.filter((s) => s[0].kind !== null && s[1].kind !== null)
    check('the pair takes turns — the two never gesture over each other', both.length === 0, `${both.length} overlaps`)
    const seen = new Set(samples.flatMap((s) => s.map((g) => g.kind)).filter(Boolean))
    check(
      'the standing pair mimes nothing on its own — no gesture without a word',
      seen.size === 0,
      [...seen].join(', ') || 'quiet',
    )
    const restBroken = samples.filter((s) =>
      s.some((g) => g.kind === null && (g.pose.lean !== 0 || g.pose.turn !== 0 || g.pose.left.yaw !== 0)),
    )
    check('a figure that is not speaking stands exactly at rest', restBroken.length === 0, `${restBroken.length} samples`)
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

  // Point 137: the six dressed peoples, each at its own village in its own
  // month, against the fifteen that never dress. The pure mapping is covered in
  // src/systems/dress.test.ts; this is the live half.
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
  // Built, the same measurement reads OFF 8/-5/12 and ON 56/40/53, inside the
  // recorded ranges. Neither threshold below is touched.
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

  // Measured on both backends: OFF contrast 3-12, ON contrast 42-57.
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
// The band must TELL THE TRUTH, so this measures it in the rendered picture and
// against the leave check itself, in EVERY kind of place and at BOTH ends of the
// year — a step visible only in the dry-season straw would be half a feature.
if (section('settlement-edge')) {
  // Ground crops: how far inside / outside the boundary each sample sits.
  const SAMPLES = [
    { name: 'inside', at: -5 },
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
      const r = L.radius
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
    const view = page.viewportSize()
    const left = Math.round(((ndc.x + 1) / 2) * view.width - w / 2)
    const top = Math.round(((1 - ndc.y) / 2) * view.height - h / 2)
    if (left < 0 || top < 0 || left + w > view.width || top + h > view.height) return null
    const { data, info } = await sharp(buf).extract({ left, top, width: w, height: h }).raw().toBuffer({ resolveWithObject: true })
    return luminanceSamples(data, info)
  }

  /** The crop's SETTLE reading (cropLuma.mjs): the crop's mean with its
   *  brightest fifth dropped, so a rain streak cannot end the wait early and a
   *  band leak arriving over part of the crop still holds it open. It compares
   *  the picture with itself; it never measures the band. */
  const groundLuma = async (buf, ndc, w, h) => {
    const samples = await groundSamples(buf, ndc, w, h)
    return samples === null ? null : settleReading(samples)
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

  /** Read the crop until it stops moving: the settlement's own state settles on
   *  entry and the wet ground keeps SOAKING through a storm (§19.13), so the
   *  measurement waits on the picture rather than on a guessed number of
   *  milliseconds. Returns the settled reading (or the last one taken). */
  const settledLuma = async (ndc, eps = 0.3) => {
    let prev = null
    for (let i = 0; i < 40; i++) {
      await settleFrames(2)
      const cur = await groundLuma(await capturePixels(page, 'settled ground luma'), ndc, 150, 46)
      if (cur === null) return null
      if (prev !== null && Math.abs(cur - prev) < eps) return cur
      prev = cur
    }
    return prev
  }

  /** The band's OWN effect on a crop: its luminance with the edge drawn over
   *  its luminance with the edge switched off from the debug menu's own value,
   *  same camera, same frame content. Attribution, not correlation — the
   *  settlement's grass scatter also stops at the edge, and a plain
   *  inside-vs-outside difference could not tell the two apart. It doubles as
   *  the live proof that the calibratable strength lands without a reload. */
  const bandRatio = async (ndc) => {
    // Point 549: three frames were not the band arriving, they were three frames.
    // Each shot waits for the crop to STOP MOVING on the new strength and then
    // takes three reads of it — the rains draw over the ground and TRAA jitters
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
    const shot = async (strength) => {
      await page.evaluate((s) => { window.__balance.placeEdgeBand.strength = s }, strength)
      if ((await settledLuma(ndc, 0.2)) === null) return null
      const reads = []
      for (let i = 0; i < READ_COUNT + CONFIRM_READS; i++) {
        // A starved gap is a FAILED shot, not a faster one: reads that are not
        // far enough apart are not independent pictures, and the rain rejection
        // is exactly what that independence buys.
        if (i > 0 && !(await readGap())) return null
        const cur = await groundSamples(await capturePixels(page, 'edge-band ground luma'), ndc, 150, 46)
        if (cur === null) return null
        reads.push(cur)
      }
      // A scene that changed WHILE the shot was taken is not a shot. The
      // per-pixel median would erase a defect arriving in a minority of the
      // reads exactly as it erases the rain, and the settle loop ahead of it is
      // one-sided — so the two halves of the shot are compared, each still
      // rain-robust, and a disagreement fails the shot instead of averaging it
      // away.
      const drift = shotDrift(reads)
      if (drift === null || drift > SHOT_DRIFT_BAR) {
        console.log(`# shot REJECTED — the crop moved ${(drift * 100).toFixed(3)} % between its first and last reads (bar ${(SHOT_DRIFT_BAR * 100).toFixed(1)} %)`)
        return null
      }
      // The confirmation read is the guard's, not the measurement's.
      return shotReading(reads.slice(0, READ_COUNT))
    }
    // ON, OFF, ON — and the two ONs averaged. In the rains the ground SOAKS
    // while the shots are taken (the §19.13 wet accumulation keeps darkening
    // it), which biased a plain on/off pair by more than the edge itself; a
    // symmetric triple cancels that linear drift instead of racing it.
    const on1 = await shot(1)
    const off = await shot(0)
    const on2 = await shot(1)
    if (on1 === null || on2 === null || !(off > 0)) return null
    return (on1 + on2) / 2 / off
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
    const radius = await page.evaluate(() => window.__placeLayout.radius)
    // One standing spot for all three crops, so only the aim moves between them.
    const stand = radius - 6
    const out = {}
    for (const s of SAMPLES) {
      const ndc = await aimAt(bearing, radius + s.at, stand)
      if (!ndc || Math.abs(ndc.y) > 0.35 || Math.abs(ndc.x) > 0.5) {
        check(`${id} (${seasonName}): the ${s.name} ground crop is in the picture`, false, `ndc ${JSON.stringify(ndc)}`)
        return null
      }
      // Wait out the season change and, in the rains, the soak that keeps
      // building — on the PICTURE, not on a stopwatch — before the pair is taken.
      if (await settledLuma(ndc) === null) {
        check(`${id} (${seasonName}): the ${s.name} ground crop is measurable`, false, 'crop off-frame')
        return null
      }
      out[s.name] = await bandRatio(ndc)
      if (out[s.name] === null) {
        check(`${id} (${seasonName}): the ${s.name} ground crop could be measured`, false, 'crop off-frame')
        return null
      }
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
  // inside ×0.905, ×0.906, ×0.906.
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
      const L = window.__placeLayout
      p.x = Math.cos(b) * (L.radius - 3)
      p.z = Math.sin(b) * (L.radius - 3)
      p.yaw = Math.atan2(-Math.cos(b), -Math.sin(b))
      p.pitch = 0
      const radius = L.radius
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
      `left at ${crossing.last?.toFixed(2)} m of a ${crossing.radius} m boundary`,
    )
  }
}

// --- The children's game of tag (design.md §19.10, point 480/351) ------------
// What needs a real browser is that the RAF-driven chase is a GAME and not a
// route: the pure round is pinned in src/scenes/place/tagGame.test.ts, but only
// the live scene can show that the paths are not periodic, that the gap between
// chaser and quarry breathes, that the role really moves, and that a child is
// seen running out of steam. Sampled over an interval, and gated on a round
// actually being in play — the group idles between rounds by design, so a sample
// window straddling a break would judge the wrong thing.
if (section('children-tag')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  const live = await page
    .waitForFunction(
      () => window.__game.getState().placeId === 'maasai-village' && !!window.__placeTag && !!window.__placeLayout,
      null,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false)
  check('the village children publish their live game of tag', live)
  if (live) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    const played = await page
      .waitForFunction(() => window.__placeTag().playing, null, { timeout: 40000 })
      .then(() => true)
      .catch(() => false)
    check('a round of tag is in play', played)

    // The window is an interval of GAME, read off the game's own clock — never a
    // count of frames. A frame budget buys wildly different amounts of game on an
    // idle machine and on one running three other suites, and 420 frames bought
    // barely 20 s here: the measured first catch is 6.6–11.3 s, so that window
    // could hold ONE catch or none, and "the chaser's identity changes at least
    // once" went red with no bug behind it. WINDOW_S is sized off that same
    // measurement to hold several catches on any machine, and the loop is capped
    // in frames so a scene that has stopped stepping FAILS LOUDLY on the check
    // below instead of spinning here forever.
    const WINDOW_S = 90
    const start = await page.evaluate(() => window.__placeTag().clock)
    const samples = []
    let clock = start
    for (let i = 0; i < 6000 && clock - start < WINDOW_S; i++) {
      const s = await page.evaluate(() => window.__placeTag())
      clock = s.clock
      samples.push(s)
      await nextFrames(3)
    }
    check(
      'the scene runs a full interval of the game to judge (its own clock, not a frame count)',
      clock - start >= WINDOW_S,
      `${(clock - start).toFixed(1)}s of ${WINDOW_S}s over ${samples.length} samples`,
    )
    const playing = samples.filter((s) => s.playing)
    check(
      'the group spends the interval playing rather than idling',
      playing.length > samples.length / 2,
      `${playing.length} of ${samples.length} samples`,
    )

    // Exactly ONE chaser at every playing sample, and nobody holds the role
    // during a break.
    const badChaser = samples.filter((s) =>
      s.playing ? !(s.chaser >= 0 && s.chaser < s.children.length) : s.chaser !== -1,
    )
    check(
      'exactly one child is IT while a round runs, and none between rounds',
      badChaser.length === 0,
      `${badChaser.length} of ${samples.length} samples`,
    )

    // The role MOVES: a game where one child chases for the whole interval is a
    // pursuit, not a game of tag.
    const chasers = new Set(playing.map((s) => s.chaser))
    check(
      "the chaser's identity changes at least once",
      chasers.size >= 2,
      `held by ${[...chasers].join(', ') || 'nobody'}`,
    )

    // The chase BREATHES: the gap to the quarry rises and falls repeatedly.
    const gaps = playing
      .filter((s) => s.target >= 0)
      .map((s) =>
        Math.hypot(
          s.children[s.chaser].x - s.children[s.target].x,
          s.children[s.chaser].z - s.children[s.target].z,
        ),
      )
    let turns = 0
    for (let i = 2; i < gaps.length; i++) {
      const a = gaps[i - 1] - gaps[i - 2]
      const b = gaps[i] - gaps[i - 1]
      if (a * b < 0) turns++
    }
    check(
      'the distance between chaser and quarry rises and falls repeatedly',
      turns >= 6,
      `${turns} turning points over ${gaps.length} readings`,
    )

    // A catch happens for a reason the viewer can SEE.
    const recovering = playing.some((s) => s.children.some((c) => c.effort === 'recover'))
    check('at least one child is seen slowing to get its breath back', recovering)

    // NOT A ROUTE: the headings cover a wide spread, and the group does not hold
    // one radius (a ring around a centre would be a route too).
    const bins = new Set()
    const radii = []
    for (const s of playing) {
      for (const c of s.children) {
        bins.add(Math.floor(((c.heading + Math.PI * 3) % (Math.PI * 2)) / (Math.PI / 6)))
        radii.push(Math.hypot(c.x, c.z))
      }
    }
    check(
      'their headings cover a wide spread rather than circling one centre',
      bins.size >= 9,
      `${bins.size} of 12 heading sectors`,
    )
    const mean = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length)
    const sd = Math.sqrt(radii.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, radii.length))
    check(
      'and they do not hold one radius around the settlement centre',
      sd > 1,
      `radius spread ${sd.toFixed(2)} m about ${mean.toFixed(1)} m`,
    )

    // Nobody pinned, nobody standing still, everybody where a walker may stand.
    const n = samples[0].children.length
    const travelled = Array.from({ length: n }, () => 0)
    for (let i = 1; i < samples.length; i++) {
      for (let k = 0; k < n; k++) {
        const a = samples[i - 1].children[k]
        const b = samples[i].children[k]
        if (a && b) travelled[k] += Math.hypot(b.x - a.x, b.z - a.z)
      }
    }
    check(
      'no child stands still for the whole interval',
      travelled.every((d) => d > 2),
      `travelled ${travelled.map((d) => d.toFixed(1)).join(', ')} m`,
    )
    const pinned = samples.filter((s) => s.children.some((c) => c.pinned > 3))
    check('no child is pinned against geometry', pinned.length === 0, `${pinned.length} samples`)
    const outside = await page.evaluate(() => {
      const L = window.__placeLayout
      return window.__placeTag().children.filter((c) => Math.hypot(c.x, c.z) > L.radius).length
    })
    check('every child stays inside the walkable settlement', outside === 0, `${outside} outside`)
    const reserves = samples.flatMap((s) => s.children.map((c) => c.reserve))
    check(
      'every sprint reserve stays within its bounds',
      reserves.every((r) => r >= 0 && r <= 1),
      `${Math.min(...reserves).toFixed(2)}..${Math.max(...reserves).toFixed(2)}`,
    )

    // The armed invariants stayed silent through all of it (point 207(i)).
    const asserts = await page.evaluate(() =>
      (window.__assertLog ?? [])
        .filter((a) => String(a.code).startsWith('tag-'))
        .map((a) => a.code + ': ' + a.detail),
    )
    check('the game fired none of its own invariant asserts', asserts.length === 0, asserts.join(' | '))

    // The picture. The frame must show THE CHASE, so the standpoint is chosen
    // the way the point-485 speaker shot chooses one rather than by a formula.
    // Three rules earned by looking at what the earlier tries actually produced:
    // aim at the CHASER AND ITS QUARRY — the pair IS the game, while the group
    // centroid drifts to wherever the stragglers are and framed a tree and an
    // empty paddock; keep the VILLAGE BEHIND THEM (point 524) — the first clear
    // sight line is as often the one looking OUT of the village across open
    // ground, which is the frame that passed every check and showed one child on
    // an empty plain; and stand on the bearing that does it, rather than at the
    // first one that is merely unobstructed. Every bearing is ray-probed against
    // the RENDERED scene for an unobstructed line and scored by PROJECTING the
    // children and the buildings through the live camera (§7.2), never by a
    // radius.
    //
    // The bearing is given as an OFFSET from the one that looks inward: the
    // camera stands outside the pair on the settlement's own radius, so what
    // lies beyond them is the village. The offset fans out from there, and every
    // candidate is validated where it stands (see the standpoint note below).
    const standAt = async (offset, back = 5.5) =>
      page.evaluate(
        ({ b, back }) => {
          const t = window.__placeTag()
          const p = window.__placePlayer
          const L = window.__placeLayout
          if (!t || !p || !t.children.length) return null
          // The pair the game is about, falling back to the group's middle
          // between rounds.
          const a = t.chaser >= 0 ? t.children[t.chaser] : null
          const q = t.target >= 0 ? t.children[t.target] : null
          const cx = a && q ? (a.x + q.x) / 2 : t.children.reduce((s2, c) => s2 + c.x, 0) / t.children.length
          const cz = a && q ? (a.z + q.z) / 2 : t.children.reduce((s2, c) => s2 + c.z, 0) / t.children.length
          // Outward from the settlement centre through the pair: standing there
          // and looking back puts the village behind them.
          const bearing = Math.atan2(cx, cz) + b
          let step = back
          // Never past the walkable rim — stepping over it LEAVES the place, and
          // the shot would be taken from outside the village or not at all.
          const rim = (L ? L.radius : 28) - 1.5
          while (step > 2.5 && Math.hypot(cx + Math.sin(bearing) * step, cz + Math.cos(bearing) * step) > rim) {
            step -= 0.5
          }
          if (step <= 2.5) return { cx, cz, tooFar: true }
          p.x = cx + Math.sin(bearing) * step
          p.z = cz + Math.cos(bearing) * step
          // Place-camera yaw 0 looks toward −Z, hence the +PI complement.
          p.yaw = Math.atan2(cx - p.x, cz - p.z) + Math.PI
          p.pitch = -0.05
          return { cx, cz, back: step }
        },
        { b: offset, back },
      )
    /**
     * MEASURE the picture this standpoint would write, and let
     * scripts/verify/tagFrameReading.mjs judge the numbers.
     *
     * Projection ALONE is not enough, and that lesson cost two pictures. The
     * first: a frame in which the pair projects inside the viewport can still be
     * a frame of the huts they are standing behind — so each of the two is
     * ray-probed against the RENDERED scene, and the first surface drawn must be
     * the CHILD ITSELF, which is what its distance says. The second: the probe
     * was ONE ray at chest height, and the settlement's boulder line hid the
     * children to the shoulders while leaving exactly that ray clear. Forty
     * pixels of head over the rocks passed every check and was rejected by eye.
     *
     * So the reading is taken along the child's WHOLE axis (AXIS_SAMPLES) and
     * its on-screen EXTENT is measured — feet and crown projected through the
     * live camera, the pixel height read off the real viewport (§7.2: project to
     * the rendered frame, never assume a radius or a distance).
     *
     * And it counts the VILLAGE BEHIND THEM (point 524): the buildings the
     * layout draws, projected the same way, that stand FURTHER from the camera
     * than the pair does. That is the difference between a game of tag in a
     * settlement and two figures on a plain, and no check saw it before.
     */
    const view = page.viewportSize()
    const readsFromHere = () =>
      page.evaluate(
        ({ KID_HEIGHT, AXIS_SAMPLES, OCCLUDED_RATIO, CONFIRMED_RATIO, width, height }) => {
          const t = window.__placeTag()
          const cam = window.__placeCamera
          if (!t || !cam || !window.__placeRayHit) return { clear: false, inFrame: 0, behind: 0, children: [] }
          const a = t.chaser >= 0 ? t.children[t.chaser] : null
          const q = t.target >= 0 ? t.children[t.target] : null
          const cx = a && q ? (a.x + q.x) / 2 : t.children.reduce((s2, c) => s2 + c.x, 0) / t.children.length
          const cz = a && q ? (a.z + q.z) / 2 : t.children.reduce((s2, c) => s2 + c.z, 0) / t.children.length
          const h = window.__placeRayHit(cx, 0.75, cz)
          const clear = h.hitDistance == null || h.hitDistance >= h.targetDistance * 0.9
          // The SAME matrix math the frame shutter projects a `local` subject
          // with (scripts/verify/frameSubject.mjs) — no THREE in the page here.
          const apply = (e, v) =>
            [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
          const ndc = (x, y, z) => {
            const eyeAt = apply(cam.matrixWorldInverse.elements, [x, y, z, 1])
            const clip = apply(cam.projectionMatrix.elements, eyeAt)
            const w = clip[3]
            if (!(w > 0) || clip[2] / w >= 1) return null
            return [clip[0] / w, clip[1] / w]
          }
          /** One child as the frame would show it: where, how tall, how much of
           *  it something else is standing in front of. */
          const reads = (c) => {
            if (!c) return null
            const ndcFeet = ndc(c.x, 0, c.z)
            const ndcHead = ndc(c.x, KID_HEIGHT, c.z)
            if (!ndcFeet || !ndcHead) return { pixels: 0, occluded: 0, confirmed: 0, ndcFeet: null, ndcHead: null }
            let occluded = 0
            let confirmed = 0
            for (const f of AXIS_SAMPLES) {
              const hit = window.__placeRayHit(c.x, KID_HEIGHT * f, c.z)
              // Nothing drawn at all on that line is not an occluder — it is a
              // ray that sailed past a thin figure into the sky.
              if (hit.hitDistance == null) continue
              const ratio = hit.hitDistance / hit.targetDistance
              if (ratio < OCCLUDED_RATIO) occluded++
              else if (ratio <= CONFIRMED_RATIO) confirmed++
            }
            // NDC spans 2 over the viewport's height, so half of it is the frame.
            return { pixels: (Math.abs(ndcHead[1] - ndcFeet[1]) / 2) * height, occluded, confirmed, ndcFeet, ndcHead }
          }
          // The pair carries the picture: a frame holding two stragglers while
          // the chase runs off-screen shows village life, not a game of tag.
          const children = [reads(a), reads(q)]
          // How many of the whole group the frame holds — projection only, no
          // rays: it is reported, never judged, and a ray probe per child per
          // bearing would multiply the sweep's cost for a detail string.
          const inFrame = t.children.filter((c) => {
            const p = ndc(c.x, KID_HEIGHT / 2, c.z)
            return p && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1
          }).length
          // What stands BEHIND them: the settlement's own buildings, in frame and
          // further away than the children are.
          const L = window.__placeLayout
          const eye = cam.position
          const pairDistance = Math.hypot(cx - eye.x, cz - eye.z)
          const fabric = L
            ? L.dwellings
                .map((d) => [d.x, d.z])
                .concat(L.interactives.filter((it) => it.type !== 'villager').map((it) => it.pos))
            : []
          let behind = 0
          let nearestWall = Infinity
          for (const [bx, bz] of fabric) {
            const away = Math.hypot(bx - eye.x, bz - eye.z)
            nearestWall = Math.min(nearestWall, away)
            if (away <= pairDistance) continue
            const p = ndc(bx, 1.2, bz)
            if (p && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1) behind++
          }
          // How far apart the two are: a pair that has just sprinted apart fills
          // the frame with the ground between them, and one of the two is out of
          // it again by the time the shutter opens.
          const gap = a && q ? Math.hypot(a.x - q.x, a.z - q.z) : Infinity
          // How far apart the two stand ACROSS the frame. NDC x spans 2 over the
          // viewport's WIDTH — this is the one measurement taken against the
          // width rather than the height.
          const separation =
            children[0]?.ndcFeet && children[1]?.ndcFeet
              ? (Math.abs(children[0].ndcFeet[0] - children[1].ndcFeet[0]) / 2) * width
              : 0
          return { clear, inFrame, behind, gap, nearestWall, separation, children }
        },
        {
          KID_HEIGHT,
          AXIS_SAMPLES,
          OCCLUDED_RATIO,
          CONFIRMED_RATIO,
          width: view?.width ?? 1440,
          height: view?.height ?? 900,
        },
      )
    // The sweep is RETRIED as the game runs, and that is not a courtesy to a
    // slow machine: a chase that is momentarily boxed between two huts offers no
    // clear line from any bearing, which is a passing state of the game and not
    // a defect in it. A single sweep made that moment fail the whole suite.
    // Three ranges are tried before each wait: 5.5 m is the composition that was
    // accepted, 4.5 m is the way PAST an occluder — the boulder line stands
    // between the play ground and the settlement's rim, so a lens on the village
    // side of it sees the children whole where one behind it saw two heads —
    // and 8.5 m the fallback for a pair that has just sprinted apart.
    //
    // THE STANDPOINT IS SHOT FROM WHERE IT WAS VALIDATED. Scoring the bearings
    // and then re-standing on the winner looked tidier and produced a frame of
    // the inside of a hut: re-standing recomputes the aim against a pair that
    // has run on, so the camera lands 5.5 m from somewhere nobody validated. The
    // reading is taken again after the shutter's own delay, too, because the
    // children keep running through it — and only a standpoint that still holds
    // both of them opens it.
    //
    // The offsets fan out from the inward-looking bearing rather than sweeping
    // the circle from due north, so the first standpoint that qualifies is the
    // one with the most village behind the pair, not merely the first with a
    // clear line — and it is still shot from where it was validated.
    const OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8].map((n) => (n / 16) * Math.PI * 2)
    // THE PICTURE IS WAITED FOR ONCE, HERE — before the sweep, not between the
    // reading and the shutter. The shutter opens only on a scene that has been
    // quiet for five seconds, and the children run through those five seconds:
    // the first retaken frame was JUDGED with the pair 251 px apart and WRITTEN
    // with them almost touching, which is the same green-check-wrong-picture
    // shape this point is about. Taking the wait up front and shooting the
    // validated instant (`sceneReady: false` below) keeps the two together.
    await waitForSceneReady(page).catch(() => {})
    let stood = null
    let shotProbe = 'no readable standpoint in any sweep'
    let bestSeen = 'nothing read from any bearing'
    // Six attempts, not four: the pair must now also stand APART on screen, and
    // that is a state of the game the sweep waits for rather than one it can
    // choose — a sweep landing entirely inside the seconds after a catch finds
    // nothing however many bearings it tries.
    for (let attempt = 0; attempt < 6 && !stood; attempt++) {
      for (const back of [5.5, 4.5, 8.5]) {
        for (let k = 0; k < OFFSETS.length && !stood; k++) {
          const at = await standAt(OFFSETS[k], back)
          if (!at) break
          if (at.tooFar) continue
          await nextFrames(2)
          const r = await readsFromHere()
          const verdict = judgeTagStandpoint(r)
          if (!verdict.ok) {
            bestSeen = `best read: ${describeReading(r)} — ${verdict.reason}`
            continue
          }
          // It reads from here NOW — does it still, a few frames on? Only then
          // is this the frame.
          await nextFrames(4)
          const still = await readsFromHere()
          const settled = judgeTagStandpoint(still)
          if (settled.ok) {
            stood = at
            shotProbe =
              `attempt ${attempt + 1}, ${at.back.toFixed(1)} m, offset ${k}/${OFFSETS.length}: ` +
              `${describeReading(still)} inFrame=${still.inFrame}`
          }
        }
        if (stood) break
      }
      if (!stood) await nextFrames(60)
    }
    check(
      `the game is photographable: both children read whole, apart and at least ${MIN_CHILD_PIXELS} px tall, unoccluded, WITH the village behind them (point 524)`,
      !!stood,
      stood ? shotProbe : `${shotProbe}; ${bestSeen}`,
    )
    if (stood) {
      // The subject is A CHILD (point 524), read where it is NOW rather than
      // where the pair was when the standpoint was picked: the settle delay
      // above is eight frames of running children, and the shutter must be told
      // what it is actually looking at. The midpoint between the two used to
      // stand here, and a midpoint is a patch of ground — it projects into an
      // empty plain as happily as into a game of tag.
      const subject = await page.evaluate(() => {
        const t = window.__placeTag()
        if (!t || t.chaser < 0) return null
        const a = t.children[t.chaser]
        return { x: a.x, z: a.z }
      })
      const aim = subject ?? { x: stood.cx, z: stood.cz }
      await frame('480-village-tag', {
        local: { x: aim.x, y: 0.6, z: aim.z },
        label: 'the child who is IT, with the village behind the chase',
        // The scene was waited for BEFORE the sweep (see above) and this
        // standpoint's picture has just been ray-probed and projected — which is
        // a stronger proof that the picture is there than a triangle count that
        // has stopped moving. The shutter's own five-second settle would only
        // buy the children time to run out of the frame it validated, and a
        // reading taken on the far side of the shutter is no remedy: measured
        // here, it reports a moment LATER than the pixels and called an occluder
        // on a frame that shows both children whole.
        sceneReady: false,
      })
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}

// --- How the children MOVE (work-order 648) ----------------------------------
// The user reported three things from one state in the Bambara village: a child
// hangs briefly, a child jitters on the spot, two children clip through each
// other. All three are the same system, and the pure layer pins each cause
// (src/scenes/place/tagGame.test.ts, inhabitantBodies.test.ts). What needs a
// real browser is the state itself: this settlement, at HIS seed, with its own
// huts, fences, fire and lanes in the collision set — the pockets that stalled a
// child are drawn by THAT layout, and no synthetic world can stand in for it.
//
// The trace is taken INSIDE the page, one entry per rendered frame. The defects
// are per-frame — an alternation, a single stalled step, a moment of overlap —
// and a sampling loop that crosses the process boundary between readings would
// step straight over them.
if (section('children-motion')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  // HIS seed: the settlement layout is derived from place + seed, so this is the
  // village he was standing in and not merely one of the same people. Put back
  // afterwards — every section after this one would otherwise be reading a world
  // it did not ask for.
  const bootSeed = await page.evaluate(() => window.__game.getState().seed)
  await page.evaluate(() => window.__game.setState({ seed: 2972259115 }))
  await page.evaluate(() => window.__game.getState().enterPlace('bambara-village'))
  const live = await page
    .waitForFunction(
      () => window.__game.getState().placeId === 'bambara-village' && !!window.__placeTag,
      null,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false)
  check('the reported village publishes its live game of tag', live)
  if (live) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    // AND IT MUST REALLY BE PLAYING (point 656). The wait's result used to be
    // thrown away: a group that never played produced no stalls, no shuffle
    // windows and no rescues, and satisfied every check below VACUOUSLY.
    const playing = await page
      .waitForFunction(() => window.__placeTag().playing, null, { timeout: 40000 })
      .then(() => true)
      .catch(() => false)
    check('the group is really playing before the trace is taken', playing)
    const FRAMES = 1200
    const trace = await page.evaluate(
      (frames) =>
        new Promise((resolve) => {
          const log = []
          const tick = () => {
            const t = window.__placeTag()
            log.push({
              clock: t.clock,
              playing: t.playing,
              // Of that clock, the seconds actually played — likewise the
              // game's own count.
              playedClock: t.playedClock,
              c: t.children.map((k) => ({
                x: k.x,
                z: k.z,
                pace: k.pace,
                held: k.held,
                walked: k.walked,
                // The metres walked while the round was ON, the game's own
                // counter (point 656): a watcher outside cannot say which side
                // of a round's first frame a step belongs to.
                walkedWhilePlaying: k.walkedWhilePlaying,
                heading: k.heading,
                // How often the settlement has had to pick this child up
                // (point 656): the rescue is what ENDS a snag, so without it
                // the correction reads as the child getting somewhere.
                nudges: k.nudges,
                // And how far it carried it, the game's own counter — no watcher
                // outside can tell a carry from a walk in one frame vector.
                carried: k.carried,
              })),
            })
            if (log.length < frames) requestAnimationFrame(tick)
            else resolve({ bodyRadius: t.bodyRadius, log })
          }
          requestAnimationFrame(tick)
        }),
      FRAMES,
    )
    const log = trace.log
    const n = log[0]?.c.length ?? 0
    check(
      'the trace covers a real stretch of the game, frame by frame',
      log.length >= FRAMES && n >= 2 && log[log.length - 1].clock - log[0].clock > 5,
      `${log.length} frames, ${n} children, ${(log[log.length - 1].clock - log[0].clock).toFixed(1)}s`,
    )
    // AND THE TRACE ITSELF HOLDS A GAME (point 656). Between rounds the group
    // idles for a calibratable break, which is legitimate — but a trace that is
    // ALL break has nothing in it to judge: no chase, no pockets walked into, no
    // shuffle windows.
    //
    // TWO REPAIRS HERE, both from the fourth cross-vendor review. The bar was a
    // majority of the FRAMES, which is not a majority of the minute — frames are
    // not evenly spaced, and this trace's own run from 20 ms to over a second.
    // And nothing required a child to WALK: four stationary children reporting
    // themselves as playing passed this check, the shuffle share (nothing walked
    // is nothing shuffled), the judged share, and both rescue rates. The
    // condition is now the shared `holdsAGame`, which asks the game CLOCK and
    // the QUIETEST child's legs.
    const tracks = Array.from({ length: n }, (_, k) =>
      log.map((f) => ({ ...f.c[k], clock: f.clock, playing: f.playing, playedClock: f.playedClock })),
    )
    const live = traceLiveness(tracks)
    check(
      'and the trace holds a game rather than a break',
      holdsAGame(live),
      `${live.playedSeconds.toFixed(1)}s of ${live.seconds.toFixed(1)}s played ` +
        `(${(live.playedShare * 100).toFixed(0)} %), quietest child ${live.quietestChild} walked ` +
        `${live.quietestWalkedPerPlayedMinute.toFixed(1)} m per played minute ` +
        `(floor ${CHILD_MOTION.walkFloor}), ` +
        `group ${live.walkedPerChildMinute.toFixed(1)} m/child-min`,
    )

    // 3. THEY NEVER OCCUPY ONE ANOTHER. Judged against the body the game itself
    // publishes, not an assumed radius (§7.2) — and against the distance the
    // separation actually settles a resting pair at, which is the contact
    // distance less the deliberate slop band. Judging it against the bare
    // contact distance would call every settled pair an overlap.
    const contact = trace.bodyRadius * 2 - (await page.evaluate(() => window.__balance.villageLife.separation.slop))
    let worstOverlap = 0
    let overlapFrames = 0
    for (const f of log) {
      let bad = false
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(f.c[i].x - f.c[j].x, f.c[i].z - f.c[j].z)
          if (contact - d > worstOverlap) worstOverlap = contact - d
          if (contact - d > 1e-6) bad = true
        }
      }
      if (bad) overlapFrames++
    }
    check(
      'no two children are ever inside one another, in any frame',
      overlapFrames === 0,
      `${overlapFrames} of ${log.length} frames, worst ${Math.max(0, worstOverlap).toFixed(4)} m inside a ${contact.toFixed(3)} m contact`,
    )

    // 1. NOTHING SNAGS. A child COMMANDED to move that covers no ground is the
    // reported hang; a child standing at a pace of zero, or standing because it
    // was told to, is not — that is the game idling or a call being obeyed.
    let longestStall = 0
    for (let k = 0; k < n; k++) {
      let run = 0
      for (let i = 1; i < log.length; i++) {
        const before = log[i - 1].c[k]
        const now = log[i].c[k]
        const moving = now.pace > 1e-6 && !now.held
        if (moving && now.walked - before.walked < 1e-4) {
          run += log[i].clock - log[i - 1].clock
          longestStall = Math.max(longestStall, run)
        } else run = 0
      }
    }
    check(
      'no child that is walking is held motionless by the settlement',
      longestStall < 0.25,
      `longest stall while commanded to move ${longestStall.toFixed(2)}s`,
    )

    // 2. NOTHING SHUFFLES ON THE SPOT — the user's own words, measured as he
    // would judge them: over a window of one second, does a child WALK a real
    // distance without GETTING anywhere?
    //
    // THE MEASURE IS NOT THIS FILE'S (point 656). It is
    // scripts/verify/childMotionMetric.mjs, which the replay test
    // (src/scenes/place/tagShuffle.test.ts) judges by too — because when each
    // side carried its own copy, both copies had the same two blind spots: they
    // summed frame-to-frame POSITIONS as the path walked, so the rescue teleport
    // that ENDS a snag counted as the child walking out of its own pocket, and
    // their window was longer than the 1.5 s rescue that tidied the symptom
    // away. The walked distance now comes from the game itself, the ground
    // covered leaves out the carry, and the rescues are counted.
    //
    // AND THE SHARE IS WEIGHTED IN GAME TIME, which matters most HERE: the
    // headless frame times in this very trace run from 20 ms to over a second,
    // and one window per FRAME would have let the fast stretches of a run
    // outvote the slow ones — the same fault, in a new place. Each window now
    // counts for the game time it stands for, so the number below is the share
    // of the traced minute the children spent shuffling.
    //
    // It used to count REVERSALS — a step that undoes the one before — and that
    // check could never hold either. A chase is FULL of legitimate reversals: a
    // runner doubling back at the rim, a chaser cutting in as its quarry dodges.
    // And their rate rides on the FRAME RATE — 1.4 % of steps at 60 fps against
    // 3.2 % at 14, because a slower frame turns a longer step — so on this
    // machine, where a headless frame takes anything from 20 ms to over a
    // second, one run passed a 3 % gate and the next failed it on the same code.
    // Ground covered against ground walked has neither fault.
    //
    // The gate is the replay's own, and this run is the proof that the LIVE
    // settlement — real frame times, the speech, the bodies, the player standing
    // in it — behaves as the replay says.
    const shuffle = shuffleWindows(tracks)
    // AND THE SHORT BURST BESIDE IT (point 656): the user's report was "die
    // Kinder hängen KURZ fest", and a child that paces on the spot for six
    // tenths of a second between spells of walking never collects the metre of
    // walking a one-second window asks for. The same windows over half a second,
    // with the ground bar a ratio of the distance walked. Both verdicts are ONE
    // check, because they are one question asked at two scales.
    const burst = shuffleWindows(tracks, CHILD_MOTION.short)
    check(
      'no child walks without getting anywhere',
      // The bar is CHILD-SECONDS of game, not a count of frames: this trace is
      // 1200 rendered frames and buys anything from 20 s of game to a minute
      // and a half of it. 20 child-seconds is the same floor the trace check
      // above sets (5 s of game, four children), read in the unit the share is
      // weighted in.
      // AND THE VERDICT MUST REST ON THE TRACE, CHILD BY CHILD. A live frame gap
      // longer than the window is judged by nobody — interpolating across a
      // silence longer than the question would invent the answer — so a share is
      // worth exactly what `judgedShare` says it covers. Both are read off the
      // WORST child rather than the group: one child snagging into a rescue
      // every three seconds while its three siblings play leaves every group
      // average clean, which is the whole of it divided by four.
      // BOTH measures must have judged something, and both must be clean. A
      // share of 0 is what either reports when nothing was bad AND when nothing
      // was looked at: at a live frame gap of 0.6 s the one-second windows still
      // stand while every half-second one is refused, so the burst half would
      // pass on nothing at all.
      judgedEnough(shuffle) &&
        judgedEnough(burst) &&
        shuffle.worstShare < CHILD_MOTION.shareGate &&
        burst.worstShare < CHILD_MOTION.shareGate,
      `worst child ${shuffle.worstShareChild} at ${(shuffle.worstShare * 100).toFixed(2)} % of its own ` +
        `judged time; group ${(shuffle.share * 100).toFixed(2)} % (${shuffle.bad} of ${shuffle.windows} ` +
        `${CHILD_MOTION.span}s windows, ${shuffle.seconds.toFixed(1)} judged child-seconds). ` +
        `Least judgeable child ${shuffle.leastJudgedChild} at ${(shuffle.leastJudged * 100).toFixed(1)} %, ` +
        `group ${(shuffle.judgedShare * 100).toFixed(1)} % of ${shuffle.covered.toFixed(1)} traced. ` +
        `In ${CHILD_MOTION.short.span}s bursts: worst child ${burst.worstShareChild} at ` +
        `${(burst.worstShare * 100).toFixed(2)} %, group ${(burst.share * 100).toFixed(2)} % of ` +
        `${burst.seconds.toFixed(1)} judged child-seconds, least judgeable child ` +
        `${burst.leastJudgedChild} at ${(burst.leastJudged * 100).toFixed(1)} %. ` +
        `Bad = over ${CHILD_MOTION.minPath} m walked inside ${CHILD_MOTION.circle} m ` +
        `(burst: over ${CHILD_MOTION.short.minPath} m walked for a ${CHILD_MOTION.short.ratio}th of it covered)` +
        (shuffle.worst.child >= 0
          ? ` — worst child ${shuffle.worst.child} at ${shuffle.worst.clock.toFixed(1)}s, ${shuffle.worst.path.toFixed(2)} m walked inside ${shuffle.worst.out.toFixed(2)} m`
          : ''),
    )

    // 2b. AND NOBODY IS BEING CARRIED (point 656). The stall watch teleports a
    // child that has got nowhere for 1.5 s onto free ground, and that teleport
    // is the reported episode ENDING — so it is a finding in its own right and
    // is reported by name here, whatever the windows above say. A CARRY is a
    // rescue that really set the child down somewhere else; the rest handed it
    // back the ground it was already standing on.
    const rescues = rescueRate(tracks)
    check(
      'and no child has to be carried out of the settlement’s own geometry',
      rescues.carriedPublished &&
        rescues.nudgesPublished &&
        rescues.carriedMetresPerChildMinute < CHILD_MOTION.carryGate &&
        rescues.perChildMinute < CHILD_MOTION.rescueGate &&
        // AND THE WORST CHILD ON ITS OWN CLOCK: a rate averaged over the group
        // divides one persistently rescued child by its healthy siblings.
        rescues.worstPerChildMinute < CHILD_MOTION.worstChildRescueGate &&
        rescues.worstCarriedMetresPerChildMinute < CHILD_MOTION.worstChildCarryGate,
      // EACH FIGURE WITH THE CHILD IT BELONGS TO, AND CALLED WHAT IT IS. Three
      // different questions with three possibly different answers: the highest
      // RATE (what the gate reads), the most rescues in ABSOLUTE count, and the
      // furthest CARRIED. The rate used to be printed as "most-often-picked-up",
      // which is the count's name, and the count was not printed at all.
      `highest rescue rate: child ${rescues.worstRescueChild} at ` +
        `${rescues.worstPerChildMinute.toFixed(2)}/min. Most rescues in all: child ` +
        `${rescues.worstChild} with ${rescues.worstRescues}. Furthest carried: child ` +
        `${rescues.worstCarriedChild} at ${rescues.worstCarriedMetresPerChildMinute.toFixed(2)} m/min. ` +
        `Group ` +
        `${rescues.rescues} rescues (${rescues.carriedMetres.toFixed(2)} m carried in all` +
        `${rescues.carriedPublished && rescues.nudgesPublished ? '' : ', A COUNTER NOT PUBLISHED BY THE GAME'}) in ` +
        `${rescues.childMinutes.toFixed(2)} child-minutes = ${rescues.perChildMinute.toFixed(2)}/child-min, ` +
        `carried ${rescues.carriedMetresPerChildMinute.toFixed(2)} m/child-min`,
    )

    // AND A LOOK AT THEM. The complaint is what the player SEES, so the run
    // leaves a frame of the children themselves — the traveller stepped back to
    // the group and turned to face it, the shutter projecting their centroid so
    // a frame named after them cannot photograph an empty lane (point 375).
    // THE STANDPOINT IS SEARCHED, AND SO IS THE MOMENT. Where the children
    // stand decides what any standpoint can see of them: their ground is 13 m
    // across with the huts standing in it, so while the chase has them strung
    // out through the lanes, the best vantage in the settlement still sees one
    // of them past a wall — a photograph of an empty village with a figure in
    // it. The search below is therefore run EVERY frame and the shutter waits,
    // bounded, for a moment worth photographing; if the game never offers one it
    // shoots the best it found rather than skipping the picture.
    await page.evaluate(() => {
      window.__pickChildVantage = () => {
        const kids = window.__placeTag().children
        if (kids.length === 0) return null
        const cx = kids.reduce((s, k) => s + k.x, 0) / kids.length
        const cz = kids.reduce((s, k) => s + k.z, 0) / kids.length
        // A vantage the huts do not stand in. Merely stepping back from where
        // the traveller happened to be put the camera inside a dwelling, and the
        // shutter cannot see that: the centroid still PROJECTED into the frame,
        // behind a wall. So the standpoint is chosen against the layout — clear
        // of every dwelling, and with a clear line to the children.
        const huts = window.__placeLayout.dwellings
        const blocks = (ax, az, bx, bz, pad) =>
          huts.some((h) => {
            const dx = bx - ax
            const dz = bz - az
            const len2 = dx * dx + dz * dz || 1
            const t = Math.max(0, Math.min(1, ((h.x - ax) * dx + (h.z - az) * dz) / len2))
            return Math.hypot(ax + t * dx - h.x, az + t * dz - h.z) < h.r + pad
          })
        const room = (sx, sz) =>
          huts.length > 0 ? Math.min(...huts.map((h) => Math.hypot(sx - h.x, sz - h.z) - h.r)) : Infinity
        let best = null
        let bestScore = -Infinity
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          for (const dist of [6, 8, 10]) {
            const sx = cx + Math.sin(a) * dist
            const sz = cz + Math.cos(a) * dist
            if (Math.hypot(sx, sz) > window.__placeLayout.radius - 2) continue
            if (blocks(sx, sz, sx, sz, 2)) continue // standing inside a hut
            // How many children it can actually SEE: a thatch roof is opaque,
            // and a subject that merely projects into the frame can sit behind
            // one. The roof overhangs the wall, so the sightline is tested
            // against a hut generously wider than its footprint.
            const seen = kids.filter((k) => !blocks(sx, sz, k.x, k.z, 1.2))
            if (seen.length === 0) continue
            // Then ELBOW ROOM, then nearness. Seeing them was not enough on its
            // own: the first standpoint that did stood in the alley between two
            // dwellings, and at eye height a wall a metre away fills half the
            // picture whatever the sightline says. Room counts up to four metres
            // and no further — beyond that the wall is out of the picture, and
            // what is left to decide is that the children are figures rather
            // than specks.
            const clear = Math.min(room(sx, sz), 4)
            const score = seen.length * 1000 + clear * 50 - dist
            if (score > bestScore) {
              bestScore = score
              best = { sx, sz, seen: seen.length, of: kids.length, clear, dist }
              const vx = seen.reduce((s, k) => s + k.x, 0) / seen.length
              const vz = seen.reduce((s, k) => s + k.z, 0) / seen.length
              best.vx = vx
              best.vz = vz
            }
          }
        }
        return best
      }
    })
    // Worth photographing: most of the group in the clear, and the camera in the
    // open rather than up against a wall.
    await stepUntil(() => {
      const b = window.__pickChildVantage()
      return !!b && b.seen >= Math.min(3, b.of) && b.clear >= 2.5
    }, null, 300)
    const aimed = await page.evaluate(() => {
      const p = window.__placePlayer
      const best = window.__pickChildVantage()
      if (!p || !best) return null
      const pose = { x: p.x, z: p.z, yaw: p.yaw }
      p.x = best.sx
      p.z = best.sz
      // Look at what is actually visible, and hand the shutter the same point.
      p.yaw = Math.atan2(-(best.vx - p.x), -(best.vz - p.z))
      return { pose, cx: best.vx, cz: best.vz, seen: best.seen, of: best.of }
    })
    if (aimed) {
      await nextFrames(2)
      await frame('648-village-children', {
        local: { x: aimed.cx, y: 0.8, z: aimed.cz },
        label: `the children at their game of tag (${aimed.seen} of ${aimed.of} in the clear)`,
      })
      await page.evaluate((pose) => {
        const p = window.__placePlayer
        if (!p) return
        p.x = pose.x
        p.z = pose.z
        p.yaw = pose.yaw
      }, aimed.pose)
    }
    // The world goes back as it was found, the injected search included — every
    // section after this one would otherwise read a page this one left behind.
    await page.evaluate(() => {
      delete window.__pickChildVantage
    })
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  await page.evaluate((seed) => window.__game.setState({ seed }), bootSeed)
}

// --- The adults' errands (work-order point 483) -------------------------------
// What needs a real browser here is the WALK: the catalogue, the fair queue and
// every teaching rule are pinned in src/scenes/place/adultErrands.test.ts, but
// only the live scene can show that a villager told to go somewhere actually
// crosses the village to it against the collision set and stands there.
//
// The village is the PoC's own (the Bambara village), because that is the one
// with the teaching stone; the ground work is in every village.
//
// The RIVER errands are checked here too (work-order 482 landed the bank): the
// village now carries a walkable bank and two stretches along it, so a villager
// told to go to the water has somewhere to go — and this is where that walk, and
// the current it is walked beside, can be seen.
if (section('adult-errands')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  // The sample window's calibration is set BEFORE the settlement mounts: the
  // group size is read once per visit, and a village of four spends the whole
  // window walking to the water and back — the queue is fair, so the errands at
  // the end of the catalogue never come round while everybody is out on the bank.
  // Every one of these is a balance value the debug menu edits.
  await page.evaluate(() => {
    const e = window.__balance.villageLife.adultErrands
    e.intervalSeconds = 0.8
    e.dwellSeconds = 1
    e.digSeconds = 3
    e.pace = 6
    e.villagerCount = 10
  })
  await page.evaluate(() => window.__game.getState().enterPlace('bambara-village'))
  const live = await page
    .waitForFunction(
      () => window.__game.getState().placeId === 'bambara-village' && !!window.__placeErrands,
      null,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false)
  check('the village adults publish their live errands', live)
  // Read inside the settlement, used again after leaving it (the cross-view
  // check at the end of this block).
  let river = null
  if (live) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    const geography = await page.evaluate(() => window.__placeErrands().geography)
    check(
      'the village draws the ground work the adults teach DIG at',
      (geography.digSites ?? []).length >= 2 && !!geography.stone,
      `${(geography.digSites ?? []).length} dig sites, stone ${geography.stone ? 'present' : 'MISSING'}`,
    )
    check(
      'and the river bank the adults teach RIVER, UPSTREAM and DOWNSTREAM at (work-order 482)',
      !!geography.bank && !!geography.upstream && !!geography.downstream,
      JSON.stringify({ bank: geography.bank, upstream: geography.upstream, downstream: geography.downstream }),
    )

    // Sample the group over a window of frames: every errand handed out, and how
    // far its villager still is from where it was sent.
    // The seven errands that are ABOUT the water (work-order 482): the three
    // that name the river and the two mirrored direction pairs.
    const RIVER_ERRANDS = [
      'sendToTheBank',
      'callBackFromTheBank',
      'gatherAtTheBank',
      'sendUpTheBank',
      'sendDownTheBank',
      'haulUpTheBank',
      'haulDownTheBank',
    ]
    const isRiverErrand = (key) => RIVER_ERRANDS.some((id) => key.includes(`:${id}:`))
    const seen = new Map()
    let arrivals = 0
    let progressed = 0
    let riverArrivals = 0
    let riverProgress = 0
    let dug = 0
    let staged = {}
    for (let i = 0; i < 1400; i++) {
      const now = await page.evaluate(() => window.__placeErrands())
      staged = now.staged
      for (const [index, v] of now.villagers.entries()) {
        if (v.digging) dug++
        if (!v.errand) continue
        const key = `${index}:${v.errand.situation}:${v.errand.x.toFixed(2)}:${v.errand.z.toFixed(2)}`
        const gap = Math.hypot(v.x - v.errand.x, v.z - v.errand.z)
        const first = seen.get(key)
        if (!first) seen.set(key, { gap, best: gap, arrived: v.errand.arrived })
        else {
          first.best = Math.min(first.best, gap)
          first.arrived = first.arrived || v.errand.arrived
        }
      }
      // Everything this window is here to show has happened: stop sampling
      // rather than spend minutes proving it again. A scene that never gets
      // there runs the whole cap and fails on the checks below.
      arrivals = [...seen.values()].filter((e) => e.arrived).length
      progressed = [...seen.values()].filter((e) => e.gap - e.best > 0.8).length
      riverArrivals = [...seen.entries()].filter(([k, e]) => isRiverErrand(k) && e.arrived).length
      riverProgress = [...seen.entries()].filter(([k, e]) => isRiverErrand(k) && e.gap - e.best > 0.8).length
      if (arrivals >= 2 && progressed >= 2 && dug > 0 && riverArrivals >= 1 && riverProgress >= 1) break
      await nextFrames(2)
    }
    const stagedTotal = Object.values(staged).reduce((a, b) => a + b, 0)
    check(
      'the adults stage errands while the player watches',
      stagedTotal >= 3,
      `${stagedTotal} staged: ${Object.entries(staged).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(', ')}`,
    )
    check(
      'a villager told to go somewhere WALKS there: it closes the distance to its target',
      progressed >= 1,
      `${progressed} of ${seen.size} errands visibly closed the gap`,
    )
    check(
      'and it gets there: the walk ends at the place it was sent to',
      arrivals >= 1,
      `${arrivals} of ${seen.size} errands reached their target`,
    )
    check(
      'the ground work is worked: a villager is seen digging',
      dug > 0,
      `${dug} samples with a villager at the digging pose; ground-work errands staged ` +
        `${['digWhereIStand', 'sendToThePostHole', 'joinTheDigging'].map((id) => `${id}×${staged[id] ?? 0}`).join(', ')}`,
    )
    check(
      'the adults stage the errands that are about the water (work-order 482)',
      RIVER_ERRANDS.reduce((n, id) => n + (staged[id] ?? 0), 0) >= 1,
      RIVER_ERRANDS.map((id) => `${id}×${staged[id] ?? 0}`).join(', '),
    )
    check(
      'a villager sent to the BANK crosses the village to it and arrives',
      riverProgress >= 1 && riverArrivals >= 1,
      `${riverProgress} closed the gap, ${riverArrivals} arrived`,
    )

    // The picture: a villager standing at the ground work it was sent to.
    const spot = await page.evaluate(() => {
      const s = window.__placeErrands()
      const site = s.geography.digSites[0]
      return site ? { x: site.x, z: site.z } : null
    })
    if (spot) {
      await page.evaluate(({ x, z }) => {
        const p = window.__placePlayer
        // Six metres short of the patch, on the village-centre side of it, and
        // TURNED TO IT: the yaw convention here is the one the rest of this
        // suite uses (atan2 of the NEGATED offset), because the camera looks
        // down its own −Z.
        const bearing = Math.atan2(x, z)
        p.x = x - Math.sin(bearing) * 6
        p.z = z - Math.cos(bearing) * 6
        p.yaw = Math.atan2(-(x - p.x), -(z - p.z))
        p.pitch = -0.12
      }, spot)
      await nextFrames(6)
      await frame('483-village-errands', {
        local: { x: spot.x, y: 0.6, z: spot.z },
        label: 'the ground work the adults teach digging at',
      })
    }

    // --- The river itself (work-order 482) ------------------------------------
    // Two things only the live scene can settle: that the water is DRAWN in the
    // settlement rather than painted into the surroundings, and that its
    // direction is legible from the bank. The second is measured, not assumed —
    // the foam the player watches is real geometry, so the check reads the
    // positions of the very patches the picture shows and asks which way they
    // went. The whole UPSTREAM/DOWNSTREAM teaching hangs on that reading.
    river = await page.evaluate(() => (window.__placeRiver ? window.__placeRiver() : null))
    check(
      'the village draws its river in the SCENE, on its own ground',
      !!river && river.riverId === 'niger' && river.distance > 28,
      river ? `${river.riverId}, waterline ${river.distance.toFixed(1)} m out` : 'no __placeRiver',
    )
    if (river) {
      const drift = await page.evaluate(() => window.__placeRiver().flecks)
      await nextFrames(24)
      const drifted = await page.evaluate(() => window.__placeRiver().flecks)
      let forward = 0
      let backward = 0
      let moved = 0
      for (let i = 0; i < Math.min(drift.length, drifted.length); i++) {
        const along =
          (drifted[i].x - drift[i].x) * river.downstream.x + (drifted[i].z - drift[i].z) * river.downstream.z
        // A patch that reached the end of the drawn stretch re-enters upstream;
        // that is a jump of the whole span, not a current running backwards.
        if (along < -1) continue
        if (Math.abs(along) < 1e-4) continue
        moved++
        if (along > 0) forward++
        else backward++
      }
      check(
        'the current RUNS: the foam on it travels downstream, none of it back',
        moved >= 3 && backward === 0 && forward === moved,
        `${forward} of ${moved} moving patches went downstream, ${backward} against it`,
      )

      // Stand at the bank looking out over the water, and photograph the patch
      // of foam nearest the spot — so the frame's subject IS the thing that
      // showed the direction.
      const aim = await page.evaluate((r) => {
        const p = window.__placePlayer
        p.x = r.bank.x - r.normal.x * 1.4
        p.z = r.bank.z - r.normal.z * 1.4
        p.yaw = Math.atan2(-r.normal.x, -r.normal.z)
        p.pitch = -0.16
        const flecks = window.__placeRiver().flecks
        let best = null
        let bestD = Infinity
        for (const f of flecks) {
          const d = Math.hypot(f.x - r.bank.x, f.z - r.bank.z)
          if (d < bestD) {
            bestD = d
            best = f
          }
        }
        return best
      }, river)
      await nextFrames(6)
      await frame('482-village-river-bank', {
        local: aim ? { x: aim.x, y: aim.y + 0.15, z: aim.z } : { x: river.bank.x, y: 0.4, z: river.bank.z },
        label: 'the river bank, with the foam riding the current',
      })

      // --- No seam where the drawn water hands over to the panorama (525) ----
      // From this same spot the two halves of the river meet: the surface drawn
      // on the settlement's own ground, and — past the ground plate's rim — the
      // §2.5 panorama continuing the same Niger. They used to meet along a
      // perfectly straight line across the whole picture, a bright teal band
      // against a duller, greyer one, because each was shaded by its own
      // material. They read ONE description now (src/render/waterAppearance.ts),
      // and this is the reading a human makes of that: sample narrow vertical
      // strips ACROSS the rim and compare the water just above it with the water
      // just below.
      //
      // The reading has to survive the water's own pattern, which fights back in
      // two directions. ACROSS the frame: each row is the MEDIAN over strips
      // spread over the width, so a foam patch, a villager or the teaching rock
      // takes a strip or two and never the row. ALONG it: the froth runs in broad
      // horizontal ribbons that can fill a whole band, and froth only ever
      // BRIGHTENS the water — so a band is read at a LOW PERCENTILE of its rows,
      // which is the water's own tone on that side of the rim: the thing a seam
      // moves and a ribbon does not. Three captures a moment apart are taken and
      // the MEDIAN step of the three judged, so one unlucky moment neither fails
      // a good picture nor passes a bad one.
      //
      // Measured on this machine: 49 with the panorama shaded as it was, 1–4 as
      // it is now.
      const RIM_STEP_LIMIT = 12
      const seam = await page.evaluate((r) => {
        const cam = window.__placeCamera
        const apply = (e, v) => [0, 1, 2, 3].map((i) => e[i] * v[0] + e[i + 4] * v[1] + e[i + 8] * v[2] + e[i + 12] * v[3])
        const project = (x, y, z) => {
          const eye = apply(cam.matrixWorldInverse.elements, [x, y, z, 1])
          const clip = apply(cam.projectionMatrix.elements, eye)
          const w = clip[3]
          if (!(w > 0)) return null
          return { x: ((clip[0] / w) * 0.5 + 0.5) * window.innerWidth, y: (0.5 - (clip[1] / w) * 0.5) * window.innerHeight }
        }
        const out = (dist, y) => project(r.normal.x * dist, y, r.normal.z * dist)
        const radius = window.__placeLayout?.radius
        if (!(radius > 0)) return null
        // The handover zone, bounded by geometry rather than guessed: from the
        // ground disc's edge (where the panorama's surface has climbed back to
        // the ground plane) down to the backdrop's inner rim at the water's own
        // level (where that surface first breaks the drawn sheet). Plus the line
        // three metres out from the waterline, where the shore froth ends — the
        // near band stops there rather than measuring froth.
        const top = out(radius + 14, 0)
        const bottom = out(radius + 12, -0.25)
        const froth = out(r.distance + 3, -0.25)
        // Everything on screen that is NOT the picture.
        const blockers = []
        for (const el of document.body.querySelectorAll('*')) {
          if (el.tagName === 'CANVAS' || el.children.length > 0) continue
          const b = el.getBoundingClientRect()
          if (b.width < 2 || b.height < 2) continue
          if (b.width * b.height > window.innerWidth * window.innerHeight * 0.4) continue
          const st = getComputedStyle(el)
          if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue
          blockers.push({ x0: b.left, x1: b.right, y0: b.top, y1: b.bottom })
        }
        return { top, bottom, froth, blockers, w: window.innerWidth }
      }, river)
      if (!seam || !seam.top || !seam.bottom || !seam.froth) {
        check('the river’s rim is in the picture to measure (work-order 525)', false, JSON.stringify(seam))
      } else {
        const MARGIN = 6 // clearance kept from the handover zone
        const HALF = 6 // strip half-width, in CSS pixels
        const pick = (xs, at) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * at))]
        const readings = []
        for (let pass = 0; pass < 3; pass++) {
          const shot = await capturePixels(page, 'river rim colour step')
          const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
          const scale = info.width / seam.w
          const yTop = Math.round(seam.top.y * scale)
          const yBottom = Math.round(seam.bottom.y * scale)
          const depth = Math.max(12, Math.min(140, Math.round(seam.froth.y * scale) - yBottom - MARGIN))
          const y0 = Math.max(0, yTop - MARGIN - depth)
          const y1 = Math.min(info.height - 1, yBottom + MARGIN + depth)
          const strips = []
          for (let i = 1; i <= 14; i++) {
            const cx = (i / 15) * seam.w
            const covered = seam.blockers.some(
              (b) => b.x1 > cx - HALF && b.x0 < cx + HALF && b.y1 > y0 / scale && b.y0 < y1 / scale,
            )
            if (!covered) strips.push(Math.round(cx * scale))
          }
          const half = Math.max(1, Math.round(HALF * scale))
          const rows = []
          for (let y = y0; y <= y1; y++) {
            const perStrip = strips.map((cx) => {
              const acc = [0, 0, 0]
              let n = 0
              for (let x = Math.max(0, cx - half); x <= Math.min(info.width - 1, cx + half); x++) {
                const i = (y * info.width + x) * info.channels
                acc[0] += data[i]
                acc[1] += data[i + 1]
                acc[2] += data[i + 2]
                n++
              }
              return acc.map((v) => v / n)
            })
            rows.push([0, 1, 2].map((k) => pick(perStrip.map((c) => c[k]), 0.5)))
          }
          const band = (a, b) => [0, 1, 2].map((k) => pick(rows.slice(a - y0, b - y0 + 1).map((c) => c[k]), 0.1))
          const far = band(y0, yTop - MARGIN)
          const near = band(yBottom + MARGIN, y1)
          const zone = band(yTop, yBottom)
          const worst = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])))
          readings.push({
            strips: strips.length,
            far,
            near,
            zone,
            step: worst(far, near),
            zoneStep: worst(zone, [0, 1, 2].map((i) => (far[i] + near[i]) / 2)),
          })
          await nextFrames(20)
        }
        const say = (c) => c.map((v) => v.toFixed(0)).join('/')
        const mid = readings[1]
        const step = pick(readings.map((r) => r.step), 0.5)
        const zoneStep = pick(readings.map((r) => r.zoneStep), 0.5)
        const enough = readings.every((r) => r.strips >= 6)
        check(
          `the water beyond the plate’s rim is the SAME water as the water at the bank (≤ ${RIM_STEP_LIMIT}/255 per channel)`,
          enough && step <= RIM_STEP_LIMIT,
          `${mid.strips} clear strips · far ${say(mid.far)} against near ${say(mid.near)} — step ${step.toFixed(1)} ` +
            `(${readings.map((r) => r.step.toFixed(1)).join(', ')})`,
        )
        check(
          'and the handover zone itself carries neither band’s edge — no line at the rim',
          enough && zoneStep <= RIM_STEP_LIMIT,
          `rim zone ${say(mid.zone)} against the water either side — step ${zoneStep.toFixed(1)} ` +
            `(${readings.map((r) => r.zoneStep.toFixed(1)).join(', ')})`,
        )
      }
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  // Wait for the travel scene's water to be MOUNTED before asking it anything —
  // the condition, not a wall-clock guess.
  await page.waitForFunction(() => !!window.__rivers, null, { timeout: 30000 }).catch(() => {})

  // --- The same river, the same side, in the OTHER view (work-order 482) ------
  // Asked of the DRAWN course, not of the model both views were built from: the
  // bird's-eye ribbon's own vertices decide where the water lies from the
  // village, and that bearing has to be the bearing the settlement's bank is on.
  if (river) {
    const overhead = await page.evaluate(() => {
      const s = window.__game.getState()
      // leavePlace sets the traveller exactly one exit offset south of the
      // village, so the village's own world position follows from it.
      const village = { x: s.pos.x, z: s.pos.z - (window.__balance.placeEnterRadius + 0.5) }
      const scene = window.__scenePass?.scene
      if (!scene) return null
      let ribbon = null
      scene.traverse((o) => {
        if (o.name === 'rivers-ribbon') ribbon = o
      })
      if (!ribbon) return null
      const p = ribbon.geometry.getAttribute('position')
      let best = Infinity
      let bx = 0
      let bz = 0
      for (let i = 0; i < p.count; i++) {
        const dx = p.getX(i) - village.x
        const dz = p.getZ(i) - village.z
        const d = dx * dx + dz * dz
        if (d < best) {
          best = d
          bx = dx
          bz = dz
        }
      }
      return { bearing: Math.atan2(bz, bx), distance: Math.sqrt(best) }
    })
    check('the bird’s-eye view draws the Niger past the village', !!overhead && overhead.distance < 8, JSON.stringify(overhead))
    if (overhead) {
      const bankBearing = Math.atan2(river.normal.z, river.normal.x)
      let delta = Math.abs(overhead.bearing - bankBearing) % (Math.PI * 2)
      if (delta > Math.PI) delta = Math.PI * 2 - delta
      check(
        'and the settlement puts its bank on the SAME side of the village',
        delta < 0.4,
        `${((overhead.bearing * 180) / Math.PI).toFixed(0)}° drawn overhead against ${((bankBearing * 180) / Math.PI).toFixed(0)}° at the bank`,
      )
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
   *  coordinates, which says nothing about why 49 bearings were all rejected.
   *  Now the miss names how many bearings the disc edge closed, how many each
   *  collider closed, and which colliders those were. */
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
          return { bearing: b, tried: bearings.length, colliders: others.length }
        }
        const worst = [...byCollider.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
        return {
          bearing: null,
          tried: bearings.length,
          colliders: others.length,
          detail: `${bearings.length} bearings from r=${start} to r=1.2, all blocked: ${byDisc} by the disc edge (radius ${radius}), the rest by [${worst.map(([k, n]) => `${k}×${n}`).join(', ')}] of ${others.length} colliders`,
        }
      },
      [target, startR, prefer],
    )

  /** The same search, but never reporting a miss off a scene that may still be
   *  streaming in: a first miss is retried once from a settled state (point
   *  549 — the settled-reading shape point 499 established). */
  // THE SPREAD, RECORDED (point 549). Three checks rode on this one search and
  // each of them rotated: the zulu hut approach reported a bare `false` in one
  // of five runs and passed the other four, the cairo trade house did the same,
  // and the conversational standpoint reddened once on a loaded machine. With
  // the world seed pinned, the search reporting what it tried, and one retry
  // from a settled scene, four consecutive WebGL 2 runs picked the IDENTICAL
  // standpoint every time — the zulu hut at {x 15.79, z 2.20} on bearing 2.487
  // of 48 tried, the cairo trade house at {x -19.22, z -1.18} on bearing 0.000
  // of 49, the conversational standpoint on bearing 0.00, the first of 16. A
  // search over a world that does not change no longer produces a verdict that
  // does.
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
   *  happens to stand at that drifted spot. Measured: the same trade house, same
   *  seed, same approach bearing, once read `1.52 m down to ground-disc` and
   *  once `0.24 m down to BoxGeometry`. Standing him back on the nearest point
   *  the walk actually reached is a position he really walked to, and it is the
   *  one the check means: at the eaves. */
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
    return best.d
  }

  /** What the frame really draws straight above and straight below the eye, over
   *  a WINDOW of frames rather than in one (point 549).
   *
   *  The player stands still here, so the building fabric — the only thing this
   *  criterion is about — reads identically in every frame of the window. What
   *  varies is the settlement's TRAFFIC: measured at the cairo standpoint over
   *  2842 consecutive frames, 115 of them had a porter's carried crate 0.26 m
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
    return { target, probe: { bearing: stood.bearing, x: at.x, z: at.z } }
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

// --- Hold Ctrl inside a settlement (design.md §17.8, point 342) -------------
// The first-person half; the bird's-eye half is in enrichments.mjs. What is
// checked here is that the SAME layer answers in this perspective, over the
// inhabitants and their animals, and that it leaves nothing behind.
if (section('ctrl-actor-labels')) {
  const frames = (n) =>
    page.evaluate(
      (count) =>
        new Promise((res) => {
          let i = 0
          const step = () => (++i >= count ? res() : requestAnimationFrame(step))
          requestAnimationFrame(step)
        }),
      n,
    )

  await page.evaluate(() => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    if (g.placeId) g.leavePlace()
    g.enterPlace('maasai-village')
  })
  await page.waitForFunction(
    () => window.__game.getState().placeId === 'maasai-village' && !!window.__placeLayout,
    null,
    { timeout: 40000 },
  )
  await waitForSceneBuilt(page).catch(() => {})
  // Stand back from the middle and look at it: that is where the village lives.
  // The first entry just journaled itself and OPENED the journal panel — close
  // it again, so the frame below shows the crowd, not the diary over half of it.
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    p.x = 0
    p.z = 14
    p.pitch = 0
    p.yaw = Math.atan2(-(0 - p.x), -(0 - p.z))
  })
  await frames(4)

  const idle = await page.evaluate(() => document.querySelectorAll('.actor-label').length)
  check('a settlement stands unlabelled while Ctrl is up (point 342)', idle === 0, `${idle} labels`)

  await page.keyboard.down('Control')
  // Poll for the layer instead of sleeping: it refreshes on its own interval
  // and this machine may be loaded.
  const appeared = await page
    .waitForFunction(() => (window.__actorLabels?.() ?? []).length > 0, null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  // BOTH readings must describe the SAME moment — the bird's-eye half of this
  // check already reads them that way (enrichments.mjs) and this half was the
  // one still reading them apart, one round trip at a time. The probe reports
  // the list the layer last rendered FROM, while every new label reaches the
  // DOM through drei's own portal root, which commits on its own schedule.
  // Measured 11.08.2026 under a 20× CPU throttle, on this branch and on `main`
  // alike: the settlement's ~20 labels then arrive roughly ONE PER FRAME, so a
  // state read one round trip before the DOM read reported 24 labels against 2
  // drawn — which is exactly how this check went red on the loaded WebGL 2 lane
  // while every label was correct. So: poll on the app's own frames until the
  // two agree and snapshot them in the SAME tick. If they never converge the
  // snapshot still comes back and the check below fails on it, which is the
  // defect this assertion is really for.
  const snapshot = await page.evaluate(
    () =>
      new Promise((res) => {
        let frames = 0
        const step = () => {
          const labels = window.__actorLabels ? window.__actorLabels() : null
          if (labels === null) return res(null)
          const rendered = [...document.querySelectorAll('.actor-label')].map((el) => el.textContent ?? '')
          if (rendered.length === labels.length || ++frames > 240) return res({ labels, rendered, frames })
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
  )
  const held = snapshot === null ? null : snapshot.labels
  const rendered = snapshot === null ? [] : snapshot.rendered
  check(
    "holding Ctrl names the settlement's people and animals (point 342)",
    !!held && held.length > 0 && rendered.length === held.length,
    held
      ? `${held.length} labels, ${rendered.length} drawn after ${snapshot.frames} frame(s) ` +
        `[${held.map((l) => l.kind).join(', ')}]: ${rendered.slice(0, 4).join(' | ')}`
      : `no layer (appeared: ${appeared})`,
  )
  // A settlement's actors are its INHABITANTS and their animals — nothing else
  // is drawn here that could pass for one.
  // The elder is not in this list on purpose: he carries his own standing label,
  // so the Ctrl layer leaves him to it (see PlaceScene's Villager).
  const INHABITANTS = ['villager', 'child', 'trader', 'porter', 'goat']
  check(
    'the named subjects are inhabitants or their animals (point 342)',
    !!held && held.length > 0 && held.every((l) => INHABITANTS.includes(l.kind)),
    held ? [...new Set(held.map((l) => l.kind))].join(', ') : 'no layer',
  )
  check(
    'no label is empty or an internal id (point 342)',
    rendered.length > 0 && rendered.every((t) => t.trim().length > 1 && t[0] === t[0].toUpperCase()),
    rendered.slice(0, 6).join(' | '),
  )
  // Nothing built or grown answers: no hut, wall, fence or plant.
  const SCENERY_WORDS = ['hut', 'wall', 'mauer', 'fence', 'zaun', 'roof', 'dach', 'tree', 'baum', 'rock', 'fels', 'grass', 'gras']
  const scenery = rendered.filter((t) => SCENERY_WORDS.some((w) => t.toLowerCase().includes(w)))
  check('no building, fence or plant is named (point 342)', scenery.length === 0, scenery.join(' | '))

  // NOTHING THE SETTLEMENT DRAWS IS INVISIBLE TO THE LAYER (point 600). The
  // bird's-eye defect was a figure drawn from a list no source walked, and the
  // same failure here would be an inhabitant drawn without a mark. Every figure
  // names ITSELF in the graph (`name="inhabitant"`, set by PlaceLife's Figure
  // for the speech label), so that name is an INDEPENDENT handle on the people
  // this scene really draws: each of them must carry an actor mark AND stand in
  // the layer's raw candidate set, whatever it is doing.
  const figures = await page.evaluate(() => {
    const cands = window.__actorCandidates ? window.__actorCandidates() : null
    if (!cands || !window.__placeScene) return null
    const drawn = []
    window.__placeScene.traverse((o) => {
      if (o.name !== 'inhabitant') return
      for (let n = o; n; n = n.parent) if (n.visible === false) return
      const m = o.matrixWorld.elements
      drawn.push({ x: m[12], z: m[14], kind: o.userData?.actor?.kind ?? null })
    })
    const unmarked = drawn.filter((f) => f.kind === null)
    const unoffered = drawn.filter(
      (f) => f.kind !== null && !cands.some((c) => c.kind === f.kind && Math.hypot(c.x - f.x, c.z - f.z) < 1.5),
    )
    return {
      total: drawn.length,
      unmarked: unmarked.length,
      unoffered: unoffered.length,
      kinds: [...new Set(drawn.map((f) => f.kind))],
    }
  })
  check(
    'every inhabitant figure the scene draws reaches the label layer (point 600)',
    !!figures && figures.total > 0 && figures.unmarked === 0 && figures.unoffered === 0,
    figures
      ? `${figures.total} figures [${figures.kinds.join(', ')}], ${figures.unmarked} unmarked, ` +
        `${figures.unoffered} not offered`
      : 'no candidate hook',
  )

  // And it rides them while they WALK: the settlement's states are motion, and
  // a label that stayed at the birthplace would be the same defect one layer
  // down. Polled on the app's own frames (point 177), never a wall-clock wait.
  const walking = await page.evaluate(
    () =>
      new Promise((res) => {
        const figuresNow = () => {
          const list = []
          window.__placeScene.traverse((o) => {
            if (o.name !== 'inhabitant') return
            const m = o.matrixWorld.elements
            list.push({ node: o, x: m[12], z: m[14], kind: o.userData?.actor?.kind ?? null })
          })
          return list
        }
        const start = new Map(figuresNow().map((f) => [f.node, { x: f.x, z: f.z }]))
        let frames = 0
        const step = () => {
          const moved = figuresNow().filter((f) => {
            const s = start.get(f.node)
            return s !== undefined && Math.hypot(f.x - s.x, f.z - s.z) > 0.25
          })
          if (moved.length > 0) {
            const cands = window.__actorCandidates()
            const named = moved.filter((f) =>
              cands.some((c) => c.kind === f.kind && Math.hypot(c.x - f.x, c.z - f.z) < 1.5),
            )
            res({ moved: moved.length, named: named.length, kinds: [...new Set(moved.map((f) => f.kind))], frames })
            return
          }
          if (++frames > 900) {
            res({ moved: 0, named: 0, kinds: [], frames })
            return
          }
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
  )
  check(
    'a walking inhabitant is named where it now stands (point 600)',
    walking.moved > 0 && walking.named === walking.moved,
    `${walking.named}/${walking.moved} moved figures named after ${walking.frames} frame(s) [${walking.kinds.join(', ')}]`,
  )

  // NO TWO DRAWN BOXES FUSE IN THIS CROWD (point 628). Every check above asks
  // the DOM whether a TEXT is present — which is exactly what let the evidence
  // frame below read "Villager llager" while the whole suite was green: the
  // defective frame had been written by ANOTHER revision's run (main, 14.08,
  // before the declutter), and no assertion in THIS suite — the one that owns
  // the frame — ever measured a rectangle. The only rect check lived in the
  // sparse savanna half (enrichments.mjs). So the rects are measured HERE, in
  // the dense scene the defect was reported in, at the very state the frame
  // photographs — and SAMPLED over many frames rather than one instant, since
  // the declutter decides at the layer's 10 Hz refresh while the subjects walk
  // every frame (the verdict and its reasoning: scripts/verify/labelFusion.mjs).
  // The shutter is BRACKETED: one window before the frame, one after, judged as
  // one series — a sample that closed before the capture would certify a
  // picture it never measured (the Sol-review gap, 17.08.).
  const sampleFusion = (windowFrames) => page.evaluate(
    ({ TOLERANCE, SAMPLES }) =>
      new Promise((res) => {
        let sampled = 0
        let fusedFrames = 0
        let worstDepth = 0
        let worstPair = null
        let labelsMin = Infinity
        let labelsMax = 0
        const read = () => {
          const boxes = [...document.querySelectorAll('.actor-label')]
            .map((el) => {
              const r = el.getBoundingClientRect()
              return { text: (el.textContent ?? '').trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }
            })
            .filter((b) => b.right > b.left && b.bottom > b.top)
          labelsMin = Math.min(labelsMin, boxes.length)
          labelsMax = Math.max(labelsMax, boxes.length)
          let fusedHere = false
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i]
              const b = boxes[j]
              const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
              const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
              if (across > TOLERANCE && down > TOLERANCE) {
                fusedHere = true
                const depth = Math.min(across, down)
                if (depth > worstDepth) {
                  worstDepth = depth
                  worstPair = `"${a.text}"×"${b.text}" ${across.toFixed(0)}×${down.toFixed(0)} px`
                }
              }
            }
          }
          if (fusedHere) fusedFrames++
          if (++sampled >= SAMPLES) return res({ samples: sampled, fusedFrames, worstDepth, worstPair, labelsMin, labelsMax })
          requestAnimationFrame(read)
        }
        requestAnimationFrame(read)
      }),
    { TOLERANCE: FUSE_TOLERANCE, SAMPLES: windowFrames },
  )
  const fusionPre = await sampleFusion(45)

  await frame('148-ctrl-actor-labels-village', {
    place: 'maasai-village',
    label: 'the Maasai village with the Ctrl labels over its inhabitants',
  })

  const fusionPost = await sampleFusion(45)
  const fusionVerdict = judgeLabelFusion(mergeFusionReadings(fusionPre, fusionPost))
  check('no two Ctrl labels fuse in the village crowd (point 628)', fusionVerdict.ok, fusionVerdict.detail)

  await page.keyboard.up('Control')
  const cleared = await page
    .waitForFunction(
      () => document.querySelectorAll('.actor-label').length === 0 && window.__actorLabels === undefined,
      null,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false)
  check('releasing Ctrl clears the settlement labels too (point 342)', cleared, `cleared=${cleared}`)
}

// A selected section that never executed is a FAILURE, not a quiet pass: it is
// the one way a --section run could report green having verified nothing.
const unrun = sections.unrun()
if (unrun) check('the selected section actually ran', false, unrun)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
// Said again where the verdict is read: a green one-section run is not a green
// suite, and nothing downstream may quote it as one.
if (sections.banner()) console.log(sections.banner())
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
